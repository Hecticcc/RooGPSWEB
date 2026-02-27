'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
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
};

const MARKER_ICON_TYPES = ['car', 'car_alt', 'caravan', 'trailer', 'truck', 'misc'] as const;

function createMarkerElement(hexColor: string, offline?: boolean, iconType?: string | null): HTMLDivElement {
  const icon = (iconType && (MARKER_ICON_TYPES as readonly string[]).includes(iconType)) ? iconType : 'car';
  const { viewBox, path, fillRule } = getMarkerSvgPath(icon);
  const el = document.createElement('div');
  el.className = 'dashboard-map-car-marker' + (offline ? ' dashboard-map-car-marker--offline' : '');
  el.style.width = '36px';
  el.style.height = '36px';
  el.style.cursor = 'pointer';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.position = 'relative';
  const safeColor = hexColor.replace(/[^#0-9A-Fa-f]/g, '');
  const pathAttrs = fillRule ? `d="${path}" fill-rule="${fillRule}"` : `d="${path}"`;
  const svg = `<svg class="dashboard-map-car-svg" width="32" height="32" viewBox="${viewBox}" fill="${safeColor}" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5));"><path ${pathAttrs}/></svg>`;
  const alertBadge = offline
    ? `<span class="dashboard-map-offline-badge" title="Offline – last known location" aria-label="Offline, last known location">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
       </span>`
    : '';
  el.innerHTML = svg + alertBadge;
  return el;
}

type Props = {
  markers?: MapMarker[];
  onMarkerClick?: (markerId: string) => void;
  onPopupClose?: () => void;
  /** Show battery voltage in popup (e.g. admin). Default false for user-facing map. */
  showVoltage?: boolean;
};

function buildPopupHtml(
  name: string,
  batteryRowContent: string,
  lastCheck: string,
  statusLine: string,
  address: string | null
): string {
  const addressValue = address === null ? 'Loading…' : escapeHtml(address);
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
      <div class="map-popup__row">
        <span class="map-popup__label">Battery</span>
        <span class="map-popup__value">${batteryRowContent}</span>
      </div>
      <div class="map-popup__row map-popup__row--last-check">
        <span class="map-popup__label">Last check</span>
        <span class="map-popup__value">${escapeHtml(lastCheck)}</span>
      </div>
    </div>
  </div>
`;
}

export default function DashboardMap({ markers = [], onMarkerClick, onPopupClose, showVoltage = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapStyle, setMapStyle] = useState<'dark' | 'satellite'>('dark');

  useEffect(() => {
    if (!containerRef.current || !token) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyle === 'satellite' ? STYLE_SATELLITE : STYLE_DARK,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });
    mapRef.current = map;
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !token) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    let currentPopup: mapboxgl.Popup | null = null;
    const valid = markers.filter((m) => typeof m.lat === 'number' && typeof m.lng === 'number');
    valid.forEach((m) => {
      const color = m.color && /^#[0-9A-Fa-f]{6}$/.test(m.color) ? m.color : '#f97316';
      const el = createMarkerElement(color, m.offline, m.icon);
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([m.lng, m.lat])
        .addTo(map);
      const markerEl = marker.getElement();
      if (markerEl) {
        markerEl.style.pointerEvents = 'auto';
        markerEl.addEventListener('click', (e: Event) => {
          e.stopPropagation();
          e.preventDefault();
          onMarkerClick?.(m.id);
          if (currentPopup) {
            currentPopup.remove();
            currentPopup = null;
          }
          const name = m.name || m.id;
          const batteryRowContent =
            m.batteryPercent != null
              ? `${escapeHtml(String(m.batteryPercent))}%${showVoltage && m.batteryVoltageV != null ? ` <span class="map-popup__voltage">(${escapeHtml(String(m.batteryVoltageV))} V)</span>` : ''}`
              : '—';
          const lastCheck = m.lastSeen
            ? new Date(m.lastSeen).toLocaleString()
            : 'Never';
          const statusLine = m.offline
            ? `<div class="map-popup__status map-popup__status--offline">Offline · Last known location</div>`
            : '';
          const popupContent = buildPopupHtml(name, batteryRowContent, lastCheck, statusLine, null);
          const popup = new mapboxgl.Popup({ anchor: 'bottom', offset: [-8, -24], closeButton: true })
            .setLngLat([m.lng, m.lat])
            .setHTML(popupContent)
            .addTo(map);
          currentPopup = popup;
          popup.on('close', () => {
            currentPopup = null;
            onPopupClose?.();
          });
          reverseGeocode(m.lng, m.lat).then((address) => {
            if (currentPopup !== popup) return;
            const updated = buildPopupHtml(name, batteryRowContent, lastCheck, statusLine, address ?? '—');
            popup.setHTML(updated);
          });
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
  }, [markers, onMarkerClick, onPopupClose, mapStyle, showVoltage]);

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
