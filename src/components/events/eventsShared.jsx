// Helpers compartilhados da área Eventos & Venues (v2.5.0): rótulos PT-BR,
// cores por tipo/status/área, badges e utilitários de prazo. Reaproveita
// StarRating, Badge e parseTags da área Mercado para manter o visual
// consistente entre as áreas Rede Profissional.
export { StarRating, Badge, parseTags } from '../market/marketShared';
import { Badge } from '../market/marketShared';

// --- Tipos de evento ---------------------------------------------------------
export const EVENT_TYPE_LABELS = {
  conference_academic: 'Acadêmico',
  conference_commercial: 'Comercial',
  conference_hybrid: 'Híbrido',
  workshop: 'Workshop',
  networking_informal: 'Networking',
  networking_formal: 'Networking Formal',
  summer_school: 'Summer School',
};

// Cor do badge por tipo (chip Tailwind).
export const EVENT_TYPE_COLORS = {
  conference_academic: 'bg-indigo-100 text-indigo-700',
  conference_commercial: 'bg-amber-100 text-amber-700',
  conference_hybrid: 'bg-purple-100 text-purple-700',
  workshop: 'bg-blue-100 text-blue-700',
  networking_informal: 'bg-green-100 text-green-700',
  networking_formal: 'bg-green-100 text-green-800',
  summer_school: 'bg-teal-100 text-teal-700',
};

export function EventTypeBadge({ type }) {
  return <Badge className={EVENT_TYPE_COLORS[type] || 'bg-surface2 text-ink2'}>{EVENT_TYPE_LABELS[type] || type || '—'}</Badge>;
}

// Filtro simplificado de tipo na UI (chips).
export const EVENT_TYPE_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'conference_academic', label: 'Acadêmico' },
  { key: 'conference_commercial', label: 'Comercial' },
  { key: 'conference_hybrid', label: 'Híbrido' },
  { key: 'networking_informal', label: 'Networking' },
  { key: 'workshop', label: 'Workshop' },
];

// --- Áreas -------------------------------------------------------------------
export const AREA_LABELS = {
  hydrogen: 'H2',
  energy_systems: 'Sistemas Energia',
  process_engineering: 'Eng. Processos',
  simulation: 'Simulação',
  control_automation: 'Controle',
  power_systems: 'Power Systems',
  mechanical_engineering: 'Eng. Mecânica',
  thermal_engineering: 'Eng. Térmica',
  deeptech: 'Deep-tech',
  other: 'Outro',
};

export function AreaBadge({ area }) {
  return <Badge className="bg-surface2 text-ink2">{AREA_LABELS[area] || area || '—'}</Badge>;
}

// Chips de filtro por área (subconjunto principal).
export const AREA_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'hydrogen', label: 'H2' },
  { key: 'energy_systems', label: 'Sistemas Energia' },
  { key: 'process_engineering', label: 'Eng. Processos' },
  { key: 'simulation', label: 'Simulação' },
  { key: 'control_automation', label: 'Controle' },
  { key: 'deeptech', label: 'Deep-tech' },
];

// --- Status do evento --------------------------------------------------------
export const EVENT_STATUS_LABELS = {
  identified: 'Identificado',
  priority: 'Prioridade',
  submitting: 'Submetendo',
  submitted: 'Submetido',
  accepted: 'Aceito',
  registered: 'Inscrito',
  attended: 'Participou',
  rejected: 'Rejeitado',
  discarded: 'Descartado',
};

export const EVENT_STATUS_ORDER = [
  'identified', 'priority', 'submitting', 'submitted',
  'accepted', 'registered', 'attended', 'rejected', 'discarded',
];

export const EVENT_STATUS_COLORS = {
  identified: 'bg-surface2 text-ink2',
  priority: 'bg-orange-100 text-orange-700',
  submitting: 'bg-amber-100 text-amber-700',
  submitted: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  registered: 'bg-indigo-100 text-indigo-700',
  attended: 'bg-emerald-200 text-emerald-800',
  rejected: 'bg-red-100 text-red-700',
  discarded: 'bg-surface2 text-muted line-through',
};

export function EventStatusBadge({ status }) {
  return <Badge className={EVENT_STATUS_COLORS[status] || 'bg-surface2 text-ink2'}>{EVENT_STATUS_LABELS[status] || status}</Badge>;
}

