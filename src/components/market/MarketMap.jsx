// Mapa geográfico de Mercado — Fase 1 (v2.25.21): organizações + projetos
// (projetos ancorados na posição da organização coordenadora — ver comentário
// da migração 0058). Fase 2 (futura): pessoas, ancoradas na organização
// vinculada via contact_professional/roles.
//
// Biblioteca: Leaflet + react-leaflet 4.x (compatível com React 18 — v5 exige
// React 19) + leaflet.markercluster usado de forma IMPERATIVA (o pacote
// react-leaflet-cluster exige react-leaflet 5/React 19, então o cluster é
// montado direto sobre a instância do Leaflet via useMap()).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { MapPin, Loader2, Move, X, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { ORG_TYPE_LABELS, ORG_STATUS_LABELS } from './marketShared';

// Mesma paleta do Mapa Orbital de Networking (NetworkingPage.jsx) — pinos e
// nós do grafo usam a mesma cor por tipo de organização em toda a app.
const ORG_TYPE_COLORS = {
  university: '#4338CA',
  company: '#B45309',
  research_institute: '#15803D',
  funder: '#7E22CE',
  other: '#6B7280',
};
function orgColor(type) {
  return ORG_TYPE_COLORS[type] || ORG_TYPE_COLORS.other;
}
const PROJECT_COLOR = '#DB2777'; // pink — distingue projeto de organização no mapa

// Pequeno deslocamento (graus) para o pino do projeto não cobrir 100% o pino
// da organização coordenadora, já que ambos nascem na mesma coordenada.
const PROJECT_OFFSET = 0.0018;

function dotIcon(color, size = 16, ring = false) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:${ring ? '3px' : '50%'};
      background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Camada de clustering — montada imperativamente sobre a instância real do
// Leaflet (useMap()). markers: [{ lat, lng, icon, popup, eventHandlers }].
function ClusterLayer({ markers }) {
  const map = useMap();
  useEffect(() => {
    const group = L.markerClusterGroup({ maxClusterRadius: 40 });
    markers.forEach((m) => {
      const marker = L.marker([m.lat, m.lng], { icon: m.icon, draggable: m.draggable || false });
      if (m.popupHtml) marker.bindPopup(m.popupHtml);
      if (m.onDragEnd) marker.on('dragend', (e) => m.onDragEnd(e.target.getLatLng()));
      if (m.onClick) marker.on('click', m.onClick);
      group.addLayer(marker);
    });
    map.addLayer(group);
    return () => map.removeLayer(group);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, markers]);
  return null;
}

// Captura um clique no mapa quando `active` — usado para "marcar no mapa"
// organizações sem geocodificação automática possível.
function ClickToPlace({ active, onPlace }) {
  useMapEvents({
    click(e) {
      if (active) onPlace(e.latlng);
    },
  });
  return null;
}

