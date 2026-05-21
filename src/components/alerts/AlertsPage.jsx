import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Play, X } from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import LoadingSpinner from '../shared/LoadingSpinner';

const TRIGGERS = [
  ['task_overdue', 'Tarefa em atraso', 'Dias de atraso'],
  ['task_no_date', 'Tarefa sem data', 'Dias sem data'],
  ['task_no_update', 'Tarefa sem atualização', 'Dias sem atualização'],
  ['timer_running_long', 'Timer rodando muito tempo', 'Horas rodando'],
  ['weekly_hours_low', 'Poucas horas na semana', 'Mínimo de horas'],
  ['custom_day', 'Dia específico', 'Dia da semana'],
];
const TRIGGER_LABEL = Object.fromEntries(TRIGGERS.map(([v, l]) => [v, l]));
const THRESHOLD_LABEL = Object.fromEntries(TRIGGERS.map(([v, , t]) => [v, t]));
const TARGET_LABEL = { lauro: 'Lauro', alice: 'Alice', both: 'Ambos' };
const CHANNEL_LABEL = { app: 'No app', push: 'Push', both: 'Ambos' };
const WEEKDAYS = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [7, 'Dom']];

export default function AlertsPage() {
  const rules = useStore((s) => s.alertRules);
  const setRules = useStore((s) => s.setAlertRules);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState(undefined); // undefined=closed, null=new, rule=edit
  const [testMsg, setTestMsg] = useState('');

  const load = async () => {
    try {
      setRules(await apiFetch('/api/alerts/rules'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleActive = async (rule) => {
    const updated = await apiFetch(`/api/alerts/rules/${rule.id}`, {
      method: 'PUT',
      body: JSON.stringify({ active: !rule.active }),
    });
    setRules(rules.map((r) => (r.id === rule.id ? updated : r)));
  };
  const remove = async (id) => {
    if (!window.confirm('Excluir esta regra?')) return;
    await apiFetch(`/api/alerts/rules/${id}`, { method: 'DELETE' });
    setRules(rules.filter((r) => r.id !== id));
  };
  const test = async (id) => {
    setTestMsg('Testando...');
    try {
      const res = await apiFetch(`/api/alerts/rules/${id}/test`, { method: 'POST' });
      setTestMsg(res.triggered ? 'Aviso de teste enviado.' : 'Regra avaliada (sem disparo).');
    } catch {
      setTestMsg('Falha ao testar.');
    }
  };

  if (loading) return <div className="h-full"><LoadingSpinner label="Carregando avisos..." /></div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Avisos Configuráveis</h1>
        <button
          onClick={() => setEditor(null)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" /> Nova Regra
        </button>
      </div>

      {testMsg && <p className="text-xs text-ink2">{testMsg}</p>}

      {rules.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted">Nenhuma regra configurada.</p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-ink">{rule.name}</div>
                  {rule.description && <div className="text-xs text-ink2">{rule.description}</div>}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge>{TRIGGER_LABEL[rule.trigger_type] || rule.trigger_type}</Badge>
                    <Badge tone="ink">{TARGET_LABEL[rule.target_user]}</Badge>
                    <Badge tone="accent">{CHANNEL_LABEL[rule.channel]}</Badge>
                  </div>
                </div>
                <label className="flex shrink-0 items-center gap-1 text-xs text-ink2">
                  <input type="checkbox" checked={rule.active} onChange={() => toggleActive(rule)} className="accent-[#6366f1]" />
                  Ativa
                </label>
              </div>
              <div className="mt-2 flex gap-2">
                <button onClick={() => setEditor(rule)} className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-ink2 hover:bg-surface2">
                  <Pencil className="h-3 w-3" /> Editar
                </button>
                <button onClick={() => test(rule.id)} className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-ink2 hover:bg-surface2">
                  <Play className="h-3 w-3" /> Testar
                </button>
                <button onClick={() => remove(rule.id)} className="flex items-center gap-1 rounded-lg border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/10">
                  <Trash2 className="h-3 w-3" /> Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editor !== undefined && (
        <RuleEditor
          rule={editor}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined);
            load();
          }}
        />
      )}
    </div>
  );
}

function Badge({ children, tone }) {
  const cls = tone === 'ink' ? 'bg-ink text-white' : tone === 'accent' ? 'bg-accent text-white' : 'bg-surface2 text-ink2';
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>{children}</span>;
}

function RuleEditor({ rule, onClose, onSaved }) {
  const isEdit = !!rule;
  const [form, setForm] = useState(() => ({
    name: rule?.name || '',
    description: rule?.description || '',
    trigger_type: rule?.trigger_type || 'task_overdue',
    threshold: rule?.trigger_config?.threshold ?? 1,
    day: rule?.trigger_config?.day ?? 1,
    time: rule?.trigger_config?.time ?? '08:00',
    target_user: rule?.target_user || 'both',
    channel: rule?.channel || 'both',
    active: rule?.active ?? true,
  }));
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const isCustomDay = form.trigger_type === 'custom_day';

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const trigger_config = isCustomDay ? { day: Number(form.day), time: form.time } : { threshold: Number(form.threshold) };
    const payload = {
      name: form.name.trim(),
      description: form.description,
      trigger_type: form.trigger_type,
      trigger_config,
      target_user: form.target_user,
      channel: form.channel,
      active: form.active,
    };
    try {
      if (isEdit) await apiFetch(`/api/alerts/rules/${rule.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      else await apiFetch('/api/alerts/rules', { method: 'POST', body: JSON.stringify(payload) });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!isEdit || !window.confirm('Excluir esta regra?')) return;
    await apiFetch(`/api/alerts/rules/${rule.id}`, { method: 'DELETE' });
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/20" onClick={onClose}>
      <div className="flex h-full w-full flex-col bg-surface shadow-soft sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">{isEdit ? 'Editar regra' : 'Nova regra'}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2 hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <Field label="Nome"><input value={form.name} onChange={(e) => set({ name: e.target.value })} className="input" /></Field>
          <Field label="Descrição"><input value={form.description} onChange={(e) => set({ description: e.target.value })} className="input" /></Field>
          <Field label="Tipo de gatilho">
            <select value={form.trigger_type} onChange={(e) => set({ trigger_type: e.target.value })} className="input">
              {TRIGGERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          {isCustomDay ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dia da semana">
                <select value={form.day} onChange={(e) => set({ day: e.target.value })} className="input">
                  {WEEKDAYS.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
                </select>
              </Field>
              <Field label="Horário"><input type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} className="input" /></Field>
            </div>
          ) : (
            <Field label={THRESHOLD_LABEL[form.trigger_type]}>
              <input type="number" min="0" value={form.threshold} onChange={(e) => set({ threshold: e.target.value })} className="input" />
            </Field>
          )}
          <Field label="Para quem?">
            <select value={form.target_user} onChange={(e) => set({ target_user: e.target.value })} className="input">
              <option value="lauro">Lauro</option>
              <option value="alice">Alice</option>
              <option value="both">Ambos</option>
            </select>
          </Field>
          <Field label="Como notificar?">
            <select value={form.channel} onChange={(e) => set({ channel: e.target.value })} className="input">
              <option value="app">No app</option>
              <option value="push">Push</option>
              <option value="both">Ambos</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} className="accent-[#6366f1]" />
            Ativa
          </label>
        </div>
        <div className="flex items-center gap-2 border-t border-line px-4 py-3">
          <button onClick={save} disabled={saving} className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-60">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          {isEdit && (
            <button onClick={remove} className="flex items-center gap-1 rounded-lg border border-danger/40 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10">
              <Trash2 className="h-4 w-4" /> Excluir
            </button>
          )}
        </div>
      </div>
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
