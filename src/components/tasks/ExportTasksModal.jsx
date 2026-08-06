import { useState } from 'react';
import { X, Download, Loader2 } from 'lucide-react';
import { downloadTasksExport, EXPORT_FORMATS } from '../../lib/exportTasks';

// Modal de export usado no menu de perfil (Layout). O TasksPage tem o seu
// próprio dropdown compacto — este é a versão com escolha de âmbito.
//
// O selector de âmbito só aparece para o owner: para qualquer outro utilizador
// o worker devolve sempre as SUAS tarefas, `?scope=all` ou não (o gate está no
// servidor, não aqui — ver handleExportTasks).
export default function ExportTasksModal({ onClose, isOwner }) {
  const [format, setFormat] = useState('json');
  const [scope, setScope] = useState('mine');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState('');

  const exportar = async () => {
    setBusy(true); setErro(''); setFeito('');
    try {
      const nome = await downloadTasksExport({ format, scope: isOwner ? scope : 'mine' });
      setFeito(nome);
    } catch (e) {
      setErro(String((e && e.message) || e).slice(0, 200));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface shadow-soft">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">Exportar Tarefas</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div>
            <p className="mb-2 text-xs font-medium text-ink2">Formato</p>
            <div className="flex flex-wrap gap-2">
              {EXPORT_FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                    format === f.id ? 'border-accent bg-accent text-white' : 'border-line text-ink2 hover:bg-surface2'
                  }`}
                >
                  {f.icon} {f.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted">
              {EXPORT_FORMATS.find((f) => f.id === format)?.hint}
            </p>
          </div>

          {isOwner && (
            <div>
              <p className="mb-2 text-xs font-medium text-ink2">Âmbito</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setScope('mine')}
                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                    scope === 'mine' ? 'border-accent bg-accent text-white' : 'border-line text-ink2 hover:bg-surface2'
                  }`}
                >
                  Minhas tarefas
                </button>
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                    scope === 'all' ? 'border-accent bg-accent text-white' : 'border-line text-ink2 hover:bg-surface2'
                  }`}
                >
                  Todas
                </button>
              </div>
            </div>
          )}

          {erro && <p className="text-xs text-danger">{erro}</p>}
          {feito && <p className="text-xs text-ink2">✅ {feito}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={exportar}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {busy ? 'A exportar...' : 'Exportar'}
          </button>
        </div>
      </div>
    </div>
  );
}
