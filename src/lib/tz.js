// Conversões de fuso horário usando apenas Intl (sem deps).
// Modelo: cada slot tem hora local de quem o criou (source). O visualizador
// vê tudo no PRÓPRIO fuso. fromZonedTime/toZonedParts cobrem isso.

function partsFromTZ(utcDate, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(utcDate);
  const o = {};
  for (const p of parts) if (p.type !== 'literal') o[p.type] = parseInt(p.value, 10);
  return o;
}

// Offset em ms entre `tz` e UTC no instante `atUTCDate`.
// Positivo = tz à frente de UTC (ex.: Europe/Amsterdam verão = +7_200_000).
function offsetMs(tz, atUTCDate) {
  if (!tz) return 0;
  try {
    const o = partsFromTZ(atUTCDate, tz);
    const tzAsUTC = Date.UTC(o.year, o.month - 1, o.day, o.hour % 24, o.minute, o.second);
    return tzAsUTC - atUTCDate.getTime();
  } catch {
    return 0;
  }
}

// Dado um wall-clock (y,m,d,h,min) em `tz`, devolve o Date UTC correspondente.
// Duas iterações cobrem fronteiras de DST sem perder precisão.
export function fromZonedTime(year, month, day, hour, minute, tz) {
  if (!tz) return new Date(year, month, day, hour, minute);
  let utc = new Date(Date.UTC(year, month, day, hour, minute, 0));
  for (let i = 0; i < 2; i += 1) {
    const off = offsetMs(tz, utc);
    const next = new Date(Date.UTC(year, month, day, hour, minute, 0) - off);
    if (next.getTime() === utc.getTime()) break;
    utc = next;
  }
  return utc;
}

// Converte um Date UTC para componentes wall-clock em `tz`.
export function toZonedParts(utcDate, tz) {
  if (!tz) {
    return {
      year: utcDate.getFullYear(),
      month: utcDate.getMonth(),
      day: utcDate.getDate(),
      hour: utcDate.getHours(),
      minute: utcDate.getMinutes(),
      dateISO: `${utcDate.getFullYear()}-${pad(utcDate.getMonth() + 1)}-${pad(utcDate.getDate())}`,
      hourDecimal: utcDate.getHours() + utcDate.getMinutes() / 60,
    };
  }
  const o = partsFromTZ(utcDate, tz);
  const hour = (o.hour || 0) % 24;
  return {
    year: o.year,
    month: o.month - 1,
    day: o.day,
    hour,
    minute: o.minute,
    dateISO: `${o.year}-${pad(o.month)}-${pad(o.day)}`,
    hourDecimal: hour + (o.minute || 0) / 60,
  };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// Detecta o fuso do browser. Pode falhar em ambientes antigos.
export function detectBrowserTZ() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

// Converte "HH:MM" para hora decimal (9.5 = 09:30).
export function hhmmToHours(s) {
  if (!s) return 0;
  const [h, m] = s.split(':').map(Number);
  return (h || 0) + (m || 0) / 60;
}

// Lista compacta de fusos comuns para o dropdown do ProfilePage.
export const COMMON_TIMEZONES = [
  'Europe/Amsterdam',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Berlin',
  'Europe/Paris',
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Fortaleza',
  'America/Bahia',
  'America/Recife',
  'America/Belem',
  'America/Cuiaba',
  'America/Boa_Vista',
  'America/Rio_Branco',
  'America/Noronha',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'America/Denver',
  'UTC',
];
