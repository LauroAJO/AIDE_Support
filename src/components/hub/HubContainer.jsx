import { useState } from 'react';
import { Radar, GraduationCap, Briefcase } from 'lucide-react';
import HubPage from './HubPage';
import VagasPhDPage from '../vagas/VagasPhDPage';

const TABS = [
  { key: 'noticias', label: 'Notícias', icon: Radar },
  { key: 'vagas', label: 'Vagas PhD', icon: GraduationCap },
  { key: 'empregos', label: 'Empregos', icon: Briefcase, comingSoon: true },
];

// Página principal do Hub: agrupa Notícias, Vagas PhD e Empregos em subabas
// controladas por estado local — a URL (/hub) não muda entre elas.
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
              {t.comingSoon && (
                <span className="rounded-full bg-surface2 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                  Em breve
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1">
        {tab === 'noticias' && <HubPage />}
        {tab === 'vagas' && <VagasPhDPage />}
        {tab === 'empregos' && <EmpregosPlaceholder />}
      </div>
    </div>
  );
}

function EmpregosPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface px-6 py-16 text-center">
      <Briefcase className="h-10 w-10 text-muted" />
      <h2 className="text-lg font-bold text-ink">Empregos</h2>
      <p className="max-w-sm text-sm text-muted">
        Em breve — vagas de emprego em empresas de energia, hidrogênio e engenharia serão monitoradas aqui.
      </p>
    </div>
  );
}
