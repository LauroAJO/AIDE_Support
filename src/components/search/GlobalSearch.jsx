import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Loader2,
  CheckSquare,
  FileText,
  User,
  Building2,
  CalendarDays,
  Radar,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';

// Ordem de exibição dos grupos no dropdown = ordem de navegação por teclado.
const CATEGORY_META = {
  tasks:         { header: 'TAREFAS',      icon: CheckSquare,  to: (item) => `/tasks?task=${item.id}` },
  notes:         { header: 'NOTAS',        icon: FileText,     to: (item) => `/notes?note=${item.id}` },
  people:        { header: 'PESSOAS',      icon: User,         to: (item) => `/networking?person=${item.id}` },
  organizations: { header: 'ORGANIZAÇÕES', icon: Building2,    to: (item) => `/market/org/${item.id}` },
  events:        { header: 'EVENTOS',      icon: CalendarDays, to: (item) => `/events?event=${item.id}` },
  hub:           { header: 'HUB',          icon: Radar,        to: (item) => `/hub?vaga=${item.short_id}` },
};
const CATEGORY_ORDER = ['tasks', 'notes', 'people', 'organizations', 'events', 'hub'];
const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults(null);
      setLoading(false);
      setOpen(false);
      return;
    }
    setLoading(true);
    setOpen(true);
    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      try {
        const res = await apiFetch(`/api/search?q=${encodeURIComponent(trimmed)}&limit=5`);
        if (requestId !== requestIdRef.current) return; // resposta obsoleta (query mudou) — ignora
        setResults(res);
        setActiveIndex(-1);
      } catch {
        if (requestId !== requestIdRef.current) return;
        setResults(null);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  useEffect(() => {
    function onDocClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Lista plana (categoria + item) na mesma ordem de exibição, usada pela
  // navegação por teclado (Arrow Up/Down percorre os grupos em sequência).
  const flatItems = [];
  if (results) {
    for (const cat of CATEGORY_ORDER) {
      for (const item of results[cat] || []) flatItems.push({ cat, item });
    }
  }

  function goTo(entry) {
    const meta = CATEGORY_META[entry.cat];
    setOpen(false);
    setQuery('');
    setResults(null);
    navigate(meta.to(entry.item));
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      setOpen(false);
      e.currentTarget.blur();
      return;
    }
    if (!open || flatItems.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flatItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? flatItems.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      goTo(flatItems[activeIndex] || flatItems[0]);
    }
  }

  const showEmpty = !loading && results && flatItems.length === 0;

  return (
    <div ref={containerRef} className="relative w-full">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (results) setOpen(true); }}
        onKeyDown={onKeyDown}
        placeholder="Buscar tarefas, notas, projetos..."
        className="h-9 w-full rounded-lg border border-line bg-surface2 pl-9 pr-12 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)]"
      />
      {loading ? (
        <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />
      ) : (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded bg-line px-1.5 py-0.5 text-[11px] text-muted">
          ⌘K
        </span>
      )}

      {open && (results || loading) && (
        <div className="absolute left-0 top-11 z-20 max-h-[400px] w-full min-w-[320px] overflow-y-auto rounded-lg border border-line bg-surface shadow-soft">
          {loading && !results && (
            <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando...
            </div>
          )}
          {showEmpty && (
            <div className="px-3 py-6 text-center text-sm text-muted">
              Nenhum resultado para "{query.trim()}"
            </div>
          )}
          {results && flatItems.length > 0 && CATEGORY_ORDER.map((cat) => {
            const items = results[cat] || [];
            if (!items.length) return null;
            const meta = CATEGORY_META[cat];
            const Icon = meta.icon;
            return (
              <div key={cat} className="border-b border-line last:border-b-0">
                <div className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-wide text-muted">
                  {meta.header}
                </div>
                {items.map((item) => {
                  const flatIdx = flatItems.findIndex((f) => f.cat === cat && f.item.id === item.id);
                  const active = flatIdx === activeIndex;
                  return (
                    <button
                      key={`${cat}-${item.id}`}
                      type="button"
                      onMouseEnter={() => setActiveIndex(flatIdx)}
                      onClick={() => goTo({ cat, item })}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
                        active ? 'bg-accent/10 text-ink' : 'text-ink hover:bg-surface2'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-ink2" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.label}</span>
                        {item.meta ? (
                          <span className="block truncate text-xs text-muted">{item.meta}</span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
