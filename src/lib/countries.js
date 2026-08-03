// Catálogo de países usado por PESSOAS (network_people.country) e
// ORGANIZAÇÕES (market_organizations.country) — Networking, Mercado e Dashboard.
//
// Não confundir com lib/countryDetection.js, que INFERE país de itens do Hub
// (vagas) a partir do portal/título. Aqui o país é um dado gravado à mão, e o
// trabalho é só normalizar (o campo das organizações sempre foi texto livre,
// então há linhas com "NL", "Netherlands", "Holanda", "Brasil"...) e exibir.

export const COUNTRY_OPTIONS = [
  { code: 'NL', flag: '🇳🇱', label: 'Holanda' },
  { code: 'BR', flag: '🇧🇷', label: 'Brasil' },
  { code: 'DE', flag: '🇩🇪', label: 'Alemanha' },
  { code: 'GB', flag: '🇬🇧', label: 'Reino Unido' },
  { code: 'US', flag: '🇺🇸', label: 'EUA' },
  { code: 'FR', flag: '🇫🇷', label: 'França' },
  { code: 'BE', flag: '🇧🇪', label: 'Bélgica' },
  { code: 'CH', flag: '🇨🇭', label: 'Suíça' },
];

// NL é o padrão/assumido do ecossistema (H2 holandês): registro sem país cai
// aqui, tanto no filtro quanto na ausência de bandeira no card.
export const DEFAULT_COUNTRY = 'NL';

// Sinônimos em PT/EN/idioma local → código ISO-3166 alpha-2. Só precisa cobrir
// o que aparece de fato nos dados + o que o usuário digitaria no campo livre.
const ALIASES = {
  nl: 'NL', netherlands: 'NL', 'the netherlands': 'NL', holland: 'NL',
  holanda: 'NL', nederland: 'NL', 'paises baixos': 'NL', 'países baixos': 'NL',
  br: 'BR', brasil: 'BR', brazil: 'BR',
  de: 'DE', germany: 'DE', deutschland: 'DE', alemanha: 'DE',
  gb: 'GB', uk: 'GB', 'united kingdom': 'GB', 'reino unido': 'GB',
  england: 'GB', inglaterra: 'GB', 'great britain': 'GB',
  us: 'US', usa: 'US', 'united states': 'US', eua: 'US', 'estados unidos': 'US',
  fr: 'FR', france: 'FR', franca: 'FR', 'frança': 'FR',
  be: 'BE', belgium: 'BE', belgica: 'BE', 'bélgica': 'BE', belgie: 'BE', 'belgië': 'BE',
  ch: 'CH', switzerland: 'CH', suica: 'CH', 'suíça': 'CH', schweiz: 'CH', suisse: 'CH',
};

// Devolve o código ISO quando reconhece o valor; senão devolve o texto original
// aparado (país "Outro" digitado à mão continua legível). '' quando vazio.
export function normalizeCountry(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  const key = raw.toLowerCase();
  if (ALIASES[key]) return ALIASES[key];
  if (/^[a-z]{2}$/.test(key)) return key.toUpperCase();
  return raw;
}

// Bandeira a partir do código alpha-2 (regional indicator symbols) — funciona
// para qualquer país, não só os do COUNTRY_OPTIONS. '' quando não é um código.
export function countryFlag(value) {
  const code = normalizeCountry(value);
  if (!/^[A-Z]{2}$/.test(code)) return '';
  const known = COUNTRY_OPTIONS.find((c) => c.code === code);
  if (known) return known.flag;
  return String.fromCodePoint(...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

export function countryLabel(value) {
  const code = normalizeCountry(value);
  if (!code) return '';
  const known = COUNTRY_OPTIONS.find((c) => c.code === code);
  return known ? known.label : code;
}

// O que mostrar ao lado do nome num card/lista: bandeira quando existe, senão
// o próprio código/texto como badge. NL (padrão) e vazio não marcam nada.
export function countryMark(value) {
  const code = normalizeCountry(value);
  if (!code || code === DEFAULT_COUNTRY) return null;
  const flag = countryFlag(code);
  return { code, flag, label: countryLabel(code), isFlag: !!flag };
}

export function isBrazilianCountry(value) {
  return normalizeCountry(value) === 'BR';
}

// Filtro dos chips [🌍 Todos] [🇳🇱 Holanda] [🇧🇷 Brasil] [🌐 Outros].
// `country` é o país EFETIVO do registro ('' = não informado).
//   NL     — NL ou sem país (NL é o default/assumido)
//   BR     — BR
//   other  — país informado e diferente de NL/BR
export function matchesCountryFilter(country, filter) {
  if (!filter || filter === 'all') return true;
  const code = normalizeCountry(country);
  if (filter === 'NL') return !code || code === 'NL';
  if (filter === 'BR') return code === 'BR';
  if (filter === 'other') return !!code && code !== 'NL' && code !== 'BR';
  return true;
}
