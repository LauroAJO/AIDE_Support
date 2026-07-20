// Inferência de país para itens do Hub (Vagas PhD / Empregos). Compartilhado
// entre VagasPhDPage.jsx e EmpregoPage.jsx, que usam exatamente a mesma
// prioridade.
//
// Prioridade:
//   1. item.country gravado manualmente no banco (D1) -- prioridade máxima.
//   2. source_name indica um portal exclusivamente holandês (AcademicTransfer
//      ou Techniekwerkt) -> "NL".
//   3. source_name indica academics.de (portal exclusivamente alemão) -> "DE".
//   4. source_name indica jobs.ac.uk (portal britânico, mas lista vagas
//      globais) -> "UK" como DEFAULT — sobrescrito pelo passo 5 se o
//      título/resumo trouxer uma pista mais específica de outro país.
//   5. Termos de país/cidade no título + resumo (também usado como fallback
//      geral para fontes fora dos passos 2-4, ex.: jobRxiv).
//   6. Nenhuma pista encontrada -> "Outro".

export const COUNTRIES = [
  { code: 'NL', label: 'Países Baixos', color: 'bg-orange-100 text-orange-700',
    terms: ['netherlands', 'holland', 'holanda', 'nederland', 'delft', 'amsterdam', 'rotterdam', 'eindhoven', 'utrecht', 'groningen', 'twente', 'wageningen', 'leiden', 'maastricht'] },
  { code: 'DE', label: 'Alemanha', color: 'bg-neutral-200 text-neutral-800',
    terms: ['germany', 'deutschland', 'berlin', 'munich', 'münchen', 'hamburg', 'heidelberg', 'karlsruhe', 'dresden', 'cologne'] },
  { code: 'BE', label: 'Bélgica', color: 'bg-yellow-100 text-yellow-800',
    terms: ['belgium', 'belgië', 'belgique', 'leuven', 'ghent', 'gent', 'brussels', 'bruxelles', 'antwerp', 'liège', 'liege'] },
  { code: 'DK', label: 'Dinamarca', color: 'bg-red-100 text-red-700',
    terms: ['denmark', 'danmark', 'copenhagen', 'københavn', 'lyngby', 'aarhus', 'odense', 'dtu'] },
  { code: 'SE', label: 'Suécia', color: 'bg-sky-100 text-sky-700',
    terms: ['sweden', 'sverige', 'stockholm', 'gothenburg', 'göteborg', 'chalmers', 'kth', 'lund', 'uppsala'] },
  { code: 'CH', label: 'Suíça', color: 'bg-rose-100 text-rose-700',
    terms: ['switzerland', 'schweiz', 'suisse', 'zurich', 'zürich', 'geneva', 'lausanne', 'basel', 'eth', 'epfl', 'bern'] },
  { code: 'UK', label: 'Reino Unido', color: 'bg-indigo-100 text-indigo-700',
    terms: ['united kingdom', 'england', 'scotland', 'wales', 'london', 'edinburgh', 'manchester', 'cambridge', 'oxford', 'bristol', 'sheffield', 'birmingham', 'glasgow', 'newcastle', 'leeds', 'uk home fee', 'british'] },
];

export const OTHER_COUNTRY = { code: 'Outro', label: 'Outro', color: 'bg-surface2 text-ink2' };

export function countryMeta(code) {
  return COUNTRIES.find((c) => c.code === code) || OTHER_COUNTRY;
}

// Portais exclusivamente nacionais (passos 2-3) e o portal britânico global
// cujo default e' UK (passo 4).
const NL_ONLY_SOURCES = ['academictransfer', 'techniekwerkt'];
const DE_ONLY_SOURCES = ['academics.de'];
const UK_DEFAULT_SOURCES = ['jobs.ac.uk'];

export function detectCountry(item) {
  // 1) País gravado manualmente no banco.
  if (item.country) return countryMeta(item.country);

  const sourceName = (item.source_name || '').toLowerCase();

  // 2) AcademicTransfer / Techniekwerkt -- exclusivamente holandeses.
  if (NL_ONLY_SOURCES.some((s) => sourceName.includes(s))) return countryMeta('NL');

  // 3) academics.de -- exclusivamente alemão.
  if (DE_ONLY_SOURCES.some((s) => sourceName.includes(s))) return countryMeta('DE');

  // 5) Pistas de país/cidade no título + resumo. Verificado ANTES de aplicar
  //    o default do passo 4 (jobs.ac.uk) porque esse default é sobrescrevível
  //    -- uma vaga do jobs.ac.uk sediada na Holanda deve virar "NL", não "UK".
  const content = `${item.title || ''} ${item.resumo || ''}`.toLowerCase();
  for (const c of COUNTRIES) {
    if (c.terms.some((t) => content.includes(t))) return c;
  }

  // 4) jobs.ac.uk sem pista melhor no conteúdo -- default "UK".
  if (UK_DEFAULT_SOURCES.some((s) => sourceName.includes(s))) return countryMeta('UK');

  // 6) Nenhuma pista encontrada.
  return OTHER_COUNTRY;
}
