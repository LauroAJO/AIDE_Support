import { useCallback, useEffect, useRef, useState } from 'react';

// Persistência de rascunho em localStorage (v2.25.13).
//
// Problema que resolve: qualquer fechamento de modal (acidental, refresh,
// crash da aba, PWA reiniciando) apagava tudo que tinha sido digitado. Agora
// cada formulário grava um rascunho a cada alteração (debounce de 500ms) e o
// restaura na próxima abertura.
//
// Chave: `aide-draft-<key>` — ex.: 'aide-draft-task-new',
// 'aide-draft-person-123'. Passe só o sufixo; o prefixo é adicionado aqui.
//
// Diferença deliberada em relação ao esboço original: `setValue` JÁ agenda a
// gravação do rascunho. Sem isso, cada componente precisaria chamar
// `setValue` + `saveDraft` em todo onChange (dezenas de call sites por
// editor) e bastaria esquecer um para o campo voltar a se perder — que é
// exatamente o bug sendo corrigido. `saveDraft` continua exportado para
// gravação manual/imediata quando necessário.
//
// `setValue` aceita valor direto ou updater funcional, igual ao setState do
// React — assim os editores existentes trocam `useState` por `useDraft` sem
// alterar nenhum `setForm((f) => ({ ...f, ... }))`.

const PREFIX = 'aide-draft-';
const DEBOUNCE_MS = 500;

function readDraft(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return undefined;
    return JSON.parse(raw);
  } catch {
    // JSON corrompido ou localStorage indisponível (modo privado, cota).
    return undefined;
  }
}

export function useDraft(key, initialValue) {
  const storageKey = `${PREFIX}${key}`;

  const [value, setValueState] = useState(() => {
    const saved = readDraft(storageKey);
    return saved === undefined ? initialValue : saved;
  });
  // `hasDraft` é o estado "havia rascunho salvo quando este formulário abriu"
  // — é o que o banner precisa saber. Vira false ao descartar/salvar, para o
  // banner sumir na hora (um useMemo lendo o localStorage nunca recalcularia).
  const [hasDraft, setHasDraft] = useState(() => readDraft(storageKey) !== undefined);

  // Valor "inicial de fábrica" (sem rascunho), usado por discardDraft.
  const pristineRef = useRef(initialValue);
  const valueRef = useRef(value);
  const timerRef = useRef(null);
  // Depois de clearDraft, o flush do unmount não pode ressuscitar o rascunho.
  const clearedRef = useRef(false);

  useEffect(() => { valueRef.current = value; }, [value]);

  const writeNow = useCallback((v) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(v));
    } catch {
      // Cota estourada ou storage bloqueado — o formulário segue funcionando.
    }
  }, [storageKey]);

  const saveDraft = useCallback((v) => {
    clearedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      writeNow(v);
    }, DEBOUNCE_MS);
  }, [writeNow]);

  const setValue = useCallback((next) => {
    const resolved = typeof next === 'function' ? next(valueRef.current) : next;
    valueRef.current = resolved;
    setValueState(resolved);
    saveDraft(resolved);
  }, [saveDraft]);

  const clearDraft = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    clearedRef.current = true;
    try {
      localStorage.removeItem(storageKey);
    } catch { /* storage indisponível */ }
    setHasDraft(false);
  }, [storageKey]);

  // Banner "Descartar": limpa o rascunho E devolve o formulário ao estado
  // inicial — senão o texto recuperado continuaria na tela.
  const discardDraft = useCallback(() => {
    clearDraft();
    valueRef.current = pristineRef.current;
    setValueState(pristineRef.current);
  }, [clearDraft]);

  // Flush no unmount: fechar o modal menos de 500ms depois da última tecla
  // perderia justamente as últimas alterações se o timer só fosse cancelado.
  useEffect(() => () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      if (!clearedRef.current) writeNow(valueRef.current);
    }
  }, [writeNow]);

  return { value, setValue, saveDraft, clearDraft, discardDraft, hasDraft };
}

export default useDraft;
