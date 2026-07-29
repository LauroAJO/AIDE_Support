// Renderer de markdown simples, baseado em regex (sem dependência externa).
// Cobre o subconjunto usado nos campos de texto longo do AIDE: cabeçalhos,
// negrito/itálico, código inline, listas, HR, links e paragrafação por
// linha em branco. Não é um parser completo de CommonMark.

// Esquemas de URL permitidos em links — bloqueia javascript:/data: etc.
// (o texto já chega aqui escapado, então isto é defesa em profundidade,
// não a única barreira contra XSS).
const SAFE_URL_SCHEME = /^(https?:|mailto:)/i;

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMarkdown(text) {
  if (!text) return '';

  let html = escapeHtml(text)
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-4 mb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')

    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')

    // Inline code
    .replace(/`(.+?)`/g, '<code class="bg-surface2 px-1 rounded text-sm font-mono">$1</code>')

    // Unordered lists
    .replace(/^[\-\*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')

    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')

    // Wrap consecutive <li> in <ul>
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => `<ul class="my-2 space-y-0.5">${match}</ul>`)

    // Horizontal rule
    .replace(/^---$/gm, '<hr class="my-3 border-line"/>')

    // Links — só http(s)/mailto viram <a>; qualquer outro esquema (ex.:
    // javascript:) cai para texto puro, sem o link.
    .replace(/\[(.+?)\]\((.+?)\)/g, (match, label, url) => {
      if (!SAFE_URL_SCHEME.test(url)) return label;
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-accent underline">${label}</a>`;
    })

    // Paragraphs — blank lines become paragraph breaks
    .replace(/\n\n+/g, '</p><p class="mt-3">')

    // Single line breaks become <br>
    .replace(/\n/g, '<br/>');

  return `<p class="leading-relaxed">${html}</p>`;
}

// Versão em texto puro (sem tags), usada em previews compactos de lista
// (ex.: primeira linha de uma nota) onde não faz sentido renderizar HTML.
export function stripMarkdown(text, maxLength) {
  if (!text) return '';
  const stripped = text
    .replace(/^#{1,3} /gm, '')
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^[\-\*] /gm, '')
    .replace(/^\d+\. /gm, '')
    .replace(/^---$/gm, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (maxLength && stripped.length > maxLength) return `${stripped.slice(0, maxLength)}…`;
  return stripped;
}

export function MarkdownViewer({ content, className = '' }) {
  if (!content) return null;
  return (
    <div
      className={`prose-sm max-w-none text-ink ${className}`}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
    />
  );
}
