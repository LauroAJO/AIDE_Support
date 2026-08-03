// Aviso de rascunho recuperado (v2.25.13) — aparece no topo de um formulário
// quando useDraft restaurou dados do localStorage da sessão anterior.
// "Descartar" limpa o rascunho e devolve o formulário ao estado inicial.
export function DraftBanner({ onDiscard, label = 'Rascunho recuperado' }) {
  return (
    <div className="mb-3 flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
      <span>📝 {label}</span>
      <button
        type="button"
        onClick={onDiscard}
        className="ml-auto text-xs text-amber-600 underline hover:text-amber-800"
      >
        Descartar
      </button>
    </div>
  );
}

export default DraftBanner;
