import { useEffect, useState } from 'react';
import { Folder, File as FileIcon, Plus, X, Search, Trash2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

// Owner-only: defines which Drive items / calendars Alice can see in AIDE.
export default function AccessControl() {
  const [driveRules, setDriveRules] = useState([]);
  const [calRules, setCalRules] = useState([]);
  const [calendars, setCalendars] = useState([]);
  const [picker, setPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [calPicker, setCalPicker] = useState(false);

  const load = async () => {
    const [d, c] = await Promise.all([
      apiFetch('/api/access/drive').catch(() => []),
      apiFetch('/api/access/calendar').catch(() => []),
    ]);
    setDriveRules(d);
    setCalRules(c);
  };
  useEffect(() => {
    load();
  }, []);

  const runSearch = async () => {
    if (!search.trim()) return;
    try {
      setResults(await apiFetch(`/api/drive/files?search=${encodeURIComponent(search.trim())}`));
    } catch {
      setResults([]);
    }
  };

  const addDrive = async (f) => {
    await apiFetch('/api/access/drive', {
      method: 'POST',
      body: JSON.stringify({ google_file_id: f.googleFileId, file_name: f.name, mime_type: f.mimeType }),
    });
    setPicker(false);
    setSearch('');
    setResults([]);
    load();
  };
  const removeDrive = async (id) => {
    await apiFetch(`/api/access/drive/${id}`, { method: 'DELETE' });
    load();
  };

  const openCalPicker = async () => {
    setCalPicker(true);
    try {
      setCalendars(await apiFetch('/api/calendar/list'));
    } catch {
      setCalendars([]);
    }
  };
  const addCal = async (c) => {
    await apiFetch('/api/access/calendar', {
      method: 'POST',
      body: JSON.stringify({ google_calendar_id: c.id, calendar_name: c.summary, color: c.backgroundColor || '#6366f1' }),
    });
    setCalPicker(false);
    load();
  };
  const removeCal = async (id) => {
    await apiFetch(`/api/access/calendar/${id}`, { method: 'DELETE' });
    load();
  };

  // "Acesso aberto" = no rules. Toggling it on clears all rules.
  const driveOpen = driveRules.length === 0;
  const calOpen = calRules.length === 0;
  const clearDrive = async () => {
    await Promise.all(driveRules.map((r) => apiFetch(`/api/access/drive/${r.id}`, { method: 'DELETE' })));
    load();
  };
  const clearCal = async () => {
    await Promise.all(calRules.map((r) => apiFetch(`/api/access/calendar/${r.id}`, { method: 'DELETE' })));
    load();
  };

  return (
    <>
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-3 text-base font-bold text-ink">Acesso ao Drive — Alice</h2>
        <label className="mb-2 flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={driveOpen}
            onChange={(e) => e.target.checked && clearDrive()}
            disabled={driveOpen}
            className="accent-[#6366f1]"
          />
          Acesso aberto (sem restrições)
        </label>
        {!driveOpen && (
          <ul className="mb-2 space-y-1">
            {driveRules.map((r) => {
              const Icon = r.mime_type === FOLDER_MIME ? Folder : FileIcon;
              return (
                <li key={r.id} className="flex items-center gap-2 rounded-lg border border-line bg-base px-2 py-1.5 text-sm">
                  <Icon className="h-4 w-4 text-ink2" />
                  <span className="flex-1 truncate text-ink">{r.file_name}</span>
                  <button onClick={() => removeDrive(r.id)} className="text-muted hover:text-danger" title="Remover">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button
          onClick={() => setPicker(true)}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2"
        >
          <Plus className="h-4 w-4" /> Adicionar pasta ou arquivo
        </button>
        <p className="mt-2 text-[11px] text-muted">Itens não listados aqui não aparecem para Alice (quando há restrições).</p>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-3 text-base font-bold text-ink">Acesso ao Calendário — Alice</h2>
        <label className="mb-2 flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={calOpen}
            onChange={(e) => e.target.checked && clearCal()}
            disabled={calOpen}
            className="accent-[#6366f1]"
          />
          Acesso aberto (sem restrições)
        </label>
        {!calOpen && (
          <ul className="mb-2 space-y-1">
            {calRules.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-lg border border-line bg-base px-2 py-1.5 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color || '#6366f1' }} />
                <span className="flex-1 truncate text-ink">{r.calendar_name}</span>
                <button onClick={() => removeCal(r.id)} className="text-muted hover:text-danger" title="Remover">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={openCalPicker}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2"
        >
          <Plus className="h-4 w-4" /> Adicionar calendário
        </button>
        <p className="mt-2 text-[11px] text-muted">Calendários não listados não aparecem para Alice (quando há restrições).</p>
      </section>

      {/* Drive picker */}
      {picker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setPicker(false)}>
          <div className="flex max-h-[70vh] w-full max-w-md flex-col rounded-xl border border-line bg-surface shadow-soft" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-sm font-bold text-ink">Adicionar do Drive</h3>
              <button onClick={() => setPicker(false)} className="text-ink2 hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <div className="border-b border-line p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                  placeholder="Buscar no Drive..."
                  className="input pl-8"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {results.length === 0 ? (
                <p className="p-3 text-center text-xs text-muted">Busque e selecione um item.</p>
              ) : (
                results.map((f) => {
                  const Icon = f.mimeType === FOLDER_MIME ? Folder : FileIcon;
                  return (
                    <button key={f.googleFileId} onClick={() => addDrive(f)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-ink hover:bg-surface2">
                      <Icon className="h-4 w-4 text-ink2" />
                      <span className="truncate">{f.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Calendar picker */}
      {calPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setCalPicker(false)}>
          <div className="flex max-h-[70vh] w-full max-w-md flex-col rounded-xl border border-line bg-surface shadow-soft" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-sm font-bold text-ink">Adicionar calendário</h3>
              <button onClick={() => setCalPicker(false)} className="text-ink2 hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {calendars.length === 0 ? (
                <p className="p-3 text-center text-xs text-muted">Nenhum calendário.</p>
              ) : (
                calendars
                  .filter((c) => !calRules.some((r) => r.google_calendar_id === c.id))
                  .map((c) => (
                    <button key={c.id} onClick={() => addCal(c)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-ink hover:bg-surface2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.backgroundColor || '#6366f1' }} />
                      <span className="truncate">{c.summary}</span>
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
