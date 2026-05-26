import { useEffect, useState } from 'react';
import { Trash2, ExternalLink, CheckCircle2, AlertTriangle, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { useStore } from '../store';
import { apiFetch } from '../lib/api';
import { getToken } from '../lib/auth';
import { APP_VERSION } from '../version';
import { isAuthScopeError } from './shared/ScopeBanner';
import Avatar from './shared/Avatar';
import Sharing from './settings/Sharing';

const ROLE_LABELS = { owner: 'Proprietário', assistant: 'Assistente' };
const GITHUB_URL = 'https://github.com/LauroAJO/AIDE_Support';

function lastSeen(unix) {
  if (!unix) return 'nunca';
  const s = Math.floor(Date.now() / 1000) - unix;
  if (s < 60) return 'agora';
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)} dias`;
}

async function downloadExport(path, filename) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${getToken()}` } });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function SettingsPage() {
  const currentUser = useStore((s) => s.user);
  const [users, setUsers] = useState([]);
  const [calStatus, setCalStatus] = useState('checking');
  const [driveStatus, setDriveStatus] = useState('checking');
  const [bridge, setBridge] = useState(null);
  const [bridgeLog, setBridgeLog] = useState([]);
  const [savingBridge, setSavingBridge] = useState(false);
  const [bridgeMsg, setBridgeMsg] = useState(null); // { kind: 'ok'|'err', text }
  const [secretDirty, setSecretDirty] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const testBridge = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await apiFetch('/api/bridge/test');
      setTestResult({ kind: r.error ? 'err' : 'ok', data: r });
    } catch (e) {
      setTestResult({ kind: 'err', data: { error: String((e && e.message) || e) } });
    } finally {
      setTesting(false);
    }
  };

  const [importing, setImporting] = useState(false);
  const importFromLifegame = async () => {
    setImporting(true);
    setSyncMsg('Importando do Lifegame...');
    try {
      const [tasks, people] = await Promise.all([
        apiFetch('/api/bridge/import/tasks', { method: 'POST' }).catch((e) => ({ error: String(e.message || e) })),
        apiFetch('/api/bridge/import/people', { method: 'POST' }).catch((e) => ({ error: String(e.message || e) })),
      ]);
      const parts = [];
      if (tasks && tasks.error) parts.push(`tarefas: erro (${String(tasks.error).slice(0, 80)})`);
      else if (tasks) parts.push(`tarefas: ${tasks.inserted || 0} novas, ${tasks.updated || 0} atualizadas (de ${tasks.fetched || 0})`);
      if (people && people.error) parts.push(`pessoas: erro (${String(people.error).slice(0, 80)})`);
      else if (people) parts.push(`pessoas: ${people.inserted || 0} novas, ${people.updated || 0} atualizadas (de ${people.fetched || 0})`);
      setSyncMsg(parts.join(' · '));
      loadBridge();
    } catch (e) {
      setSyncMsg(`Falha na importação: ${String((e && e.message) || e).slice(0, 200)}`);
    } finally {
      setImporting(false);
    }
  };
  const [syncMsg, setSyncMsg] = useState('');
  const [cronMsg, setCronMsg] = useState('');

  const runCron = async () => {
    setCronMsg('Executando...');
    try {
      const res = await apiFetch('/api/cron/run', { method: 'POST' });
      setCronMsg(`${res.message || 'Concluído'} — ${res.result?.sent ?? 0} notificação(ões) enviada(s).`);
    } catch {
      setCronMsg('Falha ao executar.');
    }
  };

  useEffect(() => {
    apiFetch('/api/users').then(setUsers).catch(() => {});
    apiFetch('/api/calendar/list').then(() => setCalStatus('ok')).catch((e) => setCalStatus(isAuthScopeError(e) ? 'no' : 'ok'));
    apiFetch('/api/drive/files').then(() => setDriveStatus('ok')).catch((e) => setDriveStatus(isAuthScopeError(e) ? 'no' : 'ok'));
    loadBridge();
  }, []);

  const loadBridge = async () => {
    try {
      const [cfg, log] = await Promise.all([apiFetch('/api/bridge/config'), apiFetch('/api/bridge/log')]);
      setBridge(cfg);
      setBridgeLog(log);
    } catch {
      /* ignore */
    }
  };

  const saveBridge = async () => {
    setSavingBridge(true);
    setBridgeMsg(null);
    try {
      // Only send the secret when the user actually edited the field. The
      // GET response masks it as bullets; sending those back would no-op
      // and (with the old logic) could overwrite the real value.
      const payload = {
        lifegame_url: bridge.lifegame_url,
        sync_enabled: bridge.sync_enabled,
      };
      if (secretDirty && bridge.bridge_secret && !/^[•●]+$/.test(bridge.bridge_secret)) {
        payload.bridge_secret = bridge.bridge_secret;
      }
      const saved = await apiFetch('/api/bridge/config', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setBridge(saved);
      setSecretDirty(false);
      setBridgeMsg({ kind: 'ok', text: 'Configuração salva.' });
    } catch (e) {
      setBridgeMsg({ kind: 'err', text: `Falha ao salvar: ${String((e && e.message) || e).slice(0, 200)}` });
    } finally {
      setSavingBridge(false);
    }
  };

  const runSync = async (path, label) => {
    setSyncMsg(`Sincronizando ${label}...`);
    try {
      const res = await apiFetch(path, { method: 'POST' });
      setSyncMsg(`${label}: ${res.pushed} enviado(s)${res.errors?.length ? `, erros: ${res.errors.join(', ')}` : ''}`);
      loadBridge();
    } catch {
      setSyncMsg(`Falha ao sincronizar ${label}.`);
    }
  };

  const clearCache = () => {
    localStorage.clear();
    window.location.reload();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-ink">Configurações</h1>

      {/* Team */}
      <Section title="Equipe">
        <ul className="space-y-2">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-3 rounded-lg border border-line bg-base p-2">
              <Avatar user={u} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">{u.name || u.email}</span>
                  {u.id === currentUser?.id && (
                    <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-white">Você</span>
                  )}
                </div>
                <div className="truncate text-xs text-ink2">{u.email}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs text-ink2">{ROLE_LABELS[u.role] || u.role}</div>
                <div className="text-[10px] text-muted">Visto {lastSeen(u.last_seen_at)}</div>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {/* Application */}
      <Section title="Aplicação">
        <p className="text-sm text-ink">Aide v{APP_VERSION}</p>
        <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline">
          Repositório no GitHub <ExternalLink className="h-3 w-3" />
        </a>
        <div className="mt-3">
          <button onClick={clearCache} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2">
            <Trash2 className="h-4 w-4" /> Limpar cache local
          </button>
        </div>
      </Section>

      {/* Integrations */}
      <Section title="Integrações">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <IntegrationCard label="Google Calendar" status={calStatus} />
          <IntegrationCard label="Google Drive" status={driveStatus} />
        </div>
      </Section>

      {/* Bidirectional Drive/Calendar sharing — both Lauro and Alice can grant
          and receive access to items in their own Google accounts. */}
      <Sharing />

      {/* Data */}
      <Section title="Dados">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => downloadExport('/api/export/tasks', 'aide-tasks.json')}
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2"
          >
            Exportar minhas tarefas
          </button>
          <button
            onClick={() => downloadExport('/api/export/notes', 'aide-notes.json')}
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2"
          >
            Exportar minhas notas
          </button>
        </div>
      </Section>

      {/* System */}
      <Section title="Sistema">
        <button
          onClick={runCron}
          className="rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2"
        >
          Executar notificações agora
        </button>
        {cronMsg && <p className="mt-2 text-xs text-ink2">{cronMsg}</p>}
      </Section>

      {/* Bridge */}
      <Section title="Bridge — Lifegame">
        {!bridge ? (
          <p className="text-sm text-muted">Carregando...</p>
        ) : (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={bridge.sync_enabled}
                onChange={(e) => setBridge({ ...bridge, sync_enabled: e.target.checked })}
                className="accent-[#6366f1]"
              />
              Sincronização ativa
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink2">URL do Lifegame</span>
              <input
                value={bridge.lifegame_url}
                onChange={(e) => setBridge({ ...bridge, lifegame_url: e.target.value })}
                placeholder="https://lifegame-bep.pages.dev"
                className="input"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink2">
                Bridge Secret {bridge.has_secret && !secretDirty && <span className="text-muted">(já definido — clique para alterar)</span>}
              </span>
              {/* type="text" para evitar o warning do password manager
                  ("Password field is not inside a form"). É uma API key,
                  não senha de usuário. Mascarado visualmente via CSS quando
                  showSecret=false. */}
              <div className="relative">
                <input
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                  data-form-type="other"
                  value={secretDirty ? bridge.bridge_secret : ''}
                  onFocus={() => {
                    if (!secretDirty) {
                      setBridge({ ...bridge, bridge_secret: '' });
                      setSecretDirty(true);
                    }
                  }}
                  onChange={(e) => {
                    setBridge({ ...bridge, bridge_secret: e.target.value });
                    setSecretDirty(true);
                  }}
                  placeholder={bridge.has_secret ? 'deixe em branco para manter o atual' : 'defina um segredo'}
                  className="input pr-10"
                  style={!showSecret ? { WebkitTextSecurity: 'disc', MozTextSecurity: 'disc', textSecurity: 'disc' } : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  title={showSecret ? 'Ocultar' : 'Mostrar'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink2 hover:bg-surface2 hover:text-ink"
                  aria-label={showSecret ? 'Ocultar segredo' : 'Mostrar segredo'}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={saveBridge}
                disabled={savingBridge}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
              >
                {savingBridge ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                onClick={() => runSync('/api/bridge/push/tasks', 'tarefas')}
                className="rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2"
              >
                Sincronizar tarefas agora
              </button>
              <button
                onClick={() => runSync('/api/bridge/push/time-entries', 'registros de tempo')}
                className="rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2"
              >
                Sincronizar registros de tempo
              </button>
              <button
                onClick={testBridge}
                disabled={testing}
                className="rounded-lg border border-accent/40 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/10 disabled:opacity-60"
              >
                {testing ? 'Testando...' : 'Testar conexão'}
              </button>
              <button
                onClick={importFromLifegame}
                disabled={importing}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
                title="Puxa tarefas e pessoas do Lifegame e grava em D1 com source=lifegame"
              >
                {importing ? 'Importando...' : '← Importar do Lifegame'}
              </button>
            </div>
            {testResult && (
              <div
                className={`rounded-md border px-3 py-2 text-xs ${
                  testResult.kind === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-danger/30 bg-danger/10 text-danger'
                }`}
              >
                <div className="mb-1 font-semibold">
                  {testResult.kind === 'ok' && testResult.data?.lifegame_status?.ok
                    ? 'Conexão OK — Lifegame respondeu com sucesso.'
                    : 'Conexão falhou — veja o detalhe:'}
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-snug">
                  {JSON.stringify(testResult.data, null, 2)}
                </pre>
              </div>
            )}
            {bridgeMsg && (
              <p
                className={`rounded-md px-3 py-2 text-xs ${
                  bridgeMsg.kind === 'ok'
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border border-danger/30 bg-danger/10 text-danger'
                }`}
              >
                {bridgeMsg.text}
              </p>
            )}
            {syncMsg && <p className="text-xs text-ink2">{syncMsg}</p>}

            {bridgeLog.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line text-muted">
                      <th className="py-1 pr-2 font-medium">Direção</th>
                      <th className="py-1 pr-2 font-medium">Entidade</th>
                      <th className="py-1 pr-2 font-medium">Status</th>
                      <th className="py-1 font-medium">Quando</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bridgeLog.slice(0, 10).map((l) => (
                      <tr key={l.id} className="border-b border-line/60 text-ink">
                        <td className="py-1 pr-2">{l.direction === 'outbound' ? '→ Lifegame' : '← Lifegame'}</td>
                        <td className="py-1 pr-2">{l.entity_type}</td>
                        <td className="py-1 pr-2" style={{ color: l.status === 'success' ? '#22C55E' : l.status === 'error' ? '#EF4444' : '#9E9890' }}>
                          {l.status}
                        </td>
                        <td className="py-1 text-ink2">{new Date(l.synced_at * 1000).toLocaleString('pt-BR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-3 text-base font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function IntegrationCard({ label, status }) {
  const connected = status === 'ok';
  return (
    <div className="flex items-center justify-between rounded-lg border border-line bg-base p-3">
      <div>
        <div className="text-sm font-medium text-ink">{label}</div>
        <div className="mt-0.5 flex items-center gap-1 text-xs" style={{ color: connected ? '#22C55E' : '#F59E0B' }}>
          {connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {status === 'checking' ? 'Verificando...' : connected ? 'Conectado' : 'Não autorizado'}
        </div>
      </div>
      {!connected && status !== 'checking' && (
        <button
          onClick={() => {
            window.location.href = '/api/auth/google';
          }}
          className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-ink2 hover:bg-surface2"
        >
          <RefreshCw className="h-3 w-3" /> Reconectar
        </button>
      )}
    </div>
  );
}
