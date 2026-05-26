import { useEffect, useMemo, useState } from 'react';
import { Folder, File as FileIcon, Plus, X, Search, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

// Symmetric Drive/Calendar sharing — either Lauro or Alice can grant the other
// access to items in their own Google Drive/Calendar. The grantor's token is
// used when fetching the actual content (see backend).
export default function Sharing() {
  const currentUser = useStore((s) => s.user);
  const [users, setUsers] = useState([]);
  const [driveRules, setDriveRules] = useState([]);
  const [calRules, setCalRules] = useState([]);
  const [calendars, setCalendars] = useState([]);
  const [picker, setPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [calPicker, setCalPicker] = useState(false);

  const otherUser = useMemo(
    () => users.find((u) => u.id !== currentUser?.id) || null,
    [users, currentUser]
  );

  const load = async () => {
    const [u, d, c] = await Promise.all([
      apiFetch('/api/users').catch(() => []),
      apiFetch('/api/sharing/drive').catch(() => []),
      apiFetch('/api/sharing/calendar').catch(() => []),
    ]);
    setUsers(u);
    setDriveRules(d);
    setCalRules(c);
  };
  useEffect(() => {
    load();
  }, []);

  const sharedByMeDrive = driveRules.filter((r) => r.grantor_user_id === currentUser?.id);
  const sharedWithMeDrive = driveRules.filter((r) => r.grantee_user_id === currentUser?.id);
  const sharedByMeCal = calRules.filter((r) => r.grantor_user_id === currentUser?.id);
  const sharedWithMeCal = calRules.filter((r) => r.grantee_user_id === currentUser?.id);

  const userName = (id) => {
    const u = users.find((x) => x.id === id);
    return u ? (u.name || u.email || 'usuário') : 'usuário';
  };

  const runSearch = async () => {
    if (!search.trim()) return;
    try {
      setResults(await apiFetch(`/api/drive/files?search=${encodeURIComponent(search.trim())}`));
    } catch {
      setResults([]);
    }
  };

  const addDrive = async (f) => {
    if (!otherUser) return;
    await apiFetch('/api/sharing/drive', {
      method: 'POST',
      body: JSON.stringify({
        google_file_id: f.googleFileId || f.id,
        file_name: f.name,
        mime_type: f.mimeType,
        grantee_user_id: otherUser.id,
      }),
    });
    setPicker(false);
    setSearch('');
    setResults([]);
    load();
  };
  const removeDrive = async (id) => {
    if (!window.confirm('Remover este compartilhamento?')) return;
    await apiFetch(`/api/sharing/drive/${id}`, { method: 'DELETE' });
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
    if (!otherUser) return;
    await apiFetch('/api/sharing/calendar', {
      method: 'POST',
      body: JSON.stringify({
        google_calendar_id: c.id,
        calendar_name: c.summary,
        color: c.backgroundColor || '#6366f1',
        grantee_user_id: otherUser.id,
      }),
    });
    setCalPicker(false);
    load();
  };
  const removeCal = async (id) => {
    if (!window.confirm('Remover este compartilhamento?')) return;
    await apiFetch(`/api/sharing/calendar/${id}`, { method: 'DELETE' });
    load();
  };

  const otherName = otherUser?.name ? otherUser.name.split(' ')[0] : 'a outra pessoa';

  return (
    <>
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-1 text-base font-bold text-ink">Compartilhamento de Drive</h2>
        <p className="mb-3 text-xs text-muted">
          Escolha pastas ou arquivos do seu Drive para compartilhar com {otherName}, e veja o que ela compartilha com você.
        </p>

        <h3 className="mb-1 text-xs font-semibold uppercase text-muted">O que você compartilha</h3>
        {sharedByMeDrive.length === 0 ? (
          <p className="mb-2 text-[11px] text-muted">Nenhum item compartilhado.</p>
        ) : (
          <ul className="mb-2 space-y-1">
            {sharedByMeDrive.map((r) => {
              const Icon = r.mime_type === FOLDER_MIME ? Folder : FileIcon;
              return (
                <li key={r.id} className="flex items-center gap-2 rounded-lg border border-line bg-base px-2 py-1.5 text-sm">
                  <Icon className="h-4 w-4 text-ink2" />
                  <span className="flex-1 truncate text-ink">{r.file_name}</span>
                  <span className="text-[10px] text-muted">com {userName(r.grantee_user_id)}</span>
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
          disabled={!otherUser}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" /> Compartilhar pasta ou arquivo
        </button>

        <h3 className="mb-1 mt-4 text-xs font-semibold uppercase text-muted">O que foi compartilhado com você</h3>
        {sharedWithMeDrive.length === 0 ? (
          <p className="text-[11px] text-muted">Nada por enquanto.</p>
        ) : (
          <ul className="space-y-1">
            {sharedWithMeDrive.map((r) => {
              const Icon = r.mime_type === FOLDER_MIME ? Folder : FileIcon;
              return (
                <li key={r.id} className="flex items-center gap-2 rounded-lg border border-line bg-base px-2 py-1.5 text-sm">
                  <Icon className="h-4 w-4 text-ink2" />
                  <span className="flex-1 truncate text-ink">{r.file_name}</span>
                  <span className="text-[10px] text-muted">por {userName(r.grantor_user_id)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-1 text-base font-bold text-ink">Compartilhamento de Calendário</h2>
        <p className="mb-3 text-xs text-muted">
          Defina quais calendários você compartilha com {otherName}.
        </p>

        <h3 className="mb-1 text-xs font-semibold uppercase text-muted">O que você compartilha</h3>
        {sharedByMeCal.length === 0 ? (
          <p className="mb-2 text-[11px] text-muted">Nenhum calendário compartilhado.</p>
        ) : (
          <ul className="mb-2 space-y-1">
            {sharedByMeCal.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-lg border border-line bg-base px-2 py-1.5 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color || '#6366f1' }} />
                <span className="flex-1 truncate text-ink">{r.calendar_name}</span>
                <span className="text-[10px] text-muted">com {userName(r.grantee_user_id)}</span>
                <button onClick={() => removeCal(r.id)} className="text-muted hover:text-danger" title="Remover">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={openCalPicker}
          disabled={!otherUser}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" /> Compartilhar calendário
        </button>

        <h3 className="mb-1 mt-4 text-xs font-semibold uppercase text-muted">O que foi compartilhado com você</h3>
        {sharedWithMeCal.length === 0 ? (
          <p className="text-[11px] text-muted">Nada por enquanto.</p>
        ) : (
          <ul className="space-y-1">
            {sharedWithMeCal.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-lg border border-line bg-base px-2 py-1.5 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color || '#6366f1' }} />
                <span className="flex-1 truncate text-ink">{r.calendar_name}</span>
                <span className="text-[10px] text-muted">por {userName(r.grantor_user_id)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Drive picker */}
      {picker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setPicker(false)}>
          <div className="flex max-h-[70vh] w-full max-w-md flex-col rounded-xl border border-line bg-surface shadow-soft" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-sm font-bold text-ink">Compartilhar do Drive</h3>
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
                    <button key={f.googleFileId || f.id} onClick={() => addDrive(f)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-ink hover:bg-surface2">
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
              <h3 className="text-sm font-bold text-ink">Compartilhar calendário</h3>
              <button onClick={() => setCalPicker(false)} className="text-ink2 hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {calendars.length === 0 ? (
                <p className="p-3 text-center text-xs text-muted">Nenhum calendário disponível.</p>
              ) : (
                calendars
                  .filter((c) => !sharedByMeCal.some((r) => r.google_calendar_id === c.id))
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
