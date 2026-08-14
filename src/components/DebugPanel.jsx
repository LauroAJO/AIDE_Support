import { useEffect, useState } from 'react';
import { Bug, X, Copy, Check, Trash2 } from 'lucide-react';
import { getApiLog, subscribeApiLog, clearApiLog } from '../lib/api';
import { CHANGELOG } from '../changelog';
import { APP_VERSION } from '../version';

// 🐛 debug button — fixo, canto inferior esquerdo, sempre visível (mesmo na
// tela de login/pending, já que é montado no App() fora das rotas). Abre um
// bottom-sheet com o log das últimas ~50 chamadas de API e o changelog
// compacto, para diagnosticar problemas no PWA instalado sem precisar de
// DevTools. Ported do mesmo padrão em Birdie Bear Entertainment.
export default function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('log'); // 'log' | 'changelog'
  const [log, setLog] = useState([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLog(getApiLog());
    const unsub = subscribeApiLog(() => setLog(getApiLog()));
    return unsub;
  }, [open]);

  function copyLog() {
    const text = log
      .map((e) => {
        const status = e.ok ? e.status : `${e.status || 0} ✗`;
        const err = e.error ? ` — ${e.error}` : '';
        return `[${e.at}] ${e.method} ${e.url} → ${status} (${e.durationMs}ms)${err}`;
      })
      .join('\n');
    navigator.clipboard?.writeText(text || '(vazio)').catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`Debug · v${APP_VERSION}`}
        className="fixed bottom-2 left-2 z-50 flex h-7 w-7 items-center justify-center rounded-full border border-ink/10 bg-base/90 text-muted shadow-sm backdrop-blur transition hover:text-ink"
      >
        <Bug size={12} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="flex max-h-[75vh] w-full flex-col rounded-t-xl bg-base shadow-xl sm:max-w-lg">
            <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
              <span className="text-sm font-medium text-ink">Debug · v{APP_VERSION}</span>
              <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-ink">
                <X size={16} />
              </button>
            </div>

            <div className="flex border-b border-ink/10 px-4">
              <button
                type="button"
                onClick={() => setTab('log')}
                className={`px-3 py-2 text-xs font-medium ${tab === 'log' ? 'border-b-2 border-ink text-ink' : 'text-muted'}`}
              >
                API log
              </button>
              <button
                type="button"
                onClick={() => setTab('changelog')}
                className={`px-3 py-2 text-xs font-medium ${tab === 'changelog' ? 'border-b-2 border-ink text-ink' : 'text-muted'}`}
              >
                Changelog
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {tab === 'log' && (
                <>
                  <div className="mb-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={copyLog}
                      className="flex items-center gap-1 rounded border border-ink/10 px-2 py-1 text-[11px] text-muted hover:text-ink"
                    >
                      {copied ? <Check size={11} /> : <Copy size={11} />}
                      {copied ? 'Copiado' : 'Copiar tudo'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { clearApiLog(); setLog([]); }}
                      className="flex items-center gap-1 rounded border border-ink/10 px-2 py-1 text-[11px] text-muted hover:text-ink"
                    >
                      <Trash2 size={11} />
                      Limpar
                    </button>
                  </div>
                  {log.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted">Nenhuma chamada registrada ainda.</p>
                  ) : (
                    <ul className="space-y-1.5 font-mono text-[11px]">
                      {log.slice().reverse().map((e, i) => (
                        <li
                          key={i}
                          className={`rounded border px-2 py-1.5 ${e.ok ? 'border-ink/10' : 'border-red-300 bg-red-50'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{e.method} {e.url}</span>
                            <span className={e.ok ? 'text-muted' : 'font-semibold text-red-600'}>
                              {e.ok ? e.status : (e.status || 'ERR')}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center justify-between text-muted">
                            <span>{new Date(e.at).toLocaleTimeString()}</span>
                            <span>{e.durationMs}ms</span>
                          </div>
                          {e.error && <div className="mt-0.5 break-words text-red-600">{e.error}</div>}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              {tab === 'changelog' && (
                <ul className="space-y-3">
                  {CHANGELOG.map((entry) => (
                    <li key={entry.version} className="border-b border-ink/5 pb-3 last:border-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold text-ink">v{entry.version}</span>
                        <span className="text-[11px] text-muted">{entry.date}</span>
                      </div>
                      <p className="mt-0.5 text-xs font-medium text-ink2">{entry.title}</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-muted">
                        {entry.items.map((it, i) => <li key={i}>{it}</li>)}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
