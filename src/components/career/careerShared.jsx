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

// Trilha (track) sugerida a partir do tipo — usada na criação rápida a partir
// de uma organização/evento e no editor, que auto-seleciona a trilha quando o
// tipo muda (o usuário ainda pode sobrescrever manualmente).
export const TYPE_TO_TRACK = {
  job: 'job',
  contract: 'job',
  phd: 'phd',
  postdoc: 'phd',
  grant: 'phd',
  collaboration: 'phd',
  spinoff_support: 'spinoff',
};

export function trackForType(type) {
  return TYPE_TO_TRACK[type] || 'job';
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

// v2.26.2 — 'mapped' é um status de arquivo (fora do Kanban ativo), alcançado
// só pelo botão "Coleta concluída" — por isso não entra em OPP_STATUS_ORDER
// (que alimenta o select manual de status no editor/modal). Ambos 'mapped' e
// 'dead' aparecem juntos na aba Arquivo — 'dead' já era o "arquivo" de facto
// desta app antes de existir uma aba dedicada para isso.
OPP_STATUS_LABELS.mapped = 'Mapeada';
export const ARCHIVE_STATUSES = ['mapped', 'dead'];

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

// Cor do prazo por urgência. Retorna { text, bg }:
//   text = classe de cor/peso do texto; bg = classe de fundo do card (vazia
//   quando o prazo não é urgente, para o card manter o fundo padrão).
// ATENÇÃO: até a v2.25.11 esta função devolvia uma STRING. Agora devolve um
// objeto — todos os chamadores usam `.text` (e opcionalmente `.bg`). O
// deadlineColor de eventsShared.jsx é OUTRA função e segue devolvendo string.
// Usa daysUntil() (não `new Date(deadline)` direto) para continuar aceitando
// prazos no formato YYYY-MM além de YYYY-MM-DD, e para zerar as horas do dia.
export function deadlineColor(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null) return { text: 'text-muted', bg: '' };
  if (d < 0)  return { text: 'text-red-700 font-bold',      bg: 'bg-red-50 border-red-200' };
  if (d < 7)  return { text: 'text-red-600 font-semibold',  bg: 'bg-red-50' };
  if (d < 14) return { text: 'text-amber-600 font-medium',  bg: 'bg-amber-50' };
  if (d < 30) return { text: 'text-amber-500',              bg: '' };
  if (d < 60) return { text: 'text-ink2',                   bg: '' };
  return { text: 'text-muted', bg: '' };
}

// Texto de contagem regressiva exibido abaixo da data no card/modal.
// null (nada exibido) quando falta mais de 30 dias ou não há prazo.
export function deadlineCountdown(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null || d >= 30) return null;
  if (d < 0) return { text: `${-d} ${-d === 1 ? 'dia' : 'dias'} atrás`, className: 'text-red-700 font-bold' };
  if (d === 0) return { text: 'hoje', className: 'text-red-600 font-semibold' };
  const label = `em ${d} ${d === 1 ? 'dia' : 'dias'}`;
  if (d < 7) return { text: label, className: 'text-red-600 font-semibold' };
  if (d < 14) return { text: label, className: 'text-amber-600' };
  return { text: label, className: 'text-muted' };
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

// --- Histórico de status (activity log) --------------------------------------
// O worker registra cada mudança de status como uma linha em `notes`.
// Dois formatos convivem no banco:
//   antigo (≤ v2.25.11): [2026-07-15 14:30] status: to_organize → preparing
//   novo   (v2.25.12+):  [15/07/2026] Status: to_organize → preparing
// O parser aceita OS DOIS para que o histórico já gravado continue aparecendo
// na timeline. Devolve { entries, rest } — `rest` são as notas do usuário sem
// as linhas de log, para exibir/editar o texto livre separadamente.
const STATUS_LOG_RE = /^\[([^\]]+)\]\s*status:\s*(\S+)\s*(?:→|->)\s*(\S+)\s*$/i;

// Normaliza a data do log para DD/MM/YYYY (aceita ISO do formato antigo).
function fmtLogDate(raw) {
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return s;
}

// `logLines` devolve as linhas de log EXATAMENTE como estão no banco. O editor
// de notas mostra só `rest` ao usuário e re-anexa `logLines` ao salvar, para
// que editar as notas nunca apague o histórico.
export function parseStatusLog(notes) {
  const entries = [];
  const logLines = [];
  const rest = [];
  for (const line of String(notes || '').split('\n')) {
    const m = line.match(STATUS_LOG_RE);
    if (m) {
      entries.push({ date: fmtLogDate(m[1]), from: m[2], to: m[3] });
      logLines.push(line);
    } else {
      rest.push(line);
    }
  }
  return { entries, logLines, rest: rest.join('\n').trim() };
}

// Recompõe o campo `notes` a partir do texto livre editado + o histórico
// preservado. Usado ao salvar as notas no modal da oportunidade.
export function joinNotesWithLog(rest, logLines) {
  return [String(rest || '').trim(), ...(logLines || [])].filter(Boolean).join('\n');
}
