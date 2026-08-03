import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, RotateCcw, ArrowLeft, X } from 'lucide-react';
import {
  TEMP_META, sectorWeightColor, sectorWeightLabel, currentRoleOrg, subtitleForPerson,
  truncate, buildBrazilianPersonSet, buildEgoNetwork, edgeLabel,
} from './networkShared';

// Mapa de Rede (v2.25.14) — visão egocêntrica: qualquer pessoa vira o centro e
// a rede é desenhada por grau de distância. Complementa o Mapa Orbital (Lauro
// sempre no centro, todo mundo num anel só), que continua intacto.
//
// Sem física: os anéis são calculados por ângulo fixo, então a figura é estável
// entre renders e a transição de um centro para outro é uma animação CSS de
// `transform` — nós que existem nos dois layouts deslizam para a nova posição
// (a `key` do <g> é o id da pessoa, então o React reaproveita o mesmo nó).

const VB = 1000;                 // viewBox quadrado, origem no centro
const VB_MIN = -VB / 2;
const R_FIRST = 210;             // anel do 1º grau
const R_SECOND = 375;            // anel do 2º grau
const R_OUT = 468;               // anel dos não conectados
const NODE_TRANSITION = 'transform 450ms cubic-bezier(0.22, 1, 0.36, 1)';

const RADIUS = { 0: 34, 1: 17, 2: 11, out: 4 };
const LABEL_MAX = { 0: 26, 1: 18, 2: 14 };

