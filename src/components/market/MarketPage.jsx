import { useState } from 'react';
import { Building2, FolderKanban } from 'lucide-react';
import OrganizationsView from './OrganizationsView';
import ProjectsView from './ProjectsView';

const TABS = [
  { key: 'orgs', label: 'Organizações', icon: Building2 },
  { key: 'projects', label: 'Projetos & Iniciativas', icon: FolderKanban },
];

export default function MarketPage() {
  // Contatos deixaram de ser uma sub-aba do Mercado — agora são acessados
  // direto pela barra lateral (item "Contatos-Networking" → /networking).
  const [tab, setTab] = useState('orgs');

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

      {/* Conteúdo da sub-aba */}
      <div className="min-h-0 flex-1">
        {tab === 'orgs' && <OrganizationsView />}
        {tab === 'projects' && <ProjectsView />}
      </div>
    </div>
  );
}
