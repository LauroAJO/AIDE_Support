import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, Paperclip } from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import Avatar from '../shared/Avatar';
import MentionText from '../tasks/MentionText';

const POLL_MS = 10000;
const lastReadKey = (userId) => `aide_chat_last_read_${userId || 'anon'}`;

function formatTime(unix) {
  if (!unix) return '';
  const d = new Date(unix * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dateKey(unix) {
  if (!unix) return '';
  const d = new Date(unix * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateLabel(unix) {
  if (!unix) return '';
  const d = new Date(unix * 1000);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return 'Hoje';
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

export default function ChatPage() {
  const user = useStore((s) => s.user);
  const setChatUnread = useStore((s) => s.setChatUnread);

  const [messages, setMessages] = useState([]);          // ascending order (oldest first)
  const [users, setUsers] = useState([]);
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState([]);          // [{ id, name }]
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [newCount, setNewCount] = useState(0);           // messages received while scrolled up
  const [mentionQuery, setMentionQuery] = useState(null); // { needle, atIndex } | null

  const listRef = useRef(null);
  const textareaRef = useRef(null);

  const isAtBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Initial load + user roster.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [list, roster] = await Promise.all([
          apiFetch('/api/chat/messages?limit=50').catch(() => []),
          apiFetch('/api/users').catch(() => []),
        ]);
        if (cancelled) return;
        // Backend returns DESC; flip to ASC for display.
        const ordered = [...(list || [])].reverse();
        setMessages(ordered);
        setUsers(roster || []);
        // Mark all messages as read on first paint.
        const latest = ordered.length ? ordered[ordered.length - 1].created_at : 0;
        if (latest && user?.id) localStorage.setItem(lastReadKey(user.id), String(latest));
        setChatUnread(0);
        requestAnimationFrame(scrollToBottom);
      } catch (e) {
        if (!cancelled) setError(String((e && e.message) || e).slice(0, 200));
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const list = await apiFetch('/api/chat/messages?limit=50');
        const ordered = [...(list || [])].reverse();
        const stickToBottom = isAtBottom();
        setMessages((prev) => {
          const prevCount = prev.length;
          const newDelta = Math.max(0, ordered.length - prevCount);
          if (newDelta > 0 && !stickToBottom) {
            setNewCount((n) => n + newDelta);
          }
          return ordered;
        });
        if (stickToBottom) {
          requestAnimationFrame(scrollToBottom);
          const latest = ordered.length ? ordered[ordered.length - 1].created_at : 0;
          if (latest && user?.id) localStorage.setItem(lastReadKey(user.id), String(latest));
          setChatUnread(0);
        } else {
          // Compute unread from localStorage marker.
          const lastRead = Number(localStorage.getItem(lastReadKey(user?.id))) || 0;
          const unread = ordered.filter((m) => m.created_at > lastRead && m.user_id !== user?.id).length;
          setChatUnread(unread);
        }
      } catch { /* keep showing what we have */ }
    }, POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAtBottom, scrollToBottom, user?.id]);

  // Clear unread when user scrolls to the bottom manually.
  const onScroll = () => {
    if (isAtBottom()) {
      setNewCount(0);
      const latest = messages.length ? messages[messages.length - 1].created_at : 0;
      if (latest && user?.id) localStorage.setItem(lastReadKey(user.id), String(latest));
      setChatUnread(0);
    }
  };

  // Mention dropdown candidates — exclude self and archived.
  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = (mentionQuery.needle || '').toLowerCase();
    return (users || [])
      .filter((u) => u.id !== user?.id)
      .filter((u) => !q || (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [users, mentionQuery, user?.id]);

  // Detects an in-progress @mention right before the caret. Triggers the
  // dropdown; closes it on whitespace / clear.
  const onTextChange = (e) => {
    const v = e.target.value;
    setText(v);
    const caret = e.target.selectionStart || v.length;
    const upToCaret = v.slice(0, caret);
    const at = upToCaret.lastIndexOf('@');
    if (at < 0) { setMentionQuery(null); return; }
    const fragment = upToCaret.slice(at + 1);
    if (/\s/.test(fragment)) { setMentionQuery(null); return; }
    setMentionQuery({ needle: fragment, atIndex: at });
  };

  const insertMention = (u) => {
    if (mentionQuery === null) return;
    const handle = (u.name || u.email || '').split(' ')[0] || 'user';
    const before = text.slice(0, mentionQuery.atIndex);
    const after = text.slice((mentionQuery.atIndex + 1) + (mentionQuery.needle || '').length);
    const next = `${before}@${handle} ${after}`;
    setText(next);
    setMentions((m) => (m.some((x) => x.id === u.id) ? m : [...m, { id: u.id, name: handle }]));
    setMentionQuery(null);
    requestAnimationFrame(() => textareaRef.current && textareaRef.current.focus());
  };

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    setError('');
    // Re-derive mentions in case the user edited a mention by hand: keep any
    // tracked mention whose handle still appears as @<handle> in the text.
    const active = mentions.filter((m) => trimmed.includes(`@${m.name}`));
    try {
      const created = await apiFetch('/api/chat/messages', {
        method: 'POST',
        body: JSON.stringify({ content: trimmed, mentions: active.map((m) => m.id) }),
      });
      setMessages((prev) => [...prev, created]);
      setText('');
      setMentions([]);
      setNewCount(0);
      if (user?.id) localStorage.setItem(lastReadKey(user.id), String(created.created_at || Math.floor(Date.now() / 1000)));
      setChatUnread(0);
      requestAnimationFrame(scrollToBottom);
    } catch (e) {
      setError(String((e && e.message) || e).slice(0, 200));
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sending) send();
    }
  };

  // Auto-grow up to 3 lines.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const lineHeight = 20;
    const maxH = lineHeight * 3 + 16;
    ta.style.height = `${Math.min(ta.scrollHeight, maxH)}px`;
  }, [text]);

  // Group messages with a date separator when the date changes.
  const grouped = useMemo(() => {
    const rows = [];
    let lastKey = null;
    for (const m of messages) {
      const k = dateKey(m.created_at);
      if (k !== lastKey) {
        rows.push({ kind: 'date', id: `d-${k}`, ts: m.created_at });
        lastKey = k;
      }
      rows.push({ kind: 'msg', id: m.id, msg: m });
    }
    return rows;
  }, [messages]);

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Chat</h1>
        <span className="text-xs text-muted">Canal geral · {messages.length} mensagens</span>
      </div>

      {error && (
        <div className="mb-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col rounded-2xl border border-line bg-surface">
        <div
          ref={listRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto px-4 py-3"
        >
          {grouped.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              Nenhuma mensagem ainda. Diga oi!
            </div>
          ) : (
            grouped.map((row) => {
              if (row.kind === 'date') {
                return (
                  <div key={row.id} className="my-3 flex items-center gap-2">
                    <div className="flex-1 border-t border-line" />
                    <span className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted">
                      {dateLabel(row.ts)}
                    </span>
                    <div className="flex-1 border-t border-line" />
                  </div>
                );
              }
              const m = row.msg;
              const isSelf = m.user_id === user?.id;
              return (
                <div key={m.id} className={`mb-3 flex items-start gap-2 ${isSelf ? 'flex-row-reverse' : ''}`}>
                  <Avatar user={{ name: m.user_name, avatar: m.user_avatar }} size={32} />
                  <div className={`min-w-0 max-w-[80%] ${isSelf ? 'text-right' : ''}`}>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-ink">{m.user_name || '—'}</span>
                      <span className="text-[10px] text-muted">{formatTime(m.created_at)}</span>
                    </div>
                    {m.deleted_at ? (
                      <div className="mt-0.5 inline-block rounded-lg bg-surface2 px-3 py-1.5 text-xs italic text-muted">
                        [Mensagem removida]
                      </div>
                    ) : (
                      <div
                        className={`mt-0.5 inline-block whitespace-pre-wrap rounded-lg px-3 py-1.5 text-sm ${
                          isSelf ? 'bg-accent text-white' : 'bg-surface2 text-ink'
                        }`}
                      >
                        <MentionText text={m.content} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* "X novas mensagens" banner — shows when scrolled up and more arrive. */}
        {newCount > 0 && (
          <button
            onClick={() => { scrollToBottom(); setNewCount(0); }}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-white shadow-soft hover:bg-accent-hover"
          >
            {newCount} nova{newCount > 1 ? 's' : ''} mensage{newCount > 1 ? 'ns' : 'm'} ↓
          </button>
        )}

        {/* Input area */}
        <div className="relative border-t border-line bg-surface2/40 px-3 py-2">
          {mentionQuery && mentionCandidates.length > 0 && (
            <div className="absolute bottom-full left-3 right-3 mb-1 max-h-44 overflow-y-auto rounded-lg border border-line bg-surface shadow-soft">
              {mentionCandidates.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink hover:bg-surface2"
                >
                  <Avatar user={u} size={24} />
                  <span className="font-medium">{u.name || u.email}</span>
                  <span className="ml-auto text-xs text-muted">{u.email}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              type="button"
              disabled
              title="Em breve"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line text-muted opacity-50"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={onTextChange}
              onKeyDown={onKeyDown}
              placeholder="Escreva uma mensagem… (Enter envia · Shift+Enter nova linha · @ para mencionar)"
              rows={1}
              className="input min-h-[36px] flex-1 resize-none"
            />
            <button
              onClick={send}
              disabled={sending || !text.trim()}
              className="flex h-9 items-center gap-1 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
            >
              <Send className="h-4 w-4" /> Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
