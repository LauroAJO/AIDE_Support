// Export multi-domínio (Carreira/Mercado/Networking/Eventos/Venues) — II.1.6.0.
//
// CSV/TXT são downloads diretos do worker (GET /api/export/data). PDF é
// montado NO NAVEGADOR via jspdf/jspdf-autotable — o worker devolve só os
// dados já formatados (GET /api/export/data/json), sem gerar o PDF no
// servidor (lib pesada, sem ganho claro rodando no Worker). Import dinâmico
// dos dois pacotes: eles só entram no bundle quando o usuário realmente
// exporta em PDF, não no carregamento inicial do app.
//
// II.1.15.0 — restrito ao owner no backend (ver handleExportData/
// handleExportDataJson em _worker.js); este módulo não faz gate nenhum
// sozinho, só chama a API — a UI que o usa (SettingsPage.jsx) só renderiza
// o painel para o owner.
import { getToken } from './auth';

export const EXPORT_DOMAINS = [
  { key: 'career', label: 'Carreira' },
  { key: 'market', label: 'Mercado' },
  { key: 'networking', label: 'Contatos (Networking)' },
  { key: 'events', label: 'Eventos' },
  { key: 'venues', label: 'Venues' },
];

async function authedFetch(path) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) {
    let msg = `Falha ao exportar (HTTP ${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      // resposta não era JSON (ex.: já é o próprio arquivo de erro) — mantém msg genérica
    }
    throw new Error(msg);
  }
  return res;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Um domínio por chamada (CSV/TXT) — dispara N downloads quando vários
// domínios estão marcados, um arquivo por domínio.
export async function downloadDomainFile(domain, format) {
  const res = await authedFetch(`/api/export/data?domain=${domain}&format=${format}`);
  const blob = await res.blob();
  const hoje = new Date().toISOString().slice(0, 10);
  const ext = format === 'txt' ? 'txt' : 'csv';
  triggerDownload(blob, `aide-${domain}-${hoje}.${ext}`);
}

// PDF: um arquivo só, uma seção/tabela por domínio selecionado.
export async function downloadDomainsPdf(domains) {
  if (!domains.length) return;
  const [{ default: jsPDF }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const res = await authedFetch(`/api/export/data/json?domains=${domains.join(',')}`);
  const data = await res.json();

  const doc = new jsPDF({ orientation: 'landscape' });
  let first = true;
  for (const domain of domains) {
    const section = data[domain];
    if (!section) continue;
    if (!first) doc.addPage();
    first = false;
    doc.setFontSize(14);
    doc.text(section.label, 14, 16);
    doc.setFontSize(9);
    doc.text(`AIDE — exportado em ${new Date().toLocaleString('pt-BR')}`, 14, 22);
    doc.autoTable({
      startY: 27,
      head: [section.columns],
      body: section.rows,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [40, 40, 40] },
      margin: { left: 14, right: 14 },
    });
  }
  const hoje = new Date().toISOString().slice(0, 10);
  doc.save(`aide-export-${hoje}.pdf`);
}
