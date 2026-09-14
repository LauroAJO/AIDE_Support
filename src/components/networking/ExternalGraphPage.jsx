import { useEffect, useMemo, useState } from 'react';
import { Search, RotateCcw } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import LoadingSpinner from '../shared/LoadingSpinner';
import { buildEgoNetworkGeneric, truncate } from './networkShared';

// Fase 4 (II.1.13.0) — visualização de grafos genéricos {nodes, edges},
// consumindo GET /api/graph/data?type=<...> (Fase 0/4 no backend). É o
// "segundo consumidor real" que valida buildEgoNetworkGeneric fora do
// endpoint isolado da Fase 0 — NetworkMapRede.jsx continua intocado (ver
// CHANGELOG, desvio documentado desde a Fase 0).
//
// Layout deliberadamente mais simples que NetworkMapRede (sem os detalhes
// visuais específicos de pessoa: temperatura, losango de nacionalidade,
// peso setorial) — este componente é genérico por natureza, e serve tanto
// para o grafo de colaboração científica quanto para o de projetos CORDIS
// compartilhados, sem saber nada sobre o domínio dos nós além de
// {label, sublabel, type}.

const GRAPH_TYPES = [
  { key: 'collaboration', label: 'Colaboração Científica', node: 'pessoa', edgeLabel: 'coautoria' },
  { key: 'cordis', label: 'Projetos CORDIS (UE)', node: 'organização', edgeLabel: 'projeto em comum' },
];

const VB = 900;
const VB_MIN = -VB / 2;
const R1 = 200;
const R2 = 360;
const ROUT = 430;

function ringPos(i, count, r, offset = 0) {
  const denom = Math.max(1, count);
  const angle = (i / denom) * Math.PI * 2 - Math.PI / 2 + offset;
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
}

