import { useMemo, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import ConfirmModal from './ConfirmModal';
import { DraftBanner } from './DraftBanner';
import { useDraft } from '../../hooks/useDraft';
import {
  useUnsavedGuard, DISCARD_TITLE, DISCARD_MESSAGE,
  DISCARD_CONFIRM_LABEL, DISCARD_CANCEL_LABEL,
} from '../../hooks/useUnsavedGuard';

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

// Fase 5 (II.1.14.0) — tenta sincronizar automaticamente a partir da URL
// EURAXESS salva no item. Best-effort: o EURAXESS bloqueia a maior parte do
// tráfego automatizado (bot-detection, 403/429 confirmados durante o
// desenvolvimento) — quando falha, o backend grava o motivo em
// euraxess_sync_note e os campos continuam editáveis manualmente.
function EuraxessSyncButton({ itemId, onSynced }) {
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');
  const run = async () => {
    setSyncing(true);
    setMsg('');
    try {
      const r = await apiFetch(`/api/hub/items/${itemId}/enrich-euraxess`, { method: 'POST' });
      if (r.ok) {
        setMsg('Sincronizado.');
        onSynced && onSynced(r);
      } else {
        setMsg(r.error || 'Falha ao sincronizar — preencha manualmente.');
      }
    } catch (e) {
      setMsg(String(e.message || e));
    } finally {
      setSyncing(false);
    }
  };
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-[10px] text-muted">{msg}</span>}
      <button
        type="button"
        onClick={run}
        disabled={syncing}
        className="text-[11px] font-medium text-accent hover:underline disabled:opacity-50"
      >
        {syncing ? 'Sincronizando…' : 'Sincronizar'}
      </button>
    </div>
  );
}

// Modal de edição reutilizável (Vagas PhD / Empregos). `item` traz o item do
// hub_items a editar; `onClose` cancela; `onSaved(updatedItem)` é chamado com
// o item já atualizado pelo backend após um PATCH bem-sucedido — a página que
// usa o modal decide o que fazer (atualizar lista, toast, fechar).
export default function EditItemModal({ item, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Rascunho por item (v2.25.16): os 5 campos viram um objeto só, persistido
  // em `aide-draft-hub-item-<id>`. Os setters abaixo preservam a assinatura
  // antiga, então o JSX não mudou. O modal é montado condicionalmente pelas
  // páginas (Vagas/Empregos), então cada abertura reinicia com o item certo —
  // por isso o useEffect que copiava de `item` saiu: ele sobrescreveria o
  // rascunho recuperado logo no mount.
  const pristine = useMemo(() => ({
    country: item?.country || '',
    area: item?.area || '',
    title: item?.title_override || item?.title || '',
    resumo: item?.resumo_override || item?.resumo || '',
    notes: item?.user_notes || '',
    // Fase 5 (II.1.14.0) — campos EURAXESS, preenchimento manual (a coleta
    // automática é best-effort, ver enrichHubItemFromEuraxess no worker).
    hostInstitution: item?.host_institution || '',
    applicationDeadline: item?.application_deadline || '',
    fundingProgramme: item?.funding_programme || '',
    contractType: item?.contract_type || '',
    euraxessUrl: item?.euraxess_url || '',
  }), [item]);
  const {
    value: form, setValue: setForm, clearDraft, discardDraft, hasDraft,
  } = useDraft(`hub-item-${item?.id || 'new'}`, pristine);

  const {
    country, area, title, resumo, notes,
    hostInstitution, applicationDeadline, fundingProgramme, contractType, euraxessUrl,
  } = form;
  const setField = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setCountry = setField('country');
  const setArea = setField('area');
  const setTitle = setField('title');
  const setResumo = setField('resumo');
  const setNotes = setField('notes');
  const setHostInstitution = setField('hostInstitution');
  const setApplicationDeadline = setField('applicationDeadline');
  const setFundingProgramme = setField('fundingProgramme');
  const setContractType = setField('contractType');
  const setEuraxessUrl = setField('euraxessUrl');

  const isDirty = JSON.stringify(form) !== JSON.stringify(pristine);
  const guard = useUnsavedGuard({
    isDirty, onClose, onDiscard: discardDraft, enabled: !!item,
  });

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
        host_institution: hostInstitution || null,
        application_deadline: applicationDeadline || null,
        funding_programme: fundingProgramme || null,
        contract_type: contractType || null,
        euraxess_url: euraxessUrl || null,
      };
      const updated = await apiFetch(`/api/hub/items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      clearDraft();          // salvo no servidor: o rascunho não serve mais
      onSaved(updated);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    {/* Backdrop SEM onClick (v2.25.16): clicar fora não fecha mais. */}
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-surface shadow-soft">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">Editar item</h2>
          <button
            type="button"
            onClick={guard.requestClose}
            className="rounded-md p-1 text-ink2 hover:bg-surface2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {hasDraft && <DraftBanner onDiscard={discardDraft} />}
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

          {/* Fase 5 (II.1.14.0) — campos EURAXESS. Preenchimento manual;
              "Sincronizar" tenta preencher automaticamente a partir da URL
              (best-effort — o EURAXESS bloqueia a maior parte das tentativas
              automatizadas, ver nota abaixo quando falha). */}
          <div className="rounded-lg border border-line bg-surface2/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">EURAXESS</span>
              {item.id && (
                <EuraxessSyncButton
                  itemId={item.id}
                  onSynced={(patch) => setForm((f) => ({
                    ...f,
                    hostInstitution: patch.host_institution || f.hostInstitution,
                    applicationDeadline: patch.application_deadline || f.applicationDeadline,
                  }))}
                />
              )}
            </div>
            <label className="flex flex-col gap-1 text-xs font-medium text-ink2">
              URL da vaga no EURAXESS
              <input
                type="text"
                value={euraxessUrl}
                onChange={(e) => setEuraxessUrl(e.target.value)}
                placeholder="https://euraxess.ec.europa.eu/jobs/..."
                className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
              />
            </label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-ink2">
                Instituição anfitriã
                <input
                  type="text"
                  value={hostInstitution}
                  onChange={(e) => setHostInstitution(e.target.value)}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-ink2">
                Prazo de candidatura
                <input
                  type="text"
                  value={applicationDeadline}
                  onChange={(e) => setApplicationDeadline(e.target.value)}
                  placeholder="AAAA-MM-DD"
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-ink2">
                Programa de financiamento
                <input
                  type="text"
                  value={fundingProgramme}
                  onChange={(e) => setFundingProgramme(e.target.value)}
                  placeholder="Ex: Horizon Europe, Marie Curie..."
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-ink2">
                Tipo de contrato
                <input
                  type="text"
                  value={contractType}
                  onChange={(e) => setContractType(e.target.value)}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                />
              </label>
            </div>
            {item.euraxess_sync_note && (
              <p className="mt-2 text-[11px] text-muted">{item.euraxess_sync_note}</p>
            )}
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={guard.requestClose}
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

    <ConfirmModal
      open={guard.confirming}
      title={DISCARD_TITLE}
      message={DISCARD_MESSAGE}
      confirmLabel={DISCARD_CONFIRM_LABEL}
      cancelLabel={DISCARD_CANCEL_LABEL}
      danger
      onConfirm={guard.confirmDiscard}
      onCancel={guard.cancelDiscard}
    />
    </>
  );
}
