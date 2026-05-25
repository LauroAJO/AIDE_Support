// Time / currency formatting helpers.

const pad = (n) => String(n).padStart(2, '0');

// Seconds → HH:MM:SS (for the live counter).
export function formatHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

// Seconds → "Xh Ymin" (or "Ymin" when under an hour).
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h === 0 ? `${m}min` : `${h}h ${m}min`;
}

// Euro currency — Lauro is in the Netherlands. Format as €X.XX.
export function formatEuro(value) {
  return `€${(Number(value) || 0).toFixed(2)}`;
}

// Brazilian real — Alice's local currency. R$ X,XX (BR uses comma decimals).
export function formatBrl(value) {
  return `R$ ${(Number(value) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Unix seconds → DD/MM/YYYY HH:MM.
export function formatDateTime(unixSeconds) {
  if (!unixSeconds) return '—';
  return new Date(unixSeconds * 1000).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Unix seconds → HH:MM.
export function formatTimeShort(unixSeconds) {
  if (!unixSeconds) return '—';
  return new Date(unixSeconds * 1000).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
