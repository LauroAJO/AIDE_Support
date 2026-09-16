import { useState } from 'react';
import { EXPORT_DOMAINS, downloadDomainFile, downloadDomainsPdf } from '../../lib/exportData';

// Export multi-domínio (Carreira/Mercado/Networking/Eventos/Venues) — II.1.6.0,
// recriado na II.1.15.0 (nunca tinha sido commitado). Movido de SettingsPage
// para cá na II.1.16.0, dentro da página unificada /data — owner-only, o
// gate real é no backend (handleExportData/handleExportDataJson em
// _worker.js); quem renderiza este componente decide se mostra, não ele.
export default function ExportDataPanel() {
  const [selected, setSelected] = useState(() => new Set());
  const [format, setFormat] = useState('csv');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    setSelected((prev) =>
      prev.size === EXPORT_DOMAINS.length ? new Set() : new Set(EXPORT_DOMAINS.map((d) => d.key))
    );
  };

  const handleExport = async () => {
    if (!selected.size) return;
    setBusy(true);
    setError(null);
    try {
      const domains = EXPORT_DOMAINS.filter((d) => selected.has(d.key)).map((d) => d.key);
      if (format === 'pdf') {
        await downloadDomainsPdf(domains);
      } else {
        // CSV/TXT: um arquivo por domínio — dispara N downloads em sequência.
        for (const domain of domains) {
          // eslint-disable-next-line no-await-in-loop
          await downloadDomainFile(domain, format);
        }
      }
    } catch (e) {
      setError(e.message || 'Falha ao exportar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {EXPORT_DOMAINS.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => toggle(d.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              selected.has(d.key)
                ? 'border-accent bg-accent text-white'
                : 'border-line text-ink2 hover:bg-surface2'
            }`}
          >
            {d.label}
          </button>
        ))}
        <button
          type="button"
          onClick={selectAll}
          className="rounded-full border border-dashed border-line px-3 py-1 text-xs font-medium text-ink2 hover:bg-surface2"
        >
          {selected.size === EXPORT_DOMAINS.length ? 'Limpar seleção' : 'Selecionar todos'}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-line p-0.5">
          {['csv', 'txt', 'pdf'].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium uppercase ${
                format === f ? 'bg-surface2 text-ink' : 'text-ink2'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={!selected.size || busy}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? 'Exportando...' : 'Exportar'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
