import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Check, Clock, Pencil } from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import { formatEuro, formatDuration } from '../../lib/time';
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

export default function PaymentPage() {
  const summary = useStore((s) => s.paymentSummary);
  const setSummary = useStore((s) => s.setPaymentSummary);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [alice, setAlice] = useState(null);
  const [lauro, setLauro] = useState(null);
  const [editRate, setEditRate] = useState(null); // { taskId, type, value }

  const load = async (m) => {
    setLoading(true);
    try {
      const [sum, users] = await Promise.all([apiFetch(`/api/payment/summary?month=${m}`), apiFetch('/api/users')]);
      setSummary(sum);
      setAlice(users.find((u) => u.role === 'assistant') || null);
      setLauro(users.find((u) => u.role === 'owner') || null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

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

  const generatePdf = async () => {
    const report = await apiFetch(`/api/reports/monthly?month=${month}`);
    openPrintWindow(report, alice, lauro);
  };

  if (loading || !summary) return <div className="h-full"><LoadingSpinner label="Carregando pagamentos..." /></div>;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card label="Total horas" value={`${summary.totalHours}h`} />
        <Card label="Total devido" value={formatEuro(summary.totalDue)} />
        <Card label="Total pago" value={formatEuro(summary.totalPaid)} />
        <Card label="Saldo pendente" value={formatEuro(summary.balance)} danger={summary.balance > 0} />
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
              <th className="py-2 pr-2 font-medium">Valor</th>
              <th className="py-2 pr-2 font-medium">Pago</th>
              <th className="py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {summary.entries.length === 0 ? (
              <tr><td colSpan={8} className="py-6 text-center text-muted">Nenhum registro neste mês.</td></tr>
            ) : (
              summary.entries.map((e) => (
                <tr key={e.id} className="border-b border-line/60 text-ink">
                  <td className="py-2 pr-2">{e.taskTitle}</td>
                  <td className="py-2 pr-2 text-ink2">{e.projectName || '—'}</td>
                  <td className="py-2 pr-2">{e.rateType === 'fixed' ? 'Fixo' : 'Por hora'}</td>
                  <td className="py-2 pr-2">{e.rateType === 'fixed' ? `${formatEuro(e.rateValue)} (fixo)` : `${formatEuro(e.rateValue)}/h`}</td>
                  <td className="py-2 pr-2">{e.rateType === 'fixed' ? '—' : `${e.hours}h`}</td>
                  <td className="py-2 pr-2 font-medium">{formatEuro(e.amount)}</td>
                  <td className="py-2 pr-2">
                    <button onClick={() => togglePaid(e)} title={e.paid ? 'Pago' : 'Pendente'}>
                      {e.paid ? <Check className="h-4 w-4" style={{ color: '#22C55E' }} /> : <Clock className="h-4 w-4" style={{ color: '#F59E0B' }} />}
                    </button>
                  </td>
                  <td className="py-2">
                    {e.taskId && (
                      <button onClick={() => setEditRate({ taskId: e.taskId, type: e.rateType, value: e.rateValue })} className="text-ink2 hover:text-ink" title="Editar taxa">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
              <span className="mb-1 block text-xs text-ink2">Valor (€)</span>
              <input type="number" min="0" step="0.5" value={editRate.value} onChange={(e) => setEditRate({ ...editRate, value: e.target.value })} className="input" />
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditRate(null)} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink2">Cancelar</button>
              <button onClick={saveRate} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white">Salvar</button>
            </div>
          </div>
        </div>
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

function openPrintWindow(report, alice, lauro) {
  const rows = (report.entries || [])
    .map((e) => `<tr><td>${e.taskTitle}</td><td>${e.projectName || '—'}</td><td>${e.rateType === 'fixed' ? 'Fixo' : 'Por hora'}</td><td>${e.hours || 0}</td><td>€${(e.amount || 0).toFixed(2)}</td><td>${e.paid ? 'Pago' : 'Pendente'}</td></tr>`)
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

  <h2>Alice (Assistente)</h2>
  <div class="muted">${alice?.name || 'Alice'} · ${alice?.email || ''}<br>PIX (${report.alicePixKeyType || '—'}): ${report.alicePixKey || '—'} · ${report.aliceBankName || ''}</div>

  <h2>Lauro (Proprietário)</h2>
  <div class="muted">${lauro?.name || 'Lauro'} · ${lauro?.email || ''}</div>

  <h2>Resumo</h2>
  <table><tr><th>Total horas</th><th>Total devido</th><th>Total pago</th><th>Saldo</th></tr>
  <tr><td>${report.totalHours}h</td><td>€${report.totalDue.toFixed(2)}</td><td>€${report.totalPaid.toFixed(2)}</td><td>€${report.balance.toFixed(2)}</td></tr></table>

  <h2>Registros</h2>
  <table><tr><th>Tarefa</th><th>Projeto</th><th>Tipo</th><th>Horas</th><th>Valor</th><th>Pago</th></tr>${rows || '<tr><td colspan="6">Nenhum</td></tr>'}</table>

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
