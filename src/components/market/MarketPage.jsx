import { Suspense, lazy, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, FolderKanban, Map } from 'lucide-react';
import ErrorBoundary from '../shared/ErrorBoundary';
import LoadingSpinner from '../shared/LoadingSpinner';
import OrganizationsView from './OrganizationsView';
import ProjectsView from './ProjectsView';

// Carregado sob demanda (v2.25.21) — Leaflet + leaflet.markercluster somam
// ~200KB ao bundle; quem nunca abre a aba Mapa não paga esse custo.
const MarketMap = lazy(() => import('./MarketMap'));

const TABS = [
  { key: 'orgs', label: 'Organizações', icon: Building2 },
  { key: 'projects', label: 'Projetos & Iniciativas', icon: FolderKanban },
  { key: 'map', label: 'Mapa', icon: Map },
];

export default function MarketPage() {
  // Contatos deixaram de ser uma sub-aba do Mercado — agora são acessados
  // direto pela barra lateral (item "Contatos-Networking" → /networking).
  // ?tab=projects abre direto em Iniciativas (usado pelo dashboard de perfis
  // desatualizados, que precisa levar a uma iniciativa específica).
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(
    () => (TABS.some((t) => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'orgs')
  );

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-4">
      {/* Header + sub-navegação */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <Building2 className="h-6 w-6 text-accent" />
          Mercado
        </h1>
        <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  active ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conteúdo da sub-aba.
          ErrorBoundary local (v2.25.19): antes, qualquer exceção de render aqui
          subia até o boundary de App.jsx e derrubava o app inteiro com o texto
          genérico "Algo deu errado", sem dizer QUAL erro nem em qual aba. Agora
          o estouro fica contido na sub-aba e a mensagem real aparece na tela —
          o resto do Mercado continua utilizável e o erro vira diagnosticável
          sem precisar do console. */}
      <div className="min-h-0 flex-1">
        <ErrorBoundary
          key={tab}
          fallback={({ error, reset }) => (
            <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-danger/40 bg-danger/5 p-8 text-center">
              <p className="text-sm font-semibold text-ink">
                Erro ao carregar {tab === 'orgs' ? 'Organizações' : tab === 'projects' ? 'Projetos & Iniciativas' : 'Mapa'}
              </p>
              <p className="max-w-lg break-words font-mono text-xs text-danger">
                {String((error && error.message) || error)}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink2 hover:bg-surface2"
                >
                  Tentar de novo
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
                >
                  Recarregar página
                </button>
              </div>
            </div>
          )}
        >
          {tab === 'orgs' && <OrganizationsView />}
          {tab === 'projects' && <ProjectsView />}
          {tab === 'map' && (
            <Suspense fallback={<LoadingSpinner label="Carregando mapa..." />}>
              <MarketMap />
            </Suspense>
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}
