import { useEffect, useMemo, useState } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { apiFetch } from '../../lib/api';

// Granular feature → actions mapped to spec labels (PT-BR).
const FEATURE_GROUPS = [
  {
    key: 'tasks', label: 'Tarefas', actions: [
      ['view_assigned',  'Ver tarefas atribuídas a mim'],
      ['view_all',       'Ver todas as tarefas'],
      ['create',         'Criar tarefas'],
      ['edit_own',       'Editar próprias tarefas'],
      ['edit_all',       'Editar todas as tarefas'],
      ['delete',         'Deletar tarefas'],
      ['assign',         'Atribuir tarefas'],
      ['view_comments',  'Ver comentários'],
      ['add_comments',   'Adicionar comentários'],
    ],
  },
  {
    key: 'planning', label: 'Planejamento', actions: [
      ['view',            'Ver plano semanal'],
      ['edit_own',        'Editar próprio plano'],
      ['edit_all',        'Editar planos de todos'],
      ['view_strategic',  'Ver plano estratégico'],
      ['edit_strategic',  'Editar plano estratégico'],
    ],
  },
  {
    key: 'calendar', label: 'Calendário', actions: [
      ['view',     'Ver eventos'],
      ['create',   'Criar eventos'],
      ['edit_own', 'Editar próprios eventos'],
      ['edit_all', 'Editar eventos de todos'],
      ['delete',   'Deletar eventos'],
    ],
  },
  {
    key: 'drive', label: 'Drive', actions: [
      ['view',     'Visualizar arquivos'],
      ['upload',   'Enviar arquivos'],
      ['download', 'Baixar arquivos'],
      ['delete',   'Deletar arquivos'],
    ],
  },
  {
    key: 'notes', label: 'Notas', actions: [
      ['view_own',   'Ver próprias notas'],
      ['view_all',   'Ver todas as notas'],
      ['create',     'Criar notas'],
      ['edit_own',   'Editar próprias notas'],
      ['edit_all',   'Editar notas de todos'],
      ['delete',     'Deletar notas'],
      ['add_images', 'Inserir imagens/anexos'],
    ],
  },
  {
    key: 'areas', label: 'Áreas', actions: [
      ['view',             'Ver áreas/projetos/frentes'],
      ['manage_fronts',    'Gerenciar frentes'],
      ['manage_projects',  'Gerenciar projetos'],
      ['manage_areas',     'Gerenciar áreas'],
    ],
  },
  {
    key: 'networking', label: 'Networking', actions: [
      ['view',            'Visualizar contatos'],
      ['edit_contacts',   'Editar contatos'],
      ['view_map',        'Ver mapa de relacionamentos'],
      ['link_entities',   'Vincular entidades AIDE'],
    ],
  },
  {
    key: 'payment', label: 'Pagamentos', actions: [
      ['view_own',         'Ver próprios pagamentos'],
      ['view_all',         'Ver pagamentos de todos'],
      ['edit',             'Editar entradas de pagamento'],
      ['mark_paid',        'Marcar como pago'],
      ['generate_report',  'Gerar relatório'],
    ],
  },
  {
    key: 'chat', label: 'Chat', actions: [
      ['read',   'Ler mensagens'],
      ['write',  'Enviar mensagens'],
      ['delete', 'Deletar mensagens'],
    ],
  },
  {
    key: 'meeting', label: 'Reunião', actions: [
      ['view_link',  'Ver link da reunião'],
      ['start_stop', 'Iniciar/encerrar reunião'],
      ['view_notes', 'Ver notas da reunião'],
      ['edit_notes', 'Editar notas da reunião'],
    ],
  },
];

const PRESETS = [
  { id: 'preset_fixed',    label: 'Assistente Fixo',    hint: 'Acesso amplo' },
  { id: 'preset_external', label: 'Assistente Externo', hint: 'Acesso restrito' },
];

// Convert the list-shape from the API ({feature, action, allowed}[])
// into a flat map keyed `feature.action`.
function listToMap(rows) {
  const m = {};
  for (const r of rows || []) m[`${r.feature}.${r.action}`] = !!r.allowed;
  return m;
}

