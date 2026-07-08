import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail, RefreshCw, Star, Search, ExternalLink, Loader2, X, Plus, Inbox, AlertCircle,
} from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import { getToken } from '../../lib/auth';
import LoadingSpinner from '../shared/LoadingSpinner';

// A conta Gmail é única e compartilhada (lcestech.consulting@gmail.com). Todos os
// usuários autenticados leem; só o owner conecta (OAuth). Não há resposta pelo
// AIDE — "Abrir no Gmail" leva ao webmail.
const CONNECT_EMAIL = 'lcestech.consulting@gmail.com';
const AUTOSYNC_MS = 5 * 60 * 1000;

// Tipos e trilhas do modal "Adicionar ao Pipeline" (mapeiam para career_opportunities).
const PIPELINE_TYPES = [
  { key: 'phd', label: 'PhD' },
  { key: 'job', label: 'Emprego' },
  { key: 'collaboration', label: 'Colaboração' },
  { key: 'other', label: 'Outro' },
];
const PIPELINE_TRACKS = [
  { key: 'phd', label: 'PhD' },
  { key: 'job', label: 'Emprego' },
  { key: 'spinoff', label: 'Spin-off' },
];

// Data relativa em PT-BR: "há 12min", "há 2h", "ontem", senão "DD/MM".
function relDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  const sameDay = now.toDateString() === d.toDateString();
  if (sameDay) return `há ${Math.max(1, Math.floor(diff / 3600))}h`;
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (yest.toDateString() === d.toDateString()) return 'ontem';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fullDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function truncate(s, n) {
  const str = String(s || '');
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

export default function GmailPage() {
  const user = useStore((s) => s.user);
  const isOwner = user?.role === 'owner';
  const canPipeline = isOwner || user?.role === 'assistant_fixed' || user?.user_type === 'fixed';

  const [connected, setConnected] = useState(null); // null = ainda não sabe
  const [account, setAccount] = useState(null);
  const [emails, setEmails] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState('all'); // all | unread | starred
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');

  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [selLoading, setSelLoading] = useState(false);
  const [pipelineFor, setPipelineFor] = useState(null);

  // Lê ?connected=true / ?error= devolvidos pelo callback OAuth e limpa a URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true') setBanner('Conta LCEStech conectada com sucesso.');
    const err = params.get('error');
    if (err) setError(`Falha ao conectar: ${err}`);
    if (params.get('connected') || err) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const loadList = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (filter === 'unread') qs.set('unread', 'true');
      if (filter === 'starred') qs.set('starred', 'true');
      if (search.trim()) qs.set('search', search.trim());
      qs.set('limit', '50');
      const data = await apiFetch(`/api/gmail/emails?${qs.toString()}`);
      setConnected(!!data.connected);
      setAccount(data.account || null);
      setEmails(data.emails || []);
      setUnreadCount(data.unread_count || 0);
      setError('');
    } catch (e) {
      setError(String(e.message || e));
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  // Recarrega ao trocar filtro; busca com debounce.
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(loadList, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [loadList, search]);

  const sync = useCallback(async () => {
    setSyncing(true);
    setError('');
    try {
      const r = await apiFetch('/api/gmail/sync', { method: 'POST' });
      if (r && typeof r.synced === 'number' && r.synced > 0) {
        setBanner(`${r.synced} novo(s) email(s) sincronizado(s).`);
      }
      await loadList();
    } catch (e) {
      setError(`Falha ao sincronizar: ${String(e.message || e)}`);
    } finally {
      setSyncing(false);
    }
  }, [loadList]);

  // Auto-sync a cada 5 min enquanto a aba estiver visível.
  useEffect(() => {
    if (connected === false) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') sync();
    }, AUTOSYNC_MS);
    return () => clearInterval(id);
  }, [connected, sync]);

  const openEmail = async (id) => {
    setSelectedId(id);
    setSelLoading(true);
    try {
      const full = await apiFetch(`/api/gmail/emails/${id}`);
      setSelected(full);
      // Atualiza a lista localmente (marca como lido + ajusta contador).
      setEmails((list) => list.map((e) => (e.id === id ? { ...e, is_read: true } : e)));
      setUnreadCount((c) => {
        const was = emails.find((e) => e.id === id);
        return was && !was.is_read ? Math.max(0, c - 1) : c;
      });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSelLoading(false);
    }
  };

  const toggleStar = async (id, e) => {
    if (e) e.stopPropagation();
    // Otimista.
    setEmails((list) => list.map((m) => (m.id === id ? { ...m, is_starred: !m.is_starred } : m)));
    setSelected((s) => (s && s.id === id ? { ...s, is_starred: !s.is_starred } : s));
    try {
      await apiFetch(`/api/gmail/emails/${id}/star`, { method: 'POST' });
    } catch {
      loadList();
    }
  };

  const connect = () => {
    window.location.href = `/api/gmail/auth?token=${encodeURIComponent(getToken() || '')}`;
  };

  // ---- Estados de topo (loading / desconectado) --------------------------
  if (loading && connected === null) {
    return <div className="h-full"><LoadingSpinner label="Carregando emails..." /></div>;
  }

  if (connected === false) {
    return (
      <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-4 text-center">
        <Mail className="h-12 w-12 text-muted" />
        <h1 className="text-xl font-bold text-ink">Conta LCEStech não conectada</h1>
        {error && <p className="text-sm text-danger">{error}</p>}
        {isOwner ? (
          <>
            <p className="max-w-md text-sm text-ink2">
              Conecte a conta {CONNECT_EMAIL} para que todos os usuários possam ler os
              emails de oportunidades (leitura apenas).
            </p>
            <button
              type="button"
              onClick={connect}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
            >
              <Mail className="h-4 w-4" /> Conectar {CONNECT_EMAIL}
            </button>
          </>
        ) : (
          <p className="max-w-md text-sm text-ink2">Aguardando autorização do administrador.</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-3">
      {banner && (
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          <span>{banner}</span>
          <button type="button" onClick={() => setBanner('')} className="text-green-700 hover:opacity-70"><X className="h-4 w-4" /></button>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3">
        {/* ---- PAINEL ESQUERDO (35%) ---- */}
        <div className="flex w-full min-w-0 flex-col gap-2 md:w-[35%]">
          <div className="flex items-center justify-between gap-2">
            <h1 className="flex items-center gap-2 text-lg font-bold text-ink">
              <Mail className="h-5 w-5 text-accent" /> LCEStech Email
            </h1>
            <button
              type="button"
              onClick={sync}
              disabled={syncing}
              title="Sincronizar"
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink2 transition hover:bg-surface2 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>
          </div>

          {unreadCount > 0 && (
            <span className="w-fit rounded-full bg-danger px-2 py-0.5 text-xs font-semibold text-white">
              {unreadCount} não lido{unreadCount > 1 ? 's' : ''}
            </span>
          )}

          {/* Abas de filtro */}
          <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
            {[
              { key: 'all', label: 'Todos' },
              { key: 'unread', label: 'Não lidos' },
              { key: 'starred', label: 'Com estrela' },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                  filter === t.key ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Busca */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar emails..."
              className="h-9 w-full rounded-lg border border-line bg-surface2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>

          {/* Lista */}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-line bg-surface">
            {loading ? (
              <div className="py-10"><LoadingSpinner label="Carregando..." /></div>
            ) : emails.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-sm text-muted">
                <Inbox className="h-8 w-8" />
                Nenhum email {filter === 'unread' ? 'não lido' : filter === 'starred' ? 'com estrela' : ''}.
              </div>
            ) : (
              emails.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => openEmail(m.id)}
                  className={`flex w-full flex-col gap-0.5 border-b border-line px-3 py-2.5 text-left transition hover:bg-surface2 ${
                    selectedId === m.id ? 'bg-accent/5' : ''
                  } ${!m.is_read ? 'bg-blue-50/40' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`min-w-0 flex-1 truncate text-sm ${!m.is_read ? 'font-bold text-ink' : 'text-ink2'}`}>
                      {!m.is_read && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-accent align-middle" />}
                      {m.from_name || m.from_email || '—'}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted">
                      <Star
                        onClick={(e) => toggleStar(m.id, e)}
                        className={`h-3.5 w-3.5 cursor-pointer ${m.is_starred ? 'fill-amber-400 text-amber-400' : 'text-muted hover:text-amber-400'}`}
                      />
                      {relDate(m.date_sent)}
                    </span>
                  </div>
                  <span className={`truncate text-xs ${!m.is_read ? 'font-semibold text-ink' : 'text-ink2'}`}>
                    {truncate(m.subject, 40)}
                  </span>
                  <span className="truncate text-[11px] text-muted">{truncate(m.snippet, 60)}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ---- PAINEL DIREITO (65%) ---- */}
        <div className="hidden min-w-0 flex-1 flex-col rounded-lg border border-line bg-surface md:flex md:w-[65%]">
          {!selectedId ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted">
              <Mail className="h-10 w-10" />
              <p className="text-sm">Selecione um email para ler</p>
              <button
                type="button"
                onClick={sync}
                className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2"
              >
                <RefreshCw className="h-4 w-4" /> Sincronizar emails
              </button>
            </div>
          ) : selLoading || !selected ? (
            <div className="py-16"><LoadingSpinner label="Abrindo email..." /></div>
          ) : (
            <EmailReader
              email={selected}
              onStar={() => toggleStar(selected.id)}
              onPipeline={canPipeline ? () => setPipelineFor(selected) : null}
            />
          )}
        </div>
      </div>

      {/* Leitura em tela cheia no mobile (o painel direito é oculto em < md). */}
      {selectedId && (
        <div className="fixed inset-0 z-40 flex flex-col bg-surface md:hidden">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-sm font-semibold text-ink">Email</span>
            <button type="button" onClick={() => { setSelectedId(null); setSelected(null); }} className="rounded-md p-1 text-ink2 hover:bg-surface2">
              <X className="h-5 w-5" />
            </button>
          </div>
          {selLoading || !selected ? (
            <div className="py-16"><LoadingSpinner label="Abrindo email..." /></div>
          ) : (
            <EmailReader
              email={selected}
              onStar={() => toggleStar(selected.id)}
              onPipeline={canPipeline ? () => setPipelineFor(selected) : null}
            />
          )}
        </div>
      )}

      {pipelineFor && (
        <PipelineModal email={pipelineFor} onClose={() => setPipelineFor(null)} />
      )}
    </div>
  );
}

// --- Leitor do email (corpo em iframe sandboxed quando há HTML) -------------
function EmailReader({ email, onStar, onPipeline }) {
  const iframeRef = useRef(null);

  // Ajusta a altura do iframe ao conteúdo (limitada por CSS/max-height).
  const onFrameLoad = () => {
    try {
      const doc = iframeRef.current.contentDocument;
      if (doc) iframeRef.current.style.height = `${Math.min(doc.body.scrollHeight + 24, 900)}px`;
    } catch { /* cross-origin — mantém altura padrão */ }
  };

  const openGmail = () => window.open(email.gmail_link, '_blank', 'noopener');

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Cabeçalho */}
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">{email.subject}</h2>
          <button type="button" onClick={onStar} title="Estrela" className="shrink-0 rounded-md p-1 hover:bg-surface2">
            <Star className={`h-5 w-5 ${email.is_starred ? 'fill-amber-400 text-amber-400' : 'text-muted'}`} />
          </button>
        </div>
        <div className="mt-1.5 text-sm text-ink2">
          <span className="font-medium text-ink">{email.from_name || email.from_email}</span>
          {email.from_name && <span className="text-muted"> &lt;{email.from_email}&gt;</span>}
          <span className="text-muted"> · {fullDate(email.date_sent)}</span>
        </div>
        {email.to_email && <div className="text-xs text-muted">Para: {email.to_email}</div>}
        {Array.isArray(email.labels) && email.labels.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {email.labels.map((l) => (
              <span key={l} className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] font-medium text-ink2">{l}</span>
            ))}
          </div>
        )}
        <div className="mt-3">
          <button
            type="button"
            onClick={openGmail}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            Abrir no Gmail <ExternalLink className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Corpo */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" style={{ maxHeight: '60vh' }}>
        {email.body_html ? (
          <iframe
            ref={iframeRef}
            title="Corpo do email"
            sandbox=""
            srcDoc={email.body_html}
            onLoad={onFrameLoad}
            className="w-full rounded border border-line bg-white"
            style={{ minHeight: 200 }}
          />
        ) : (
          <pre className="whitespace-pre-wrap break-words font-sans text-sm text-ink2">{email.body_text || '(sem conteúdo)'}</pre>
        )}
      </div>

      {/* Barra de ações */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
        {onPipeline && (
          <button
            type="button"
            onClick={onPipeline}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Adicionar ao Pipeline
          </button>
        )}
        <button
          type="button"
          onClick={openGmail}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          Abrir no Gmail <ExternalLink className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// --- Modal "Adicionar ao Pipeline" -----------------------------------------
function PipelineModal({ email, onClose }) {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState([]);
  const [form, setForm] = useState({
    title: email.subject || '',
    type: 'phd',
    track: 'phd',
    organization: '',
    notes: email.snippet || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    apiFetch('/api/market/organizations').then((r) => setOrgs(r || [])).catch(() => {});
  }, []);

  const save = async () => {
    if (!form.title.trim()) { setError('Título é obrigatório'); return; }
    setSaving(true);
    setError('');
    try {
      const match = orgs.find((o) => (o.name || '').toLowerCase() === form.organization.trim().toLowerCase());
      const notes = [
        form.notes,
        !match && form.organization.trim() ? `Organização: ${form.organization.trim()}` : '',
        `Origem: email LCEStech de ${email.from_name || email.from_email}`,
        email.gmail_link,
      ].filter(Boolean).join('\n');
      await apiFetch('/api/career/opportunities', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          type: form.type,
          track: form.track,
          organization_id: match ? match.id : null,
          url: email.gmail_link,
          notes,
        }),
      });
      setDone(true);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-soft" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Adicionar ao Pipeline</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
        </div>

        {done ? (
          <div className="space-y-4 py-2 text-center">
            <p className="text-sm text-green-700">Oportunidade criada com sucesso.</p>
            <div className="flex justify-center gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2">Fechar</button>
              <button type="button" onClick={() => navigate('/career')} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">Ver em Carreira</button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink2">Título</span>
                <input value={form.title} onChange={(e) => set({ title: e.target.value })} className="input" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink2">Tipo</span>
                  <select value={form.type} onChange={(e) => set({ type: e.target.value })} className="input">
                    {PIPELINE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink2">Trilha</span>
                  <select value={form.track} onChange={(e) => set({ track: e.target.value })} className="input">
                    {PIPELINE_TRACKS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink2">Organização</span>
                <input
                  list="gmail-orgs"
                  value={form.organization}
                  onChange={(e) => set({ organization: e.target.value })}
                  placeholder="Buscar ou digitar..."
                  className="input"
                />
                <datalist id="gmail-orgs">
                  {orgs.map((o) => <option key={o.id} value={o.name} />)}
                </datalist>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink2">Notas</span>
                <textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} className="input min-h-[70px]" />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2">Cancelar</button>
              <button type="button" onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Criar Oportunidade
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
