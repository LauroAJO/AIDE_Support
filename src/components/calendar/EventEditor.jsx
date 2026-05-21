import { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { localToISO, isoToLocalInput } from '../../lib/calendar';
import { addDaysISO } from '../../lib/week';

function initialInputs(event, initialDate) {
  if (event && event.startDatetime) {
    if (event.allDay) {
      const d = event.startDatetime.slice(0, 10);
      return { start: `${d}T00:00`, end: `${d}T00:00` };
    }
    return {
      start: isoToLocalInput(event.startDatetime),
      end: isoToLocalInput(event.endDatetime),
    };
  }
  const d = initialDate || new Date().toISOString().slice(0, 10);
  return { start: `${d}T09:00`, end: `${d}T10:00` };
}

export default function EventEditor({
  event,
  calendars,
  defaultCalendarId,
  initialDate,
  onClose,
  onSaved,
  onDeleted,
}) {
  const isEdit = !!(event && event.googleEventId);
  const inputs = initialInputs(event, initialDate);

  const [title, setTitle] = useState(event?.title || '');
  const [description, setDescription] = useState(event?.description || '');
  const [allDay, setAllDay] = useState(!!event?.allDay);
  const [location, setLocation] = useState(event?.location || '');
  const [calendarId] = useState(event?.calendarId || defaultCalendarId || 'primary');
  const [startInput, setStartInput] = useState(inputs.start);
  const [endInput, setEndInput] = useState(inputs.end);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const calLabel = calendars.find((c) => c.id === calendarId)?.summary || 'Agenda principal';

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Título é obrigatório');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      title: title.trim(),
      description,
      location,
      all_day: allDay,
      calendar_id: calendarId,
    };
    if (allDay) {
      const d = startInput.slice(0, 10);
      payload.start = d;
      payload.end = addDaysISO(d, 1); // Google all-day end is exclusive
    } else {
      payload.start = localToISO(startInput);
      payload.end = localToISO(endInput);
    }
    try {
      const saved = isEdit
        ? await apiFetch(`/api/calendar/events/${event.googleEventId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : await apiFetch('/api/calendar/events', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
      onSaved(saved);
    } catch {
      setError('Falha ao salvar o evento.');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    if (!window.confirm('Excluir este evento?')) return;
    setSaving(true);
    try {
      await apiFetch(
        `/api/calendar/events/${event.googleEventId}?calendarId=${encodeURIComponent(calendarId)}`,
        { method: 'DELETE' }
      );
      onDeleted(event.googleEventId);
    } catch {
      setError('Falha ao excluir.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/20" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col bg-surface shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">{isEdit ? 'Editar evento' : 'Novo evento'}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink2">Título</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink2">Descrição</span>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="input resize-y" />
          </label>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="accent-[#6366f1]" />
            Dia inteiro
          </label>

          <div className="grid grid-cols-1 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink2">Início</span>
              <input
                type={allDay ? 'date' : 'datetime-local'}
                value={allDay ? startInput.slice(0, 10) : startInput}
                onChange={(e) => setStartInput(allDay ? `${e.target.value}T00:00` : e.target.value)}
                className="input"
              />
            </label>
            {!allDay && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink2">Fim</span>
                <input
                  type="datetime-local"
                  value={endInput}
                  onChange={(e) => setEndInput(e.target.value)}
                  className="input"
                />
              </label>
            )}
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink2">Local</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className="input" />
          </label>

          <p className="text-xs text-muted">Agenda: {calLabel}</p>
        </div>

        <div className="flex items-center gap-2 border-t border-line px-4 py-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          {isEdit && (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="flex items-center gap-1 rounded-lg border border-danger/40 px-3 py-2 text-sm font-medium text-danger transition hover:bg-danger/10 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" /> Excluir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
