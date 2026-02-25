'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getMarkerSvgPath } from '@/lib/tracker-icon-svg';

const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const DEFAULT_CENTER: [number, number] = [133.8, -25.3];
const DEFAULT_ZOOM = 3;

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
};

export default function DashboardMap({ markers = [], onMarkerClick, onPopupClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || !token) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
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
  }, []);

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
          const battery =
            m.batteryPercent != null ? `${m.batteryPercent}%` : '—';
          const lastCheck = m.lastSeen
            ? new Date(m.lastSeen).toLocaleString()
            : 'Never';
          const statusLine = m.offline
            ? `<div class="dashboard-map-popup-status dashboard-map-popup-status--offline">Offline · Last known location</div>`
            : '';
          const popupContent = `
          <div class="dashboard-map-popup">
            <div class="dashboard-map-popup-title">${escapeHtml(name)}</div>
            ${statusLine}
            <div class="dashboard-map-popup-row"><span class="dashboard-map-popup-label">Battery</span> ${escapeHtml(battery)}</div>
            <div class="dashboard-map-popup-row"><span class="dashboard-map-popup-label">Last check</span> ${escapeHtml(lastCheck)}</div>
          </div>
        `;
          const popup = new mapboxgl.Popup({ offset: 20, closeButton: true })
            .setLngLat([m.lng, m.lat])
            .setHTML(popupContent)
            .addTo(map);
          currentPopup = popup;
          popup.on('close', () => {
            currentPopup = null;
            onPopupClose?.();
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
  }, [markers, onMarkerClick, onPopupClose]);

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
    <div
      ref={containerRef}
      className="dashboard-map-container"
      style={{
        width: '100%',
        minHeight: 280,
        height: '100%',
        overflow: 'hidden',
        background: 'var(--surface)',
      }}
    />
  );
}
