import { useState } from 'react';
import { Radar, GraduationCap, Briefcase, BookOpen } from 'lucide-react';
import HubPage from './HubPage';
import VagasPhDPage from '../vagas/VagasPhDPage';
import EmpregoPage from '../empregos/EmpregoPage';

const TABS = [
  { key: 'noticias', label: 'Notícias', icon: Radar },
  { key: 'vagas', label: 'Vagas PhD', icon: GraduationCap },
  { key: 'empregos', label: 'Empregos', icon: Briefcase },
  { key: 'artigos', label: 'Artigos Científicos', icon: BookOpen, badge: 'Em breve' },
];

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

// Página principal do Hub: agrupa Notícias, Vagas PhD, Empregos e Artigos
// Científicos em subabas controladas por estado local — a URL (/hub) não
// muda entre elas.
export default function HubContainer() {
  const [tab, setTab] = useState('noticias');

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-4">
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
        {tab === 'noticias' && <HubPage />}
        {tab === 'vagas' && <VagasPhDPage />}
        {tab === 'empregos' && <EmpregoPage />}
        {tab === 'artigos' && <ArtigosCientificosPlaceholder />}
      </div>
    </div>
  );
}
