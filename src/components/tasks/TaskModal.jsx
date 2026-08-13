import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Star, Pencil, CheckCircle2, Trash2, Paperclip, ExternalLink, Send, CornerDownRight, Briefcase } from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import Avatar from '../shared/Avatar';
import MentionText from './MentionText';
import DriveAttachmentZone from '../shared/DriveAttachmentZone';
import ConfirmModal from '../shared/ConfirmModal';
import { DraftBanner } from '../shared/DraftBanner';
import { useDraft } from '../../hooks/useDraft';
import {
  useUnsavedGuard, DISCARD_TITLE,
  DISCARD_CONFIRM_LABEL, DISCARD_CANCEL_LABEL,
} from '../../hooks/useUnsavedGuard';
import { MarkdownViewer } from '../../lib/markdownRenderer';
import AvatarStack from '../shared/AvatarStack';
import { scoreColor, STATUS_LABELS, STATUS_COLORS, formatDate, isOverdue, WEEKDAY_CHIPS, taskAssignees } from '../../lib/tasks';
import { OPP_STATUS_LABELS } from '../career/careerShared';

// Recorrência (v2.25.5): "Personalizada" no seletor é só uma forma alternativa
// de configurar o mesmo recurrence_type ('daily'/'weekly'/'monthly') — deixa
// escolher intervalo + unidade num único controle em vez de um botão fixo por
// frequência. Não existe recurrence_type='custom' de fato gravado no banco:
// o backend (calcNextDate) só sabe calcular daily/weekly/monthly, então usar
// uma dessas três por baixo dos panos evita uma recorrência sem cálculo de
// próxima data. Ao reabrir uma tarefa salva via "Personalizada", o seletor
// mostra o botão nativo correspondente (Diária/Semanal/Mensal) — a "Personalizada"
// é só um atalho de entrada, não um estado próprio persistido.
function RecurrenceSection({ task, onPersist }) {
  const [isRecurring, setIsRecurring] = useState(!!task.is_recurring);
  const [freqMode, setFreqMode] = useState(task.recurrence_type || 'daily');
  const [interval, setIntervalValue] = useState(Number(task.recurrence_interval) || 1);
  const [days, setDays] = useState(Array.isArray(task.recurrence_days) ? task.recurrence_days : []);
  const [endDate, setEndDate] = useState(task.recurrence_end_date || '');
  const [customUnit, setCustomUnit] = useState('daily');

  useEffect(() => {
    setIsRecurring(!!task.is_recurring);
    setFreqMode(task.recurrence_type || 'daily');
    setIntervalValue(Number(task.recurrence_interval) || 1);
    setDays(Array.isArray(task.recurrence_days) ? task.recurrence_days : []);
    setEndDate(task.recurrence_end_date || '');
  }, [task.id]);

  // Persiste o objeto de recorrência inteiro a cada mudança — mesmo padrão já
  // usado no resto do modal para edições rápidas (favoritar, subtarefas etc.).
  const persistRecurrence = (patch) => {
    onPersist(task, {
      is_recurring: isRecurring ? 1 : 0,
      recurrence_type: freqMode === 'custom' ? customUnit : freqMode,
      recurrence_interval: interval,
      recurrence_days: days,
      recurrence_end_date: endDate,
      ...patch,
    });
  };

  const toggleRecurring = () => {
    const next = !isRecurring;
    setIsRecurring(next);
    persistRecurrence({ is_recurring: next ? 1 : 0 });
  };
  const chooseFreq = (mode) => {
    setFreqMode(mode);
    persistRecurrence({ recurrence_type: mode === 'custom' ? customUnit : mode });
  };
  const chooseCustomUnit = (unit) => {
    setCustomUnit(unit);
    persistRecurrence({ recurrence_type: unit });
  };
  const changeInterval = (n) => {
    const v = Math.max(1, Number(n) || 1);
    setIntervalValue(v);
    persistRecurrence({ recurrence_interval: v });
  };
  const toggleDay = (d) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b);
    setDays(next);
    persistRecurrence({ recurrence_days: next });
  };
  const changeEndDate = (v) => {
    setEndDate(v);
    persistRecurrence({ recurrence_end_date: v });
  };

  const numberInputClass = 'w-16 rounded-md border border-line bg-surface2 px-2 py-1 text-sm text-ink';

  return (
    <div className="rounded-lg border border-line p-3">
      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <input type="checkbox" checked={isRecurring} onChange={toggleRecurring} className="accent-[#6366f1]" />
        🔄 Esta tarefa se repete
      </label>

      {isRecurring && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {[
              ['daily', 'Diária'],
              ['weekly', 'Semanal'],
              ['monthly', 'Mensal'],
              ['custom', 'Personalizada'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => chooseFreq(key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  freqMode === key ? 'bg-accent text-white' : 'bg-surface2 text-ink2 hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {freqMode === 'daily' && (
            <label className="flex items-center gap-2 text-sm text-ink2">
              A cada
              <input type="number" min="1" value={interval} onChange={(e) => changeInterval(e.target.value)} className={numberInputClass} />
              dia(s)
            </label>
          )}

          {freqMode === 'weekly' && (
            <>
              <label className="flex items-center gap-2 text-sm text-ink2">
                A cada
                <input type="number" min="1" value={interval} onChange={(e) => changeInterval(e.target.value)} className={numberInputClass} />
                semana(s)
              </label>
              <div>
                <p className="mb-1 text-xs font-medium text-muted">Dias</p>
                <div className="flex flex-wrap gap-1">
                  {WEEKDAY_CHIPS.map((c) => (
                    <button
                      key={c.day}
                      type="button"
                      onClick={() => toggleDay(c.day)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                        days.includes(c.day) ? 'bg-accent text-white' : 'bg-surface2 text-ink2 hover:text-ink'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {freqMode === 'monthly' && (
            <label className="flex items-center gap-2 text-sm text-ink2">
              A cada
              <input type="number" min="1" value={interval} onChange={(e) => changeInterval(e.target.value)} className={numberInputClass} />
              mês(es)
            </label>
          )}

          {freqMode === 'custom' && (
            <label className="flex items-center gap-2 text-sm text-ink2">
              A cada
              <input type="number" min="1" value={interval} onChange={(e) => changeInterval(e.target.value)} className={numberInputClass} />
              <select
                value={customUnit}
                onChange={(e) => chooseCustomUnit(e.target.value)}
                className="rounded-md border border-line bg-surface2 px-2 py-1 text-sm text-ink"
              >
                <option value="daily">dias</option>
                <option value="weekly">semanas</option>
                <option value="monthly">meses</option>
              </select>
            </label>
          )}

          <div>
            <p className="mb-1 text-xs font-medium text-muted">Termina em</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={endDate}
                onChange={(e) => changeEndDate(e.target.value)}
                className="rounded-md border border-line bg-surface2 px-2 py-1 text-sm text-ink"
              />
              <span className="text-xs text-muted">{endDate ? '' : 'Sem data de término'}</span>
              {endDate && (
                <button type="button" onClick={() => changeEndDate('')} className="text-xs text-ink2 hover:text-danger">
                  Remover data de término
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Nota "gerada de [tarefa pai]" — busca o título sob demanda (a tarefa pai
// pode já estar concluída e fora dos filtros padrão da lista, então não dá
// pra assumir que já está em memória). onOpenTask é opcional: quando o
// chamador não o fornece (ex.: modal aberto a partir da Reunião), a nota
// aparece como texto simples, sem link clicável.
function ParentTaskNote({ parentTaskId, onOpenTask }) {
  const [parent, setParent] = useState(null);
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/tasks/${parentTaskId}`)
      .then((t) => { if (!cancelled) setParent(t); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [parentTaskId]);

  if (!parent) return null;
  const label = `Gerada automaticamente de "${parent.title}"`;
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-surface2 px-3 py-2 text-xs text-ink2">
      <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-muted" />
      {onOpenTask ? (
        <button type="button" onClick={() => onOpenTask(parent)} className="text-left hover:text-accent hover:underline">
          {label}
        </button>
      ) : (
        <span>{label}</span>
      )}
    </div>
  );
}

// Centered modal: read-only view + quick actions. Editing the full task still
// uses the existing TaskEditor slide-in (opened via onEdit).
export default function TaskModal({ task, onClose, onEdit, onPersist, onDelete, onOpenTask }) {
  const navigate = useNavigate();
  const currentUser = useStore((s) => s.user);
  // v2.26.2 — mesma lógica do TaskCard: tarefa vinculada a uma oportunidade em
  // "Mapear" (extract_knowledge) ou já arquivada como mapeada (status='mapped')
  // é de coleta de informação, não de candidatura — mostra um aviso no detalhe.
  const linkedOpportunity = useStore((s) =>
    task?.opportunity_id ? s.careerOpportunities.find((o) => o.id === task.opportunity_id) : null,
  );
  const isMapping = !!linkedOpportunity && (!!linkedOpportunity.extract_knowledge || linkedOpportunity.status === 'mapped');
  // O modal é read-only + ações rápidas que persistem na hora; o ÚNICO texto
  // que se perdia ao fechar era o comentário em digitação — por isso ele tem
  // rascunho próprio. Chave separada da do TaskEditor de propósito: aquela
  // guarda o formulário inteiro (objeto), esta guarda só o comentário
  // (string) — mesma chave para formatos diferentes corromperia a restauração.
  const {
    value: comment, setValue: setComment, clearDraft, discardDraft, hasDraft,
  } = useDraft(`task-comment-${task?.id || 'new'}`, '');
  const guard = useUnsavedGuard({
    isDirty: !!comment.trim(), onClose, onDiscard: discardDraft,
  });

  // v2.25.19 — as subtarefas podem ser linhas reais (isReal, com endpoint
  // próprio e responsável independente) ou o JSON legado dentro da tarefa mãe.
  // Cópia local só para o check marcar na hora: a lista volta a sair do `task`
  // assim que a página recarrega.
  const [subs, setSubs] = useState(task?.subtasks || []);
  useEffect(() => { setSubs(task?.subtasks || []); }, [task?.id, task?.subtasks]);

  if (!task) return null;
  const done = subs.filter((s) => s.done).length;
  const overdue = isOverdue(task.due_date);
  const assignees = taskAssignees(task);

  const toggleSub = async (id) => {
    const sub = subs.find((s) => s.id === id);
    if (!sub) return;
    if (!sub.isReal) {
      onPersist(task, { subtasks: subs.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) });
      return;
    }
    setSubs((list) => list.map((s) => (
      s.id === id ? { ...s, done: !s.done, status: s.done ? 'todo' : 'done' } : s)));
    try {
      await apiFetch(`/api/tasks/${task.id}/subtasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: sub.done ? 'todo' : 'done' }),
      });
    } catch {
      setSubs((list) => list.map((s) => (
        s.id === id ? { ...s, done: sub.done, status: sub.status } : s)));
    }
  };

  const addComment = () => {
    const v = comment.trim();
    if (!v) return;
    const now = Date.now();
    const name = currentUser?.name || 'Você';
    const next = [
      ...(task.comments || []),
      { id: crypto.randomUUID(), authorId: currentUser?.id || null, authorName: name, author: name, text: v, createdAt: now, at: now },
    ];
    onPersist(task, { comments: next });
    setComment('');
    clearDraft();          // comentário enviado: rascunho não serve mais
  };

  const complete = () => {
    onPersist(task, { status: 'done' });
    clearDraft();
    onClose();
  };
  const remove = async () => {
    if (!window.confirm('Excluir esta tarefa? Esta ação não pode ser desfeita.')) return;
    // Bug fix (v2.4.8): o modal apenas chamava o callback de refresh e NUNCA
    // enviava o DELETE — a tarefa reaparecia após o loadAll(). Agora exclui de
    // fato no backend antes de atualizar a lista (mesmo padrão do TaskEditor).
    // eslint-disable-next-line no-console
    console.log('[TaskModal] DELETE disparado para a tarefa', task.id);
    try {
      const res = await apiFetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      // eslint-disable-next-line no-console
      console.log('[TaskModal] DELETE respondeu OK', res);
      clearDraft();
      onDelete(task.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TaskModal] Falha ao excluir tarefa', task.id, err);
      // Investigação (bug de exclusão): apiFetch lança com o TEXTO CRU do
      // corpo da resposta (ver src/lib/api.js), que em erros do backend é um
      // JSON tipo {"error":"..."}. Um alerta genérico fixo escondia a causa
      // real (ex.: 403 de permissão) e sugeria "tente novamente" mesmo quando
      // repetir jamais vai funcionar. Mostra a mensagem real quando dá pra
      // extrair; só cai no genérico se o corpo não for o JSON esperado.
      let detail = '';
      try { detail = JSON.parse(err.message)?.error || ''; } catch { /* corpo não era JSON */ }
      window.alert(detail || 'Falha ao excluir a tarefa. Tente novamente.');
    }
  };

  return (
    <>
    {/* Backdrop SEM onClick (v2.25.13): clicar fora não fecha mais o modal. */}
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 sm:p-4">
      <div className="flex h-full w-full flex-col overflow-y-auto bg-surface sm:h-auto sm:max-h-[85vh] sm:max-w-[680px] sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div className="min-w-0">
            {(task.areaName || task.projectName || task.frontName) && (
              <div className="mb-1 truncate text-[11px] uppercase tracking-wide text-muted">
                {[task.areaName, task.projectName, task.frontName].filter(Boolean).join(' › ')}
              </div>
            )}
            <h2 className="text-xl font-bold text-ink">{task.title}</h2>
            {isMapping && (
              <p className="mt-0.5 text-[11px] font-medium text-teal-600">
                🔍 Esta tarefa é de mapeamento (coleta de informação), não candidatura.
              </p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded px-2 py-0.5 text-xs font-medium text-white" style={{ background: STATUS_COLORS[task.status] }}>
                {STATUS_LABELS[task.status]}
              </span>
              <span className="rounded px-2 py-0.5 text-xs font-bold text-white" style={{ background: scoreColor(task.score) }}>
                Score {task.score}
              </span>
              <button
                type="button"
                onClick={() => onPersist(task, { favorited: task.favorited ? 0 : 1 })}
                title={task.favorited ? 'Remover dos favoritos' : 'Favoritar'}
              >
                <Star className="h-5 w-5" style={{ color: task.favorited ? '#F59E0B' : '#9E9890', fill: task.favorited ? '#F59E0B' : 'none' }} />
              </button>
            </div>
          </div>
          <button onClick={guard.requestClose} className="shrink-0 rounded-md p-1 text-ink2 hover:bg-surface2 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 p-5">
          {hasDraft && <DraftBanner onDiscard={discardDraft} label="Comentário em rascunho recuperado" />}
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {/* v2.25.19 — todos os responsáveis, não só o principal. */}
            {assignees.length > 0 && (
              <span className="flex flex-wrap items-center gap-1.5 text-ink2">
                <span className="font-medium">
                  {assignees.length > 1 ? 'Responsáveis:' : 'Responsável:'}
                </span>
                {assignees.map((a, i) => (
                  <span key={a.id} className="flex items-center gap-1">
                    {i > 0 && <span className="text-muted">·</span>}
                    <Avatar user={a} size={20} /> {a.name}
                  </span>
                ))}
              </span>
            )}
            {task.due_date && (
              <span className="font-medium" style={{ color: overdue ? '#EF4444' : '#6B6560' }}>
                Prazo: {formatDate(task.due_date)}
              </span>
            )}
            {task.projectName && <span className="text-ink2">Projeto: {task.projectName}</span>}
            <span className="text-ink2">U {task.urgency} · I {task.importance} · E {task.energy}</span>
          </div>

          {/* Só para a linhagem de RECORRÊNCIA. Subtarefas (is_subtask=1) também
              usam parent_task_id, mas "gerada automaticamente de" seria mentira
              para elas — daí o !task.is_subtask (v2.25.19). */}
          {task.parent_task_id && !task.is_subtask && (
            <ParentTaskNote parentTaskId={task.parent_task_id} onOpenTask={onOpenTask} />
          )}

          <RecurrenceSection key={task.id} task={task} onPersist={onPersist} />

          {/* Fix 1 (spec de investigação task↔career) — link de volta para a
              vaga de Carreira, quando a tarefa nasceu de uma oportunidade. */}
          {linkedOpportunity && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface2/60 p-3">
              <div className="min-w-0">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Vaga vinculada</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">{linkedOpportunity.title}</span>
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-ink2 bg-surface">
                    {OPP_STATUS_LABELS[linkedOpportunity.status] || linkedOpportunity.status}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/career?opportunity=${task.opportunity_id}`)}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink2 hover:bg-surface"
              >
                <Briefcase className="h-3.5 w-3.5" /> Ver no Pipeline →
              </button>
            </div>
          )}

          {task.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {task.tags.map((t) => (
                <span key={t} className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] text-ink2">#{t}</span>
              ))}
            </div>
          )}

          {task.description && <MarkdownViewer content={task.description} className="text-sm" />}

          {/* Subtasks */}
          {subs.length > 0 && (
            <div>
              <div className="mb-1 flex items-center justify-between text-xs font-medium text-ink2">
                <span>Subtarefas</span>
                <span>{done}/{subs.length} concluídas</span>
              </div>
              <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-surface2">
                <div className="h-full rounded-full bg-accent" style={{ width: `${subs.length ? (done / subs.length) * 100 : 0}%` }} />
              </div>
              <ul className="space-y-1">
                {subs.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!s.done} onChange={() => toggleSub(s.id)} className="accent-[#6366f1]" />
                    <span className={`flex-1 ${s.done ? 'text-muted line-through' : 'text-ink'}`}>{s.text}</span>
                    {/* Subtarefa-linha pode ter responsável próprio (v2.25.19) */}
                    {s.assignedUser && (
                      <span className="flex items-center gap-1 text-[11px] text-ink2">
                        <AvatarStack users={[s.assignedUser]} size={16} max={1} />
                        {s.assignedUser.name}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Drive attachments */}
          {task.drive_attachments?.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-ink2">Anexos do Drive</p>
              <div className="flex flex-wrap gap-1.5">
                {task.drive_attachments.map((a) => (
                  <a
                    key={a.googleFileId}
                    href={a.webViewLink || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-full bg-surface2 px-2 py-1 text-[11px] text-ink2 hover:text-accent"
                    title={a.name}
                  >
                    {a.iconLink ? <img src={a.iconLink} alt="" className="h-3.5 w-3.5" /> : <Paperclip className="h-3.5 w-3.5" />}
                    <span className="max-w-[160px] truncate">{a.name}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Drive attachments (read-only) */}
          <div>
            <p className="mb-1 text-xs font-medium text-ink2">Arquivos</p>
            <DriveAttachmentZone entityType="task" entityId={task.id} readOnly />
          </div>

          {/* Comments */}
          <div>
            <p className="mb-1 text-xs font-medium text-ink2">Comentários</p>
            <ul className="space-y-2">
              {(task.comments || []).map((c) => (
                <li key={c.id} className="rounded-lg bg-surface2 p-2 text-xs">
                  <div className="flex justify-between text-[10px] text-muted">
                    <span>{c.authorName || c.author}</span>
                    <span>{c.createdAt || c.at ? new Date(c.createdAt || c.at).toLocaleString('pt-BR') : ''}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-ink"><MentionText text={c.text} /></p>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addComment())}
                placeholder="Escrever comentário"
                className="input flex-1"
              />
              <button type="button" onClick={addComment} className="btn-icon">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 border-t border-line p-4">
          <button
            onClick={() => onEdit(task)}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
          >
            <Pencil className="h-4 w-4" /> Editar tarefa
          </button>
          {task.status !== 'done' && (
            <button
              onClick={complete}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ background: '#22C55E' }}
            >
              <CheckCircle2 className="h-4 w-4" /> Concluir tarefa
            </button>
          )}
          <button onClick={remove} className="ml-auto flex items-center gap-1 rounded-lg border border-danger/40 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10">
            <Trash2 className="h-4 w-4" /> Excluir
          </button>
        </div>
      </div>
    </div>

    <ConfirmModal
      open={guard.confirming}
      title={DISCARD_TITLE}
      message="Há um comentário não enviado. Deseja descartá-lo?"
      confirmLabel={DISCARD_CONFIRM_LABEL}
      cancelLabel={DISCARD_CANCEL_LABEL}
      danger
      onConfirm={guard.confirmDiscard}
      onCancel={guard.cancelDiscard}
    />
    </>
  );
}
