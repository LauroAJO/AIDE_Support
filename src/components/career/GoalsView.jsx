import { useEffect, useMemo, useState } from 'react';
import { Plus, X, Loader2, Check, RotateCcw, AlertTriangle } from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import LoadingSpinner from '../shared/LoadingSpinner';
import { TRACK_LABELS, trackColor, daysUntil, PRIORITY_LABELS } from './careerShared';

// Lembrete crítico fixo por trilha (hardcoded conforme spec da Etapa 5).
const CRITICAL_NOTE = {
  phd: 'Visto expira dezembro 2025',
  job: 'Visto expira dezembro 2025',
  spinoff: '',
};

const TRACKS = ['phd', 'job', 'spinoff'];

export default function GoalsView() {
  const goals = useStore((s) => s.careerGoals);
  const setGoals = useStore((s) => s.setCareerGoals);

  const [loading, setLoading] = useState(true);
  const [editorTrack, setEditorTrack] = useState(null); // trilha do formulário aberto

  const load = async () => {
    try {
      setGoals(await apiFetch('/api/career/goals'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byTrack = useMemo(() => {
    const m = { phd: [], job: [], spinoff: [] };
    goals.forEach((g) => { (m[g.track] || (m[g.track] = [])).push(g); });
    return m;
  }, [goals]);

  const toggleStatus = async (g) => {
    const status = g.status === 'achieved' ? 'active' : 'achieved';
    setGoals(goals.map((x) => (x.id === g.id ? { ...x, status } : x)));
    try {
      await apiFetch(`/api/career/goals/${g.id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    } catch {
      load();
    }
  };

  if (loading) return <div className="h-full"><LoadingSpinner label="Carregando metas..." /></div>;

  return (
    <div className="h-full space-y-5 overflow-y-auto pr-1">
      {TRACKS.map((track) => {
        const c = trackColor(track);
        const list = byTrack[track] || [];
        return (
          <section key={track} className="rounded-xl border border-line bg-surface">
            <div className={`flex items-center justify-between rounded-t-xl px-4 py-2.5 ${c.header}`}>
              <h2 className="flex items-center gap-2 text-base font-bold">
                <span>{c.emoji}</span> {TRACK_LABELS[track]}
              </h2>
              <button type="button" onClick={() => setEditorTrack(track)} className="flex items-center gap-1 rounded-lg bg-white/70 px-2.5 py-1 text-xs font-medium text-ink2 hover:bg-white">
                <Plus className="h-3.5 w-3.5" /> Nova Meta
              </button>
            </div>

            {CRITICAL_NOTE[track] && (
              <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0" /> <span className="font-medium">Prazo crítico:</span> {CRITICAL_NOTE[track]}
              </div>
            )}

            <div className="space-y-2 p-4">
              {list.length === 0 ? (
                <p className="text-sm text-muted">Nenhuma meta nesta trilha ainda.</p>
              ) : (
                list.map((g) => <GoalCard key={g.id} goal={g} onToggle={() => toggleStatus(g)} />)
              )}
            </div>
          </section>
        );
      })}

      {editorTrack && (
        <GoalEditor track={editorTrack} onClose={() => setEditorTrack(null)} onSaved={() => { setEditorTrack(null); load(); }} />
      )}
    </div>
  );
}

function PriorityDots({ priority }) {
  const p = Number(priority) || 3;
  return (
    <span className="inline-flex items-center gap-0.5" title={`Prioridade: ${PRIORITY_LABELS[p] || p}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= p ? 'bg-accent' : 'bg-line'}`} />
      ))}
    </span>
  );
}

function GoalCard({ goal, onToggle }) {
  const achieved = goal.status === 'achieved';
  const days = daysUntil(goal.target_date);
  const past = days !== null && days < 0;
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${achieved ? 'border-emerald-200 bg-emerald-50' : 'border-line bg-surface'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`font-semibold text-ink ${achieved ? 'line-through opacity-70' : ''}`}>{goal.title}</div>
          {goal.description && <p className="mt-0.5 text-sm text-ink2">{goal.description}</p>}
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
            achieved ? 'border border-line text-ink2 hover:bg-surface2' : 'bg-emerald-500 text-white hover:opacity-90'
          }`}
        >
          {achieved ? <><RotateCcw className="h-3.5 w-3.5" /> Reabrir</> : <><Check className="h-3.5 w-3.5" /> Concluir</>}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        {goal.target_date && (
          <span className={past && !achieved ? 'font-semibold text-red-600' : 'text-muted'}>
            Prazo: {goal.target_date}{past ? ` · ${-days}d atrás` : (days !== null ? ` · ${days}d` : '')}
          </span>
        )}
        <PriorityDots priority={goal.priority} />
      </div>
      {goal.notes && <p className="mt-1.5 text-xs text-ink2">{goal.notes}</p>}
    </div>
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

function GoalEditor({ track, onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', description: '', target_date: '', priority: 3, notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (!form.title.trim()) { setError('Título é obrigatório'); return; }
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/career/goals', {
        method: 'POST',
        body: JSON.stringify({ ...form, track, priority: Number(form.priority) || 3 }),
      });
      onSaved();
    } catch (e) {
      setError(String(e.message || e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-soft" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Nova meta — {TRACK_LABELS[track]}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
        </div>
        {error && <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
        <div className="space-y-3">
          <Field label="Título *"><input value={form.title} onChange={(e) => set({ title: e.target.value })} className="input" /></Field>
          <Field label="Descrição"><textarea value={form.description} onChange={(e) => set({ description: e.target.value })} className="input min-h-[60px]" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data alvo"><input value={form.target_date} onChange={(e) => set({ target_date: e.target.value })} className="input" placeholder="2026-12-31" /></Field>
            <Field label={`Prioridade: ${PRIORITY_LABELS[form.priority] || form.priority}`}>
              <input type="range" min="1" max="5" value={form.priority} onChange={(e) => set({ priority: Number(e.target.value) })} className="w-full accent-accent" />
            </Field>
          </div>
          <Field label="Notas"><textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} className="input min-h-[50px]" /></Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2">Cancelar</button>
          <button type="button" onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
