import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Play, X, Info } from 'lucide-react';
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

function utcHourToLocalTime(h) {
  const d = new Date();
  d.setUTCHours(h ?? 8, 0, 0, 0);
  return `${String(d.getHours()).padStart(2, '0')}:00`;
}
function localTimeToUtcHour(hhmm) {
  const [h, m] = (hhmm || '10:00').split(':').map(Number);
  const d = new Date();
  d.setHours(h, m || 0, 0, 0);
  return d.getUTCHours();
}
function fmtLastRun(unix) {
  if (!unix) return 'Nunca executada';
  const d = new Date(unix * 1000);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function AlertsPage() {
  const rules = useStore((s) => s.alertRules);
  const setRules = useStore((s) => s.setAlertRules);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [editor, setEditor] = useState(undefined);
  const [testMsg, setTestMsg] = useState('');

  const load = async () => {
    try {
      const [r, t, p] = await Promise.all([
        apiFetch('/api/alerts/rules'),
        apiFetch('/api/tasks').catch(() => []),
        apiFetch('/api/projects').catch(() => []),
      ]);
      setRules(r);
      setTasks(t);
      setProjects(p);
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
      setTestMsg(
        res.triggered
          ? `✅ Regra disparada — ${res.notificationsSent} notificação(ões) enviada(s)`
          : 'ℹ️ Condição não atendida no momento'
      );
      load();
    } catch {
      setTestMsg('Falha ao testar.');
    }
  };

  const scopeLabel = (rule) => {
    if (rule.task_id) return `Tarefa: ${rule.taskTitle || '—'}`;
    if (rule.project_id) return `Projeto: ${rule.projectName || '—'}`;
    return 'Todas as tarefas';
  };

  if (loading) return <div className="h-full"><LoadingSpinner label="Carregando avisos..." /></div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink">Avisos Configuráveis</h1>
          <p className="mt-0.5 text-xs text-muted">
            Regras automáticas avaliadas diariamente. Avisos manuais podem ser enviados pelo sininho.
          </p>
        </div>
        <button
          onClick={() => setEditor(null)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" /> Nova Regra
        </button>
      </div>

      <div
        className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
        style={{ background: 'rgba(99,102,241,0.08)', color: '#4F52D3' }}
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        As regras são avaliadas automaticamente todo dia no horário configurado. Use o botão "Testar" para disparar uma regra agora.
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
                    <Badge>{scopeLabel(rule)}</Badge>
                  </div>
                  <div className="mt-1.5 text-[11px] text-muted">
                    Última execução: {fmtLastRun(rule.last_run_at)}
                    {rule.last_result ? ` · ${rule.last_result}` : ''}
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
          tasks={tasks}
          projects={projects}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined);
            load();
          }}
          onTestResult={setTestMsg}
        />
      )}
    </div>
  );
}

function Badge({ children, tone }) {
  const cls = tone === 'ink' ? 'bg-ink text-white' : tone === 'accent' ? 'bg-accent text-white' : 'bg-surface2 text-ink2';
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>{children}</span>;
}

function RuleEditor({ rule, tasks, projects, onClose, onSaved, onTestResult }) {
  const isEdit = !!rule;
  const [form, setForm] = useState(() => ({
    name: rule?.name || '',
    description: rule?.description || '',
    trigger_type: rule?.trigger_type || 'task_overdue',
    threshold: rule?.trigger_config?.threshold ?? 1,
    day: rule?.trigger_config?.day ?? 1,
    target_user: rule?.target_user || 'both',
    channel: rule?.channel || 'both',
    active: rule?.active ?? true,
    task_id: rule?.task_id || '',
    project_id: rule?.project_id || '',
    runTime: utcHourToLocalTime(rule?.run_hour ?? 8),
  }));
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const isCustomDay = form.trigger_type === 'custom_day';

  const buildPayload = () => ({
    name: form.name.trim(),
    description: form.description,
    trigger_type: form.trigger_type,
    trigger_config: isCustomDay ? { day: Number(form.day) } : { threshold: Number(form.threshold) },
    target_user: form.target_user,
    channel: form.channel,
    active: form.active,
    task_id: form.task_id || null,
    project_id: form.project_id || null,
    run_hour: localTimeToUtcHour(form.runTime),
  });

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (isEdit) await apiFetch(`/api/alerts/rules/${rule.id}`, { method: 'PUT', body: JSON.stringify(buildPayload()) });
      else await apiFetch('/api/alerts/rules', { method: 'POST', body: JSON.stringify(buildPayload()) });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const testNow = async () => {
    if (!isEdit) return;
    // Persist current edits first so the test reflects them.
    await apiFetch(`/api/alerts/rules/${rule.id}`, { method: 'PUT', body: JSON.stringify(buildPayload()) });
    const res = await apiFetch(`/api/alerts/rules/${rule.id}/test`, { method: 'POST' });
    onTestResult(
      res.triggered
        ? `✅ Regra disparada — ${res.notificationsSent} notificação(ões) enviada(s)`
        : 'ℹ️ Condição não atendida no momento'
    );
    onSaved();
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
            <Field label="Dia da semana">
              <select value={form.day} onChange={(e) => set({ day: e.target.value })} className="input">
                {WEEKDAYS.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
              </select>
            </Field>
          ) : (
            <Field label={THRESHOLD_LABEL[form.trigger_type]}>
              <input type="number" min="0" value={form.threshold} onChange={(e) => set({ threshold: e.target.value })} className="input" />
            </Field>
          )}

          <Field label="Executar diariamente às">
            <input type="time" value={form.runTime} onChange={(e) => set({ runTime: e.target.value })} className="input" />
            <span className="mt-1 block text-[11px] text-muted">Horário local (convertido para UTC no servidor).</span>
          </Field>

          <Field label="Tarefa específica">
            <select
              value={form.task_id}
              onChange={(e) => set({ task_id: e.target.value, project_id: e.target.value ? '' : form.project_id })}
              className="input"
            >
              <option value="">Todas as tarefas</option>
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </Field>
          <Field label="Projeto específico">
            <select
              value={form.project_id}
              onChange={(e) => set({ project_id: e.target.value, task_id: e.target.value ? '' : form.task_id })}
              className="input"
            >
              <option value="">Todos os projetos</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>

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
            <button onClick={testNow} className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink2 hover:bg-surface2">
              <Play className="h-4 w-4" /> Testar agora
            </button>
          )}
          {isEdit && (
            <button onClick={remove} className="flex items-center gap-1 rounded-lg border border-danger/40 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10">
              <Trash2 className="h-4 w-4" />
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
