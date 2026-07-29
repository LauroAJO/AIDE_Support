import { useEffect, useRef, useState } from 'react';
import { Eye, Pencil } from 'lucide-react';
import { MarkdownViewer } from '../../lib/markdownRenderer';

const BUTTON_CLASS = 'px-2 py-0.5 text-xs rounded hover:bg-surface2 font-mono text-ink2';

// [inicio-da-linha, fim-da-linha] (sem o \n) que contem `pos`.
function currentLineRange(value, pos) {
  const start = value.lastIndexOf('\n', pos - 1) + 1;
  let end = value.indexOf('\n', pos);
  if (end === -1) end = value.length;
  return [start, end];
}

// Textarea com toolbar de markdown (insere sintaxe no cursor/seleção) +
// alternância Editar/Visualizar (via MarkdownViewer) + auto-resize.
export default function MarkdownEditor({
  value,
  onChange,
  onBlur,
  placeholder = '',
  minHeight = 120,
  showToolbar = true,
  label,
}) {
  const textareaRef = useRef(null);
  // Seleção a restaurar no textarea depois que `value` (controlado pelo pai)
  // refletir a edição do toolbar — precisa esperar o novo valor "voltar" via
  // props antes de reposicionar o cursor.
  const pendingSelectionRef = useRef(null);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el || preview) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [value, minHeight, preview]);

  useEffect(() => {
    const pending = pendingSelectionRef.current;
    if (!pending) return;
    pendingSelectionRef.current = null;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(pending.start, pending.end);
  }, [value]);

  const applyEdit = (nextValue, selStart, selEnd) => {
    pendingSelectionRef.current = { start: selStart, end: selEnd };
    onChange(nextValue);
  };

  const wrapSelection = (marker) => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const hasSelection = e > s;
    const selected = hasSelection ? value.slice(s, e) : 'texto';
    const next = `${value.slice(0, s)}${marker}${selected}${marker}${value.slice(e)}`;
    const from = s + marker.length;
    applyEdit(next, from, from + selected.length);
  };

  const prependToLine = (prefix) => {
    const el = textareaRef.current;
    if (!el) return;
    const [lineStart] = currentLineRange(value, el.selectionStart);
    const next = `${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}`;
    const cursor = el.selectionStart + prefix.length;
    applyEdit(next, cursor, cursor);
  };

  const insertAtCursor = (text, selStart, selEnd) => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const next = `${value.slice(0, s)}${text}${value.slice(e)}`;
    applyEdit(next, s + selStart, s + selEnd);
  };

  return (
    <div className="flex flex-col">
      {label && (
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
          {label}
        </label>
      )}

      {showToolbar && (
        <div className="flex flex-wrap items-center gap-1 rounded-t border border-b-0 border-line bg-surface2 p-1">
          <button type="button" onClick={() => wrapSelection('**')} className={BUTTON_CLASS} title="Negrito">
            <strong>B</strong>
          </button>
          <button type="button" onClick={() => wrapSelection('*')} className={BUTTON_CLASS} title="Itálico">
            <em>I</em>
          </button>
          <button type="button" onClick={() => prependToLine('## ')} className={BUTTON_CLASS} title="Título">
            H2
          </button>
          <button type="button" onClick={() => prependToLine('- ')} className={BUTTON_CLASS} title="Lista com marcadores">
            • Lista
          </button>
          <button type="button" onClick={() => prependToLine('1. ')} className={BUTTON_CLASS} title="Lista numerada">
            1. Lista
          </button>
          <button type="button" onClick={() => insertAtCursor('\n---\n', 5, 5)} className={BUTTON_CLASS} title="Linha horizontal">
            ---
          </button>
          <button type="button" onClick={() => insertAtCursor('[texto](url)', 1, 6)} className={BUTTON_CLASS} title="Link">
            Link
          </button>
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            className={`${BUTTON_CLASS} ml-auto flex items-center gap-1`}
          >
            {preview ? <Pencil className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {preview ? 'Editar' : 'Visualizar'}
          </button>
        </div>
      )}

      {preview ? (
        <div
          className={`overflow-y-auto border border-line bg-surface2 px-3 py-2 ${showToolbar ? 'rounded-b' : 'rounded-lg'}`}
          style={{ minHeight }}
        >
          {value ? <MarkdownViewer content={value} /> : <p className="text-sm text-muted">{placeholder}</p>}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          style={{ minHeight }}
          className={`w-full resize-none overflow-hidden border border-line bg-surface2 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:ring-1 focus:ring-accent ${
            showToolbar ? 'rounded-b' : 'rounded-lg'
          }`}
        />
      )}
    </div>
  );
}