// Espalha `n` pontos num anel, começando no topo e com um deslocamento por
// anel para os rótulos não se empilharem entre graus vizinhos.
function ringPos(index, count, radius, offset = 0) {
  const denom = Math.max(1, count);
  const angle = (index / denom) * Math.PI * 2 - Math.PI / 2 + offset;
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

// Espiral do ângulo áureo — usada no estado vazio: parece orgânico como um
// force-directed, mas é determinístico (mesma figura a cada render, sem
// simulação rodando em loop).
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
function scatterPos(index, count) {
  const r = R_OUT * Math.sqrt((index + 0.5) / Math.max(1, count));
  const angle = index * GOLDEN;
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
}

function diamondPoints(cx, cy, r) {
  return `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
}

export default function NetworkMapRede({
  people, institutions, connections, contactOrgLinks = [], personRoles = [],
  onOpenPerson,
}) {
  const containerRef = useRef(null);
  const [centerNodeId, setCenterNodeId] = useState(null);
  const [degrees, setDegrees] = useState(1);
  const [history, setHistory] = useState([]);          // centros anteriores
  const [colorMode, setColorMode] = useState('temperature'); // 'temperature' | 'sector'
  const [hoverNode, setHoverNode] = useState(null);    // { person, degree, x, y }
  const [hoverEdge, setHoverEdge] = useState(null);    // { label, x, y }
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef(null);

  const safePeople = useMemo(
    () => (Array.isArray(people) ? people.filter((p) => p && p.id) : []),
    [people],
  );
  const peopleById = useMemo(() => {
    const m = {};
    safePeople.forEach((p) => { m[p.id] = p; });
    return m;
  }, [safePeople]);

  const brazilians = useMemo(
    () => buildBrazilianPersonSet(safePeople, institutions, contactOrgLinks, personRoles),
    [safePeople, institutions, contactOrgLinks, personRoles],
  );

  // Fecha o dropdown de "Centralizar em" ao clicar fora ou apertar Escape.
  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onDocClick = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setPickerOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  const ego = useMemo(() => {
    if (!centerNodeId) return null;
    return buildEgoNetwork(centerNodeId, degrees, safePeople, connections, contactOrgLinks);
  }, [centerNodeId, degrees, safePeople, connections, contactOrgLinks]);

  // Posição de cada pessoa na figura atual + o grau a que pertence.
  const layout = useMemo(() => {
    const map = {};
    if (!ego) {
      safePeople.forEach((p, i) => {
        map[p.id] = { ...scatterPos(i, safePeople.length), degree: 'out', radius: RADIUS.out };
      });
      return map;
    }
    map[centerNodeId] = { x: 0, y: 0, degree: 0, radius: RADIUS[0] };

    const first = ego.nodesByDegree[1] || [];
    first.forEach((id, i) => {
      map[id] = { ...ringPos(i, first.length, R_FIRST), degree: 1, radius: RADIUS[1] };
    });

    const second = ego.nodesByDegree[2] || [];
    second.forEach((id, i) => {
      map[id] = { ...ringPos(i, second.length, R_SECOND, 0.25), degree: 2, radius: RADIUS[2] };
    });

    const rest = safePeople.filter((p) => !ego.visited.has(p.id));
    rest.forEach((p, i) => {
      map[p.id] = { ...ringPos(i, rest.length, R_OUT, 0.5), degree: 'out', radius: RADIUS.out };
    });
    return map;
  }, [ego, centerNodeId, safePeople]);

  const nodeColor = (p) => (
    colorMode === 'sector'
      ? sectorWeightColor(p.sector_weight)
      : (TEMP_META[p.temperature] || TEMP_META.never).dot
  );

  // ── navegação ──────────────────────────────────────────────────────────────

  const goToCenter = (id) => {
    if (!id || id === centerNodeId) return;
    setHistory((h) => (centerNodeId ? [...h, centerNodeId] : h));
    setCenterNodeId(id);
    setHoverNode(null);
  };
  const goBack = () => {
    setHistory((h) => {
      if (h.length === 0) { setCenterNodeId(null); return h; }
      setCenterNodeId(h[h.length - 1]);
      return h.slice(0, -1);
    });
    setHoverNode(null);
  };
  const reset = () => {
    setCenterNodeId(null);
    setHistory([]);
    setHoverNode(null);
    setQuery('');
  };
  // Breadcrumb: "Início" é o índice -1; history[i] é o índice i.
  const jumpTo = (index) => {
    if (index < 0) { setCenterNodeId(null); setHistory([]); return; }
    setCenterNodeId(history[index]);
    setHistory(history.slice(0, index));
    setHoverNode(null);
  };

  // ── busca do "Centralizar em" ──────────────────────────────────────────────

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? safePeople.filter((p) => {
        const { role, org } = currentRoleOrg(p);
        return `${p.name} ${role} ${org}`.toLowerCase().includes(q);
      })
      : safePeople;
    return list.slice(0, 60);
  }, [safePeople, query]);

  // ── tooltip ────────────────────────────────────────────────────────────────

  const showTooltip = (p, degree, e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    setHoverNode({
      person: p,
      degree,
      x: rect ? e.clientX - rect.left : 0,
      y: rect ? e.clientY - rect.top : 0,
    });
  };

  const centerPerson = centerNodeId ? peopleById[centerNodeId] : null;
  const firstCount = ego ? (ego.nodesByDegree[1] || []).length : 0;
  const secondCount = ego ? (ego.nodesByDegree[2] || []).length : 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* ── Controles ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
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

        {/* Centralizar em — busca conforme digita */}
        <div className="relative" ref={pickerRef}>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPickerOpen(true); }}
            onFocus={() => setPickerOpen(true)}
            placeholder="Centralizar em..."
            className="w-56 rounded-lg border border-line bg-surface py-1.5 pl-8 pr-2 text-xs text-ink outline-none placeholder:text-muted focus:border-accent"
          />
          {pickerOpen && (
            <div className="absolute left-0 top-full z-30 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-soft">
              {matches.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted">Ninguém encontrado.</p>
              ) : matches.map((p) => {
                const { role, org } = currentRoleOrg(p);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { goToCenter(p.id); setPickerOpen(false); setQuery(''); }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-surface2"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: (TEMP_META[p.temperature] || TEMP_META.never).dot }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-ink">
                        {p.name}{brazilians.has(p.id) ? ' 🇧🇷' : ''}
                      </span>
                      {(role || org) && (
                        <span className="block truncate text-[10px] text-muted">
                          {[role, org].filter(Boolean).join(' @ ')}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-medium text-ink2 hover:bg-surface2"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Resetar
        </button>

        {(centerNodeId || history.length > 0) && (
          <button
            type="button"
            onClick={goBack}
            className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-medium text-ink2 hover:bg-surface2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </button>
        )}

        <div className="ml-auto flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
          <span className="px-1.5 text-[10px] font-medium text-muted">Colorir:</span>
          <button
            type="button" onClick={() => setColorMode('temperature')}
            className={`rounded-md px-2 py-1 text-[11px] font-medium ${colorMode === 'temperature' ? 'bg-indigo-600 text-white' : 'text-ink2 hover:bg-surface2'}`}
          >
            Temperatura
          </button>
          <button
            type="button" onClick={() => setColorMode('sector')}
            className={`rounded-md px-2 py-1 text-[11px] font-medium ${colorMode === 'sector' ? 'bg-indigo-600 text-white' : 'text-ink2 hover:bg-surface2'}`}
          >
            Peso Setorial
          </button>
        </div>
      </div>

      {/* ── Breadcrumb ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1 text-[11px] text-ink2">
        <button
          type="button"
          onClick={() => jumpTo(-1)}
          className={`rounded px-1.5 py-0.5 transition hover:bg-surface2 ${centerNodeId ? 'text-accent hover:underline' : 'font-semibold text-ink'}`}
        >
          Início
        </button>
        {history.map((id, i) => (
          <span key={`${id}-${i}`} className="flex items-center gap-1">
            <span className="text-muted">→</span>
            <button
              type="button"
              onClick={() => jumpTo(i)}
              className="rounded px-1.5 py-0.5 text-accent transition hover:bg-surface2 hover:underline"
            >
              {truncate(peopleById[id]?.name || '?', 22)}
            </button>
          </span>
        ))}
        {centerPerson && (
          <span className="flex items-center gap-1">
            <span className="text-muted">→</span>
            <span className="rounded px-1.5 py-0.5 font-semibold text-ink">
              {truncate(centerPerson.name, 22)}
            </span>
          </span>
        )}
        {ego && (
          <span className="ml-2 text-muted">
            · {firstCount} de 1º grau{degrees >= 2 ? ` · ${secondCount} de 2º grau` : ''}
          </span>
        )}
      </div>

      {/* ── SVG ─────────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="relative min-h-[520px] flex-1 overflow-hidden rounded-xl border border-line bg-surface"
      >
        <svg
          width="100%" height="100%"
          viewBox={`${VB_MIN} ${VB_MIN} ${VB} ${VB}`}
          style={{ display: 'block' }}
        >
          {/* Anéis-guia */}
          {ego && [R_FIRST, degrees >= 2 ? R_SECOND : null, R_OUT].filter(Boolean).map((r) => (
            <circle key={r} cx={0} cy={0} r={r} fill="none" stroke="#F3F0EB" strokeWidth="1" />
          ))}

          {/* Arestas — desenhadas antes dos nós para ficarem por baixo */}
          {ego && ego.edges.map((e) => {
            const a = layout[e.from];
            const b = layout[e.to];
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
                style={{ cursor: 'help' }}
                onMouseEnter={(evt) => {
                  const rect = containerRef.current?.getBoundingClientRect();
                  setHoverEdge({
                    label: edgeLabel(e.from, e.to, connections, contactOrgLinks, institutions),
                    x: rect ? evt.clientX - rect.left : 0,
                    y: rect ? evt.clientY - rect.top : 0,
                  });
                }}
                onMouseLeave={() => setHoverEdge(null)}
              >
                <title>
                  {peopleById[e.from]?.name} — {peopleById[e.to]?.name}:{' '}
                  {edgeLabel(e.from, e.to, connections, contactOrgLinks, institutions)}
                </title>
              </line>
            );
          })}

          {/* Nós — um <g> por pessoa, com transição CSS de posição */}
          {safePeople.map((p) => {
            const pos = layout[p.id];
            if (!pos) return null;
            const isCenter = pos.degree === 0;
            const isOut = pos.degree === 'out';
            const r = pos.radius;
            const br = brazilians.has(p.id);
            const opacity = isOut ? (ego ? 0.1 : 0.55) : 1;
            const fill = isCenter ? '#6366F1' : nodeColor(p);
            const labelMax = LABEL_MAX[pos.degree] || 0;

            return (
              <g
                key={p.id}
                style={{
                  transform: `translate(${pos.x}px, ${pos.y}px)`,
                  transition: NODE_TRANSITION,
                  cursor: 'pointer',
                }}
                opacity={opacity}
                onClick={() => goToCenter(p.id)}
                onMouseEnter={(e) => showTooltip(p, pos.degree, e)}
                onMouseMove={(e) => showTooltip(p, pos.degree, e)}
                onMouseLeave={() => setHoverNode(null)}
              >
                {br ? (
                  <polygon
                    points={diamondPoints(0, 0, r * 1.15)}
                    fill={fill}
                    stroke={isCenter ? '#312E81' : '#FFFFFF'}
                    strokeWidth={isCenter ? 3 : 1.5}
                  />
                ) : (
                  <circle
                    cx={0} cy={0} r={r}
                    fill={fill}
                    stroke={isCenter ? '#312E81' : '#FFFFFF'}
                    strokeWidth={isCenter ? 3 : 1.5}
                  />
                )}
                {labelMax > 0 && (
                  <text
                    x={0} y={r + 13}
                    textAnchor="middle"
                    fontSize={isCenter ? 13 : 10}
                    fontWeight={isCenter ? 700 : 500}
                    fill="#1A1814"
                    style={{ pointerEvents: 'none' }}
                  >
                    {truncate(p.name, labelMax)}
                  </text>
                )}
                {labelMax > 0 && br && (
                  <text
                    x={0} y={r + 13 + (isCenter ? 15 : 12)}
                    textAnchor="middle"
                    fontSize={isCenter ? 12 : 10}
                    style={{ pointerEvents: 'none' }}
                  >
                    🇧🇷
                  </text>
                )}
              </g>
            );
          })}

          {safePeople.length === 0 && (
            <text x={0} y={0} textAnchor="middle" fill="#9E9890" fontSize="14">
              Nenhuma pessoa cadastrada ainda.
            </text>
          )}
        </svg>

        {/* Estado vazio — nenhum centro escolhido */}
        {!centerNodeId && safePeople.length > 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
            <p className="rounded-lg bg-surface/90 px-4 py-2 text-base font-semibold text-ink shadow-soft backdrop-blur">
              Clique num contato para centralizar o mapa
            </p>
            <p className="text-xs text-muted">ou selecione em “Centralizar em...” acima</p>
          </div>
        )}

        {/* Tooltip do nó */}
        {hoverNode && (() => {
          const p = hoverNode.person;
          const { role, org } = currentRoleOrg(p);
          const temp = TEMP_META[p.temperature] || TEMP_META.never;
          const left = Math.min(Math.max(hoverNode.x + 14, 8), Math.max(8, (containerRef.current?.clientWidth || 400) - 232));
          const top = Math.max(8, hoverNode.y - 12);
          return (
            <div
              className="pointer-events-none absolute z-20 w-56 rounded-lg border border-line bg-white p-2.5 shadow-lg"
              style={{ left, top }}
            >
              <p className="text-sm font-semibold text-ink">
                {p.name}{brazilians.has(p.id) ? ' 🇧🇷' : ''}
              </p>
              <p className="mt-0.5 text-[11px] text-ink2">
                {[role, org].filter(Boolean).join(' @ ') || subtitleForPerson(p)}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink2">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: temp.dot }} />
                  {temp.label}
                </span>
                {p.sector_weight != null && (
                  <span className="flex items-center gap-1">
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                      style={{ background: sectorWeightColor(p.sector_weight) }}
                    >
                      ⚡ {p.sector_weight}/10
                    </span>
                    <span className="text-muted">{sectorWeightLabel(p.sector_weight)}</span>
                  </span>
                )}
              </div>
              {hoverNode.degree !== 0 && (
                <p className="mt-1.5 text-[10px] text-muted">
                  {hoverNode.degree === 'out' ? 'Sem ligação com o centro' : `${hoverNode.degree}º grau`}
                  {' · clique para centralizar'}
                </p>
              )}
            </div>
          );
        })()}

        {/* Rótulo da aresta sob o cursor */}
        {hoverEdge && (
          <div
            className="pointer-events-none absolute z-20 rounded-md bg-ink px-2 py-1 text-[11px] text-white shadow-lg"
            style={{ left: hoverEdge.x + 12, top: Math.max(4, hoverEdge.y - 26) }}
          >
            {hoverEdge.label}
          </div>
        )}

        {/* Ações do centro atual */}
        {centerPerson && (
          <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg border border-line bg-white p-1.5 shadow-soft">
            <span className="px-1 text-[11px] font-medium text-ink">{truncate(centerPerson.name, 24)}</span>
            {onOpenPerson && (
              <button
                type="button"
                onClick={() => onOpenPerson(centerPerson.id)}
                className="rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-white hover:bg-accent-hover"
              >
                Ver perfil
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              title="Limpar centro"
              className="rounded-md p-1 text-muted hover:bg-surface2 hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Legenda */}
        <div className="absolute bottom-3 left-3 max-w-xs rounded-lg border border-line bg-surface/95 p-2.5 text-[10px] text-ink2 shadow-soft backdrop-blur">
          <p className="mb-1 text-[11px] font-semibold uppercase text-ink">Mapa de Rede</p>
          <div className="grid gap-0.5">
            <span className="flex items-center gap-2">
              <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#6366F1" strokeWidth="2" /></svg>
              Centro → 1º grau
            </span>
            <span className="flex items-center gap-2">
              <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#9CA3AF" strokeWidth="1" strokeDasharray="5 4" /></svg>
              1º → 2º grau
            </span>
            <span className="flex items-center gap-2">
              <svg width="14" height="12"><polygon points="7,1 13,6 7,11 1,6" fill="#9CA3AF" /></svg>
              Brasil (losango)
            </span>
            <span className="flex items-center gap-2">
              <svg width="14" height="12"><circle cx="7" cy="6" r="5" fill="#9CA3AF" /></svg>
              Outros países (círculo)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
