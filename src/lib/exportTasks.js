import { getToken } from './auth';

// Descarregar um export não pode passar pelo apiFetch: aquele faz sempre
// res.json(), e CSV/Markdown não são JSON. Aqui lemos o corpo como blob e
// deixamos o browser gravar o ficheiro.
//
// O nome do ficheiro vem do Content-Disposition que o worker manda (já traz
// o âmbito e a data); só cai no `fallback` se o cabeçalho não vier.
export const EXPORT_FORMATS = [
  { id: 'json', label: 'JSON', hint: 'compatível com o LifeGame', icon: '📄' },
  { id: 'csv', label: 'CSV', hint: 'abre no Excel', icon: '📊' },
  { id: 'md', label: 'Markdown', hint: 'para ler e colar', icon: '📝' },
];

function filenameFrom(header, fallback) {
  const m = /filename="([^"]+)"/.exec(header || '');
  return m ? m[1] : fallback;
}

// `ids` (opcional) exporta só essas tarefas — é o que o botão da página de
// Tarefas manda para respeitar os filtros do ecrã. O servidor intersecta-as
// com o âmbito do utilizador; mandar ids não dá acesso a nada de novo.
export async function downloadTasksExport({ format = 'json', scope = 'mine', ids = null } = {}) {
  const params = new URLSearchParams({ format });
  if (scope === 'all') params.set('scope', 'all');
  const res = await fetch(`/api/export/tasks?${params}`, {
    method: ids ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      ...(ids ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(ids ? { body: JSON.stringify({ format, scope, ids }) } : {}),
  });
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  const blob = await res.blob();
  const nome = filenameFrom(res.headers.get('Content-Disposition'), `aide-tasks.${format}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return nome;
}
