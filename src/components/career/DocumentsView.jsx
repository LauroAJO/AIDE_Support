import { useEffect, useMemo, useState } from 'react';
import { Plus, X, ExternalLink, Loader2, FileText } from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import LoadingSpinner from '../shared/LoadingSpinner';
import ConfirmModal from '../shared/ConfirmModal';
import { DraftBanner } from '../shared/DraftBanner';
import { useDraft } from '../../hooks/useDraft';
import {
  useUnsavedGuard, DISCARD_TITLE, DISCARD_MESSAGE,
  DISCARD_CONFIRM_LABEL, DISCARD_CANCEL_LABEL,
} from '../../hooks/useUnsavedGuard';
import { DocTypeBadge, DOC_TYPE_LABELS, DOC_TYPE_FILTERS } from './careerShared';

const EMPTY_DOC = {
  title: '', type: 'cv', version: 'v1', opportunity_id: '', drive_link: '', drive_file_id: '', notes: '',
};

// Templates de criação rápida (Parte 3). `title(ctx)` monta o título a partir
// do contexto: n = próxima versão daquele tipo, date = hoje (ISO), year = ano.
// Os trechos entre colchetes ([org], [tema]) ficam como placeholder para o
// usuário completar — o campo Título continua editável normalmente.
// NOTA: "Pitch Spin-off" usa o tipo `spinoff_pitch`, que já existe em
// DOC_TYPE_LABELS ('Pitch'), e não `other` — assim o documento cai no filtro
// "Pitch" da barra superior em vez de virar "Outro".
const DOC_TEMPLATES = [
  { key: 'cv',                 label: 'CV',                 type: 'cv',                 title: (c) => `CV - Lauro Oliveira - v${c.n}` },
  { key: 'cover_letter',       label: 'Cover Letter',       type: 'cover_letter',       title: ()  => `Cover Letter - [org] - ${todayISO()}` },
  { key: 'research_statement', label: 'Research Statement', type: 'research_statement', title: ()  => `Research Statement - ${todayISO()}` },
  { key: 'phd_proposal',       label: 'PhD Proposal',       type: 'phd_proposal',       title: (c) => `PhD Proposal - [tema] - ${c.year}` },
  { key: 'spinoff_pitch',      label: 'Pitch Spin-off',     type: 'spinoff_pitch',      title: (c) => `Pitch RHYSE Simulator - v${c.n}` },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Próxima versão de um tipo = quantidade já cadastrada + 1.
function nextVersionFor(docs, type) {
  return (docs || []).filter((d) => d.type === type).length + 1;
}

function fmtDate(unix) {
  if (!unix) return '—';
  try {
    return new Date(unix * 1000).toISOString().slice(0, 10);
  } catch {
    return '—';
  }
}

export default function DocumentsView() {
  const docs = useStore((s) => s.careerDocuments);
  const setDocs = useStore((s) => s.setCareerDocuments);

  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [oppFilter, setOppFilter] = useState('');
  const [opps, setOpps] = useState([]);
  const [editorOpen, setEditorOpen] = useState(false);

  const load = async () => {
    try {
      setDocs(await apiFetch('/api/career/documents'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    apiFetch('/api/career/opportunities').then((r) => setOpps(r || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const oppName = useMemo(() => {
    const m = {};
    opps.forEach((o) => { m[o.id] = o.title; });
    return m;
  }, [opps]);

  const filtered = useMemo(() => {
    let list = [...docs];
    if (typeFilter) list = list.filter((d) => d.type === typeFilter);
    if (oppFilter) list = list.filter((d) => d.opportunity_id === oppFilter);
    return list;
  }, [docs, typeFilter, oppFilter]);

  if (loading) return <div className="h-full"><LoadingSpinner label="Carregando documentos..." /></div>;

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Filtros + novo */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={!typeFilter} onClick={() => setTypeFilter('')}>Todos</Chip>
          {DOC_TYPE_FILTERS.map((f) => (
            <Chip key={f.key} active={typeFilter === f.key} onClick={() => setTypeFilter(typeFilter === f.key ? '' : f.key)}>{f.label}</Chip>
          ))}
        </div>
        <select value={oppFilter} onChange={(e) => setOppFilter(e.target.value)} className="rounded-lg border border-line bg-surface2 px-2 py-1.5 text-xs text-ink2">
          <option value="">Todas as oportunidades</option>
          {opps.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
        </select>
        <button type="button" onClick={() => setEditorOpen(true)} className="ml-auto flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90">
          <Plus className="h-4 w-4" /> Novo Documento
        </button>
      </div>

      {/* Lista */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {filtered.length === 0 && <p className="px-1 text-sm text-muted">Nenhum documento cadastrado.</p>}
        {filtered.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3">
            <FileText className="h-5 w-5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">{d.title}</span>
                <span className="rounded bg-surface2 px-1.5 py-0.5 text-[11px] text-ink2">{d.version}</span>
                <DocTypeBadge type={d.type} />
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                {d.opportunity_id && oppName[d.opportunity_id] && <span>{oppName[d.opportunity_id]}</span>}
                <span>· {fmtDate(d.updated_at || d.created_at)}</span>
              </div>
            </div>
            {d.drive_link ? (
              <a href={d.drive_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm text-ink2 hover:bg-surface2">
                <ExternalLink className="h-4 w-4" /> Abrir no Drive
              </a>
            ) : (
              <span className="rounded-lg border border-dashed border-line px-3 py-1.5 text-xs text-muted">Sem link</span>
            )}
          </div>
        ))}
      </div>

      {editorOpen && (
        <DocumentEditor docs={docs} opps={opps} onClose={() => setEditorOpen(false)} onSaved={() => { setEditorOpen(false); load(); }} />
      )}
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${active ? 'bg-accent text-white' : 'border border-line bg-surface text-ink2 hover:bg-surface2'}`}>
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink2">{label}</span>
      {children}
    </label>
  );
}

function DocumentEditor({ docs, opps, onClose, onSaved }) {
  // Rascunho (v2.25.16).
  const {
    value: form, setValue: setForm, clearDraft, discardDraft, hasDraft,
  } = useDraft('career-doc-new', EMPTY_DOC);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [template, setTemplate] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const isDirty = JSON.stringify(form) !== JSON.stringify(EMPTY_DOC);
  const guard = useUnsavedGuard({ isDirty, onClose, onDiscard: discardDraft });

  // Aplica um template: preenche tipo, título e versão. Tudo continua editável.
  const applyTemplate = (t) => {
    const n = nextVersionFor(docs, t.type);
    setTemplate(t.key);
    set({ type: t.type, title: t.title({ n, year: new Date().getFullYear() }), version: `v${n}` });
  };

  const save = async () => {
    if (!form.title.trim()) { setError('Título é obrigatório'); return; }
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/career/documents', {
        method: 'POST',
        body: JSON.stringify({ ...form, opportunity_id: form.opportunity_id || null }),
      });
      clearDraft();          // salvo no servidor: o rascunho não serve mais
      onSaved();
    } catch (e) {
      setError(String(e.message || e));
      setSaving(false);
    }
  };

  return (
    <>
    {/* Backdrop SEM onClick (v2.25.16). */}
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="flex h-full w-full flex-col bg-surface shadow-soft sm:max-w-md">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">Novo documento</h2>
          <button onClick={guard.requestClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {hasDraft && <DraftBanner onDiscard={discardDraft} />}
          {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}

          {/* Templates de criação rápida — preenchem tipo/título/versão. */}
          <div className="rounded-lg border border-line bg-surface2 px-3 py-2.5">
            <span className="mb-1.5 block text-xs font-medium text-ink2">Usar template:</span>
            <div className="flex flex-wrap gap-1.5">
              {DOC_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                    template === t.key ? 'bg-accent text-white' : 'border border-line bg-surface text-ink2 hover:bg-surface2'
                  }`}
                >
                  📄 {t.label}
                </button>
              ))}
            </div>
          </div>

          <Field label="Título *"><input value={form.title} onChange={(e) => set({ title: e.target.value })} className="input" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select value={form.type} onChange={(e) => set({ type: e.target.value })} className="input">
                {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Versão"><input value={form.version} onChange={(e) => set({ version: e.target.value })} className="input" placeholder="v1" /></Field>
          </div>
          <Field label="Oportunidade">
            <select value={form.opportunity_id} onChange={(e) => set({ opportunity_id: e.target.value })} className="input">
              <option value="">— Nenhuma —</option>
              {opps.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
          </Field>
          <Field label="Link do Drive"><input value={form.drive_link} onChange={(e) => set({ drive_link: e.target.value })} className="input" placeholder="https://drive.google.com/..." /></Field>
          <Field label="Notas"><textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} className="input min-h-[70px]" /></Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button type="button" onClick={guard.requestClose} className="rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2">Cancelar</button>
          <button type="button" onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </button>
        </div>
      </div>
    </div>

    <ConfirmModal
      open={guard.confirming}
      title={DISCARD_TITLE}
      message={DISCARD_MESSAGE}
      confirmLabel={DISCARD_CONFIRM_LABEL}
      cancelLabel={DISCARD_CANCEL_LABEL}
      danger
      onConfirm={guard.confirmDiscard}
      onCancel={guard.cancelDiscard}
    />
    </>
  );
}
