import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Check, Clock, Pencil, Plus, X, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import { formatEuro, formatBrl } from '../../lib/time';
import Avatar from '../shared/Avatar';
import LoadingSpinner from '../shared/LoadingSpinner';

function monthLabel(month) {
  const [y, m] = month.split('-');
  return `${m}/${y}`;
}
function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatRateTime(unix) {
  if (!unix) return '';
  return new Date(unix * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Build a YYYY-MM-DD / HH:MM pair from a unix timestamp (local).
function splitTs(unix) {
  if (!unix) return { date: todayStr(), time: '09:00' };
  const d = new Date(unix * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function durationLabel(sec) {
  const h = Math.floor((sec || 0) / 3600);
  const m = Math.floor(((sec || 0) % 3600) / 60);
  const s = Math.floor((sec || 0) % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function PaymentPage() {
  const user = useStore((s) => s.user);
  const summary = useStore((s) => s.paymentSummary);
  const setSummary = useStore((s) => s.setPaymentSummary);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [alice, setAlice] = useState(null);
  const [lauro, setLauro] = useState(null);
  const [editRate, setEditRate] = useState(null); // { taskId, type, value }
  const [editEntry, setEditEntry] = useState(null); // time_entry payload
  const [showManual, setShowManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [defaultRateDraft, setDefaultRateDraft] = useState('');
  const [savingDefaultRate, setSavingDefaultRate] = useState(false);
  const [defaultRateMsg, setDefaultRateMsg] = useState(null);

  const isOwner = user?.role === 'owner';

  const load = async (m) => {
    setLoading(true);
    try {
      const [sum, users] = await Promise.all([
        apiFetch(`/api/payment/summary?month=${m}`),
        apiFetch('/api/users'),
      ]);
      setSummary(sum);
      setAlice(users.find((u) => u.role === 'assistant') || null);
      setLauro(users.find((u) => u.role === 'owner') || null);
      // Seed do editor: taxa padrão é sempre a de Alice (assistant), vindo do
      // summary.defaultRate. NÃO depende de quem está logado.
      setDefaultRateDraft(String(sum.defaultRate ?? 0));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const saveDefaultRate = async () => {
    setSavingDefaultRate(true);
    setDefaultRateMsg(null);
    try {
      const rate = Number(defaultRateDraft) || 0;
      // Endpoint dedicado escreve em ALICE.availability.hourly_rate_brl
      // independente do papel do usuário logado.
      await apiFetch('/api/payment/default-rate', {
        method: 'PUT',
        body: JSON.stringify({ rate }),
      });
      setDefaultRateMsg({ kind: 'ok', text: 'Taxa padrão salva.' });
      load(month); // Recarrega o summary com a nova taxa.
    } catch (e) {
      setDefaultRateMsg({ kind: 'err', text: `Falha: ${String((e && e.message) || e).slice(0, 200)}` });
    } finally {
      setSavingDefaultRate(false);
    }
  };

  const togglePaid = async (entry) => {
    await apiFetch(`/api/payment/entries/${entry.id}/paid`, { method: 'PUT', body: JSON.stringify({ paid: !entry.paid }) });
    load(month);
  };
  const markAllPaid = async () => {
    const pending = summary.entries.filter((e) => !e.paid);
    for (const e of pending) {
      // eslint-disable-next-line no-await-in-loop
      await apiFetch(`/api/payment/entries/${e.id}/paid`, { method: 'PUT', body: JSON.stringify({ paid: true }) });
    }
    load(month);
  };
  const saveRate = async () => {
    await apiFetch(`/api/tasks/${editRate.taskId}`, {
      method: 'PUT',
      body: JSON.stringify({ rate_type: editRate.type, rate_value: Number(editRate.value) || 0 }),
    });
    setEditRate(null);
    load(month);
  };

  const deleteEntry = async (entryId) => {
    if (!window.confirm('Excluir esta entrada? Esta ação não pode ser desfeita.')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/timer/entries/${entryId}`, { method: 'DELETE' });
      load(month);
    } finally {
      setBusy(false);
    }
  };

  const applyDefaultRateToAll = async () => {
    if (!summary?.defaultRate) return;
    const targets = (summary.entries || []).filter(
      (e) => (!e.entryRate || e.entryRate === 0) && e.rateSource === 'default'
    );
    if (targets.length === 0) return;
    if (!window.confirm(`Aplicar taxa padrão (R$ ${summary.defaultRate.toFixed(2)}/h) a ${targets.length} entrada(s)?`)) return;
    setBusy(true);
    try {
      for (const e of targets) {
        // eslint-disable-next-line no-await-in-loop
        await apiFetch(`/api/timer/entries/${e.id}`, {
          method: 'PUT',
          body: JSON.stringify({ hourly_rate: summary.defaultRate }),
        });
      }
      load(month);
    } finally {
      setBusy(false);
    }
  };

  const generatePdf = async () => {
    const report = await apiFetch(`/api/reports/monthly?month=${month}`);
    openPrintWindow(report, alice, lauro, isOwner);
  };

  if (loading || !summary) return <div className="h-full"><LoadingSpinner label="Carregando pagamentos..." /></div>;

  const brlRate = summary.brlRate || 0;
  const rateTime = formatRateTime(summary.brlRateUpdatedAt);
  const defaultRate = summary.defaultRate || 0;
  const entriesUsingDefault = (summary.entries || []).filter(
    (e) => e.rateSource === 'default' && (!e.entryRate || e.entryRate === 0)
  ).length;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-ink">Pagamentos</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-lg border border-line p-1.5 text-ink2 hover:bg-surface2"><ChevronLeft className="h-4 w-4" /></button>
            <span className="w-20 text-center text-sm font-medium text-ink">{monthLabel(month)}</span>
            <button onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-lg border border-line p-1.5 text-ink2 hover:bg-surface2"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <button onClick={generatePdf} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover">
            <FileText className="h-4 w-4" /> Gerar Relatório PDF
          </button>
          <button onClick={markAllPaid} className="rounded-lg px-3 py-2 text-sm font-medium text-white" style={{ background: '#22C55E' }}>
            Marcar todos como pagos
          </button>
        </div>
      </div>

      {/* Alice info */}
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
        <Avatar user={alice || {}} size={48} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-ink">{alice?.name || 'Alice'}</div>
          {summary.alicePixKey ? (
            <div className="text-xs text-ink2">
              PIX ({summary.alicePixKeyType || '—'}): <span className="font-medium text-ink">{summary.alicePixKey}</span>
              {summary.aliceBankName && <> · {summary.aliceBankName}</>}
            </div>
          ) : (
            <div className="text-xs" style={{ color: '#F59E0B' }}>Alice não cadastrou chave PIX</div>
          )}
        </div>
        <a href="/profile" className="text-xs text-accent hover:underline">Editar dados → Perfil</a>
      </div>

      {/* Editor da taxa padrão — único local. Escreve em Alice.hourly_rate_brl
          via /api/payment/default-rate independente do papel do usuário logado. */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[200px]">
            <span className="mb-1 block text-xs font-medium text-ink2">
              Taxa padrão de {alice?.name?.split(' ')[0] || 'Alice'} (R$/h)
            </span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={defaultRateDraft}
              onChange={(e) => setDefaultRateDraft(e.target.value)}
              placeholder="0.00"
              className="input"
            />
          </label>
          <button
            onClick={saveDefaultRate}
            disabled={savingDefaultRate}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {savingDefaultRate ? 'Salvando...' : 'Salvar taxa padrão'}
          </button>
          {defaultRateMsg && (
            <span
              className={`text-xs ${
                defaultRateMsg.kind === 'ok' ? 'text-emerald-600' : 'text-danger'
              }`}
            >
              {defaultRateMsg.text}
            </span>
          )}
          <p className="basis-full text-[11px] text-muted">
            Aplicada como padrão a novas entradas de tempo sem taxa explícita.
            {defaultRate > 0
              ? <> Valor atual: <span className="font-medium text-ink2">R$ {defaultRate.toFixed(2)}/h</span>.</>
              : <> Ainda não configurada — entradas sem taxa explícita totalizam R$ 0,00.</>}
          </p>
        </div>
      </div>

      {/* Exchange rate banner — owner only */}
      {isOwner && brlRate > 0 && (
        <div className="rounded-lg border border-line bg-surface2 px-3 py-2 text-xs text-ink2">
          Cotação: <span className="font-medium text-ink">1 BRL = €{brlRate.toFixed(4)}</span>
          {rateTime && <span className="text-muted"> · atualizado {rateTime}</span>}
        </div>
      )}

      {/* Apply-default banner */}
      {entriesUsingDefault > 0 && defaultRate > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs"
             style={{ background: 'rgba(99,102,241,0.06)', color: '#3730A3' }}>
          <span>
            {entriesUsingDefault} entrada(s) usando a taxa padrão de R$ {defaultRate.toFixed(2)}/h.
          </span>
          <button
            onClick={applyDefaultRateToAll}
            disabled={busy}
            className="rounded-md border border-accent/40 bg-surface px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/10 disabled:opacity-60"
          >
            Aplicar taxa padrão a todas
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card label="Total horas" value={`${summary.totalHours}h`} />
        <DualCard
          label="Total devido"
          brl={summary.totalDue}
          eur={summary.totalDueEur}
          isOwner={isOwner}
        />
        <DualCard
          label="Total pago"
          brl={summary.totalPaid}
          eur={summary.totalPaidEur}
          isOwner={isOwner}
        />
        <DualCard
          label="Saldo pendente"
          brl={summary.balance}
          eur={summary.balanceEur}
          isOwner={isOwner}
          danger={summary.balance > 0}
        />
      </div>

      {/* Entries */}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface p-4">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-line text-muted">
              <th className="py-2 pr-2 font-medium">Tarefa</th>
              <th className="py-2 pr-2 font-medium">Projeto</th>
              <th className="py-2 pr-2 font-medium">Tipo</th>
              <th className="py-2 pr-2 font-medium">Taxa</th>
              <th className="py-2 pr-2 font-medium">Horas</th>
              <th className="py-2 pr-2 font-medium">Valor (R$)</th>
              {isOwner && <th className="py-2 pr-2 font-medium">Valor (€)</th>}
              <th className="py-2 pr-2 font-medium">Pago</th>
              <th className="py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {summary.entries.length === 0 ? (
              <tr><td colSpan={isOwner ? 9 : 8} className="py-6 text-center text-muted">Nenhum registro neste mês.</td></tr>
            ) : (
              summary.entries.map((e) => (
                <tr key={e.id} className="border-b border-line/60 text-ink">
                  <td className="py-2 pr-2">{e.taskTitle}</td>
                  <td className="py-2 pr-2 text-ink2">{e.projectName || '—'}</td>
                  <td className="py-2 pr-2">{e.rateType === 'fixed' ? 'Fixo' : 'Por hora'}</td>
                  <td className="py-2 pr-2">
                    {e.rateType === 'fixed'
                      ? `${formatBrl(e.rateValue)} (fixo)`
                      : `${formatBrl(e.rateValue)}/h`}
                    {e.rateSource === 'default' && (
                      <span className="ml-1 text-[10px] text-muted">(padrão)</span>
                    )}
                  </td>
                  <td className="py-2 pr-2">{e.rateType === 'fixed' ? '—' : `${e.hours}h`}</td>
                  <td className="py-2 pr-2 font-medium">{formatBrl(e.amountBrl ?? e.amount)}</td>
                  {isOwner && (
                    <td className="py-2 pr-2 text-ink2">{formatEuro(e.amountEur ?? 0)}</td>
                  )}
                  <td className="py-2 pr-2">
                    <button onClick={() => togglePaid(e)} title={e.paid ? 'Pago' : 'Pendente'}>
                      {e.paid ? <Check className="h-4 w-4" style={{ color: '#22C55E' }} /> : <Clock className="h-4 w-4" style={{ color: '#F59E0B' }} />}
                    </button>
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditEntry({
                          id: e.id,
                          taskTitle: e.taskTitle,
                          rate: e.entryRate || e.rateValue || defaultRate,
                          notes: e.notes || '',
                          ...splitTs(e.started_at),
                          endDate: splitTs(e.ended_at || e.started_at).date,
                          endTime: splitTs(e.ended_at || (e.started_at + (e.duration_seconds || 0))).time,
                        })}
                        className="rounded-md border border-line p-1 text-ink2 hover:bg-surface2"
                        title="Editar entrada"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      {e.taskId && (
                        <button
                          onClick={() => setEditRate({ taskId: e.taskId, type: e.rateType, value: e.rateValue })}
                          className="rounded-md border border-line p-1 text-ink2 hover:bg-surface2"
                          title="Editar taxa da tarefa"
                        >
                          R$
                        </button>
                      )}
                      <button
                        onClick={() => deleteEntry(e.id)}
                        disabled={busy}
                        className="rounded-md border border-line p-1 text-danger hover:bg-danger/10 disabled:opacity-60"
                        title="Excluir entrada"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => setShowManual(true)}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2 hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar tempo manualmente
          </button>
        </div>
      </div>

      {editRate && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={() => setEditRate(null)}>
          <div className="w-full max-w-xs rounded-xl border border-line bg-surface p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-sm font-bold text-ink">Editar taxa da tarefa</h3>
            <label className="mb-2 block">
              <span className="mb-1 block text-xs text-ink2">Tipo</span>
              <select value={editRate.type} onChange={(e) => setEditRate({ ...editRate, type: e.target.value })} className="input">
                <option value="inherit">Herdar</option>
                <option value="hourly">Por hora</option>
                <option value="fixed">Fixo</option>
              </select>
            </label>
            <label className="mb-3 block">
              <span className="mb-1 block text-xs text-ink2">Valor (R$)</span>
              <input type="number" min="0" step="0.5" value={editRate.value} onChange={(e) => setEditRate({ ...editRate, value: e.target.value })} className="input" />
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditRate(null)} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink2">Cancelar</button>
              <button onClick={saveRate} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {editEntry && (
        <EntryEditModal
          entry={editEntry}
          defaultRate={defaultRate}
          onClose={() => setEditEntry(null)}
          onSaved={() => { setEditEntry(null); load(month); }}
        />
      )}

      {showManual && (
        <ManualEntryModal
          defaultRate={defaultRate}
          onClose={() => setShowManual(false)}
          onSaved={() => {
            setShowManual(false);
            load(month);
          }}
        />
      )}
    </div>
  );
}

function Card({ label, value, danger }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="text-[10px] text-muted">{label}</div>
      <div className="text-lg font-bold" style={{ color: danger ? '#EF4444' : '#1A1814' }}>{value}</div>
    </div>
  );
}

function DualCard({ label, brl, eur, isOwner, danger }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="text-[10px] text-muted">{label}</div>
      <div className="text-lg font-bold" style={{ color: danger ? '#EF4444' : '#1A1814' }}>
        {formatBrl(brl)}
      </div>
      {isOwner && (
        <div className="mt-0.5 text-xs text-ink2">{formatEuro(eur || 0)}</div>
      )}
    </div>
  );
}

function calcDurationSeconds(date, startTime, endDate, endTime) {
  const start = new Date(`${date}T${startTime}`);
  const end = new Date(`${endDate || date}T${endTime}`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

function EntryEditModal({ entry, defaultRate, onClose, onSaved }) {
  const [form, setForm] = useState(entry);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const duration = calcDurationSeconds(form.date, form.time, form.endDate, form.endTime);

  const save = async () => {
    setError('');
    if (duration <= 0) return setError('Hora final deve ser depois da inicial.');
    setBusy(true);
    try {
      const startedAt = new Date(`${form.date}T${form.time}`).toISOString();
      const endedAt = new Date(`${form.endDate || form.date}T${form.endTime}`).toISOString();
      await apiFetch(`/api/timer/entries/${form.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          started_at: startedAt,
          ended_at: endedAt,
          duration_seconds: duration,
          hourly_rate: Number(form.rate) || 0,
          notes: form.notes,
        }),
      });
      onSaved();
    } catch (e) {
      setError(String((e && e.message) || e) || 'Erro ao salvar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface shadow-soft" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">Editar entrada</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>
          )}
          <div className="rounded-lg bg-surface2 px-3 py-2 text-xs">
            <span className="text-muted">Tarefa: </span>
            <span className="font-medium text-ink">{form.taskTitle || '—'}</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink2">Data</span>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value, endDate: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink2">Início</span>
              <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink2">Fim</span>
              <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="input" />
            </label>
          </div>

          <div className="rounded-lg bg-surface2 px-3 py-2 text-xs text-ink2">
            Duração: <span className="font-semibold text-ink">{durationLabel(duration)}</span>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink2">
              Taxa (R$/h){defaultRate > 0 ? ` — padrão R$ ${defaultRate.toFixed(2)}` : ''}
            </span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.rate}
              onChange={(e) => setForm({ ...form, rate: e.target.value })}
              className="input"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink2">Observações</span>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input resize-y" />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button onClick={onClose} className="rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
          >
            {busy ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualEntryModal({ defaultRate, onClose, onSaved }) {
  const tasks = useStore((s) => s.tasks);
  const setTasks = useStore((s) => s.setTasks);
  const [search, setSearch] = useState('');
  const [taskId, setTaskId] = useState('');
  const [date, setDate] = useState(todayStr());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [rate, setRate] = useState(defaultRate || 0);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (tasks.length > 0) return;
    apiFetch('/api/tasks').then(setTasks).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks
      .filter((t) => !q || t.title.toLowerCase().includes(q))
      .slice(0, 30);
  }, [tasks, search]);

  const durationSeconds = calcDurationSeconds(date, startTime, date, endTime);

  const save = async () => {
    setError('');
    if (!taskId) return setError('Selecione uma tarefa.');
    if (durationSeconds <= 0) return setError('Hora final deve ser depois da inicial.');
    setBusy(true);
    try {
      const startedAt = new Date(`${date}T${startTime}`).toISOString();
      const endedAt = new Date(`${date}T${endTime}`).toISOString();
      await apiFetch('/api/timer/start', {
        method: 'POST',
        body: JSON.stringify({
          task_id: taskId,
          started_at: startedAt,
          ended_at: endedAt,
          duration_seconds: durationSeconds,
          hourly_rate: Number(rate) || 0,
          notes,
          manual: true,
        }),
      });
      onSaved();
    } catch (e) {
      setError(String((e && e.message) || e) || 'Erro ao salvar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface shadow-soft" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">Adicionar tempo manualmente</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink2">Tarefa</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tarefa..."
              className="input"
            />
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              size={Math.min(6, Math.max(3, filtered.length))}
              className="input mt-1 w-full"
            >
              {filtered.length === 0 && <option value="">Nenhuma tarefa</option>}
              {filtered.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}{t.status === 'done' ? ' · concluída' : ''}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink2">Data</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink2">Início</span>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink2">Fim</span>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input" />
            </label>
          </div>

          <div className="rounded-lg bg-surface2 px-3 py-2 text-xs text-ink2">
            Duração calculada: <span className="font-semibold text-ink">{durationLabel(durationSeconds)}</span>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink2">
              Taxa (R$/h){defaultRate > 0 ? ` — padrão R$ ${defaultRate.toFixed(2)}` : ''}
            </span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="input"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink2">Observações</span>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="input resize-y" />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button onClick={onClose} className="rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
          >
            {busy ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function openPrintWindow(report, alice, lauro, isOwner) {
  const fmt = (n) => `R$ ${(Number(n) || 0).toFixed(2).replace('.', ',')}`;
  const fmtEur = (n) => `€${(Number(n) || 0).toFixed(2)}`;
  const rows = (report.entries || [])
    .map((e) => `<tr><td>${e.taskTitle}</td><td>${e.projectName || '—'}</td><td>${e.rateType === 'fixed' ? 'Fixo' : 'Por hora'}</td><td>${e.hours || 0}</td><td>${fmt(e.amountBrl ?? e.amount)}</td>${isOwner ? `<td>${fmtEur(e.amountEur || 0)}</td>` : ''}<td>${e.paid ? 'Pago' : 'Pendente'}</td></tr>`)
    .join('');
  const tasks = (report.completedTasks || [])
    .map((t) => `<tr><td>${t.title}</td><td>${t.assignedUser ? t.assignedUser.name : '—'}</td></tr>`)
    .join('');
  const [y, m] = report.month.split('-');
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>AIDE — Relatório de Pagamento</title>
<style>
  body { font-family: Arial, sans-serif; color: #1A1814; padding: 32px; }
  h1 { color: #6366f1; } h2 { margin-top: 24px; font-size: 15px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
  th, td { border: 1px solid #E8E3DB; padding: 6px 8px; text-align: left; }
  th { background: #F3F0EB; }
  .muted { color: #6B6560; font-size: 12px; }
  .footer { margin-top: 32px; color: #9E9890; font-size: 11px; }
  @media print { body { padding: 0; } button { display: none; } }
</style></head><body>
  <h1>AIDE — Relatório de Pagamento</h1>
  <div class="muted">Mês de ${m}/${y}</div>
  <div class="muted">Gerado em ${new Date().toLocaleString('pt-BR')}</div>
  ${isOwner && report.brlRate ? `<div class="muted">Cotação: 1 BRL = €${Number(report.brlRate).toFixed(4)}</div>` : ''}

  <h2>Alice (Assistente)</h2>
  <div class="muted">${alice?.name || 'Alice'} · ${alice?.email || ''}<br>PIX (${report.alicePixKeyType || '—'}): ${report.alicePixKey || '—'} · ${report.aliceBankName || ''}</div>

  <h2>Lauro (Proprietário)</h2>
  <div class="muted">${lauro?.name || 'Lauro'} · ${lauro?.email || ''}</div>

  <h2>Resumo</h2>
  <table><tr><th>Total horas</th><th>Total devido (R$)</th><th>Total pago (R$)</th><th>Saldo (R$)</th>${isOwner ? '<th>Saldo (€)</th>' : ''}</tr>
  <tr><td>${report.totalHours}h</td><td>${fmt(report.totalDue)}</td><td>${fmt(report.totalPaid)}</td><td>${fmt(report.balance)}</td>${isOwner ? `<td>${fmtEur(report.balanceEur || 0)}</td>` : ''}</tr></table>

  <h2>Registros</h2>
  <table><tr><th>Tarefa</th><th>Projeto</th><th>Tipo</th><th>Horas</th><th>Valor (R$)</th>${isOwner ? '<th>Valor (€)</th>' : ''}<th>Pago</th></tr>${rows || `<tr><td colspan="${isOwner ? 7 : 6}">Nenhum</td></tr>`}</table>

  <h2>Tarefas concluídas no mês</h2>
  <table><tr><th>Tarefa</th><th>Responsável</th></tr>${tasks || '<tr><td colspan="2">Nenhuma</td></tr>'}</table>

  <div class="footer">Documento gerado pelo AIDE</div>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 500);
}
