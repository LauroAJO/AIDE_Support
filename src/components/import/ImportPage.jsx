import { useEffect, useState } from 'react';
import { Upload, CheckCircle2, AlertTriangle, Building2, Users, History, Loader2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { parseImportJSON } from '../../lib/importParser';

const PLACEHOLDER = `{
  "source_description": "Relatório Twente H2 2026",
  "organizations": [
    {
      "name": "HyGear",
      "type": "company",
      "city": "Arnhem",
      "website": "https://hygear.com",
      "description": "Empresa de eletrolisadores...",
      "relevance_score": 5,
      "relevance_notes": "Alta relevância para H2",
      "tags": ["H2", "PEM", "SOE", "eletrolisador"]
    }
  ],
  "contacts": [
    {
      "name": "Ilaria Mirabelli",
      "organization_name": "HyGear",
      "role": "Chief Engineer",
      "email": "",
      "linkedin": "linkedin.com/in/...",
      "relevance_notes": "Engenheira SWITCH project",
      "outreach_status": "not_contacted",
      "relevance_for_phd": 4,
      "relevance_for_job": 5,
      "tags": ["SOE", "H2", "eletrolisador"]
    }
  ]
}`;

function fmtDate(unix) {
  if (!unix) return '—';
  try {
    return new Date(unix * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

export default function ImportPage() {
  const [jsonText, setJsonText] = useState('');
  const [parsed, setParsed] = useState(null); // resultado de parseImportJSON
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null); // { imported, failed, organizations, contacts, errors }
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');

  const loadHistory = async () => {
    try {
      const rows = await apiFetch('/api/market/import');
      setHistory(Array.isArray(rows) ? rows : []);
    } catch {
      setHistory([]);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const onValidate = () => {
    setResult(null);
    setError('');
    setParsed(parseImportJSON(jsonText));
  };

  const onImport = async () => {
    // Garante validação antes de enviar.
    const report = parsed || parseImportJSON(jsonText);
    setParsed(report);
    if (!report.valid) {
      setError('Corrija os erros antes de importar.');
      return;
    }
    setImporting(true);
    setError('');
    try {
      const payload = {
        type: 'mixed',
        source_description: report.source_description || '',
        data: {
          organizations: report.organizations.filter((o) => o.valid).map((o) => o.data),
          contacts: report.contacts.filter((c) => c.valid).map((c) => c.data),
        },
      };
      const res = await apiFetch('/api/market/import', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setResult(res);
      await loadHistory();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setImporting(false);
    }
  };

  const summary = parsed?.summary;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <Upload className="h-6 w-6 text-accent" />
          Importação em Massa
        </h1>
        <p className="mt-1 text-sm text-muted">
          Cole um JSON estruturado com organizações e contatos para importar de uma vez,
          sem digitar um a um. Clique em <strong>Validar</strong> para conferir antes de gravar.
        </p>
      </div>

      {/* Seção 1 — JSON */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink2">1. Importar via JSON</h2>
        <textarea
          value={jsonText}
          onChange={(e) => { setJsonText(e.target.value); setParsed(null); setResult(null); }}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          className="h-72 w-full resize-y rounded-lg border border-line bg-surface2 p-3 font-mono text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onValidate}
            disabled={!jsonText.trim()}
            className="rounded-lg border border-line bg-surface2 px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface disabled:opacity-50"
          >
            Validar
          </button>
          <button
            type="button"
            onClick={onImport}
            disabled={importing || !jsonText.trim()}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {importing && <Loader2 className="h-4 w-4 animate-spin" />}
            Importar
          </button>
          {error && <span className="text-sm text-danger">{error}</span>}
        </div>
      </section>

      {/* Resultado da importação */}
      {result && (
        <section className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Importação concluída
          </h2>
          <p className="mt-1 text-sm text-ink2">
            {result.imported} item(ns) importado(s)
            {typeof result.organizations === 'number' && (
              <> — {result.organizations} organização(ões), {result.contacts} contato(s)</>
            )}
            {result.failed > 0 && <span className="text-danger"> · {result.failed} falha(s)</span>}
          </p>
          {Array.isArray(result.errors) && result.errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-danger">
              {result.errors.map((e, i) => (
                <li key={i}>{e.kind}: {e.item} — {e.error}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Seção 2 — Preview de validação */}
      {parsed && (
        <section className="space-y-4 rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink2">2. Preview de validação</h2>

          {parsed.errors.length > 0 && (
            <div className="rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
              {parsed.errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}

          {summary && (
            <p className="text-sm text-ink2">
              <strong className="text-ink">{summary.validOrgs}</strong> organização(ões),{' '}
              <strong className="text-ink">{summary.validContacts}</strong> contato(s) prontos para importar
              {summary.errorCount > 0 && (
                <span className="text-danger"> · {summary.errorCount} erro(s) encontrado(s)</span>
              )}
            </p>
          )}

          {/* Tabela de organizações */}
          {parsed.organizations.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                <Building2 className="h-4 w-4" /> Organizações ({parsed.organizations.length})
              </h3>
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface2 text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2">Nome</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Cidade</th>
                      <th className="px-3 py-2">Rel.</th>
                      <th className="px-3 py-2">Tags</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.organizations.map((o) => (
                      <tr key={o.index} className={`border-t border-line ${o.valid ? '' : 'bg-danger/5'}`}>
                        <td className="px-3 py-2 text-ink">{o.data.name || <em className="text-muted">(sem nome)</em>}</td>
                        <td className="px-3 py-2 text-ink2">{o.data.type}</td>
                        <td className="px-3 py-2 text-ink2">{o.data.city || '—'}</td>
                        <td className="px-3 py-2 text-ink2">{o.data.relevance_score}</td>
                        <td className="px-3 py-2 text-ink2">{(o.data.tags || []).join(', ') || '—'}</td>
                        <td className="px-3 py-2">
                          {o.valid
                            ? <span className="text-emerald-500">ok</span>
                            : <span className="text-danger">{o.errors.join('; ')}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tabela de contatos */}
          {parsed.contacts.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                <Users className="h-4 w-4" /> Contatos ({parsed.contacts.length})
              </h3>
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface2 text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2">Nome</th>
                      <th className="px-3 py-2">Organização</th>
                      <th className="px-3 py-2">Cargo</th>
                      <th className="px-3 py-2">PhD</th>
                      <th className="px-3 py-2">Job</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.contacts.map((c) => (
                      <tr key={c.index} className={`border-t border-line ${c.valid ? '' : 'bg-danger/5'}`}>
                        <td className="px-3 py-2 text-ink">{c.data.name || <em className="text-muted">(sem nome)</em>}</td>
                        <td className="px-3 py-2 text-ink2">{c.data.organization_name || '—'}</td>
                        <td className="px-3 py-2 text-ink2">{c.data.role || '—'}</td>
                        <td className="px-3 py-2 text-ink2">{c.data.relevance_for_phd}</td>
                        <td className="px-3 py-2 text-ink2">{c.data.relevance_for_job}</td>
                        <td className="px-3 py-2">
                          {c.valid
                            ? <span className="text-emerald-500">ok</span>
                            : <span className="text-danger">{c.errors.join('; ')}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {parsed.valid && (
            <button
              type="button"
              onClick={onImport}
              disabled={importing}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Confirmar importação
            </button>
          )}
        </section>
      )}

      {/* Seção 3 — Histórico */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink2">
          <History className="h-4 w-4" /> 3. Histórico de importações
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma importação registrada ainda.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface2 text-xs text-muted">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Fonte</th>
                  <th className="px-3 py-2">Importados</th>
                  <th className="px-3 py-2">Erros</th>
                  <th className="px-3 py-2">Por</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-line">
                    <td className="px-3 py-2 text-ink2">{fmtDate(h.imported_at)}</td>
                    <td className="px-3 py-2 text-ink2">{h.import_type}</td>
                    <td className="px-3 py-2 text-ink2">{h.source_description || '—'}</td>
                    <td className="px-3 py-2 text-ink">{h.items_imported}</td>
                    <td className="px-3 py-2">
                      {h.items_failed > 0
                        ? <span className="flex items-center gap-1 text-danger"><AlertTriangle className="h-3 w-3" />{h.items_failed}</span>
                        : <span className="text-ink2">0</span>}
                    </td>
                    <td className="px-3 py-2 text-ink2">{h.imported_by_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
