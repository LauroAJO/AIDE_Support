import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload, Search, Link as LinkIcon, ExternalLink, X, Paperclip, FileText, Image as ImageIcon,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { getToken } from '../../lib/auth';

const ENDPOINT_BASE = {
  note: '/api/notes',
  task: '/api/tasks',
};

function isImageMime(mime) {
  return typeof mime === 'string' && mime.startsWith('image/');
}

// Reusable attachments block: drop-zone + Drive picker + list of files.
//   - `entityType`: 'note' | 'task'
//   - `entityId`: the row id (string). When falsy nothing renders.
//   - `readOnly`: hides upload/link/delete UI; only lists existing files.
export default function DriveAttachmentZone({ entityType, entityId, readOnly = false }) {
  const base = ENDPOINT_BASE[entityType];
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef(null);

  const load = async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const data = await apiFetch(`${base}/${entityId}/files`);
      setFiles(Array.isArray(data) ? data : []);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  if (!entityId) return null;

  const uploadFile = async (file) => {
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${base}/${entityId}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const saved = await res.json();
      setFiles((prev) => [saved, ...prev]);
    } catch (e) {
      setError(String((e && e.message) || e).slice(0, 200));
    } finally {
      setUploading(false);
    }
  };

  const linkExisting = async (driveFile) => {
    setError('');
    try {
      const saved = await apiFetch(`${base}/${entityId}/files/link`, {
        method: 'POST',
        body: JSON.stringify({
          googleFileId: driveFile.googleFileId || driveFile.id,
          name: driveFile.name,
          mimeType: driveFile.mimeType || '',
          webViewLink: driveFile.webViewLink || '',
          iconLink: driveFile.iconLink || '',
        }),
      });
      setFiles((prev) => [saved, ...prev]);
      setPickerOpen(false);
    } catch (e) {
      setError(String((e && e.message) || e).slice(0, 200));
    }
  };

  const removeFile = async (f) => {
    if (!window.confirm(`Remover "${f.name}"?`)) return;
    try {
      await apiFetch(`${base}/${entityId}/files/${f.fileId}`, { method: 'DELETE' });
      setFiles((prev) => prev.filter((x) => x.fileId !== f.fileId));
    } catch (e) {
      setError(String((e && e.message) || e).slice(0, 200));
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (readOnly) return;
    const dropped = Array.from(e.dataTransfer.files || []);
    for (const f of dropped) uploadFile(f);
  };

  const images = files.filter((f) => isImageMime(f.mimeType));
  const others = files.filter((f) => !isImageMime(f.mimeType));

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`rounded-lg border-2 border-dashed p-4 text-center transition ${
            dragOver ? 'border-accent bg-indigo-50' : 'border-line bg-surface'
          }`}
        >
          <p className="text-sm text-ink2">
            Arraste arquivos aqui ou
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2 disabled:opacity-60"
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? 'Enviando...' : 'Selecionar do computador'}
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2"
            >
              <Search className="h-3.5 w-3.5" />
              Buscar no Drive
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const list = Array.from(e.target.files || []);
              for (const f of list) uploadFile(f);
              e.target.value = '';
            }}
          />
          <p className="mt-2 text-[10px] text-muted">Armazenados no Google Drive</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-2 py-1 text-[11px] text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-[11px] text-muted">Carregando arquivos...</p>
      ) : files.length === 0 ? (
        <p className="text-[11px] text-muted">Nenhum arquivo anexado.</p>
      ) : (
        <>
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((img) => (
                <ImageTile key={img.fileId} file={img} readOnly={readOnly} onRemove={removeFile} />
              ))}
            </div>
          )}
          {others.length > 0 && (
            <ul className="space-y-1">
              {others.map((f) => (
                <FileRow key={f.fileId} file={f} readOnly={readOnly} onRemove={removeFile} />
              ))}
            </ul>
          )}
        </>
      )}

      {pickerOpen && (
        <DrivePickerModal onClose={() => setPickerOpen(false)} onPick={linkExisting} />
      )}
    </div>
  );
}

