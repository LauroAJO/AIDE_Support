// Helpers puros compartilhados entre NetworkingPage.jsx (lista/tabela/heatmap/
// Mapa Orbital) e NetworkMapRede.jsx (Mapa de Rede). Extraídos daqui para
// evitar duplicação — nenhuma lógica foi alterada na mudança de arquivo.

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

// ── Brasil vs. exterior ─────────────────────────────────────────────────────
// network_people NÃO tem coluna `country` (ver migrations/0015_hierarchy.sql):
// a nacionalidade só existe nas organizações (market_organizations.country).
// Então a detecção é feita pelas orgs vinculadas à pessoa — por
// contact_org_links (Mercado) e por person_roles (Networking). O teste em
// `person.country` fica por robustez, caso a coluna venha a existir.
const BR_TOKENS = ['br', 'brasil', 'brazil'];

export function isBrazilianCountry(country) {
  const s = String(country || '').trim().toLowerCase();
  if (!s) return false;
  return s === 'br' || BR_TOKENS.some((t) => s.includes(t));
}

export function buildBrazilianPersonSet(people, institutions, contactOrgLinks, personRoles) {
  const brOrgIds = new Set(
    (Array.isArray(institutions) ? institutions : [])
      .filter((o) => o && isBrazilianCountry(o.country))
      .map((o) => o.id),
  );
  const out = new Set();
  (Array.isArray(people) ? people : []).forEach((p) => {
    if (p && isBrazilianCountry(p.country)) out.add(p.id);
  });
  (Array.isArray(contactOrgLinks) ? contactOrgLinks : []).forEach((l) => {
    if (l && l.person_id && brOrgIds.has(l.organization_id)) out.add(l.person_id);
  });
  (Array.isArray(personRoles) ? personRoles : []).forEach((r) => {
    if (r && r.person_id && brOrgIds.has(r.institution_id)) out.add(r.person_id);
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