export default function ExternalGraphPage() {
  const [graphType, setGraphType] = useState('collaboration');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ nodes: [], edges: [] });
  const [centerId, setCenterId] = useState(null);
  const [degrees, setDegrees] = useState(2);
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hoverNode, setHoverNode] = useState(null);

  const typeInfo = GRAPH_TYPES.find((t) => t.key === graphType);

  useEffect(() => {
    setLoading(true);
    setCenterId(null);
    apiFetch(`/api/graph/data?type=${graphType}`)
      .then((d) => setData(d && d.nodes ? d : { nodes: [], edges: [] }))
      .catch(() => setData({ nodes: [], edges: [] }))
      .finally(() => setLoading(false));
  }, [graphType]);

  const nodesById = useMemo(() => {
    const m = {};
    data.nodes.forEach((n) => { m[n.id] = n; });
    return m;
  }, [data.nodes]);

  // firstHopOnlyTypes vazio — nesta fase nenhum tipo de aresta tem a regra
  // "só conta pro 1º grau" (essa regra é específica do grafo de Networking,
  // via 'affiliation' — ver buildNetworkingGraph).
  const ego = useMemo(() => {
    if (!centerId) return null;
    return buildEgoNetworkGeneric(centerId, degrees, data.nodes, data.edges, { firstHopOnlyTypes: [] });
  }, [centerId, degrees, data.nodes, data.edges]);

  const layout = useMemo(() => {
    const map = {};
    if (!ego) {
      data.nodes.forEach((n, i) => {
        map[n.id] = { ...ringPos(i, data.nodes.length, ROUT), degree: 'out' };
      });
      return map;
    }
    map[centerId] = { x: 0, y: 0, degree: 0 };
    const first = ego.nodesByDegree[1] || [];
    first.forEach((id, i) => { map[id] = { ...ringPos(i, first.length, R1), degree: 1 }; });
    const second = ego.nodesByDegree[2] || [];
    second.forEach((id, i) => { map[id] = { ...ringPos(i, second.length, R2, 0.25), degree: 2 }; });
    const rest = data.nodes.filter((n) => !ego.visited.has(n.id));
    rest.forEach((n, i) => { map[n.id] = { ...ringPos(i, rest.length, ROUT, 0.5), degree: 'out' }; });
    return map;
  }, [ego, centerId, data.nodes]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? data.nodes.filter((n) => (n.label || '').toLowerCase().includes(q)) : data.nodes;
    return list.slice(0, 50);
  }, [data.nodes, query]);

  const RADIUS = { 0: 30, 1: 15, 2: 10, out: 4 };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
          {GRAPH_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setGraphType(t.key)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                graphType === t.key ? 'bg-indigo-600 text-white' : 'text-ink2 hover:bg-surface2'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
          <span className="px-1.5 text-[10px] font-medium text-muted">Graus:</span>
          {[1, 2].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDegrees(d)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                degrees === d ? 'bg-indigo-600 text-white' : 'text-ink2 hover:bg-surface2'
              }`}
            >
              {d === 1 ? '1 grau' : '2 graus'}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPickerOpen(true); }}
            onFocus={() => setPickerOpen(true)}
            onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
            placeholder={`Centralizar em ${typeInfo?.node}...`}
            className="w-56 rounded-lg border border-line bg-surface py-1.5 pl-8 pr-2 text-xs text-ink outline-none placeholder:text-muted focus:border-accent"
          />
          {pickerOpen && (
            <div className="absolute left-0 top-full z-30 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-soft">
              {matches.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted">Ninguém encontrado.</p>
              ) : matches.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onMouseDown={() => { setCenterId(n.id); setQuery(''); setPickerOpen(false); }}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-ink hover:bg-surface2"
                >
                  {n.label}{n.sublabel ? ` — ${n.sublabel}` : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        {centerId && (
          <button
            type="button"
            onClick={() => setCenterId(null)}
            className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-medium text-ink2 hover:bg-surface2"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Resetar
          </button>
        )}

        <span className="ml-auto text-[11px] text-muted">
          {data.nodes.length} nós · {data.edges.length} arestas
        </span>
      </div>

      <p className="text-[11px] text-muted">
        {graphType === 'cordis'
          ? 'Vínculos vêm de busca por nome no CORDIS (Fase 2) — best-effort, confira antes de usar.'
          : 'Vínculos vêm de coautoria detectada via OpenAlex (Fase 1/3) — só entre pessoas já vinculadas ao OpenAlex.'}
      </p>

      <div className="relative min-h-[480px] flex-1 overflow-hidden rounded-xl border border-line bg-surface">
        {loading ? (
          <LoadingSpinner label="Carregando grafo..." />
        ) : data.nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Nenhum dado ainda para este grafo — vincule OpenAlex/CORDIS em Networking/Mercado primeiro.
          </div>
        ) : (
          <svg width="100%" height="100%" viewBox={`${VB_MIN} ${VB_MIN} ${VB} ${VB}`} style={{ display: 'block' }}>
            {ego && [R1, degrees >= 2 ? R2 : null, ROUT].filter(Boolean).map((r) => (
              <circle key={r} cx={0} cy={0} r={r} fill="none" stroke="#F3F0EB" strokeWidth="1" />
            ))}
            {ego && ego.edges.map((e) => {
              const a = layout[e.from]; const b = layout[e.to];
              if (!a || !b) return null;
              const first = e.degree === 1;
              return (
                <line
                  key={`${e.from}-${e.to}-${e.degree}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={first ? '#6366F1' : '#9CA3AF'}
                  strokeWidth={first ? 2 : 1}
                  strokeDasharray={first ? undefined : '5 4'}
                  opacity={first ? 0.9 : 0.6}
                >
                  <title>{nodesById[e.from]?.label} — {nodesById[e.to]?.label}: {e.label || typeInfo?.edgeLabel}</title>
                </line>
              );
            })}
            {data.nodes.map((n) => {
              const pos = layout[n.id];
              if (!pos) return null;
              const isCenter = pos.degree === 0;
              const isOut = pos.degree === 'out';
              const r = RADIUS[pos.degree] || RADIUS.out;
              const opacity = isOut ? (ego ? 0.12 : 0.6) : 1;
              return (
                <g
                  key={n.id}
                  style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, transition: 'transform 400ms ease', cursor: 'pointer' }}
                  opacity={opacity}
                  onClick={() => setCenterId(n.id)}
                  onMouseEnter={() => setHoverNode(n)}
                  onMouseLeave={() => setHoverNode(null)}
                >
                  <circle cx={0} cy={0} r={r} fill={isCenter ? '#6366F1' : '#818CF8'} stroke={isCenter ? '#312E81' : '#FFFFFF'} strokeWidth={isCenter ? 3 : 1.5} />
                  {pos.degree !== 'out' && (
                    <text x={0} y={r + 12} textAnchor="middle" fontSize={isCenter ? 12 : 10} fontWeight={isCenter ? 700 : 500} fill="#1A1814" style={{ pointerEvents: 'none' }}>
                      {truncate(n.label, 22)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {hoverNode && (
          <div className="pointer-events-none absolute left-3 top-3 z-20 max-w-xs rounded-lg border border-line bg-white p-2.5 shadow-lg">
            <p className="text-sm font-semibold text-ink">{hoverNode.label}</p>
            {hoverNode.sublabel && <p className="text-[11px] text-ink2">{hoverNode.sublabel}</p>}
          </div>
        )}

        {!centerId && data.nodes.length > 0 && !loading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="rounded-lg bg-surface/90 px-4 py-2 text-sm font-medium text-ink shadow-soft backdrop-blur">
              Clique num nó (ou busque acima) para centralizar
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
