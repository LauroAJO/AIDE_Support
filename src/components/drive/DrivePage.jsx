import { useEffect, useState } from 'react';
import {
  Folder,
  FileText,
  Image as ImageIcon,
  File as FileIcon,
  Table,
  Star,
  Search,
  RefreshCw,
  LayoutGrid,
  List as ListIcon,
  ExternalLink,
  ChevronRight,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import ScopeBanner, { isAuthScopeError } from '../shared/ScopeBanner';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function iconFor(mime) {
  if (mime === FOLDER_MIME) return Folder;
  if (!mime) return FileIcon;
  if (mime.includes('image')) return ImageIcon;
  if (mime.includes('spreadsheet') || mime.includes('excel')) return Table;
  if (mime.includes('pdf') || mime.includes('document') || mime.includes('text')) return FileText;
  return FileIcon;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
}

export default function DrivePage() {
  const driveFiles = useStore((s) => s.driveFiles);
  const setDriveFiles = useStore((s) => s.setDriveFiles);
  const driveFavorites = useStore((s) => s.driveFavorites);
  const setDriveFavorites = useStore((s) => s.setDriveFavorites);
  const driveParent = useStore((s) => s.driveParent);
  const setDriveParent = useStore((s) => s.setDriveParent);
  const driveSearch = useStore((s) => s.driveSearch);
  const setDriveSearch = useStore((s) => s.setDriveSearch);

  const [breadcrumb, setBreadcrumb] = useState([{ id: null, name: 'Meu Drive' }]);
  const [viewMode, setViewMode] = useState('grid');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [scopeError, setScopeError] = useState(false);

  const loadFiles = async (parent, search) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      else if (parent) params.set('parent', parent);
      const files = await apiFetch(`/api/drive/files?${params.toString()}`);
      setDriveFiles(files);
      setScopeError(false);
    } catch (err) {
      if (isAuthScopeError(err)) setScopeError(true);
    } finally {
      setLoading(false);
    }
  };

  const loadFavorites = async () => {
    try {
      setDriveFavorites(await apiFetch('/api/drive/favorites'));
    } catch (err) {
      if (isAuthScopeError(err)) setScopeError(true);
    }
  };

  useEffect(() => {
    loadFiles(null, '');
    loadFavorites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enterFolder = (file) => {
    setDriveSearch('');
    setSearchInput('');
    setBreadcrumb((b) => [...b, { id: file.googleFileId, name: file.name }]);
    setDriveParent(file.googleFileId);
    loadFiles(file.googleFileId, '');
  };

  const goToCrumb = (idx) => {
    const crumb = breadcrumb[idx];
    setBreadcrumb(breadcrumb.slice(0, idx + 1));
    setDriveParent(crumb.id);
    setDriveSearch('');
    setSearchInput('');
    loadFiles(crumb.id, '');
  };

  const runSearch = () => {
    const q = searchInput.trim();
    setDriveSearch(q);
    loadFiles(driveParent, q);
  };

  const toggleFavorite = async (file, makeFav) => {
    await apiFetch(`/api/drive/favorites/${file.googleFileId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: file.name,
        mimeType: file.mimeType,
        webViewLink: file.webViewLink,
        iconLink: file.iconLink,
        modifiedTime: file.modifiedTime,
        is_favorite: makeFav,
        sort_order: makeFav ? driveFavorites.length : 0,
      }),
    });
    setDriveFiles(driveFiles.map((f) => (f.googleFileId === file.googleFileId ? { ...f, isFavorite: makeFav } : f)));
    loadFavorites();
  };

  const moveFavorite = async (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= driveFavorites.length) return;
    const arr = [...driveFavorites];
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    setDriveFavorites(arr);
    await apiFetch('/api/drive/sort', {
      method: 'PUT',
      body: JSON.stringify({ items: arr.map((f, i) => ({ googleFileId: f.googleFileId, sort_order: i })) }),
    });
  };

  return (
    <div className="space-y-4">
      {scopeError && <ScopeBanner message="Para usar o Drive, autorize o acesso ao Google Drive." />}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 text-sm">
          {breadcrumb.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted" />}
              <button
                onClick={() => goToCrumb(i)}
                className={i === breadcrumb.length - 1 ? 'font-bold text-ink' : 'text-ink2 hover:text-ink'}
              >
                {c.name}
              </button>
            </span>
          ))}
          {driveSearch && <span className="text-muted">· busca: “{driveSearch}”</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              placeholder="Buscar no Drive..."
              className="input w-44 pl-8"
            />
          </div>
          <button
            onClick={() => loadFiles(driveParent, driveSearch)}
            className="rounded-lg border border-line p-1.5 text-ink2 hover:bg-surface2"
            title="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Favorites */}
        <div className="lg:w-[30%]">
          <div className="rounded-xl border border-line bg-surface p-4">
            <h3 className="mb-2 text-sm font-bold text-ink">Acesso Rápido</h3>
            {driveFavorites.length === 0 ? (
              <p className="text-xs text-muted">Adicione arquivos aos favoritos para acesso rápido.</p>
            ) : (
              <ul className="space-y-1.5">
                {driveFavorites.map((f, idx) => {
                  const Icon = iconFor(f.mimeType);
                  return (
                    <li key={f.googleFileId} className="group flex items-center gap-2 rounded-lg border border-line bg-base px-2 py-1.5">
                      <Icon className="h-4 w-4 shrink-0 text-ink2" />
                      <button
                        onClick={() => f.webViewLink && window.open(f.webViewLink, '_blank')}
                        className="min-w-0 flex-1 truncate text-left text-xs text-ink hover:text-accent"
                      >
                        {f.name}
                      </button>
                      <div className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100">
                        <button onClick={() => moveFavorite(idx, -1)} className="text-muted hover:text-ink">
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button onClick={() => moveFavorite(idx, 1)} className="text-muted hover:text-ink">
                          <ArrowDown className="h-3 w-3" />
                        </button>
                      </div>
                      <button
                        onClick={() => toggleFavorite(f, false)}
                        title="Remover dos favoritos"
                        className="shrink-0"
                      >
                        <Star className="h-3.5 w-3.5" fill="#F59E0B" style={{ color: '#F59E0B' }} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* File browser */}
        <div className="min-w-0 lg:w-[70%]">
          <div className="mb-2 flex justify-end">
            <div className="flex overflow-hidden rounded-lg border border-line">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 ${viewMode === 'grid' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 ${viewMode === 'list' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'}`}
              >
                <ListIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-muted">Carregando...</p>
          ) : driveFiles.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Nenhum item.</p>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {driveFiles.map((f) => (
                <FileCard key={f.googleFileId} file={f} onOpen={enterFolder} onToggleFav={toggleFavorite} />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-line rounded-xl border border-line bg-surface">
              {driveFiles.map((f) => (
                <FileRow key={f.googleFileId} file={f} onOpen={enterFolder} onToggleFav={toggleFavorite} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FileCard({ file, onOpen, onToggleFav }) {
  const Icon = iconFor(file.mimeType);
  const isFolder = file.mimeType === FOLDER_MIME;
  return (
    <div className="flex flex-col rounded-xl border border-line bg-surface p-3">
      <div className="mb-2 flex items-start justify-between">
        {file.iconLink ? (
          <img src={file.iconLink} alt="" className="h-6 w-6" />
        ) : (
          <Icon className="h-6 w-6 text-ink2" />
        )}
        <button onClick={() => onToggleFav(file, !file.isFavorite)} title="Favoritar">
          <Star
            className="h-4 w-4"
            fill={file.isFavorite ? '#F59E0B' : 'none'}
            style={{ color: file.isFavorite ? '#F59E0B' : '#9E9890' }}
          />
        </button>
      </div>
      <button
        onClick={() => (isFolder ? onOpen(file) : file.webViewLink && window.open(file.webViewLink, '_blank'))}
        className="truncate text-left text-sm font-medium text-ink hover:text-accent"
        title={file.name}
      >
        {file.name}
      </button>
      <span className="mt-0.5 text-[10px] text-muted">{formatDate(file.modifiedTime)}</span>
      {!isFolder && file.webViewLink && (
        <button
          onClick={() => window.open(file.webViewLink, '_blank')}
          className="mt-2 flex items-center justify-center gap-1 rounded-lg border border-line py-1 text-[11px] text-ink2 hover:bg-surface2"
        >
          <ExternalLink className="h-3 w-3" /> Abrir
        </button>
      )}
    </div>
  );
}

function FileRow({ file, onOpen, onToggleFav }) {
  const Icon = iconFor(file.mimeType);
  const isFolder = file.mimeType === FOLDER_MIME;
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      {file.iconLink ? <img src={file.iconLink} alt="" className="h-5 w-5" /> : <Icon className="h-5 w-5 text-ink2" />}
      <button
        onClick={() => (isFolder ? onOpen(file) : file.webViewLink && window.open(file.webViewLink, '_blank'))}
        className="min-w-0 flex-1 truncate text-left text-sm text-ink hover:text-accent"
      >
        {file.name}
      </button>
      <span className="shrink-0 text-[11px] text-muted">{formatDate(file.modifiedTime)}</span>
      <button onClick={() => onToggleFav(file, !file.isFavorite)} className="shrink-0" title="Favoritar">
        <Star
          className="h-4 w-4"
          fill={file.isFavorite ? '#F59E0B' : 'none'}
          style={{ color: file.isFavorite ? '#F59E0B' : '#9E9890' }}
        />
      </button>
      {!isFolder && file.webViewLink && (
        <button onClick={() => window.open(file.webViewLink, '_blank')} className="shrink-0 text-ink2 hover:text-accent" title="Abrir">
          <ExternalLink className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
