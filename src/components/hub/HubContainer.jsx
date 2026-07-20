import { useState } from 'react';
import { Radar, GraduationCap, Briefcase } from 'lucide-react';
import HubPage from './HubPage';
import VagasPhDPage from '../vagas/VagasPhDPage';
import EmpregoPage from '../empregos/EmpregoPage';

const TABS = [
  { key: 'noticias', label: 'Notícias', icon: Radar },
  { key: 'vagas', label: 'Vagas PhD', icon: GraduationCap },
  { key: 'empregos', label: 'Empregos', icon: Briefcase },
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
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1">
        {tab === 'noticias' && <HubPage />}
        {tab === 'vagas' && <VagasPhDPage />}
        {tab === 'empregos' && <EmpregoPage />}
      </div>
    </div>
  );
}
