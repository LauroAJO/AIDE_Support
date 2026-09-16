import { useState } from 'react';
import { Upload, Download, FileJson } from 'lucide-react';
import { useStore } from '../../store';
import { getToken } from '../../lib/auth';
import ImportPage from '../import/ImportPage';
import ExportTasksModal from '../tasks/ExportTasksModal';
import ExportDataPanel from './ExportDataPanel';

// Dados — II.1.16.0. Ponto único de importar/exportar no menu do perfil,
// substituindo os dois itens separados que existiam ("Importar Dados" e
// "Exportar Tarefas") + o que estava duplicado dentro de Configurações
// (exportar tarefas/notas apareciam lá E no menu). Pedido do usuário depois
// de duas idas e voltas confusas sobre onde cada coisa ficava.
//
// Visível pra qualquer usuário autenticado (não é FixedRoute/OwnerRoute no
// App.jsx) — o conteúdo é que muda por role:
// - Importar: só quem já podia (owner + assistente fixo) — mesma regra que
//   a rota /import sempre teve.
// - Exportar → "Minhas exportações": qualquer usuário (tarefas/notas, sempre
//   escopadas a si mesmo pelo servidor).
// - Exportar → painel multi-domínio (Carreira/Mercado/Networking/Eventos/
//   Venues): só owner — o backend já recusa com 403 pra qualquer outro
//   usuário, isto aqui só evita mostrar um painel que ia falhar.
function isFixedUser(user) {
  return !!(user && (user.role === 'owner' || user.role === 'assistant_fixed' || user.user_type === 'fixed'));
}

async function downloadExport(path, filename) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${getToken()}` } });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function DataHubPage() {
  const user = useStore((s) => s.user);
  const isOwner = user?.role === 'owner';
  const canImport = isFixedUser(user);
  const [tab, setTab] = useState('export');
  const [showTaskExport, setShowTaskExport] = useState(false);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Dados</h1>
        <p className="mt-1 text-sm text-muted">
          Importar e exportar dados do AIDE, tudo num só lugar.
        </p>
      </div>

      <div className="flex w-fit gap-1 rounded-lg border border-line bg-surface p-1">
        <button
          type="button"
          onClick={() => setTab('export')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
            tab === 'export' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'
          }`}
        >
          <Download className="h-4 w-4" /> Exportar
        </button>
        {canImport && (
          <button
            type="button"
            onClick={() => setTab('import')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === 'import' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'
            }`}
          >
            <Upload className="h-4 w-4" /> Importar
          </button>
        )}
      </div>

      {tab === 'import' && canImport && <ImportPage />}

      {tab === 'export' && (
        <div className="space-y-6">
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="mb-3 text-base font-bold text-ink">Minhas exportações</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowTaskExport(true)}
                className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2"
              >
                <FileJson className="h-4 w-4" /> Exportar tarefas
              </button>
              <button
                type="button"
                onClick={() => downloadExport('/api/export/notes', 'aide-notes.json')}
                className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2"
              >
                <FileJson className="h-4 w-4" /> Exportar minhas notas
              </button>
            </div>
          </section>

          {isOwner && (
            <section className="rounded-xl border border-line bg-surface p-5">
              <h2 className="mb-1 text-base font-bold text-ink">Exportar dados (owner)</h2>
              <p className="mb-3 text-xs text-ink2">
                Base completa por domínio, não só o que é seu — Carreira, Mercado, Networking,
                Eventos, Venues.
              </p>
              <ExportDataPanel />
            </section>
          )}
        </div>
      )}

      {showTaskExport && <ExportTasksModal isOwner={isOwner} onClose={() => setShowTaskExport(false)} />}
    </div>
  );
}
