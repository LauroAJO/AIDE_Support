// Helpers puros compartilhados entre NetworkingPage.jsx (lista/tabela/heatmap/
// Mapa Orbital) e NetworkMapRede.jsx (Mapa de Rede). Extraídos daqui para
// evitar duplicação — nenhuma lógica foi alterada na mudança de arquivo.

import { normalizeCountry, isBrazilianCountry } from '../../lib/countries';

// Temperatura do contato (pela última interação).
export const TEMP_META = {
  hot:   { emoji: '🔥', label: 'Quente', dot: '#EF4444' },
  warm:  { emoji: '🟡', label: 'Morno',  dot: '#F59E0B' },
  cold:  { emoji: '🔵', label: 'Frio',   dot: '#3B82F6' },
  never: { emoji: '⚫', label: 'Nunca contatado', dot: '#9CA3AF' },
};

// "Peso setorial" — avaliação manual 1-10 de influência no setor.
const SECTOR_WEIGHT_LABELS = [
  [1, 2, 'Pouca influência'],
  [3, 4, 'Influência local/restrita'],
  [5, 6, 'Influência regional/setorial'],
  [7, 8, 'Influência nacional/europeia'],
  [9, 10, 'Referência global'],
];

export function sectorWeightLabel(n) {
  const hit = SECTOR_WEIGHT_LABELS.find(([lo, hi]) => n >= lo && n <= hi);
  return hit ? hit[2] : '';
}

export function sectorWeightColor(n) {
  if (n >= 9) return '#7C3AED';
  if (n >= 7) return '#6366F1';
  if (n >= 5) return '#3B82F6';
  if (n >= 3) return '#93C5FD';
  if (n >= 1) return '#DBEAFE';
  return '#E5E7EB';
}

// Função/organização "atual" da pessoa (a marcada como current, senão a
// primeira; sem roles, cai nos campos legados role/institution).
export function currentRoleOrg(p) {
  const current = p.roles && p.roles.length > 0 ? (p.roles.find((r) => r.current) || p.roles[0]) : null;
  if (current) return { role: current.role || '', org: current.institution_name || '' };
  return { role: p.role || '', org: p.institution || '' };
}

export function subtitleForPerson(p) {
  if (p.roles && p.roles.length > 0) {
    const current = p.roles.find((r) => r.current) || p.roles[0];
    return [current.role, current.institution_name].filter(Boolean).join(' @ ') || 'Pessoa';
  }
  return [p.role, p.institution].filter(Boolean).join(' · ') || 'Pessoa';
}

export function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

// ── País da pessoa ──────────────────────────────────────────────────────────
// Desde a migração 0050 network_people TEM coluna `country`, que é a fonte
// primária. Quando ela está vazia (a maioria dos contatos antigos), o país é
// herdado das organizações vinculadas — por contact_org_links (Mercado) e por
// person_roles (Networking), ambas apontando para market_organizations.country.
// Sem nenhuma pista, o país fica '' (= NL, o default assumido do ecossistema).
export { isBrazilianCountry };

// Mapa person_id → país EFETIVO (código normalizado, '' quando desconhecido).
export function buildPersonCountryMap(people, institutions, contactOrgLinks, personRoles) {
  const orgCountry = new Map();
  (Array.isArray(institutions) ? institutions : []).forEach((o) => {
    if (!o || !o.id) return;
    const c = normalizeCountry(o.country);
    if (c) orgCountry.set(o.id, c);
  });
  // País herdado de org, por pessoa. O primeiro vínculo com país vence; um
  // vínculo brasileiro tem prioridade (é o caso que a UI precisa destacar).
  const inherited = new Map();
  const inherit = (personId, orgId) => {
    if (!personId || !orgId) return;
    const c = orgCountry.get(orgId);
    if (!c) return;
    const prev = inherited.get(personId);
    if (!prev || (c === 'BR' && prev !== 'BR')) inherited.set(personId, c);
  };
  (Array.isArray(contactOrgLinks) ? contactOrgLinks : []).forEach((l) => {
    if (l) inherit(l.person_id, l.organization_id);
  });
  (Array.isArray(personRoles) ? personRoles : []).forEach((r) => {
    if (r) inherit(r.person_id, r.institution_id);
  });

  const out = new Map();
  (Array.isArray(people) ? people : []).forEach((p) => {
    if (!p || !p.id) return;
    out.set(p.id, normalizeCountry(p.country) || inherited.get(p.id) || '');
  });
  return out;
}

