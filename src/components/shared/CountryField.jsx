import { useState } from 'react';
import { COUNTRY_OPTIONS, normalizeCountry } from '../../lib/countries';

// Seletor de país compartilhado por pessoas (network_people.country) e
// organizações (market_organizations.country) — v2.25.15.
//
// A lista cobre os países do ecossistema (Holanda e Brasil à frente); qualquer
// outro valor entra por "🌐 Outro", um campo livre. Como o campo das
// organizações sempre foi texto livre, um valor fora da lista ("Portugal",
// "Espanha"...) abre já no modo livre em vez de ser silenciosamente perdido.
//
// onChange   — a cada digitação/seleção (atualiza o formulário).
// onCommit   — opcional, quando o valor "assenta" (troca no select ou blur do
//              campo livre). Usado por telas que salvam sozinhas, como a
//              Visão Geral da organização.
const OTHER = '__other__';

export default function CountryField({ label = 'País', value, onChange, onCommit }) {
  const code = normalizeCountry(value);
  const known = COUNTRY_OPTIONS.some((c) => c.code === code);
  const [otherChosen, setOtherChosen] = useState(false);
  const isOther = otherChosen || (!!code && !known);
  const selectValue = known ? code : (isOther ? OTHER : '');

  const pick = (v) => {
    if (v === OTHER) {
      setOtherChosen(true);
      onChange('');
      return;
    }
    setOtherChosen(false);
    onChange(v);
    if (onCommit) onCommit(v);
  };

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink2">{label}</span>
      <select value={selectValue} onChange={(e) => pick(e.target.value)} className="input">
        <option value="">— Não informado (assume Holanda) —</option>
        {COUNTRY_OPTIONS.map((c) => (
          <option key={c.code} value={c.code}>{`${c.flag} ${c.label} (${c.code})`}</option>
        ))}
        <option value={OTHER}>🌐 Outro (campo livre)</option>
      </select>
      {isOther && (
        <input
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onCommit && onCommit(value || '')}
          placeholder="Código ou nome do país (ex.: PT, Portugal)"
          className="input mt-1.5"
        />
      )}
    </label>
  );
}
