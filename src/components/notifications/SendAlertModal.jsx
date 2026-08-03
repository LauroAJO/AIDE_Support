import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import ConfirmModal from '../shared/ConfirmModal';
import { DraftBanner } from '../shared/DraftBanner';
import { useDraft } from '../../hooks/useDraft';
import {
  useUnsavedGuard, DISCARD_TITLE, DISCARD_MESSAGE,
  DISCARD_CONFIRM_LABEL, DISCARD_CANCEL_LABEL,
} from '../../hooks/useUnsavedGuard';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function SendAlertModal({ otherUser, onClose, onSent }) {
  // Rascunho por destinatário (v2.25.16).
  const pristine = useMemo(() => ({
    title: '', message: '', taskId: '', mode: 'now', date: todayISO(), time: '09:00',
  }), []);
  const {
    value: form, setValue: setForm, clearDraft, discardDraft, hasDraft,
  } = useDraft(`alert-send-${otherUser?.id || 'none'}`, pristine);

  const { title, message, taskId, mode, date, time } = form;
  const setField = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setTitle = setField('title');
  const setMessage = setField('message');
  const setTaskId = setField('taskId');
  const setMode = setField('mode');
  const setDate = setField('date');
  const setTime = setField('time');

  const [tasks, setTasks] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const isDirty = JSON.stringify(form) !== JSON.stringify(pristine);
  const guard = useUnsavedGuard({ isDirty, onClose, onDiscard: discardDraft });

  useEffect(() => {
    apiFetch('/api/tasks')
      .then((t) => setTasks(t.filter((x) => x.status !== 'done')))
      .catch(() => setTasks([]));
  }, []);

  const send = async () => {
    if (!otherUser) {
      setError('Nenhum destinatário disponível.');
      return;
    }
    if (!title.trim()) {
      setError('Título é obrigatório');
      return;
    }
    setSending(true);
    setError('');
    try {
      if (mode === 'schedule') {
        const sendAt = new Date(`${date}T${time}`);
        if (Number.isNaN(sendAt.getTime())) {
          setError('Data/hora inválida.');
          setSending(false);
          return;
        }
        await apiFetch('/api/notifications/scheduled', {
          method: 'POST',
          body: JSON.stringify({
            to_user_id: otherUser.id,
            title: title.trim(),
            body: message,
            task_id: taskId || null,
            send_at: sendAt.toISOString(),
          }),
        });
        clearDraft();          // enviado: o rascunho não serve mais
        onSent(`Aviso agendado para ${date.split('-').reverse().join('/')} às ${time}`);
      } else {
        await apiFetch('/api/notifications', {
          method: 'POST',
          body: JSON.stringify({
            to_user_id: otherUser.id,
            type: 'alert',
            title: title.trim(),
            body: message,
            task_id: taskId || null,
          }),
        });
        clearDraft();
        onSent();
      }
    } catch {
      setError('Falha ao enviar o aviso.');
      setSending(false);
    }
  };

  return (
    <>
    {/* Backdrop SEM onClick (v2.25.16). */}
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface shadow-soft">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">Enviar aviso</h2>
          <button onClick={guard.requestClose} className="rounded-md p-1 text-ink2 hover:bg-surface2 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          {hasDraft && <DraftBanner onDiscard={discardDraft} />}
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>
          )}
          <div className="text-sm text-ink2">
            Para: <span className="font-medium text-ink">{otherUser ? otherUser.name || otherUser.email : '—'}</span>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink2">Título</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink2">Mensagem</span>
            <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} className="input resize-y" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink2">Tarefa relacionada (opcional)</span>
            <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className="input">
              <option value="">Nenhuma</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </label>

          {/* Schedule toggle */}
          <div className="flex gap-1 rounded-lg bg-surface2 p-1">
            {[['now', 'Enviar agora'], ['schedule', 'Agendar envio']].map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setMode(v)}
                className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                  mode === v ? 'bg-surface text-ink shadow-soft' : 'text-ink2'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          {mode === 'schedule' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink2">Enviar em (data)</span>
                <input type="date" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} className="input" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink2">Hora</span>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input" />
              </label>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button onClick={guard.requestClose} className="rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2">
            Cancelar
          </button>
          <button
            onClick={send}
            disabled={sending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
          >
            {sending ? 'Enviando...' : mode === 'schedule' ? 'Agendar' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>

    <ConfirmModal
      open={guard.confirming}
      title={DISCARD_TITLE}
      message={DISCARD_MESSAGE}
      confirmLabel={DISCARD_CONFIRM_LABEL}
      cancelLabel={DISCARD_CANCEL_LABEL}
      danger
      onConfirm={guard.confirmDiscard}
      onCancel={guard.cancelDiscard}
    />
    </>
  );
}
