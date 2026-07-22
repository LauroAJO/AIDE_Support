// Helpers compartilhados da área Carreira (Etapa 5): rótulos PT-BR, cores por
// trilha (PhD / Emprego / Spin-off), badges e utilitários de prazo/prioridade.
// Reutiliza StarRating, Badge e parseTags da área Mercado para manter o visual
// consistente entre as duas áreas.
export { StarRating, Badge, parseTags } from '../market/marketShared';
import { Badge } from '../market/marketShared';

// --- Trilhas (track) ---------------------------------------------------------
export const TRACK_LABELS = {
  phd: 'PhD',
  job: 'Emprego',
  spinoff: 'Spin-off',
};

// Cores por trilha. `all` (sem filtro) é cinza neutro.
export const TRACK_COLORS = {
  phd:     { hex: '#6366f1', dot: 'bg-indigo-500', header: 'bg-indigo-50 text-indigo-700', chip: 'bg-indigo-100 text-indigo-700', emoji: '🎓' },
  job:     { hex: '#F59E0B', dot: 'bg-amber-500',  header: 'bg-amber-50 text-amber-700',   chip: 'bg-amber-100 text-amber-700',  emoji: '💼' },
  spinoff: { hex: '#22C55E', dot: 'bg-green-500',  header: 'bg-green-50 text-green-700',   chip: 'bg-green-100 text-green-700',  emoji: '🚀' },
  all:     { hex: '#9CA3AF', dot: 'bg-gray-400',   header: 'bg-surface2 text-ink2',        chip: 'bg-surface2 text-ink2',        emoji: '' },
};

export function trackColor(track) {
  return TRACK_COLORS[track] || TRACK_COLORS.all;
}

export function TrackBadge({ track }) {
  const c = trackColor(track);
  return <Badge className={c.chip}>{TRACK_LABELS[track] || track || '—'}</Badge>;
}

// --- Tipos de oportunidade ---------------------------------------------------
export const OPP_TYPE_LABELS = {
  job: 'Vaga',
  phd: 'PhD',
  postdoc: 'Pós-doc',
  grant: 'Bolsa',
  collaboration: 'Colaboração',
  spinoff_support: 'Apoio Spin-off',
  contract: 'Contrato',
};

export function OppTypeBadge({ type }) {
  return <Badge className="bg-accent/10 text-accent">{OPP_TYPE_LABELS[type] || type || '—'}</Badge>;
}

// --- Pipeline: 5 colunas, uma por status do banco.
// dropStatus = status gravado quando um card é solto na coluna.
export const PIPELINE_COLUMNS = [
  { key: 'to_organize', label: 'Identificadas a Organizar', statuses: ['to_organize'], dropStatus: 'to_organize' },
  { key: 'preparing',   label: 'Preparando',                statuses: ['preparing'],   dropStatus: 'preparing' },
  { key: 'applied',     label: 'Aplicada',                  statuses: ['applied'],     dropStatus: 'applied' },
  { key: 'in_process',  label: 'Em Processo',               statuses: ['in_process'],  dropStatus: 'in_process' },
  { key: 'dead',        label: 'Vagas Mortas',              statuses: ['dead'],        dropStatus: 'dead' },
];

// Todos os status do banco, para selects de status no modal/editor.
export const OPP_STATUS_LABELS = {
  to_organize: 'Identificadas a Organizar',
  preparing: 'Preparando',
  applied: 'Aplicada',
  in_process: 'Em Processo',
  dead: 'Vagas Mortas',
};

export const OPP_STATUS_ORDER = ['to_organize', 'preparing', 'applied', 'in_process', 'dead'];

// --- Documentos --------------------------------------------------------------
export const DOC_TYPE_LABELS = {
  cv: 'CV',
  cover_letter: 'Carta',
  research_statement: 'Research Statement',
  phd_proposal: 'Proposta PhD',
  spinoff_pitch: 'Pitch',
  other: 'Outro',
};

// Mapeia o filtro simplificado da UI (CV | Carta | Proposta | Pitch | Outro)
// para os tipos do banco.
export const DOC_TYPE_FILTERS = [
  { key: 'cv', label: 'CV' },
  { key: 'cover_letter', label: 'Carta' },
  { key: 'phd_proposal', label: 'Proposta' },
  { key: 'spinoff_pitch', label: 'Pitch' },
  { key: 'other', label: 'Outro' },
];

export function DocTypeBadge({ type }) {
  return <Badge className="bg-accent/10 text-accent">{DOC_TYPE_LABELS[type] || type || '—'}</Badge>;
}

// --- Prazo (deadline) --------------------------------------------------------
// Dias até a data (YYYY-MM ou YYYY-MM-DD). null se não houver data válida.
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const s = dateStr.length === 7 ? `${dateStr}-01` : dateStr; // YYYY-MM → primeiro dia
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((t - today.getTime()) / 86400000);
}

// Classe de cor para o prazo: vermelho < 30 dias, laranja < 60, cinza além disso.
export function deadlineColor(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null) return 'text-muted';
  if (d < 0) return 'text-red-600 font-semibold';
  if (d < 30) return 'text-red-600 font-semibold';
  if (d < 60) return 'text-amber-600 font-medium';
  return 'text-ink2';
}

// --- Prioridade --------------------------------------------------------------
// Ponto colorido por prioridade 1-5.
export function priorityDot(priority) {
  const p = Number(priority) || 3;
  if (p >= 5) return 'bg-red-500';
  if (p === 4) return 'bg-orange-500';
  if (p === 3) return 'bg-amber-400';
  if (p === 2) return 'bg-blue-400';
  return 'bg-gray-300';
}

export const PRIORITY_LABELS = { 1: 'Muito baixa', 2: 'Baixa', 3: 'Média', 4: 'Alta', 5: 'Crítica' };
