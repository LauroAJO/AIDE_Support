import { useCallback, useEffect, useRef, useState } from 'react';

// Guarda de fechamento com alterações não salvas (v2.25.13).
//
// Usada por todo modal/editor no lugar de chamar `onClose` direto:
//   - formulário limpo  → fecha normalmente;
//   - formulário sujo   → abre a confirmação "Descartar alterações?"
//     ([Descartar] / [Continuar editando]).
//
// Também registra o Escape: mesma regra (fecha se limpo, confirma se sujo).
// Substitui o clique no backdrop, que fechava tudo sem aviso e era a causa
// principal da perda de dados.
//
// Uso:
//   const guard = useUnsavedGuard({ isDirty, onClose, onDiscard: clearDraft });
//   ...
//   <button onClick={guard.requestClose}>X</button>
//   <ConfirmModal open={guard.confirming} ... onConfirm={guard.confirmDiscard}
//                 onCancel={guard.cancelDiscard} />

// Pilha de modais abertos: só o do topo responde ao Escape. Sem isso, um
// modal aninhado (ex.: o seletor do Drive dentro do TaskEditor) faria o
// Escape disparar nos dois de uma vez — fechando o de cima E abrindo a
// confirmação de descarte do de baixo.
const escapeStack = [];

export const DISCARD_TITLE = 'Descartar alterações?';
export const DISCARD_MESSAGE = 'Tem dados não salvos. Deseja descartar as alterações?';
export const DISCARD_CONFIRM_LABEL = 'Descartar';
export const DISCARD_CANCEL_LABEL = 'Continuar editando';

export function useUnsavedGuard({ isDirty, onClose, onDiscard, enabled = true }) {
  const [confirming, setConfirming] = useState(false);

  const requestClose = useCallback(() => {
    if (isDirty) {
      setConfirming(true);
      return;
    }
    // Nada digitado: não há rascunho útil a preservar.
    if (onDiscard) onDiscard();
    onClose();
  }, [isDirty, onClose, onDiscard]);

  // "Descartar" é uma escolha explícita do usuário — aí sim o rascunho some.
  const confirmDiscard = useCallback(() => {
    setConfirming(false);
    if (onDiscard) onDiscard();
    onClose();
  }, [onClose, onDiscard]);

  const cancelDiscard = useCallback(() => setConfirming(false), []);

  // Entrada na pilha: depende só de `enabled`, para que a posição NÃO mude a
  // cada re-render (se dependesse de `confirming`/`requestClose`, o modal de
  // baixo voltaria para o topo sempre que seu estado mudasse).
  const tokenRef = useRef({});
  useEffect(() => {
    if (!enabled) return undefined;
    const token = tokenRef.current;
    escapeStack.push(token);
    return () => {
      const i = escapeStack.indexOf(token);
      if (i >= 0) escapeStack.splice(i, 1);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      if (escapeStack[escapeStack.length - 1] !== tokenRef.current) return;
      // Escape com a confirmação aberta = "Continuar editando" (não fecha o
      // editor por baixo).
      if (confirming) {
        setConfirming(false);
        return;
      }
      requestClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled, confirming, requestClose]);

  return { confirming, requestClose, confirmDiscard, cancelDiscard };
}

export default useUnsavedGuard;
