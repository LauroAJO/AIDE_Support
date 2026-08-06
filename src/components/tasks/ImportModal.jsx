import { useRef, useState } from 'react';
import { X, Upload, Loader2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { getToken } from '../../lib/auth';
import ConfirmModal from '../shared/ConfirmModal';
import { DraftBanner } from '../shared/DraftBanner';
import { useDraft } from '../../hooks/useDraft';
import {
  useUnsavedGuard, DISCARD_TITLE,
  DISCARD_CONFIRM_LABEL, DISCARD_CANCEL_LABEL,
} from '../../hooks/useUnsavedGuard';

// Três formas de trazer tarefas para dentro:
//   Títulos — uma por linha (o modo antigo, mantido tal e qual)
//   JSON    — o que o export do AIDE ou do LifeGame produz
//   CSV     — ficheiro do Excel ou o CSV do próprio export
//
// JSON e CSV vão num ÚNICO pedido a POST /api/import/tasks e fazem upsert por
// aideTaskId (reimportar actualiza em vez de duplicar). O modo Títulos continua
// a criar uma tarefa por linha via POST /api/tasks — é o formato que não tem
// identidade nenhuma para casar, por isso não há upsert possível.
const TABS = [
  { id: 'titles', label: '📝 Colar títulos' },
  { id: 'json', label: '📄 JSON' },
  { id: 'csv', label: '📊 CSV' },
];

export default function ImportModal({ onClose, onImported }) {
  const [tab, setTab] = useState('titles');

  // Rascunho só para o modo Títulos — é o que se escreve à mão e custa perder.
  const {
    value: text, setValue: setText, clearDraft, discardDraft, hasDraft,
  } = useDraft('task-import', '');
  const [payload, setPayload] = useState('');   // JSON/CSV colado ou lido do ficheiro
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const guard = useUnsavedGuard({
    isDirty: !!text.trim() || !!payload.trim(), onClose, onDiscard: discardDraft,
  });

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // Pré-visualização: quantas tarefas o ficheiro traz, antes de escrever nada.
  const preview = (() => {
    if (!payload.trim()) return null;
    try {
      if (tab === 'json') {
        const o = JSON.parse(payload);
        const arr = Array.isArray(o) ? o : (o.tasks || o.tarefas);
        if (!Array.isArray(arr)) return { erro: 'JSON sem { tasks: [...] } nem array' };
        const semTitulo = arr.filter((t) => !String((t && (t.title || t.titulo)) || '').trim()).length;
        return { n: arr.length, semTitulo };
      }
      const linhas = payload.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
      // -1 cabeçalho, -1 se a primeira linha for o bloco "TAREFAS" do export.
      const bloco = /^"?(TAREFAS|PROJETOS)"?\s*[,;]?\s*$/i.test(linhas[0] || '') ? 1 : 0;
      return { n: Math.max(0, linhas.length - 1 - bloco) };
    } catch (e) {
      return { erro: String((e && e.message) || e).slice(0, 120) };
    }
  })();

  const escolherFicheiro = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setFileName(f.name);
    setError('');
    setResult(null);
    setPayload(await f.text());
  };

  // Títulos: continua a ser um POST por linha (não há endpoint em lote para
  // este formato e criar um só para títulos não valia a duplicação).
  const importarTitulos = async () => {
    if (!lines.length) return;
    setBusy(true); setError(''); setResult(null);
    let criadas = 0;
    try {
      for (const title of lines) {
        await apiFetch('/api/tasks', {
          method: 'POST',
          body: JSON.stringify({ title, urgency: 5, importance: 5, status: 'backlog' }),
        });
        criadas += 1;
      }
      clearDraft();
      onImported();
    } catch {
      setError(`Falha ao importar. ${criadas} de ${lines.length} tarefa(s) foram criadas.`);
      setBusy(false);
    }
  };

  // JSON/CSV: UM pedido para o lote inteiro.
  const importarFicheiro = async () => {
    if (!payload.trim()) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const res = await fetch('/api/import/tasks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': tab === 'csv' ? 'text/csv' : 'application/json',
        },
        body: payload,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Falha na importação (HTTP ${res.status})`);
        setBusy(false);
        return;
      }
      setResult(data);
      setBusy(false);
      // Não fecha sozinho: o resultado (importadas/actualizadas/erros) é a
      // parte útil e desaparecia antes de ser lida.
    } catch (e) {
      setError(String((e && e.message) || e).slice(0, 200));
      setBusy(false);
    }
  };

  const trocarTab = (id) => {
    setTab(id); setError(''); setResult(null);
    if (id !== 'json' && id !== 'csv') { setPayload(''); setFileName(''); }
  };

  return (
    <>
    {/* Backdrop SEM onClick (v2.25.16). */}
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg rounded-xl border border-line bg-surface shadow-soft">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">Importar tarefas</h2>
          <button type="button" onClick={guard.requestClose} className="rounded-md p-1 text-ink2 hover:bg-surface2 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => trocarTab(t.id)}
              className={`flex-1 px-3 py-2.5 text-sm font-medium transition ${
                tab === t.id ? 'border-b-2 border-accent text-ink' : 'text-ink2 hover:bg-surface2'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="px-4 py-4">
          {tab === 'titles' && (
            <>
              {hasDraft && <DraftBanner onDiscard={discardDraft} label="Lista em rascunho recuperada" />}
              <p className="mb-2 text-xs text-ink2">
                Cole uma tarefa por linha. Cada uma será criada no Backlog com urgência e importância 5.
              </p>
              <textarea
                rows={10}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={'Revisar contrato\nAgendar reunião\nResponder e-mails'}
                className="input resize-y"
              />
            </>
          )}

          {(tab === 'json' || tab === 'csv') && (
            <>
              <p className="mb-2 text-xs text-ink2">
                {tab === 'json'
                  ? 'Ficheiro .json do AIDE ou do LifeGame — { "tasks": [...] } ou um array.'
                  : 'Ficheiro .csv (vírgula ou ponto-e-vírgula, com ou sem BOM).'}
                {' '}Tarefas com um <code>aideTaskId</code> já conhecido são <strong>actualizadas</strong>, não duplicadas.
              </p>
              <div className="mb-2 flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept={tab === 'json' ? '.json,application/json' : '.csv,text/csv'}
                  onChange={escolherFicheiro}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current && fileRef.current.click()}
                  className="rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2"
                >
                  Escolher ficheiro .{tab}
                </button>
                {fileName && <span className="truncate text-xs text-muted">{fileName}</span>}
              </div>
              <textarea
                rows={8}
                value={payload}
                onChange={(e) => { setPayload(e.target.value); setFileName(''); setResult(null); }}
                placeholder={tab === 'json' ? '{ "tasks": [ { "title": "..." } ] }' : 'titulo;status;prioridade'}
                className="input resize-y font-mono text-xs"
              />
              {preview && (
                <p className={`mt-2 text-xs ${preview.erro ? 'text-danger' : 'text-ink2'}`}>
                  {preview.erro
                    ? `❌ ${preview.erro}`
                    : `${preview.n} tarefa(s) encontrada(s)${preview.semTitulo ? ` — ${preview.semTitulo} sem título serão ignoradas` : ''}`}
                </p>
              )}
            </>
          )}

          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          {result && (
            <div className="mt-3 rounded-lg border border-line bg-surface2 px-3 py-2 text-xs text-ink2">
              <p className="font-medium text-ink">
                ✅ {result.imported} importada(s) · {result.updated} actualizada(s)
                {result.skipped ? ` · ${result.skipped} ignorada(s)` : ''}
              </p>
              {!!(result.errors || []).length && (
                <ul className="mt-1 space-y-0.5">
                  {result.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>linha {e.linha}: {e.error || e.aviso}</li>
                  ))}
                  {result.errors.length > 5 && <li>… e mais {result.errors.length - 5}</li>}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <span className="text-xs text-muted">
            {tab === 'titles' ? `${lines.length} tarefa(s)` : (preview && !preview.erro ? `${preview.n} tarefa(s)` : '')}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={result ? onImported : guard.requestClose}
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2"
            >
              {result ? 'Concluir' : 'Cancelar'}
            </button>
            <button
              type="button"
              onClick={tab === 'titles' ? importarTitulos : importarFicheiro}
              disabled={busy || (tab === 'titles' ? !lines.length : (!preview || !!preview.erro || !preview.n))}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {busy ? 'Importando...' : `Importar ${tab === 'titles' ? (lines.length || '') : (preview ? preview.n : '')}`}
            </button>
          </div>
        </div>
      </div>
    </div>

    <ConfirmModal
      open={guard.confirming}
      title={DISCARD_TITLE}
      message="O conteúdo colado ainda não foi importado. Deseja descartá-lo?"
      confirmLabel={DISCARD_CONFIRM_LABEL}
      cancelLabel={DISCARD_CANCEL_LABEL}
      danger
      onConfirm={guard.confirmDiscard}
      onCancel={guard.cancelDiscard}
    />
    </>
  );
}
