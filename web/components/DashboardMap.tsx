'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { getMarkerSvgPath } from '@/lib/tracker-icon-svg';

const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const DEFAULT_CENTER: [number, number] = [133.8, -25.3];
const DEFAULT_ZOOM = 3;

const STYLE_DARK = 'mapbox://styles/mapbox/dark-v11';
const STYLE_SATELLITE = 'mapbox://styles/mapbox/satellite-streets-v12';

async function reverseGeocode(lng: number, lat: number): Promise<string | null> {
  if (!token) return null;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${encodeURIComponent(token)}&limit=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: Array<{ place_name?: string }> };
    const name = data.features?.[0]?.place_name;
    return name ?? null;
  } catch {
    return null;
  }
}

function escapeHtml(text: string): string {
  const div = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (div) {
    div.textContent = text;
    return div.innerHTML;
  }
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function batteryBarsHtml(percent: number | null | undefined): string {
  if (percent == null) return '—';
  return `${escapeHtml(String(percent))}%`;
}

/* Popup row icons (14×14, stroke currentColor) */
const POPUP_ICON_CLOCK =
  '<svg class="map-popup__icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
const POPUP_ICON_GPS =
  '<svg class="map-popup__icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="3"/></svg>';
const POPUP_ICON_BATTERY =
  '<svg class="map-popup__icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="6" width="18" height="12" rx="2"/><line x1="23" y1="10" x2="23" y2="14"/><line x1="5" y1="10" x2="5" y2="14"/><line x1="9" y1="10" x2="9" y2="14"/><line x1="13" y1="10" x2="13" y2="14"/></svg>';
const POPUP_ICON_POWER =
  '<svg class="map-popup__icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>';

export type MapMarker = {
  id: string;
  name: string | null;
  lat: number;
  lng: number;
  color: string;
  icon?: string | null;
  batteryPercent?: number | null;
  batteryVoltageV?: number | null;
  lastSeen?: string | null;
  offline?: boolean;
  device_state?: 'ONLINE' | 'SLEEPING' | 'OFFLINE';
  emergencyMode?: boolean;
  suspended?: boolean;
  /** When true, popup shows External Power + Backup Battery instead of single Battery. */
  isWired?: boolean;
  externalPowerConnected?: boolean | null;
  backupBatteryPercent?: number | null;
  /** GPS lock/fix on last packet. */
  gpsLock?: boolean | null;
  /** Ingest server that received last packet (e.g. Skippy, Joey). */
  ingestServer?: string | null;
};

const MARKER_ICON_TYPES = ['car', 'car_alt', 'caravan', 'trailer', 'truck', 'misc', 'toolbox', 'motorbike', 'scooter'] as const;

type MarkerBadge = 'none' | 'sleep' | 'offline' | 'suspended';

function createMarkerElement(hexColor: string, badge: MarkerBadge, iconType?: string | null, emergencyMode?: boolean): HTMLDivElement {
  const icon = (iconType && (MARKER_ICON_TYPES as readonly string[]).includes(iconType)) ? iconType : 'car';
  const result = getMarkerSvgPath(icon);
  const el = document.createElement('div');
  el.className = 'dashboard-map-car-marker' +
    (badge === 'offline' ? ' dashboard-map-car-marker--offline' : '') +
    (badge === 'sleep' ? ' dashboard-map-car-marker--sleep' : '') +
    (badge === 'suspended' ? ' dashboard-map-car-marker--suspended' : '') +
    (emergencyMode ? ' dashboard-map-car-marker--emergency' : '');
  el.style.width = '36px';
  el.style.height = '36px';
  el.style.cursor = 'pointer';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.position = 'relative';
  const safeColor = hexColor.replace(/[^#0-9A-Fa-f]/g, '');
  const isStroke = 'stroke' in result && result.stroke && result.paths;
  const pathEls = isStroke
    ? result.paths!.map((d) => `<path d="${d.replace(/"/g, '&quot;')}" fill="none" stroke="${safeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`).join('')
    : (() => {
        const pathAttrs = result.fillRule ? `d="${result.path!.replace(/"/g, '&quot;')}" fill-rule="${result.fillRule}"` : `d="${result.path!.replace(/"/g, '&quot;')}"`;
        return `<path ${pathAttrs}/>`;
      })();
  const svg = `<svg class="dashboard-map-car-svg" width="32" height="32" viewBox="${result.viewBox}" ${isStroke ? '' : `fill="${safeColor}"`} xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5));">${pathEls}</svg>`;
  let alertBadge = '';
  if (badge === 'offline') {
    alertBadge = `<span class="dashboard-map-offline-badge" title="Offline – last known location" aria-label="Offline, last known location">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
       </span>`;
  } else if (badge === 'sleep') {
    alertBadge = `<span class="dashboard-map-sleep-badge" title="Sleep – last known location" aria-label="Sleep, last known location">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
       </span>`;
  }
  /* suspended: no sleep/offline badge; slash overlay is added via CSS ::after */
  const slashOverlay = badge === 'suspended'
    ? '<span class="dashboard-map-suspended-slash" aria-hidden></span>'
    : '';
  el.innerHTML = svg + slashOverlay + alertBadge;
  return el;
}

type Props = {
  markers?: MapMarker[];
  onMarkerClick?: (markerId: string) => void;
  onPopupClose?: () => void;
  /** Show battery voltage in popup (e.g. admin). Default false for user-facing map. */
  showVoltage?: boolean;
  /** When set, flies to that marker and opens its popup. */
  focusMarkerId?: string | null;
};

function buildPopupHtml(
  name: string,
  powerRowsHtml: string,
  lastSeenText: string,
  statusLine: string,
  address: string | null,
  gpsLock: boolean | null | undefined,
  lat: number,
  lng: number
): string {
  const addressValue = address === null ? 'Loading…' : escapeHtml(address);
  const gpsRow =
    gpsLock != null
      ? `<div class="map-popup__row"><span class="map-popup__icon">${POPUP_ICON_GPS}</span><span class="map-popup__label">GPS lock</span><span class="map-popup__value">${gpsLock ? 'Yes' : 'No'}</span></div>`
      : '';
  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  return `
  <div class="map-popup">
    <header class="map-popup__header">
      <span class="map-popup__title">${escapeHtml(name)}</span>
    </header>
    ${statusLine}
    <div class="map-popup__body">
      <div class="map-popup__row map-popup__row--address">
        <span class="map-popup__label">Address</span>
        <span class="map-popup__value map-popup__address">${addressValue}</span>
      </div>
      ${powerRowsHtml}
      <div class="map-popup__row map-popup__row--last-check">
        <span class="map-popup__icon">${POPUP_ICON_CLOCK}</span>
        <span class="map-popup__label">Last seen</span>
        <span class="map-popup__value">${escapeHtml(lastSeenText)}</span>
      </div>
      ${gpsRow}
    </div>
    <div class="map-popup__footer">
      <a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer" class="map-popup__gmaps-btn" title="Open in Google Maps">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
      </a>
    </div>
  </div>
`;
}

export default function DashboardMap({ markers = [], onMarkerClick, onPopupClose, showVoltage = false, focusMarkerId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const markersByIdRef = useRef<Map<string, { marker: mapboxgl.Marker; data: MapMarker }>>(new Map());
  const activePopupRef = useRef<mapboxgl.Popup | null>(null);
  const [mapStyle, setMapStyle] = useState<'dark' | 'satellite'>('dark');

  // Create map once; switch style with setStyle() to avoid teardown/reinit jitter
  useEffect(() => {
    if (!containerRef.current || !token) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLE_DARK,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      maxBounds: [[112, -44], [154, -10]],
    });
    mapRef.current = map;
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // When user toggles Satellite/Map, swap style in place (keeps center/zoom, no full reload)
  const styleUrlRef = useRef(STYLE_DARK);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const nextUrl = mapStyle === 'satellite' ? STYLE_SATELLITE : STYLE_DARK;
    if (styleUrlRef.current === nextUrl) return;
    styleUrlRef.current = nextUrl;
    map.setStyle(nextUrl);
  }, [mapStyle]);

  function addMarkersAndFit(map: mapboxgl.Map) {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    markersByIdRef.current.clear();
    let currentPopup: mapboxgl.Popup | null = null;

    function openPopupFor(m: MapMarker) {
      if (currentPopup) { currentPopup.remove(); currentPopup = null; }
      const name = m.name || m.id;
      const powerRowsHtml = m.isWired
        ? `<div class="map-popup__row map-popup__row--ext-power"><span class="map-popup__icon">${POPUP_ICON_POWER}</span><span class="map-popup__label">External Power</span><span class="map-popup__value">${m.externalPowerConnected === true ? 'Connected' : m.externalPowerConnected === false ? 'Disconnected' : '—'}</span></div>
  <div class="map-popup__row"><span class="map-popup__icon">${POPUP_ICON_BATTERY}</span><span class="map-popup__label">Backup Battery</span><span class="map-popup__value">${batteryBarsHtml(m.backupBatteryPercent)}</span></div>`
        : `<div class="map-popup__row"><span class="map-popup__icon">${POPUP_ICON_BATTERY}</span><span class="map-popup__label">Battery</span><span class="map-popup__value">${batteryBarsHtml(m.batteryPercent)}${showVoltage && m.batteryVoltageV != null ? ' <span class="map-popup__voltage">(' + escapeHtml(String(m.batteryVoltageV)) + ' V)</span>' : ''}</span></div>`;
      const lastSeenText = m.lastSeen ? new Date(m.lastSeen).toLocaleString() : 'Never';
      const statusLine = m.suspended
        ? `<div class="map-popup__status map-popup__status--suspended">Suspended · Overdue on payment</div>`
        : m.emergencyMode
          ? `<div class="map-popup__status map-popup__status--emergency">Emergency Mode · 30s updates</div>`
          : m.device_state === 'OFFLINE'
            ? `<div class="map-popup__status map-popup__status--offline">Offline · Last known location</div>`
            : m.device_state === 'SLEEPING'
              ? `<div class="map-popup__status map-popup__status--sleep">Sleep · Last known location</div>`
              : m.offline
                ? `<div class="map-popup__status map-popup__status--offline">Offline · Last known location</div>`
                : '';
      const popupContent = buildPopupHtml(name, powerRowsHtml, lastSeenText, statusLine, null, m.gpsLock, m.lat, m.lng);
      const popup = new mapboxgl.Popup({ anchor: 'bottom', offset: [0, -20], closeButton: true })
        .setLngLat([m.lng, m.lat])
        .setHTML(popupContent)
        .addTo(map);
      currentPopup = popup;
      activePopupRef.current = popup;
      popup.on('close', () => {
        currentPopup = null;
        activePopupRef.current = null;
        onPopupClose?.();
      });
      reverseGeocode(m.lng, m.lat).then((address) => {
        if (currentPopup !== popup) return;
        const updated = buildPopupHtml(name, powerRowsHtml, lastSeenText, statusLine, address ?? '—', m.gpsLock, m.lat, m.lng);
        popup.setHTML(updated);
      });
    }

    const valid = markers.filter((m) => typeof m.lat === 'number' && typeof m.lng === 'number');
    valid.forEach((m) => {
      const color = m.color && /^#[0-9A-Fa-f]{6}$/.test(m.color) ? m.color : '#f97316';
      const badge: MarkerBadge = m.suspended
        ? 'suspended'
        : m.device_state === 'OFFLINE'
          ? 'offline'
          : m.device_state === 'SLEEPING'
            ? 'sleep'
            : m.offline
              ? 'offline'
              : 'none';
      const el = createMarkerElement(color, badge, m.icon, m.emergencyMode);
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([m.lng, m.lat])
        .addTo(map);
      markersByIdRef.current.set(m.id, { marker, data: m });
      const markerEl = marker.getElement();
      if (markerEl) {
        markerEl.style.pointerEvents = 'auto';
        markerEl.addEventListener('click', (e: Event) => {
          e.stopPropagation();
          e.preventDefault();
          onMarkerClick?.(m.id);
          openPopupFor(m);
        });
      }
      markersRef.current.push(marker);
    });
    if (valid.length === 1) {
      map.setCenter([valid[0].lng, valid[0].lat]);
      map.setZoom(12);
    } else if (valid.length > 1) {
      const bounds = new mapboxgl.LngLatBounds(
        [valid[0].lng, valid[0].lat],
        [valid[0].lng, valid[0].lat]
      );
      valid.forEach((m) => bounds.extend([m.lng, m.lat]));
      map.fitBounds(bounds, { padding: 40, maxZoom: 14 });
    } else {
      map.setCenter(DEFAULT_CENTER);
      map.setZoom(DEFAULT_ZOOM);
    }
  }

  // Sync markers (and fit) when markers change or after style has loaded (e.g. after Satellite/Map toggle)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !token) return;
    const run = () => addMarkersAndFit(map);
    if (map.isStyleLoaded()) {
      run();
    } else {
      map.once('style.load', run);
    }
  }, [markers, onMarkerClick, onPopupClose, mapStyle, showVoltage]);

  // Fly to a marker and open its popup when focusMarkerId changes
  useEffect(() => {
    if (!focusMarkerId) return;
    const map = mapRef.current;
    if (!map) return;
    const entry = markersByIdRef.current.get(focusMarkerId);
    if (!entry) return;
    const { data: m } = entry;
    // Clear any lingering padding from previous operations, then fly to centre
    map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
    map.flyTo({
      center: [m.lng, m.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: 700,
    });
    // Open the popup after the fly animation settles
    const el = entry.marker.getElement();
    if (el) setTimeout(() => el.click(), 750);
  }, [focusMarkerId]);

  if (!token) {
    return (
      <div
        className="dashboard-map-placeholder"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 280,
          height: '100%',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          color: 'var(--muted)',
        }}
      >
        Set NEXT_PUBLIC_MAPBOX_TOKEN to show the map
      </div>
    );
  }

  return (
    <div className="dashboard-map-container" style={{ position: 'relative', width: '100%', minHeight: 280, height: '100%' }}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          minHeight: 280,
          height: '100%',
          overflow: 'hidden',
          background: 'var(--surface)',
        }}
      />
      {token && (
        <div className="dashboard-map-style-control">
          <button
            type="button"
            onClick={() => setMapStyle((s) => (s === 'dark' ? 'satellite' : 'dark'))}
            title={mapStyle === 'dark' ? 'Switch to satellite view' : 'Switch to map view'}
          >
            {mapStyle === 'dark' ? 'Satellite' : 'Map'}
          </button>
        </div>
      )}
    </div>
  );
}