export default function PermissionsModal({ user, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The two maps the modal cares about. `current` starts as resolved
  // (preset + overrides) and tracks every checkbox change. `preset` is the
  // immutable preset baseline used for the diff-on-save.
  const [presetId, setPresetId] = useState('preset_external');
  const [presetMap, setPresetMap] = useState({});
  const [current, setCurrent] = useState({});
  const [openSections, setOpenSections] = useState(() => new Set(['tasks']));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await apiFetch(`/api/users/${user.id}/granular-permissions`);
        if (cancelled) return;
        setPresetId(data?.preset || 'preset_external');
        setPresetMap(listToMap(data?.presetPerms));
        setCurrent(data?.resolved || listToMap(data?.presetPerms));
      } catch (e) {
        if (!cancelled) setError(String((e && e.message) || e).slice(0, 200));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user.id]);

  const toggle = (feature, action) => {
    const key = `${feature}.${action}`;
    setCurrent((c) => ({ ...c, [key]: !c[key] }));
  };

  const toggleSection = (key) => {
    setOpenSections((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Preset quick-select replaces every checkbox with the preset's defaults.
  // Does NOT save — user must click "Salvar permissões" afterwards. Switching
  // preset also re-binds preset_id via the /permissions endpoint at save time
  // (we send preset_id + empty overrides to clear any prior per-row overrides).
  const applyPreset = async (newPresetId) => {
    setBusy(true);
    setError('');
    try {
      // Fetch the preset's defaults by hitting GET — easier than caching both.
      const data = await apiFetch(`/api/users/${user.id}/granular-permissions`);
      // The fetched preset reflects the CURRENT bind. To preview a different
      // preset, swap the bind via /permissions first, then re-load.
      if (data?.preset !== newPresetId) {
        await apiFetch(`/api/users/${user.id}/permissions`, {
          method: 'PUT',
          body: JSON.stringify({ preset_id: newPresetId, overrides: {} }),
        });
      }
      const fresh = await apiFetch(`/api/users/${user.id}/granular-permissions`);
      setPresetId(fresh?.preset || newPresetId);
      setPresetMap(listToMap(fresh?.presetPerms));
      setCurrent(fresh?.resolved || listToMap(fresh?.presetPerms));
    } catch (e) {
      setError(String((e && e.message) || e).slice(0, 200));
    } finally {
      setBusy(false);
    }
  };

  // Per-feature flag: any action in this feature differs from preset.
  const isCustomized = useMemo(() => {
    const out = {};
    for (const f of FEATURE_GROUPS) {
      out[f.key] = f.actions.some(([action]) => {
        const k = `${f.key}.${action}`;
        return !!current[k] !== !!presetMap[k];
      });
    }
    return out;
  }, [current, presetMap]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const ops = [];
      for (const f of FEATURE_GROUPS) {
        for (const [action] of f.actions) {
          const key = `${f.key}.${action}`;
          const cur = !!current[key];
          const def = !!presetMap[key];
          if (cur === def) {
            // Matches preset → remove any override on the server.
            ops.push(apiFetch(`/api/users/${user.id}/granular-permissions`, {
              method: 'DELETE',
              body: JSON.stringify({ feature: f.key, action }),
            }).catch(() => null));
          } else {
            // Differs from preset → upsert override.
            ops.push(apiFetch(`/api/users/${user.id}/granular-permissions`, {
              method: 'PUT',
              body: JSON.stringify({ feature: f.key, action, allowed: cur }),
            }));
          }
        }
      }
      await Promise.all(ops);
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
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">
            {user.display_name || user.name || user.email} — Permissões
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          {/* Preset quick-select */}
          <div className="space-y-2 rounded-lg border border-line bg-surface2 p-3">
            <div className="text-xs font-medium text-ink2">
              Preset atual:{' '}
              <span className="font-semibold text-ink">
                {PRESETS.find((p) => p.id === presetId)?.label || presetId}
              </span>
            </div>
            <div className="flex gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  disabled={busy || loading}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition disabled:opacity-60 ${
                    presetId === p.id
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-line text-ink2 hover:bg-surface'
                  }`}
                  title={p.hint}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted">
              Mudar preset substitui todas as marcações abaixo pelos padrões dele. Em seguida você
              pode ajustar caixa por caixa — apenas as diferenças viram overrides.
            </p>
          </div>

          {/* Feature grid */}
          {loading ? (
            <div className="py-6 text-center text-sm text-muted">Carregando permissões…</div>
          ) : (
            FEATURE_GROUPS.map((f) => {
              const open = openSections.has(f.key);
              const customized = isCustomized[f.key];
              return (
                <div key={f.key} className="rounded-lg border border-line bg-surface">
                  <button
                    type="button"
                    onClick={() => toggleSection(f.key)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-surface2"
                  >
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {f.label}
                    {customized && (
                      <span className="ml-2 text-[10px] font-medium text-accent">(personalizado)</span>
                    )}
                  </button>
                  {open && (
                    <div className="space-y-1 border-t border-line/60 px-3 py-2">
                      {f.actions.map(([action, label]) => {
                        const key = `${f.key}.${action}`;
                        const checked = !!current[key];
                        const def = !!presetMap[key];
                        const differs = checked !== def;
                        return (
                          <label
                            key={action}
                            className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm text-ink hover:bg-surface2 ${
                              differs ? 'border border-accent/40' : 'border border-transparent'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(f.key, action)}
                              className="h-4 w-4 accent-accent"
                            />
                            <span className="flex-1">{label}</span>
                            {differs && (
                              <span className="text-[10px] text-accent">
                                {checked ? '+ permitido' : '− negado'}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-line px-4 py-3">
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
