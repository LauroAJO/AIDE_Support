import { useEffect, useMemo, useState } from 'react';
import { Plus, Pin, PinOff, Trash2, ArrowLeft, Search } from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import { formatDate } from '../../lib/tasks';
import LoadingSpinner from '../shared/LoadingSpinner';
import DriveAttachmentZone from '../shared/DriveAttachmentZone';

function preview(note) {
  if (note.title) return note.title;
  const firstLine = (note.body || '').split('\n')[0].trim();
  return firstLine ? firstLine.slice(0, 50) : 'Nota sem título';
}

export default function NotesPage() {
  const notes = useStore((s) => s.notes);
  const setNotes = useStore((s) => s.setNotes);
  const selectedNote = useStore((s) => s.selectedNote);
  const setSelectedNote = useStore((s) => s.setSelectedNote);

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | pinned | project:<id>
  const [tagFilter, setTagFilter] = useState(null);

  // Editor local state (synced from selectedNote).
  const [form, setForm] = useState(null);

  const load = async () => {
    try {
      const [n, p] = await Promise.all([apiFetch('/api/notes'), apiFetch('/api/projects')]);
      setNotes(n);
      setProjects(p);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedNote) {
      setForm(null);
      return;
    }
    setForm({
      title: selectedNote.title || '',
      body: selectedNote.body || '',
      tagsInput: (selectedNote.tags || []).join(', '),
      project_id: selectedNote.project_id || '',
      pinned: !!selectedNote.pinned,
    });
  }, [selectedNote]);

  const allTags = useMemo(() => {
    const set = new Set();
    notes.forEach((n) => (n.tags || []).forEach((t) => set.add(t)));
    return [...set];
  }, [notes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter((n) => {
      if (filter === 'pinned' && !n.pinned) return false;
      if (filter.startsWith('project:') && n.project_id !== filter.slice(8)) return false;
      if (tagFilter && !(n.tags || []).includes(tagFilter)) return false;
      if (q && !(`${n.title} ${n.body}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [notes, search, filter, tagFilter]);

  const createNote = async () => {
    const note = await apiFetch('/api/notes', { method: 'POST', body: JSON.stringify({ title: '', body: '' }) });
    setNotes([note, ...notes]);
    setSelectedNote(note);
  };

  const saveNote = async (patch) => {
    if (!selectedNote) return;
    const updated = await apiFetch(`/api/notes/${selectedNote.id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
    setNotes(notes.map((n) => (n.id === updated.id ? updated : n)));
    setSelectedNote(updated);
  };

  const persistForm = (extra = {}) => {
    if (!form) return;
    saveNote({
      title: form.title,
      body: form.body,
      tags: form.tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
      project_id: form.project_id || null,
      pinned: form.pinned,
      ...extra,
    });
  };

  const togglePin = () => {
    const next = !form.pinned;
    setForm({ ...form, pinned: next });
    persistForm({ pinned: next });
  };

  const deleteNote = async () => {
    if (!selectedNote) return;
    if (!window.confirm('Excluir esta nota?')) return;
    await apiFetch(`/api/notes/${selectedNote.id}`, { method: 'DELETE' });
    setNotes(notes.filter((n) => n.id !== selectedNote.id));
    setSelectedNote(null);
  };

  if (loading) {
    return (
      <div className="h-full">
        <LoadingSpinner label="Carregando notas..." />
      </div>
    );
  }

  return (
    <div className="flex h-full gap-4">
      {/* LEFT — list */}
      <div className={`${selectedNote ? 'hidden md:flex' : 'flex'} min-h-0 w-full flex-col md:w-[35%]`}>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-ink">Notas</h1>
          <button
            onClick={createNote}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" /> Nova Nota
          </button>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar notas..."
            className="input pl-8"
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>Todas</Chip>
          <Chip active={filter === 'pinned'} onClick={() => setFilter('pinned')}>Fixadas</Chip>
          {projects.map((p) => (
            <Chip key={p.id} active={filter === `project:${p.id}`} onClick={() => setFilter(`project:${p.id}`)}>
              {p.name}
            </Chip>
          ))}
        </div>

        {allTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setTagFilter(tagFilter === t ? null : t)}
                className={`rounded-full px-2 py-0.5 text-[11px] ${
                  tagFilter === t ? 'bg-accent text-white' : 'bg-surface2 text-ink2'
                }`}
              >
                #{t}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pb-2">
          {filtered.length === 0 ? (
            <p className="mt-6 text-center text-sm text-muted">Nenhuma nota.</p>
          ) : (
            filtered.map((n) => (
              <button
                key={n.id}
                onClick={() => setSelectedNote(n)}
                className={`w-full rounded-lg border bg-surface p-3 text-left transition hover:border-accent ${
                  selectedNote?.id === n.id ? 'border-accent ring-1 ring-accent' : 'border-line'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`font-semibold text-ink ${!n.title ? 'italic text-ink2' : ''}`}>
                    {preview(n)}
                  </span>
                  {n.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-accent" fill="currentColor" />}
                </div>
                {n.body && <p className="mt-1 truncate text-xs text-ink2">{n.body.split('\n')[0]}</p>}
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {(n.tags || []).map((t) => (
                    <span key={t} className="rounded-full bg-surface2 px-1.5 py-0.5 text-[10px] text-ink2">#{t}</span>
                  ))}
                  {n.projectName && <span className="text-[10px] text-muted">· {n.projectName}</span>}
                  <span className="ml-auto text-[10px] text-muted">{formatDate(new Date(n.updated_at * 1000))}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* RIGHT — editor */}
      <div className={`${selectedNote ? 'flex' : 'hidden md:flex'} min-h-0 w-full flex-col md:w-[65%]`}>
        {!selectedNote || !form ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-surface text-sm text-muted">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#9E9890" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M16 13H8M16 17H8M10 9H8" />
            </svg>
            Suas notas aparecem aqui
          </div>
        ) : (
          <div className="flex h-full flex-col rounded-xl border border-line bg-surface p-4">
            <button onClick={() => setSelectedNote(null)} className="mb-2 flex items-center gap-1 text-xs text-ink2 md:hidden">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>

            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              onBlur={() => persistForm()}
              placeholder="Título (opcional)"
              className="w-full bg-transparent text-xl font-bold text-ink outline-none placeholder:text-muted"
            />

            <div className="mt-2 flex flex-wrap items-center gap-2 border-b border-line pb-2">
              <select
                value={form.project_id}
                onChange={(e) => {
                  setForm({ ...form, project_id: e.target.value });
                  persistForm({ project_id: e.target.value || null });
                }}
                className="rounded-lg border border-line bg-surface2 px-2 py-1 text-xs text-ink"
              >
                <option value="">Sem projeto</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input
                value={form.tagsInput}
                onChange={(e) => setForm({ ...form, tagsInput: e.target.value })}
                onBlur={() => persistForm()}
                placeholder="tags, separadas, por vírgula"
                className="flex-1 rounded-lg border border-line bg-surface2 px-2 py-1 text-xs text-ink placeholder:text-muted"
              />
              <button
                onClick={togglePin}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${
                  form.pinned ? 'bg-accent text-white' : 'bg-surface2 text-ink2'
                }`}
              >
                {form.pinned ? <Pin className="h-3.5 w-3.5" fill="currentColor" /> : <PinOff className="h-3.5 w-3.5" />}
                {form.pinned ? 'Fixada' : 'Fixar'}
              </button>
            </div>

            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              onBlur={() => persistForm()}
              placeholder="Escreva sua nota aqui..."
              className="mt-3 min-h-0 flex-1 resize-none bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            />

            <div className="mt-3 border-t border-line pt-3">
              <DriveAttachmentZone entityType="note" entityId={selectedNote.id} />
            </div>

            <div className="mt-3 flex items-end justify-between border-t border-line pt-2">
              <div className="text-[10px] text-muted">
                {selectedNote.createdBy && <span>Criada por {selectedNote.createdBy.name}</span>}
                {selectedNote.updatedBy && (
                  <span> · Atualizada por {selectedNote.updatedBy.name} em {formatDate(new Date(selectedNote.updated_at * 1000))}</span>
                )}
              </div>
              <button
                onClick={deleteNote}
                className="flex items-center gap-1 rounded-lg border border-danger/40 px-2.5 py-1 text-xs font-medium text-danger transition hover:bg-danger/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
        active ? 'bg-accent text-white' : 'bg-surface2 text-ink2 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
