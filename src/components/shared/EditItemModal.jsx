import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';

// Opções canônicas de país/área para o campo manual (independentes da
// detecção automática por texto usada nos cards). Um select em branco
// ("não definido") significa "não mexer neste campo" — o backend usa
// COALESCE e mantém o valor anterior quando o campo enviado é null.
const COUNTRY_OPTIONS = [
  { value: 'NL', label: 'NL — Holanda' },
  { value: 'DE', label: 'DE — Alemanha' },
  { value: 'BE', label: 'BE — Bélgica' },
  { value: 'DK', label: 'DK — Dinamarca' },
  { value: 'SE', label: 'SE — Suécia' },
  { value: 'CH', label: 'CH — Suíça' },
  { value: 'UK', label: 'UK — Reino Unido' },
  { value: 'Outro', label: 'Outro' },
];

const AREA_OPTIONS = [
  { value: 'h2_energia', label: 'H₂/Energia' },
  { value: 'simulacao', label: 'Simulação/Modelagem' },
  { value: 'processos', label: 'Eng. de Processos' },
  { value: 'ia_digital_twin', label: 'IA/Digital Twin' },
  { value: 'consultoria', label: 'Consultoria' },
  { value: 'pesquisa', label: 'Pesquisa/R&D' },
  { value: 'outro', label: 'Outro' },
];

// Modal de edição reutilizável (Vagas PhD / Empregos). `item` traz o item do
// hub_items a editar; `onClose` cancela; `onSaved(updatedItem)` é chamado com
// o item já atualizado pelo backend após um PATCH bem-sucedido — a página que
// usa o modal decide o que fazer (atualizar lista, toast, fechar).
export default function EditItemModal({ item, onClose, onSaved }) {
  const [country, setCountry] = useState('');
  const [area, setArea] = useState('');
  const [title, setTitle] = useState('');
  const [resumo, setResumo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!item) return;
    setCountry(item.country || '');
    setArea(item.area || '');
    setTitle(item.title_override || item.title || '');
    setResumo(item.resumo_override || item.resumo || '');
    setNotes(item.user_notes || '');
    setError('');
  }, [item]);

  if (!item) return null;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        country: country || null,
        area: area || null,
        user_notes: notes || null,
        title_override: title || null,
        resumo_override: resumo || null,
      };
      const updated = await apiFetch(`/api/hub/items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      onSaved(updated);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-surface shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">Editar item</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-ink2 hover:bg-surface2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-ink2">
              País
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="rounded-lg border border-line bg-surface2 px-2 py-1.5 text-sm text-ink"
              >
                <option value="">— não definido —</option>
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-ink2">
              Área temática
              <select
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className="rounded-lg border border-line bg-surface2 px-2 py-1.5 text-sm text-ink"
              >
                <option value="">— não definido —</option>
                {AREA_OPTIONS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs font-medium text-ink2">
            Título
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg border border-line bg-surface2 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-ink2">
            Resumo
            <textarea
              value={resumo}
              onChange={(e) => setResumo(e.target.value)}
              rows={4}
              className="resize-none rounded-lg border border-line bg-surface2 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-ink2">
            Notas pessoais
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anotações privadas sobre esta vaga..."
              className="resize-none rounded-lg border border-line bg-surface2 px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </label>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink2 transition hover:bg-surface2 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
