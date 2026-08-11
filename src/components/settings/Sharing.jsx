import { useEffect, useMemo, useState } from 'react';
import { Folder, File as FileIcon, Plus, X, Search, Trash2, Check } from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

// Symmetric Drive/Calendar sharing — qualquer usuário pode conceder acesso a
// itens do próprio Drive/Calendar para QUALQUER outro usuário ativo (não só
// "o outro", agora que existem 3+ pessoas). O token do concedente é usado
// para buscar o conteúdo de fato (ver backend).
//
// v2.26.9 (fix — seletor de destinatário) — ANTES: `otherUser` era resolvido
// via `users.find((u) => u.id !== currentUser?.id)`, ou seja, sempre a
// PRIMEIRA pessoa da lista (Alice, por ordem alfabética/role). Com 3
// usuários ativos isso deixava a Milene inacessível nessa tela, sem
// nenhum erro visível — o compartilhamento sempre ia pra Alice mesmo que o
// usuário quisesse selecionar outra pessoa (não havia como). Substituído por
// abas "Compartilhar com:" — uma por pessoa — que escolhem o destinatário
// ativo; as listas "o que você compartilha" ficam automaticamente filtradas
// pela pessoa selecionada, então cada aba mostra só o que é relevante pra
// ela (evita a lista virar uma bagunça misturando todo mundo, que era a
// segunda reclamação de usabilidade). O backend (`_worker.js`) já aceitava
// `grantee_user_id` explícito no POST — nenhuma mudança de backend precisou.
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
  // Destinatário ativo — controla tanto a aba visível quanto pra quem um novo
  // compartilhamento é criado (addDrive/addCal). null até os usuários carregarem.
  const [recipientId, setRecipientId] = useState(null);

  // Seletores read-only: Escape fecha, clique fora não (v2.25.16).
  const pickerGuard = useUnsavedGuard({
    isDirty: false, onClose: () => setPicker(false), enabled: picker,
  });
  const calPickerGuard = useUnsavedGuard({
    isDirty: false, onClose: () => setCalPicker(false), enabled: calPicker,
  });

  const otherUsers = useMemo(
    () => users.filter((u) => u.id !== currentUser?.id),
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

  // Escolhe um destinatário padrão assim que a lista de usuários chega (só se
  // ainda não houver seleção, ou se a pessoa selecionada não existir mais —
  // ex.: usuário arquivado). Não reseta a seleção do usuário a cada load().
  useEffect(() => {
    if (otherUsers.length === 0) { setRecipientId(null); return; }
    setRecipientId((prev) => (prev && otherUsers.some((u) => u.id === prev) ? prev : otherUsers[0].id));
  }, [otherUsers]);

  const recipient = otherUsers.find((u) => u.id === recipientId) || null;
  const recipientName = recipient?.name ? recipient.name.split(' ')[0] : 'a outra pessoa';

  // v2.26.9 — as listas de "o que você compartilha" ficam filtradas pela
  // pessoa selecionada na aba, pra cada aba mostrar só o que é dela (ver
  // comentário do topo). "O que foi compartilhado com você" continua uma
  // lista única — já mostra "por {nome}" em cada linha, então misturar
  // concedentes diferentes ali não confunde do mesmo jeito.
  const sharedByMeDrive = driveRules.filter((r) => r.grantor_user_id === currentUser?.id && r.grantee_user_id === recipientId);
  const sharedWithMeDrive = driveRules.filter((r) => r.grantee_user_id === currentUser?.id);
  const sharedByMeCal = calRules.filter((r) => r.grantor_user_id === currentUser?.id && r.grantee_user_id === recipientId);
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
    if (!recipientId) return;
    await apiFetch('/api/sharing/drive', {
      method: 'POST',
      body: JSON.stringify({
        google_file_id: f.googleFileId || f.id,
        file_name: f.name,
        mime_type: f.mimeType,
        grantee_user_id: recipientId,
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
    if (!recipientId) return;
    await apiFetch('/api/sharing/calendar', {
      method: 'POST',
      body: JSON.stringify({
        google_calendar_id: c.id,
        calendar_name: c.summary,
        color: c.backgroundColor || '#6366f1',
        grantee_user_id: recipientId,
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

  // Seletor de destinatário — abas clicáveis, uma por pessoa. Só aparece
  // quando há mais de uma pessoa possível (com 1 só, não há o que escolher —
  // mostra o nome dela direto no texto, como antes). Compartilhado pelas
  // duas seções (Drive e Calendário), já que o destinatário é o mesmo.
  const RecipientTabs = () => {
    if (otherUsers.length <= 1) return null;
    return (
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-muted">Compartilhar com:</span>
        {otherUsers.map((u) => {
          const active = u.id === recipientId;
          const name = u.name ? u.name.split(' ')[0] : (u.email || 'usuário');
          const count = driveRules.filter((r) => r.grantor_user_id === currentUser?.id && r.grantee_user_id === u.id).length
            + calRules.filter((r) => r.grantor_user_id === currentUser?.id && r.grantee_user_id === u.id).length;
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => setRecipientId(u.id)}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                active
                  ? 'border-accent bg-accent text-white'
                  : 'border-line bg-surface text-ink2 hover:bg-surface2'
              }`}
            >
              {active && <Check className="h-3 w-3" />}
              {name}
              {count > 0 && (
                <span className={`ml-0.5 rounded-full px-1.5 text-[10px] ${active ? 'bg-white/20' : 'bg-surface2 text-muted'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-1 text-base font-bold text-ink">Compartilhamento de Drive</h2>
        <p className="mb-3 text-xs text-muted">
          Escolha pastas ou arquivos do seu Drive para compartilhar com {recipientName}, e veja o que foi compartilhado com você.
        </p>

        <RecipientTabs />

        <h3 className="mb-1 text-xs font-semibold uppercase text-muted">
          O que você compartilha{recipient ? ` com ${recipientName}` : ''}
        </h3>
        {!recipient ? (
          <p className="mb-2 text-[11px] text-muted">Nenhuma outra pessoa disponível ainda.</p>
        ) : sharedByMeDrive.length === 0 ? (
          <p className="mb-2 text-[11px] text-muted">Nenhum item compartilhado com {recipientName}.</p>
        ) : (
          <ul className="mb-2 space-y-1">
            {sharedByMeDrive.map((r) => {
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
          disabled={!recipient}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" /> Compartilhar pasta ou arquivo{recipient ? ` com ${recipientName}` : ''}
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
          Defina quais calendários você compartilha com {recipientName}.
        </p>

        <RecipientTabs />

        <h3 className="mb-1 text-xs font-semibold uppercase text-muted">
          O que você compartilha{recipient ? ` com ${recipientName}` : ''}
        </h3>
        {!recipient ? (
          <p className="mb-2 text-[11px] text-muted">Nenhuma outra pessoa disponível ainda.</p>
        ) : sharedByMeCal.length === 0 ? (
          <p className="mb-2 text-[11px] text-muted">Nenhum calendário compartilhado com {recipientName}.</p>
        ) : (
          <ul className="mb-2 space-y-1">
            {sharedByMeCal.map((r) => (
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
          disabled={!recipient}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" /> Compartilhar calendário{recipient ? ` com ${recipientName}` : ''}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="flex max-h-[70vh] w-full max-w-md flex-col rounded-xl border border-line bg-surface shadow-soft">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-sm font-bold text-ink">
                Compartilhar do Drive{recipient ? ` com ${recipientName}` : ''}
              </h3>
              <button onClick={pickerGuard.requestClose} className="text-ink2 hover:text-ink"><X className="h-5 w-5" /></button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="flex max-h-[70vh] w-full max-w-md flex-col rounded-xl border border-line bg-surface shadow-soft">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-sm font-bold text-ink">
                Compartilhar calendário{recipient ? ` com ${recipientName}` : ''}
              </h3>
              <button onClick={calPickerGuard.requestClose} className="text-ink2 hover:text-ink"><X className="h-5 w-5" /></button>
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