function ImageTile({ file, readOnly, onRemove }) {
  return (
    <div className="group relative h-[80px] w-[80px] overflow-hidden rounded-lg border border-line bg-surface2">
      {file.thumbnailLink ? (
        <img
          src={file.thumbnailLink}
          alt={file.name}
          className="h-full w-full cursor-pointer object-cover"
          onClick={() => window.open(file.webViewLink, '_blank', 'noopener,noreferrer')}
          referrerPolicy="no-referrer"
        />
      ) : (
        <button
          type="button"
          onClick={() => window.open(file.webViewLink, '_blank', 'noopener,noreferrer')}
          className="flex h-full w-full items-center justify-center text-ink2"
          title={file.name}
        >
          <ImageIcon className="h-6 w-6" />
        </button>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/45 p-1 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100">
        <button
          type="button"
          onClick={() => window.open(file.webViewLink, '_blank', 'noopener,noreferrer')}
          className="rounded bg-white/90 px-1 py-0.5 text-[9px] font-medium text-ink hover:bg-white"
          title={file.name}
        >
          <ExternalLink className="inline h-2.5 w-2.5" />
        </button>
        {!readOnly && (
          <button
            type="button"
            onClick={() => onRemove(file)}
            className="rounded bg-danger/90 px-1 py-0.5 text-[9px] font-medium text-white hover:bg-danger"
            title="Remover"
          >
            <X className="inline h-2.5 w-2.5" />
          </button>
        )}
      </div>
      {file.isLink && (
        <span className="absolute left-0 top-0 rounded-br bg-accent px-1 py-0.5 text-[8px] font-medium uppercase text-white">
          link
        </span>
      )}
    </div>
  );
}

function FileRow({ file, readOnly, onRemove }) {
  const shortName = file.name && file.name.length > 30 ? `${file.name.slice(0, 30)}…` : file.name;
  return (
    <li className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs">
      {file.iconLink ? (
        <img src={file.iconLink} alt="" className="h-4 w-4 shrink-0" />
      ) : (
        <FileText className="h-4 w-4 shrink-0 text-muted" />
      )}
      <span className="flex-1 truncate text-ink" title={file.name}>{shortName}</span>
      <span
        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase ${
          file.isLink ? 'bg-accent/10 text-accent' : 'bg-surface2 text-ink2'
        }`}
      >
        {file.isLink ? 'Vinculado' : 'Uploaded'}
      </span>
      {file.webViewLink && (
        <button
          type="button"
          onClick={() => window.open(file.webViewLink, '_blank', 'noopener,noreferrer')}
          className="rounded-md border border-line p-1 text-ink2 hover:bg-surface2"
          title="Abrir no Drive"
        >
          <ExternalLink className="h-3 w-3" />
        </button>
      )}
      {!readOnly && (
        <button
          type="button"
          onClick={() => onRemove(file)}
          className="rounded-md border border-line p-1 text-danger hover:bg-danger/10"
          title="Remover"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </li>
  );
}

function DrivePickerModal({ onClose, onPick }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = async () => {
    setLoading(true);
    setError('');
    try {
      const q = query.trim();
      const data = await apiFetch(`/api/drive/files${q ? `?search=${encodeURIComponent(q)}` : ''}`);
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setError('Falha ao buscar no Drive.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-line bg-surface shadow-soft" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="flex items-center gap-2 text-base font-bold text-ink">
            <LinkIcon className="h-4 w-4 text-accent" /> Vincular do Drive
          </h3>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="border-b border-line px-4 py-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
                placeholder="Buscar no Drive..."
                className="input pl-8"
                autoFocus
              />
            </div>
            <button
              type="button"
              onClick={search}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Buscar
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading && <p className="px-2 py-3 text-center text-sm text-muted">Buscando...</p>}
          {error && <p className="px-2 py-3 text-center text-sm text-danger">{error}</p>}
          {!loading && !error && results.length === 0 && (
            <p className="px-2 py-3 text-center text-sm text-muted">Faça uma busca para listar arquivos.</p>
          )}
          {results.map((f) => (
            <div key={f.googleFileId || f.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface2">
              {f.iconLink ? (
                <img src={f.iconLink} alt="" className="h-4 w-4 shrink-0" />
              ) : (
                <Paperclip className="h-4 w-4 shrink-0 text-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink" title={f.name}>{f.name}</p>
                {f.modifiedTime && (
                  <p className="text-[10px] text-muted">
                    {new Date(f.modifiedTime).toLocaleDateString('pt-BR')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onPick(f)}
                className="shrink-0 rounded-md bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover"
              >
                Vincular
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
