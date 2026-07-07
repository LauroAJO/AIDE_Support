import { useEffect, useMemo, useState } from 'react';
import {
  Radar, RefreshCw, Search, ExternalLink, X, Tag, FileText, Loader2,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import LoadingSpinner from '../shared/LoadingSpinner';

// Projetos monitorados pelo Hub. "todos" só existe como filtro.
const PROJECTS = [
  { key: 'todos', label: 'Todos' },
  { key: 'h2', label: 'H₂' },
  { key: 'energia', label: 'Energia' },
  { key: 'ia', label: 'IA' },
];
const PROJECT_LABELS = { h2: 'H₂', energia: 'Energia', ia: 'IA' };

function projectLabel(id) {
  return PROJECT_LABELS[id] || id || '—';
}

// Deriva o nível (alta/media/baixa) a partir da prioridade textual ou, na
// ausência dela, da relevância numérica (1-5).
function nivel(item) {
  const p = (item.prioridade || '').toLowerCase();
  if (p === 'alta' || p === 'media' || p === 'média' || p === 'baixa') {
    return p === 'média' ? 'media' : p;
  }
  const r = Number(item.relevancia) || 0;
  if (r >= 4) return 'alta';
  if (r >= 2.5) return 'media';
  return 'baixa';
}

const NIVEL_STYLE = {
  alta: 'bg-emerald-100 text-emerald-700',
  media: 'bg-amber-100 text-amber-700',
  baixa: 'bg-surface2 text-ink2',
};

function RelevanciaBadge({ item }) {
  const n = nivel(item);
  const r = item.relevancia != null ? Number(item.relevancia) : null;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${NIVEL_STYLE[n] || NIVEL_STYLE.baixa}`}>
      {r != null ? r.toFixed(1) : n}
    </span>
  );
}

function Badge({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {children}
    </span>
  );
}

// Datas chegam como string ISO/SQLite (DATETIME). Mostra só YYYY-MM-DD.
function fmtDate(s) {
  if (!s) return '—';
  const str = String(s);
  if (str.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const t = Date.parse(str);
  return Number.isNaN(t) ? '—' : new Date(t).toISOString().slice(0, 10);
}

export default function HubPage() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filtros
  const [project, setProject] = useState('todos');
  const [minRel, setMinRel] = useState('');
  const [search, setSearch] = useState('');

  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (project && project !== 'todos') params.set('project', project);
      if (minRel) params.set('min_relevancia', minRel);
      params.set('order_by', 'received_at');
      params.set('limit', '200');
      const [itemsRes, statsRes] = await Promise.all([
        apiFetch(`/api/hub/items?${params.toString()}`),
        apiFetch('/api/hub/stats').catch(() => null),
      ]);
      setItems(itemsRes.items || []);
      setStats(statsRes);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  // Recarrega ao mudar projeto ou relevância mínima (a busca por texto é local).
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, minRel]);

  // Busca textual filtra título e resumo no cliente.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        (it.title || '').toLowerCase().includes(q) ||
        (it.resumo || '').toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <Radar className="h-6 w-6 text-accent" />
          Hub
        </h1>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink2 transition hover:bg-surface2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {/* Cards de estatísticas por projeto */}
      <StatsCards stats={stats} />

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3">
        <label className="flex items-center gap-1.5 text-xs text-ink2">
          Projeto
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className="rounded-lg border border-line bg-surface2 px-2 py-1.5 text-xs text-ink"
          >
            {PROJECTS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink2">
          Relevância mín.
          <select
            value={minRel}
            onChange={(e) => setMinRel(e.target.value)}
            className="rounded-lg border border-line bg-surface2 px-2 py-1.5 text-xs text-ink"
          >
            <option value="">Todas</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}+</option>)}
          </select>
        </label>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título ou resumo..."
            className="h-9 w-full rounded-lg border border-line bg-surface2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-line bg-surface">
        {loading ? (
          <div className="py-16"><LoadingSpinner label="Carregando itens do Hub..." /></div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-sm text-danger">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted">Nenhum item encontrado.</div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">Relev.</th>
                <th className="px-3 py-2 font-medium">Título</th>
                <th className="px-3 py-2 font-medium">Fonte</th>
                <th className="px-3 py-2 font-medium">Projeto</th>
                <th className="px-3 py-2 font-medium">Coleta</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} className="border-b border-line/60 transition hover:bg-surface2">
                  <td className="px-3 py-2"><RelevanciaBadge item={it} /></td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setSelected(it)}
                      className="text-left font-medium text-ink transition hover:text-accent"
                    >
                      {it.title}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-ink2">{it.source_name || '—'}</td>
                  <td className="px-3 py-2">
                    <Badge className="bg-accent/10 text-accent">{projectLabel(it.project_id)}</Badge>
                  </td>
                  <td className="px-3 py-2 text-muted">{fmtDate(it.collected_at || it.received_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && <DetailModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function StatsCards({ stats }) {
  const byProject = (stats && stats.by_project) || [];
  if (byProject.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        Sem itens recebidos ainda.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {byProject.map((p) => (
        <div key={p.project_id} className="rounded-xl border border-line bg-surface p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-ink">{projectLabel(p.project_id)}</span>
            <span className="text-2xl font-bold text-accent">{p.count}</span>
          </div>
          <div className="mt-1 space-y-0.5 text-xs text-muted">
            <div>Relev. média: <span className="text-ink2">{p.avg_relevancia != null ? p.avg_relevancia.toFixed(1) : '—'}</span></div>
            <div>Último: <span className="text-ink2">{fmtDate(p.last_received)}</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="text-sm text-ink">{children}</span>
    </div>
  );
}

function DetailModal({ item, onClose }) {
  const topicos = Array.isArray(item.topicos) ? item.topicos : [];
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full flex-col bg-surface shadow-soft sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">{item.title}</h2>
          <button onClick={onClose} className="shrink-0 rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
            >
              <ExternalLink className="h-4 w-4" /> Abrir fonte original
            </a>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <RelevanciaBadge item={item} />
            {item.tipo && <Badge className="bg-accent/10 text-accent">{item.tipo}</Badge>}
            {item.prioridade && <Badge className="bg-surface2 text-ink2">Prioridade: {item.prioridade}</Badge>}
            <Badge className="bg-accent/10 text-accent">{projectLabel(item.project_id)}</Badge>
          </div>

          {item.resumo && (
            <Row label="Resumo">
              <p className="whitespace-pre-wrap leading-relaxed text-ink2">{item.resumo}</p>
            </Row>
          )}

          {topicos.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Tópicos</span>
              <div className="flex flex-wrap gap-1.5">
                {topicos.map((t, i) => (
                  <Badge key={i} className="bg-surface2 text-ink2">
                    <Tag className="mr-1 h-3 w-3" />{t}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {item.justificativa && (
            <Row label="Justificativa do LLM">
              <p className="whitespace-pre-wrap leading-relaxed text-ink2">
                <FileText className="mr-1 inline h-3.5 w-3.5 text-muted" />
                {item.justificativa}
              </p>
            </Row>
          )}

          <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
            <Row label="Fonte">{item.source_name || '—'}</Row>
            <Row label="Publicado em">{fmtDate(item.published_at)}</Row>
            <Row label="Coletado em">{fmtDate(item.collected_at)}</Row>
            <Row label="Recebido em">{fmtDate(item.received_at)}</Row>
          </div>
        </div>
      </div>
    </div>
  );
}
