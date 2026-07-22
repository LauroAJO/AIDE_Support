import { useCallback, useEffect, useState } from 'react';
import { Radar, GraduationCap, Briefcase, BookOpen, RefreshCw } from 'lucide-react';
import HubPage from './HubPage';
import VagasPhDPage from '../vagas/VagasPhDPage';
import EmpregoPage from '../empregos/EmpregoPage';
import { apiFetch } from '../../lib/api';

const TABS = [
  { key: 'noticias', label: 'Notícias', icon: Radar },
  { key: 'vagas', label: 'Vagas PhD', icon: GraduationCap },
  { key: 'empregos', label: 'Empregos', icon: Briefcase },
  { key: 'artigos', label: 'Artigos Científicos', icon: BookOpen, badge: 'Em breve' },
];

// Dashboard geral (overview) — um card compacto por projeto do hub_items,
// sempre visível acima das subabas. Clicar num card navega para a subaba
// correta (e, para h2/energia/ia, pré-seleciona o filtro de projeto em
// HubPage). As classes de borda são strings estáticas de propósito — o
// Tailwind escaneia o arquivo por texto, não por valor em runtime, então
// `border-l-${cor}-500` interpolado não seria detectado no build.
const PROJECT_META = {
  h2:            { label: 'H₂',        border: 'border-l-blue-500' },
  energia:       { label: 'Energia',   border: 'border-l-orange-500' },
  ia:            { label: 'IA',        border: 'border-l-purple-500' },
  phd_vagas:     { label: 'Vagas PhD', border: 'border-l-emerald-500' },
  emprego_vagas: { label: 'Empregos',  border: 'border-l-amber-500' },
};
const PROJECT_ORDER = ['h2', 'energia', 'ia', 'phd_vagas', 'emprego_vagas'];

// Datas chegam como string ISO/SQLite. Mostra só YYYY-MM-DD.
function fmtDate(s) {
  if (!s) return null;
  const str = String(s);
  if (str.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const t = Date.parse(str);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

// Placeholder da subaba "Artigos Científicos" — funcionalidade ainda não
// implementada (monitoramento de periódicos académicos).
function ArtigosCientificosPlaceholder() {
  return (
    <div className="flex h-full min-h-[24rem] items-center justify-center rounded-xl border border-dashed border-line">
      <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
        <BookOpen className="h-10 w-10 text-ink2" />
        <h2 className="text-base font-semibold text-ink">Artigos Científicos</h2>
        <p className="text-sm text-ink2">
          Esta funcionalidade está em desenvolvimento. Em breve você poderá
          monitorar publicações académicas de periódicos como ScienceDirect,
          MDPI, Nature Energy e Electrochimica Acta diretamente aqui.
        </p>
      </div>
    </div>
  );
}

function OverviewCard({ projectId, stat, onClick }) {
  const meta = PROJECT_META[projectId];
  const last = stat ? fmtDate(stat.last_received) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-0.5 rounded-lg border border-line border-l-4 ${meta.border} bg-surface px-3 py-2 text-left transition hover:bg-surface2`}
    >
      <span className="text-[11px] font-medium text-ink2">{meta.label}</span>
      <span className="text-xl font-bold text-ink">{stat ? stat.count : 0}</span>
      <span className="text-[10px] text-muted">{last ? `Atualizado ${last}` : 'Sem itens'}</span>
    </button>
  );
}

// Página principal do Hub: dashboard geral (overview por projeto) + subabas
// (Notícias, Vagas PhD, Empregos, Artigos Científicos) controladas por
// estado local — a URL (/hub) não muda entre elas.
export default function HubContainer() {
  const [tab, setTab] = useState('noticias');
  // Filtro de projeto da subaba Notícias — vive aqui (não em HubPage) para
  // que um clique no card "H₂"/"Energia"/"IA" do overview possa pré-selecioná-lo.
  const [newsProject, setNewsProject] = useState('todos');

  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  // Incrementado pelo botão "Atualizar" global — cada subaba observa esse
  // valor e recarrega os próprios itens quando ele muda.
  const [refreshToken, setRefreshToken] = useState(0);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const res = await apiFetch('/api/hub/stats');
      setOverview(res);
    } catch {
      setOverview(null);
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleRefreshAll = () => {
    loadOverview();
    setRefreshToken((n) => n + 1);
  };

  const goToProject = (projectId) => {
    if (projectId === 'phd_vagas') { setTab('vagas'); return; }
    if (projectId === 'emprego_vagas') { setTab('empregos'); return; }
    setNewsProject(projectId);
    setTab('noticias');
  };

  const statsByProject = Object.fromEntries(
    ((overview && overview.by_project) || []).map((p) => [p.project_id, p]),
  );

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-4">
      {/* Dashboard geral — sempre visível, independente da subaba ativa */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Visão geral do Hub
        </h2>
        <button
          type="button"
          onClick={handleRefreshAll}
          className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink2 transition hover:bg-surface2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${overviewLoading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {PROJECT_ORDER.map((projectId) => (
          <OverviewCard
            key={projectId}
            projectId={projectId}
            stat={statsByProject[projectId]}
            onClick={() => goToProject(projectId)}
          />
        ))}
      </div>

      {/* Subabas */}
      <div className="flex items-center gap-1 border-b border-line">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
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
              {t.badge && (
                <span className="inline-flex items-center rounded-full bg-surface2 px-2 py-0.5 text-[11px] font-medium text-ink2">
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1">
        {tab === 'noticias' && (
          <HubPage
            project={newsProject}
            onProjectChange={setNewsProject}
            refreshToken={refreshToken}
          />
        )}
        {tab === 'vagas' && <VagasPhDPage refreshToken={refreshToken} />}
        {tab === 'empregos' && <EmpregoPage refreshToken={refreshToken} />}
        {tab === 'artigos' && <ArtigosCientificosPlaceholder />}
      </div>
    </div>
  );
}