// --- Custo -------------------------------------------------------------------
export const COST_LABELS = { low: 'Baixo', medium: 'Médio', high: 'Alto' };

export function CostBadge({ level }) {
  const c = { low: 'bg-green-100 text-green-700', medium: 'bg-amber-100 text-amber-700', high: 'bg-red-100 text-red-700' };
  return <Badge className={c[level] || 'bg-surface2 text-ink2'}>{COST_LABELS[level] || level || '—'}</Badge>;
}

// --- Fase estratégica --------------------------------------------------------
export const PHASE_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: '1', label: 'Fase 1' },
  { key: '2', label: 'Fase 2' },
  { key: '3', label: 'Fase 3' },
];

export const PHASE_DESCRIPTIONS = {
  1: 'Fase 1 — Consolidação e primeiras submissões',
  2: 'Fase 2 — Expansão e networking estratégico',
  3: 'Fase 3 — Liderança e visibilidade internacional',
};

// --- Tipos de venue ----------------------------------------------------------
export const VENUE_TYPE_LABELS = {
  journal: 'Journal',
  proceedings_journal: 'Proceedings',
  book_series: 'Livro',
  preprint: 'Preprint',
};

export function VenueTypeBadge({ type }) {
  return <Badge className="bg-accent/10 text-accent">{VENUE_TYPE_LABELS[type] || type || '—'}</Badge>;
}

export function QuartileBadge({ quartile }) {
  if (!quartile) return null;
  const c = {
    Q1: 'bg-green-100 text-green-700',
    Q2: 'bg-blue-100 text-blue-700',
    Q3: 'bg-surface2 text-ink2',
    Q4: 'bg-surface2 text-ink2',
  };
  return <Badge className={c[quartile] || 'bg-surface2 text-ink2'}>{quartile}</Badge>;
}

// --- Tipos de vínculo evento↔venue -------------------------------------------
export const LINK_TYPE_LABELS = {
  proceedings: 'Proceedings',
  special_issue: 'Special Issue',
  invitation: 'Convite',
};

// --- Datas & prazos ----------------------------------------------------------
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Dias até uma data (YYYY-MM ou YYYY-MM-DD). null se inválida/ausente.
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const s = dateStr.length === 7 ? `${dateStr}-01` : dateStr;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((t - today.getTime()) / 86400000);
}

// "DD MMM YYYY" a partir de YYYY-MM-DD. Aceita YYYY-MM (sem dia).
export function fmtDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  const y = parts[0];
  const m = Number(parts[1]);
  const d = parts[2];
  if (!m) return y || dateStr;
  const mm = MESES[m - 1] || parts[1];
  return d ? `${d} ${mm} ${y}` : `${mm} ${y}`;
}

// Intervalo "22-26 Jun 2026" quando possível; senão "A confirmar".
export function fmtDateRange(start, end) {
  if (!start && !end) return 'A confirmar';
  if (start && !end) return fmtDate(start);
  const sp = start.split('-');
  const ep = end.split('-');
  // Mesmo mês/ano → "22-26 Jun 2026"
  if (sp[0] === ep[0] && sp[1] === ep[1] && sp[2] && ep[2]) {
    const mm = MESES[Number(sp[1]) - 1] || sp[1];
    return `${sp[2]}-${ep[2]} ${mm} ${sp[0]}`;
  }
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

// "DD/MM/YYYY" para exibição no detalhe.
export function fmtBR(dateStr) {
  if (!dateStr) return '—';
  const p = dateStr.split('-');
  if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
  if (p.length === 2) return `${p[1]}/${p[0]}`;
  return dateStr;
}

// Classe de cor por urgência de prazo: vermelho < 30, âmbar < 60, cinza além.
export function deadlineColor(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null) return 'text-muted';
  if (d < 30) return 'text-red-600 font-semibold';
  if (d < 60) return 'text-amber-600 font-medium';
  return 'text-ink2';
}

// Cor da timeline de prazos (tab Prazos): <15 vermelho, 15-30 âmbar, 30-60
// verde, >60 cinza.
export function urgencyColor(days) {
  if (days === null) return 'text-muted';
  if (days < 15) return 'text-red-600';
  if (days < 30) return 'text-amber-600';
  if (days < 60) return 'text-green-600';
  return 'text-muted';
}
