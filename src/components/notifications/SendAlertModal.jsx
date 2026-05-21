import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../../lib/api';

export default function SendAlertModal({ otherUser, onClose, onSent }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [taskId, setTaskId] = useState('');
  const [tasks, setTasks] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

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
      onSent();
    } catch {
      setError('Falha ao enviar o aviso.');
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-line bg-surface shadow-soft" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">Enviar aviso</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
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
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button onClick={onClose} className="rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2">
            Cancelar
          </button>
          <button
            onClick={send}
            disabled={sending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
          >
            {sending ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
