import { useEffect, useState } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';

// Indicador de "perfil desatualizado" (v2.25.14) — reaproveitado pelo detalhe
// de pessoa (Networking), de organização e de iniciativa (Mercado). Lê a
// configuração em GET /api/staleness/:entityType/:entityId (owner only; para
// os demais a API devolve { config: null } e nada é renderizado) e grava em
// POST /api/staleness/config.
//
// Badge por status (o backend calcula): fresh não mostra nada, ok mostra um
// texto discreto, aging/stale mostram badge âmbar/vermelho — e stale ainda
// oferece "marcar como revisado" e "criar tarefa de revisão".

const STATUS_STYLE = {
  ok:    'bg-surface2 text-ink2',
  aging: 'bg-amber-100 text-amber-800',
  stale: 'bg-red-100 text-red-700',
};

export default function StalenessSection({ entityType, entityId, isOwner, onChanged }) {
  const [config, setConfig] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [users, setUsers] = useState([]);
  const [threshold, setThreshold] = useState(60);
  const [assignedTo, setAssignedTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const applyConfig = (c) => {
    setConfig(c);
    setThreshold((c && c.threshold_days) || 60);
    setAssignedTo((c && c.assigned_to) || '');
  };

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setMsg('');
    apiFetch(`/api/staleness/${entityType}/${entityId}`)
      .then((r) => { if (alive) applyConfig((r && r.config) || null); })
      .catch(() => { if (alive) applyConfig(null); })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [entityType, entityId]);

  useEffect(() => {
    if (!isOwner) return;
    apiFetch('/api/users').then((u) => setUsers(u || [])).catch(() => setUsers([]));
  }, [isOwner]);

  const saveConfig = async (patch) => {
    setSaving(true);
    try {
      const r = await apiFetch('/api/staleness/config', {
        method: 'POST',
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId,
          enabled: patch.enabled !== undefined ? patch.enabled : !!(config && config.enabled),
          threshold_days: patch.threshold_days !== undefined ? patch.threshold_days : threshold,
          assigned_to: patch.assigned_to !== undefined ? patch.assigned_to : (assignedTo || null),
        }),
      });
      applyConfig((r && r.config) || null);
      if (onChanged) onChanged();
    } catch {
      setMsg('Falha ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  const markReviewed = async () => {
    setBusy('reviewed');
    try {
      const r = await apiFetch(`/api/staleness/${entityType}/${entityId}/reviewed`, { method: 'POST' });
      applyConfig((r && r.config) || null);
      setMsg('Perfil marcado como revisado');
      if (onChanged) onChanged();
    } catch {
      setMsg('Falha ao marcar como revisado');
    } finally {
      setBusy('');
    }
  };

  const createTask = async () => {
    setBusy('task');
    try {
      const r = await apiFetch('/api/staleness/generate-tasks', {
        method: 'POST',
        body: JSON.stringify({ entity_type: entityType, entity_id: entityId }),
      });
      setMsg(r && r.created ? 'Tarefa de revisão criada' : 'Já existe uma tarefa de revisão aberta');
    } catch {
      setMsg('Falha ao criar tarefa');
    } finally {
      setBusy('');
    }
  };

  if (!loaded || !isOwner) return null;

  const enabled = !!(config && config.enabled);
  const status = enabled ? config.status : 'fresh';

  return (
    <div className="space-y-2">
      {enabled && status === 'ok' && (
        <p className="text-[11px] text-muted">✓ Atualizado {config.daysSince} dias atrás</p>
      )}
      {enabled && (status === 'aging' || status === 'stale') && (
        <div className="space-y-1.5">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
            {status === 'stale' ? '🔴' : '⚠'} {config.daysSince} dias sem atualização
          </span>
          {status === 'stale' && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={markReviewed}
                disabled={busy === 'reviewed'}
                className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-[11px] font-medium text-ink2 transition hover:bg-surface2 disabled:opacity-60"
              >
                {busy === 'reviewed' && <Loader2 className="h-3 w-3 animate-spin" />} Marcar como revisado
              </button>
              <button
                type="button"
                onClick={createTask}
                disabled={busy === 'task'}
                className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
              >
                {busy === 'task' && <Loader2 className="h-3 w-3 animate-spin" />} Criar tarefa de revisão
              </button>
            </div>
          )}
        </div>
      )}

      <label className="flex items-center gap-2 text-[11px] text-ink2">
        <input
          type="checkbox"
          checked={enabled}
          disabled={saving}
          onChange={(e) => saveConfig({ enabled: e.target.checked })}
          className="h-3.5 w-3.5 accent-[#6366f1]"
        />
        <Clock className="h-3.5 w-3.5 text-muted" /> Monitorar atualizações
      </label>

      {enabled && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-surface2 p-2.5">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-ink2">Alertar após (dias)</span>
            <input
              type="number"
              min="1"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              onBlur={() => {
                const n = Number(threshold) > 0 ? Math.round(Number(threshold)) : 60;
                setThreshold(n);
                if (n !== config.threshold_days) saveConfig({ threshold_days: n });
              }}
              className="input"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-ink2">Responsável</span>
            <select
              value={assignedTo}
              onChange={(e) => { setAssignedTo(e.target.value); saveConfig({ assigned_to: e.target.value || null }); }}
              className="input"
            >
              <option value="">— Proprietário —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
            </select>
          </label>
        </div>
      )}

      {msg && <p className="text-[11px] text-muted">{msg}</p>}
    </div>
  );
}