export default function MarketMap() {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showOrgs, setShowOrgs] = useState(true);
  const [showProjects, setShowProjects] = useState(true);
  const [placingOrgId, setPlacingOrgId] = useState(null);
  const [geocodingId, setGeocodingId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null); // { done, total }
  const [toast, setToast] = useState('');
  const cancelBulkRef = useRef(false);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 5000);
  };

  const load = async () => {
    try {
      const [o, p] = await Promise.all([
        apiFetch('/api/market/organizations'),
        apiFetch('/api/market/projects'),
      ]);
      setOrgs(Array.isArray(o) ? o : []);
      setProjects(Array.isArray(p) ? p : []);
      setError('');
    } catch {
      setError('Falha ao carregar organizações/projetos.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const orgById = useMemo(() => {
    const m = new Map();
    orgs.forEach((o) => m.set(o.id, o));
    return m;
  }, [orgs]);

  const geocodedOrgs = useMemo(
    () => orgs.filter((o) => o.lat != null && o.lng != null),
    [orgs]
  );
  const missingOrgs = useMemo(
    () => orgs.filter((o) => o.lat == null || o.lng == null),
    [orgs]
  );
  const mappableProjects = useMemo(
    () => projects.filter((p) => {
      const org = orgById.get(p.organization_id);
      return org && org.lat != null && org.lng != null;
    }),
    [projects, orgById]
  );

  const geocodeOne = async (orgId) => {
    setGeocodingId(orgId);
    try {
      const updated = await apiFetch(`/api/market/organizations/${orgId}/geocode`, { method: 'POST' });
      setOrgs((prev) => prev.map((o) => (o.id === orgId ? updated : o)));
      return true;
    } catch (e) {
      showToast(`Falha ao geocodificar: ${String((e && e.message) || e).slice(0, 100)}`);
      return false;
    } finally {
      setGeocodingId(null);
    }
  };

  // Geocodifica todas as pendentes em sequência com pausa entre chamadas —
  // o Nominatim (gratuito) pede no máximo ~1 requisição/segundo.
  const geocodeAllPending = async () => {
    const pending = missingOrgs.filter((o) => o.city || o.country);
    if (pending.length === 0) return;
    setBulkBusy(true);
    cancelBulkRef.current = false;
    setBulkProgress({ done: 0, total: pending.length });
    let ok = 0;
    for (let i = 0; i < pending.length; i++) {
      if (cancelBulkRef.current) break;
      // eslint-disable-next-line no-await-in-loop
      const success = await geocodeOne(pending[i].id);
      if (success) ok++;
      setBulkProgress({ done: i + 1, total: pending.length });
      if (i < pending.length - 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 1100));
      }
    }
    setBulkBusy(false);
    setBulkProgress(null);
    showToast(`${ok}/${pending.length} organização(ões) geocodificada(s)`);
  };

  const setManualPin = async (orgId, latlng) => {
    try {
      const updated = await apiFetch(`/api/market/organizations/${orgId}`, {
        method: 'PUT',
        body: JSON.stringify({ lat: latlng.lat, lng: latlng.lng }),
      });
      setOrgs((prev) => prev.map((o) => (o.id === orgId ? updated : o)));
      showToast('Pino posicionado');
    } catch (e) {
      showToast(`Falha ao salvar posição: ${String((e && e.message) || e).slice(0, 100)}`);
    }
  };

  const orgMarkers = useMemo(() => {
    if (!showOrgs) return [];
    return geocodedOrgs.map((o) => ({
      lat: o.lat,
      lng: o.lng,
      icon: dotIcon(orgColor(o.type)),
      draggable: false,
      popupHtml: orgPopupHtml(o),
    }));
  }, [geocodedOrgs, showOrgs]);

  const projectMarkers = useMemo(() => {
    if (!showProjects) return [];
    return mappableProjects.map((p) => {
      const org = orgById.get(p.organization_id);
      return {
        lat: org.lat + PROJECT_OFFSET,
        lng: org.lng + PROJECT_OFFSET,
        icon: dotIcon(PROJECT_COLOR, 14, true),
        popupHtml: projectPopupHtml(p, org),
      };
    });
  }, [mappableProjects, orgById, showProjects]);

  // Popups são HTML puro (Leaflet não roda React dentro de L.divIcon/bindPopup)
  // — delega a navegação via um listener global de clique, checando data-nav.
  useEffect(() => {
    const handler = (e) => {
      const el = e.target.closest('[data-nav-org]');
      if (el) navigate(`/market/org/${el.getAttribute('data-nav-org')}`);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [navigate]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted">Carregando mapa…</div>;
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Controles: camadas + geocodificação em massa */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-2.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-ink2">
          <input type="checkbox" checked={showOrgs} onChange={(e) => setShowOrgs(e.target.checked)} className="accent-accent" />
          Organizações ({geocodedOrgs.length})
        </label>
        <label className="flex items-center gap-1.5 text-xs font-medium text-ink2">
          <input type="checkbox" checked={showProjects} onChange={(e) => setShowProjects(e.target.checked)} className="accent-accent" />
          Projetos ({mappableProjects.length})
        </label>
        <div className="ml-auto flex items-center gap-2">
          {missingOrgs.length > 0 && !bulkBusy && (
            <button
              type="button"
              onClick={geocodeAllPending}
              className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Geocodificar {missingOrgs.length} pendente(s)
            </button>
          )}
          {bulkBusy && (
            <span className="flex items-center gap-1.5 text-xs text-ink2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Geocodificando {bulkProgress?.done}/{bulkProgress?.total}…
              <button
                type="button"
                onClick={() => { cancelBulkRef.current = true; }}
                className="ml-1 text-danger underline"
              >
                cancelar
              </button>
            </span>
          )}
        </div>
      </div>

      {placingOrgId && (
        <div className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-xs font-medium text-accent">
          <Move className="h-3.5 w-3.5" />
          Clique no mapa para posicionar "{orgById.get(placingOrgId)?.name}"
          <button type="button" onClick={() => setPlacingOrgId(null)} className="ml-auto flex items-center gap-1 underline">
            <X className="h-3 w-3" /> cancelar
          </button>
        </div>
      )}

      {/* Mapa */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-line" style={{ minHeight: 420 }}>
        <MapContainer
          center={[52.2, 6.9]} // Enschede/NL — maioria das orgs cadastradas fica na região
          zoom={geocodedOrgs.length ? 5 : 3}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <ClusterLayer markers={[...orgMarkers, ...projectMarkers]} />
          <ClickToPlace active={!!placingOrgId} onPlace={(latlng) => {
            const id = placingOrgId;
            setPlacingOrgId(null);
            setManualPin(id, latlng);
          }}
          />
        </MapContainer>
      </div>

      {/* Organizações sem localização */}
      {missingOrgs.length > 0 && (
        <div className="rounded-lg border border-line bg-surface p-3">
          <p className="mb-2 text-xs font-semibold text-ink2">
            {missingOrgs.length} organização(ões) sem localização no mapa
          </p>
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {missingOrgs.map((o) => (
              <div key={o.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-surface2">
                <span className="min-w-0 flex-1 truncate text-ink">{o.name}</span>
                <span className="shrink-0 text-[10px] text-muted">
                  {[o.city, o.country].filter(Boolean).join(', ') || 'sem cidade/país'}
                </span>
                {(o.city || o.country) && (
                  <button
                    type="button"
                    onClick={() => geocodeOne(o.id)}
                    disabled={geocodingId === o.id || bulkBusy}
                    className="flex shrink-0 items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10px] font-medium text-ink2 hover:bg-surface disabled:opacity-50"
                  >
                    {geocodingId === o.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Auto
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPlacingOrgId(o.id)}
                  disabled={bulkBusy}
                  className="flex shrink-0 items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10px] font-medium text-ink2 hover:bg-surface disabled:opacity-50"
                >
                  <MapPin className="h-3 w-3" />
                  Marcar no mapa
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[1200] -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-soft">
          {toast}
        </div>
      )}
    </div>
  );
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function orgPopupHtml(o) {
  return `
    <div style="min-width:180px;font-family:inherit;">
      <div style="font-weight:700;font-size:13px;color:#1c1917;">${esc(o.name)}</div>
      <div style="font-size:11px;color:#78716c;margin-top:2px;">
        ${esc(ORG_TYPE_LABELS[o.type] || o.type)} · ${esc(ORG_STATUS_LABELS[o.status] || o.status)}
      </div>
      <div style="font-size:11px;color:#78716c;">${esc([o.city, o.country].filter(Boolean).join(', '))}</div>
      <button data-nav-org="${esc(o.id)}" style="margin-top:6px;font-size:11px;font-weight:600;color:#6366f1;background:none;border:none;padding:0;cursor:pointer;">
        Ver organização →
      </button>
    </div>`;
}

function projectPopupHtml(p, org) {
  return `
    <div style="min-width:180px;font-family:inherit;">
      <div style="font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#DB2777;">Projeto</div>
      <div style="font-weight:700;font-size:13px;color:#1c1917;">${esc(p.name)}${p.acronym ? ` (${esc(p.acronym)})` : ''}</div>
      <div style="font-size:11px;color:#78716c;margin-top:2px;">Coordenado por ${esc(org.name)}</div>
      <button data-nav-org="${esc(org.id)}" style="margin-top:6px;font-size:11px;font-weight:600;color:#6366f1;background:none;border:none;padding:0;cursor:pointer;">
        Ver organização →
      </button>
    </div>`;
}
