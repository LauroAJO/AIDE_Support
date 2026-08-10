import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Radar, GraduationCap, Briefcase, BookOpen, RefreshCw } from 'lucide-react';
import HubPage from './HubPage';
import ArtigosPage from './ArtigosPage';
import VagasPhDPage from '../vagas/VagasPhDPage';
import EmpregoPage from '../empregos/EmpregoPage';
import { apiFetch } from '../../lib/api';

// project_id -> subaba, para o link compartilhável /hub?vaga={short_id}
// (ver Parte 6). Só phd_vagas/emprego_vagas têm subaba própria com cards de
// vaga (destino do highlight); os demais projetos (h2/energia/ia) caem na
// aba Notícias com o filtro de projeto pré-selecionado.
const TAB_BY_PROJECT = { phd_vagas: 'vagas', emprego_vagas: 'empregos' };

const TABS = [
  { key: 'noticias', label: 'Notícias', icon: Radar },
  { key: 'vagas', label: 'Vagas PhD', icon: GraduationCap },
  { key: 'empregos', label: 'Empregos', icon: Briefcase },
  { key: 'artigos', label: 'Artigos Científicos', icon: BookOpen },
];

// v2.26.7 (Change 2 — contadores coloridos por aba). Classes estáticas de
// propósito (mesmo motivo do antigo PROJECT_META do Bloco 4: o Tailwind
// escaneia o arquivo por texto literal, não por valor interpolado em
// runtime — "bg-${cor}-100" não seria detectado no build).
const TAB_COUNT_STYLE = {
  noticias: 'bg-indigo-100 text-indigo-700',
  vagas: 'bg-amber-100 text-amber-700',
  empregos: 'bg-green-100 text-green-700',
  artigos: 'bg-blue-100 text-blue-700',
};

// v2.26.6 (Bloco 5A) — o dashboard "Visão geral do Hub" (5 cards de
// contagem por projeto, compactados no Bloco 4A) foi REMOVIDO por completo,
// a pedido explícito: duplicava informação já disponível dentro de cada
// sub-aba e consumia espaço vertical logo no topo da página. O clique nesses
// cards também navegava para a sub-aba/projeto correspondente — essa
// navegação direta deixou de existir; agora é só pelas próprias abas.

// Página principal do Hub: subabas (Notícias, Vagas PhD, Empregos, Artigos
// Científicos) controladas por estado local — a URL (/hub) não muda entre
// elas. Layout compacto (v2.26.6, Bloco 5): sem dashboard de overview, sem
// título de página repetido — só a barra de abas com o botão "Atualizar".
export default function HubContainer() {
  const [tab, setTab] = useState('noticias');
  // Filtro de projeto da subaba Notícias — vive aqui (não em HubPage) para
  // permitir pré-seleção (ex.: vindo do link /hub?vaga=).
  const [newsProject, setNewsProject] = useState('todos');

  // v2.26.6 (Bloco 5A) — overview/overviewLoading (estatísticas agregadas por
  // projeto) foram removidos junto com o dashboard que os exibia; nada mais
  // os consome. "Atualizar" agora só incrementa refreshToken.
  const [refreshing, setRefreshing] = useState(false);
  // Incrementado pelo botão "Atualizar" global — cada subaba observa esse
  // valor e recarrega os próprios itens quando ele muda.
  const [refreshToken, setRefreshToken] = useState(0);

  // v2.26.7 (Change 2) — contador por aba, atualizado pela própria sub-aba
  // via onCountChange assim que os dados carregam (null = ainda não
  // carregou nesta sessão → mostra "..."). Cada sub-aba só está montada
  // quando é a aba ativa, então o contador de uma aba inativa mantém o
  // último valor conhecido em vez de resetar — é o comportamento desejado
  // (não faz sentido a aba "esquecer" a contagem só por não estar visível).
  const [counts, setCounts] = useState({ noticias: null, vagas: null, empregos: null, artigos: null });
  const setCount = (key) => (n) => setCounts((prev) => ({ ...prev, [key]: n }));

  // /hub?vaga={short_id} (link compartilhável — ver Parte 4/6): resolve o
  // short_id via GET /api/hub/items?short_id=, navega para a subaba certa e
  // repassa o short_id para o highlight do card (mantido na URL — recarregar
  // a página deve continuar apontando para o mesmo card).
  const [searchParams] = useSearchParams();
  const vaga = searchParams.get('vaga');
  const [highlightShortId, setHighlightShortId] = useState(null);
  const resolvedVagaRef = useRef(null);

  useEffect(() => {
    if (!vaga || resolvedVagaRef.current === vaga) return;
    resolvedVagaRef.current = vaga;
    apiFetch(`/api/hub/items?short_id=${encodeURIComponent(vaga)}`)
      .then((res) => {
        const found = (res && res.items && res.items[0]) || null;
        if (!found) return;
        const targetTab = TAB_BY_PROJECT[found.project_id];
        if (targetTab) setTab(targetTab);
        else { setNewsProject(found.project_id); setTab('noticias'); }
        setHighlightShortId(vaga);
      })
      .catch(() => {});
  }, [vaga]);

  const handleRefreshAll = async () => {
    setRefreshing(true);
    setRefreshToken((n) => n + 1);
    // O próprio spin do ícone já dá feedback; a subaba ativa reage ao
    // refreshToken e recarrega os próprios itens (assíncrono, sem promise
    // aqui para acompanhar) — solta o spin logo em seguida.
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-3">
      {/* Subabas — v2.26.6 (Bloco 5A/5C): sem dashboard de overview acima e
          sem título de página repetido; "Atualizar" vive na própria barra. */}
      <div className="flex items-center justify-between gap-2 border-b border-line">
        <div className="flex items-center gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            const count = counts[t.key];
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'border-accent text-accent'
                    : 'border-transparent text-ink2 hover:text-ink'
                }`}
              >
                <Icon className="h-4 w-4" /> {t.label}
                <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${TAB_COUNT_STYLE[t.key]}`}>
                  {count == null ? '...' : count}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={handleRefreshAll}
          title="Atualizar"
          className="mb-1 flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink2 transition hover:bg-surface2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {tab === 'noticias' && (
          <HubPage
            project={newsProject}
            onProjectChange={setNewsProject}
            refreshToken={refreshToken}
            onCountChange={setCount('noticias')}
          />
        )}
        {tab === 'vagas' && (
          <VagasPhDPage
            refreshToken={refreshToken}
            highlightShortId={highlightShortId}
            onCountChange={setCount('vagas')}
          />
        )}
        {tab === 'empregos' && (
          <EmpregoPage
            refreshToken={refreshToken}
            highlightShortId={highlightShortId}
            onCountChange={setCount('empregos')}
          />
        )}
        {tab === 'artigos' && <ArtigosPage refreshToken={refreshToken} onCountChange={setCount('artigos')} />}
      </div>
    </div>
  );
}
