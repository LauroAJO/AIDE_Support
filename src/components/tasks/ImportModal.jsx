import { useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../../lib/api';

// Bulk import: one task title per line. Each becomes a backlog task with
// default urgency/importance (5).
export default function ImportModal({ onClose, onImported }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const handleImport = async () => {
    if (!lines.length) return;
    setBusy(true);
    setError('');
    try {
      for (const title of lines) {
        await apiFetch('/api/tasks', {
          method: 'POST',
          body: JSON.stringify({ title, urgency: 5, importance: 5, status: 'backlog' }),
        });
      }
      onImported();
    } catch {
      setError('Falha ao importar. Algumas tarefas podem não ter sido criadas.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-line bg-surface shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">Importar lista</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 py-4">
          <p className="mb-2 text-xs text-ink2">
            Cole uma tarefa por linha. Cada uma será criada no Backlog com urgência e importância 5.
          </p>
          <textarea
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Revisar contrato\nAgendar reunião\nResponder e-mails'}
            className="input resize-y"
          />
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </div>

        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <span className="text-xs text-muted">{lines.length} tarefa(s)</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={busy || !lines.length}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
            >
              {busy ? 'Importando...' : `Importar ${lines.length || ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
