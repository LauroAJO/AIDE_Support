import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../../lib/api';

// Spec-defined permission grid: feature → allowed levels.
const FEATURE_ROWS = [
  { key: 'tasks',      label: 'Tarefas',      levels: ['full', 'assigned_only', 'none'] },
  { key: 'planning',   label: 'Planejamento', levels: ['full', 'none'] },
  { key: 'timer',      label: 'Timer',        levels: ['full', 'none'] },
  { key: 'calendar',   label: 'Calendário',   levels: ['full', 'view', 'none'] },
  { key: 'drive',      label: 'Drive',        levels: ['full', 'view', 'none'] },
  { key: 'notes',      label: 'Notas',        levels: ['full', 'own_and_tagged', 'none'] },
  { key: 'payment',    label: 'Pagamentos',   levels: ['full', 'own', 'none'] },
  { key: 'meeting',    label: 'Reunião',      levels: ['full', 'none'] },
  { key: 'areas',      label: 'Áreas',        levels: ['view', 'none'] },
  { key: 'networking', label: 'Networking',   levels: ['view', 'none'] },
  { key: 'chat',       label: 'Chat',         levels: ['full', 'none'] },
  { key: 'dashboard',  label: 'Dashboard',    levels: ['full', 'none'] },
];

const LEVEL_LABEL = {
  full: 'Completo',
  view: 'Visualizar',
  own: 'Próprios',
  assigned_only: 'Somente atribuídas',
  own_and_tagged: 'Próprias e marcadas',
  none: 'Nenhum',
};

// Defaults mirror the seed in migration 0022_multiuser.sql.
const PRESET_DEFAULTS = {
  preset_fixed: {
    tasks: 'full', planning: 'full', timer: 'full', calendar: 'view',
    drive: 'view', notes: 'full', payment: 'own', meeting: 'full',
    areas: 'view', networking: 'view', alerts: 'none', settings: 'none',
    chat: 'full', dashboard: 'none',
  },
  preset_external: {
    tasks: 'assigned_only', planning: 'none', timer: 'full', calendar: 'none',
    drive: 'none', notes: 'own_and_tagged', payment: 'own', meeting: 'full',
    areas: 'none', networking: 'none', alerts: 'none', settings: 'none',
    chat: 'full', dashboard: 'none',
  },
};

export default function PermissionsModal({ user, onClose, onSaved }) {
  // mode: 'preset_fixed' | 'preset_external' | 'custom'.
  const [mode, setMode] = useState('custom');
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await apiFetch(`/api/users/${user.id}/permissions`);
        if (cancelled) return;
        const presetId = data?.preset?.id || null;
        const overrides = data?.overrides || {};
        const resolved = data?.resolved || {};
        // If overrides is empty AND a preset is set, we're in a pure preset
        // mode. Otherwise treat as custom and seed the grid from resolved.
        if (presetId && Object.keys(overrides).length === 0 &&
            (presetId === 'preset_fixed' || presetId === 'preset_external')) {
          setMode(presetId);
          setValues(PRESET_DEFAULTS[presetId] || {});
        } else {
          setMode('custom');
          setValues({ ...resolved });
        }
      } catch (e) {
        if (!cancelled) setError(String((e && e.message) || e).slice(0, 200));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user.id]);

  const choose = (presetMode) => {
    setMode(presetMode);
    if (presetMode === 'preset_fixed' || presetMode === 'preset_external') {
      setValues(PRESET_DEFAULTS[presetMode]);
    }
  };

  const setFeature = (feature, level) => {
    setValues((v) => ({ ...v, [feature]: level }));
    // Tweaking any feature implicitly drops us into custom mode.
    if (mode !== 'custom') setMode('custom');
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      let body;
      if (mode === 'preset_fixed' || mode === 'preset_external') {
        body = { preset_id: mode, overrides: {} };
      } else {
        body = { preset_id: null, overrides: values };
      }
      await apiFetch(`/api/users/${user.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      onSaved && onSaved();
    } catch (e) {
      setError(String((e && e.message) || e).slice(0, 200));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">
            {user.display_name || user.name || user.email} — Permissões
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          {/* Preset selector */}
          <fieldset className="space-y-2 rounded-lg border border-line bg-surface2 p-3">
            <legend className="px-1 text-xs font-medium text-ink2">Preset</legend>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="preset"
                checked={mode === 'preset_fixed'}
                onChange={() => choose('preset_fixed')}
              />
              Assistente Fixo
              <span className="text-xs text-muted">(acesso amplo)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="preset"
                checked={mode === 'preset_external'}
                onChange={() => choose('preset_external')}
              />
              Assistente Externo
              <span className="text-xs text-muted">(acesso restrito)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="preset"
                checked={mode === 'custom'}
                onChange={() => choose('custom')}
              />
              Personalizado
            </label>
          </fieldset>

          {/* Permission grid */}
          {loading ? (
            <div className="py-6 text-center text-sm text-muted">Carregando permissões…</div>
          ) : (
            <div className="rounded-lg border border-line">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface2 text-xs text-muted">
                    <th className="px-3 py-2 font-medium">Recurso</th>
                    <th className="px-3 py-2 font-medium">Nível de acesso</th>
                  </tr>
                </thead>
                <tbody>
                  {FEATURE_ROWS.map((row) => {
                    const current = values[row.key] || 'none';
                    const safeValue = row.levels.includes(current) ? current : row.levels[row.levels.length - 1];
                    return (
                      <tr key={row.key} className="border-b border-line/60">
                        <td className="px-3 py-2 text-ink">{row.label}</td>
                        <td className="px-3 py-2">
                          <select
                            value={safeValue}
                            onChange={(e) => setFeature(row.key, e.target.value)}
                            className="input"
                          >
                            {row.levels.map((lvl) => (
                              <option key={lvl} value={lvl}>{LEVEL_LABEL[lvl] || lvl}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={busy || loading}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {busy ? 'Salvando…' : 'Salvar permissões'}
          </button>
        </div>
      </div>
    </div>
  );
}
