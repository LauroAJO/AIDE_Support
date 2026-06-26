import { useState } from 'react';
import { Briefcase, KanbanSquare, FileText, Target } from 'lucide-react';
import OpportunityPipeline from './OpportunityPipeline';
import DocumentsView from './DocumentsView';
import GoalsView from './GoalsView';

const TABS = [
  { key: 'pipeline', label: 'Pipeline', icon: KanbanSquare },
  { key: 'documents', label: 'Documentos', icon: FileText },
  { key: 'goals', label: 'Metas', icon: Target },
];

export default function CareerPage() {
  const [tab, setTab] = useState('pipeline');

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-4">
      {/* Header + sub-navegação */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <Briefcase className="h-6 w-6 text-accent" />
          Carreira
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
        {tab === 'pipeline' && <OpportunityPipeline />}
        {tab === 'documents' && <DocumentsView />}
        {tab === 'goals' && <GoalsView />}
      </div>
    </div>
  );
}
