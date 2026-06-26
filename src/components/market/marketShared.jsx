// Helpers compartilhados da área Mercado (Etapa 4): rótulos PT-BR, badges e
// avaliação por estrelas. Mantidos num só lugar para as três sub-abas
// (Organizações, Projetos, Contatos) ficarem visualmente consistentes.
import { Star } from 'lucide-react';

export const ORG_TYPE_LABELS = {
  company: 'Empresa',
  university: 'Universidade',
  research_institute: 'Instituto',
  funder: 'Financiador',
  consortium: 'Consórcio',
  other: 'Outro',
};

export const ORG_STATUS_LABELS = {
  prospect: 'Prospect',
  active: 'Ativo',
  partner: 'Parceiro',
  inactive: 'Inativo',
};

const ORG_STATUS_COLORS = {
  prospect: 'bg-surface2 text-ink2',
  active: 'bg-blue-100 text-blue-700',
  partner: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-surface2 text-muted',
};

export const PROJECT_TYPE_LABELS = {
  research: 'Pesquisa',
  funding_call: 'Financiamento',
  consortium: 'Consórcio',
  phd_program: 'PhD',
  job_opening: 'Vaga',
  collaboration: 'Colaboração',
};

export const PROJECT_STATUS_LABELS = {
  active: 'Ativo',
  completed: 'Concluído',
  planned: 'Planejado',
  call_open: 'Edital Aberto',
};

const PROJECT_STATUS_COLORS = {
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  planned: 'bg-surface2 text-ink2',
  call_open: 'bg-amber-100 text-amber-700',
};

export const OUTREACH_LABELS = {
  not_contacted: 'Não contatado',
  contacted: 'Contatado',
  responded: 'Respondeu',
  meeting_scheduled: 'Reunião agendada',
  ongoing: 'Em andamento',
  converted: 'Convertido',
  inactive: 'Inativo',
};

export const OUTREACH_COLORS = {
  not_contacted: 'bg-surface2 text-ink2',
  contacted: 'bg-blue-100 text-blue-700',
  responded: 'bg-emerald-100 text-emerald-700',
  meeting_scheduled: 'bg-indigo-100 text-indigo-700',
  ongoing: 'bg-amber-100 text-amber-700',
  converted: 'bg-emerald-200 text-emerald-800',
  inactive: 'bg-surface2 text-muted',
};

export const OUTREACH_ORDER = [
  'not_contacted', 'contacted', 'responded', 'meeting_scheduled',
  'ongoing', 'converted', 'inactive',
];

export function Badge({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {children}
    </span>
  );
}

export function OrgTypeBadge({ type }) {
  return <Badge className="bg-accent/10 text-accent">{ORG_TYPE_LABELS[type] || type || '—'}</Badge>;
}

export function OrgStatusBadge({ status }) {
  return <Badge className={ORG_STATUS_COLORS[status] || 'bg-surface2 text-ink2'}>{ORG_STATUS_LABELS[status] || status}</Badge>;
}

export function ProjectTypeBadge({ type }) {
  return <Badge className="bg-accent/10 text-accent">{PROJECT_TYPE_LABELS[type] || type || '—'}</Badge>;
}

export function ProjectStatusBadge({ status }) {
  return <Badge className={PROJECT_STATUS_COLORS[status] || 'bg-surface2 text-ink2'}>{PROJECT_STATUS_LABELS[status] || status}</Badge>;
}

export function OutreachBadge({ status }) {
  return <Badge className={OUTREACH_COLORS[status] || 'bg-surface2 text-ink2'}>{OUTREACH_LABELS[status] || status}</Badge>;
}

// Estrelas 1..max. Somente leitura quando `onChange` não é passado.
export function StarRating({ value = 0, max = 5, onChange, size = 14 }) {
  const v = Number(value) || 0;
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < v;
        const star = (
          <Star
            className={filled ? 'text-amber-400' : 'text-line'}
            fill={filled ? 'currentColor' : 'none'}
            style={{ width: size, height: size }}
          />
        );
        if (!onChange) return <span key={i}>{star}</span>;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i + 1 === v ? 0 : i + 1)}
            className="leading-none transition hover:scale-110"
            title={`${i + 1}`}
          >
            {star}
          </button>
        );
      })}
    </span>
  );
}

export function parseTags(tags) {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === 'string' && tags) {
    try {
      const p = JSON.parse(tags);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}