export function buildBrazilianPersonSet(people, institutions, contactOrgLinks, personRoles) {
  const byPerson = buildPersonCountryMap(people, institutions, contactOrgLinks, personRoles);
  const out = new Set();
  byPerson.forEach((country, id) => {
    if (country === 'BR') out.add(id);
  });
  return out;
}

// ── Ego network ─────────────────────────────────────────────────────────────
// Monta o grafo egocêntrico a partir dos dados que já existem:
//   1º grau  — conexões diretas (network_connections) + pessoas da MESMA
//              organização (contact_org_links);
//   2º grau  — conexões diretas dos nós de 1º grau (só network_connections),
//              excluindo quem já apareceu.
// `visited` acumula tudo que entrou no grafo, para que o render saiba quem
// sobrou de fora (nós "não conectados").
export function buildEgoNetwork(centerId, degrees, people, connections, contactOrgLinks) {
  const conns = Array.isArray(connections) ? connections : [];
  const links = Array.isArray(contactOrgLinks) ? contactOrgLinks : [];
  // Só entram no grafo pessoas que existem na lista carregada — vínculos
  // órfãos (pessoa apagada) sairiam como nó fantasma sem nome.
  const known = new Set((Array.isArray(people) ? people : []).map((p) => p && p.id).filter(Boolean));

  const visited = new Set([centerId]);
  const edges = [];
  const nodesByDegree = { 0: [centerId] };

  const direct = conns
    .filter((c) => c.person_a_id === centerId || c.person_b_id === centerId)
    .map((c) => (c.person_a_id === centerId ? c.person_b_id : c.person_a_id));

  const centerOrgIds = links
    .filter((l) => l.person_id === centerId)
    .map((l) => l.organization_id);

  const sameOrg = links
    .filter((l) => centerOrgIds.includes(l.organization_id) && l.person_id !== centerId)
    .map((l) => l.person_id);

  const firstDegree = [...new Set([...direct, ...sameOrg])].filter((id) => id && known.has(id));
  nodesByDegree[1] = firstDegree;
  firstDegree.forEach((id) => {
    visited.add(id);
    edges.push({ from: centerId, to: id, degree: 1 });
  });

  if (degrees >= 2) {
    const secondDegree = [];
    firstDegree.forEach((nodeId) => {
      const nodeConns = conns
        .filter((c) => c.person_a_id === nodeId || c.person_b_id === nodeId)
        .map((c) => (c.person_a_id === nodeId ? c.person_b_id : c.person_a_id))
        .filter((id) => id && known.has(id) && !visited.has(id));

      nodeConns.forEach((id) => {
        if (!visited.has(id)) {
          visited.add(id);
          secondDegree.push(id);
          edges.push({ from: nodeId, to: id, degree: 2 });
        }
      });
    });
    nodesByDegree[2] = secondDegree;
  }

  return { nodesByDegree, edges, visited };
}

// Rótulo de uma aresta: o tipo da conexão quando existe uma em
// network_connections; senão, o nome da organização em comum (o vínculo de 1º
// grau também nasce de contact_org_links).
export function edgeLabel(fromId, toId, connections, contactOrgLinks, institutions) {
  const conn = (Array.isArray(connections) ? connections : []).find(
    (c) => (c.person_a_id === fromId && c.person_b_id === toId)
      || (c.person_a_id === toId && c.person_b_id === fromId),
  );
  if (conn && conn.connection_type) return conn.connection_type;

  const links = Array.isArray(contactOrgLinks) ? contactOrgLinks : [];
  const fromOrgs = new Set(links.filter((l) => l.person_id === fromId).map((l) => l.organization_id));
  const shared = links.find((l) => l.person_id === toId && fromOrgs.has(l.organization_id));
  if (shared) {
    const org = (Array.isArray(institutions) ? institutions : []).find((o) => o.id === shared.organization_id);
    return org ? org.name : 'mesma organização';
  }
  return conn ? 'conexão' : 'vínculo';
}
