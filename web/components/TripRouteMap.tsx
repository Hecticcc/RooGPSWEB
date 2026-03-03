'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

type Point = { lat: number; lon: number; occurred_at?: string; speed_kph?: number | null };

type Props = {
  points: Point[];
  startLat: number | null;
  startLon: number | null;
  endLat: number | null;
  endLon: number | null;
  className?: string;
};

function formatPointTime(iso: string | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
  } catch {
    return '';
  }
}

export default function TripRouteMap({ points, startLat, startLon, endLat, endLon, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  useEffect(() => {
    if (!containerRef.current || !token) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: startLon != null && startLat != null ? [startLon, startLat] : [145, -37.8],
      zoom: 12,
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
    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }

    let coords: [number, number][] = points.length >= 2
      ? points.map((p) => [p.lon, p.lat] as [number, number])
      : startLat != null && startLon != null && endLat != null && endLon != null
        ? [[startLon, startLat] as [number, number], [endLon, endLat] as [number, number]]
        : [];

    const first = points.length > 0 ? points[0] : null;
    const last = points.length > 0 ? points[points.length - 1] : null;
    const markerStartLat = first ? first.lat : startLat;
    const markerStartLon = first ? first.lon : startLon;
    const markerEndLat = endLat != null ? endLat : (last?.lat ?? null);
    const markerEndLon = endLon != null ? endLon : (last?.lon ?? null);

    if (coords.length >= 2 && markerEndLat != null && markerEndLon != null && last != null) {
      const lastCoord = coords[coords.length - 1];
      const same = Math.abs(lastCoord[0] - markerEndLon) < 1e-5 && Math.abs(lastCoord[1] - markerEndLat) < 1e-5;
      if (!same) coords = [...coords, [markerEndLon, markerEndLat] as [number, number]];
    }

    const fitBounds = (c: [number, number][]) => {
      if (c.length < 2) return;
      const lngs = c.map((x) => x[0]);
      const lats = c.map((x) => x[1]);
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 40, maxZoom: 16, duration: 0 }
      );
    };

    const applyRoute = (finalCoords: [number, number][]) => {
      if (map.getLayer('route')) map.removeLayer('route');
      if (map.getSource('route')) map.removeSource('route');
      if (finalCoords.length >= 2) {
        map.addSource('route', {
          type: 'geojson',
          data: { type: 'LineString', coordinates: finalCoords },
          lineMetrics: true,
        });
        map.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-width': 4,
            'line-opacity': 0.9,
            'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, '#22c55e', 1, '#ef4444'],
          },
        });
      }
      const pointsToShow = points.length >= 2 ? points : (markerStartLat != null && markerStartLon != null && markerEndLat != null && markerEndLon != null ? [{ lat: markerStartLat, lon: markerStartLon, occurred_at: undefined, speed_kph: undefined }, { lat: markerEndLat, lon: markerEndLon, occurred_at: undefined, speed_kph: undefined }] : []);
      const CLOSE_DEG = 0.00025;
      const NUDGE_DEG = 0.00012;
      pointsToShow.forEach((p, i) => {
        const isFirst = i === 0;
        const isLast = i === pointsToShow.length - 1;
        const total = pointsToShow.length;
        let markerLon = p.lon;
        let markerLat = p.lat;
        if (!isFirst && !isLast) {
          const prev = pointsToShow[i - 1];
          const distToPrev = Math.hypot(p.lon - prev!.lon, p.lat - prev!.lat);
          if (distToPrev < CLOSE_DEG && distToPrev > 1e-9) {
            const next = pointsToShow[i + 1];
            const dx = next ? next.lon - prev!.lon : 0;
            const dy = next ? next.lat - prev!.lat : 0;
            const len = Math.hypot(dx, dy) || 1;
            const perpLon = (-dy / len) * NUDGE_DEG;
            const perpLat = (dx / len) * NUDGE_DEG;
            markerLon = p.lon + perpLon;
            markerLat = p.lat + perpLat;
          }
        }
        const label = isFirst ? 'Start' : isLast ? 'End' : `Waypoint ${i + 1}`;
        const timeStr = formatPointTime(p.occurred_at);
        const pointLabel = total > 0 ? `Point ${i + 1} of ${total}` : '';
        const speedStr = p.speed_kph != null && !Number.isNaN(p.speed_kph) ? `${Math.round(p.speed_kph)} km/h` : '';
        const popupHtml = `<div class="trip-map-popup"><div class="trip-map-popup-title">${label}</div>${pointLabel ? `<div class="trip-map-popup-row trip-map-popup-meta">${pointLabel}</div>` : ''}${timeStr ? `<div class="trip-map-popup-row"><span class="trip-map-popup-label">Time</span> ${timeStr}</div>` : ''}${speedStr ? `<div class="trip-map-popup-row"><span class="trip-map-popup-label">Speed</span> ${speedStr}</div>` : ''}<div class="trip-map-popup-row trip-map-popup-coords">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</div></div>`;

        const el = document.createElement('div');
        el.className = isFirst ? 'trip-map-marker trip-map-marker--start' : isLast ? 'trip-map-marker trip-map-marker--end' : 'trip-map-marker trip-map-marker--waypoint';
        el.style.width = isFirst || isLast ? '16px' : '10px';
        el.style.height = isFirst || isLast ? '16px' : '10px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = isFirst ? '#22c55e' : isLast ? '#ef4444' : '#3b82f6';
        el.style.border = '2px solid #fff';
        el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)';
        el.style.cursor = 'pointer';
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', `${label}${timeStr ? ` at ${timeStr}` : ''}`);
        el.addEventListener('click', () => {
          if (popupRef.current) popupRef.current.remove();
          const popup = new mapboxgl.Popup({
            anchor: 'bottom',
            offset: 16,
            closeButton: true,
            closeOnClick: false,
            className: 'trip-map-popup-container',
          })
            .setLngLat([p.lon, p.lat])
            .setHTML(popupHtml)
            .addTo(map);
          popupRef.current = popup;
          popup.once('close', () => { popupRef.current = null; });
        });
        const m = new mapboxgl.Marker({ element: el }).setLngLat([markerLon, markerLat]).addTo(map);
        markersRef.current.push(m);
      });
      if (pointsToShow.length === 0 && markerStartLat != null && markerStartLon != null) {
        const el = document.createElement('div');
        el.className = 'trip-map-marker trip-map-marker--start';
        el.style.width = '16px';
        el.style.height = '16px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = '#22c55e';
        el.style.border = '2px solid #fff';
        el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)';
        el.style.cursor = 'pointer';
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', 'Start');
        el.addEventListener('click', () => {
          if (popupRef.current) popupRef.current.remove();
          const popup = new mapboxgl.Popup({ anchor: 'bottom', offset: 16, closeButton: true, closeOnClick: false, className: 'trip-map-popup-container' })
            .setLngLat([markerStartLon, markerStartLat])
            .setHTML('<div class="trip-map-popup"><div class="trip-map-popup-title">Start</div></div>')
            .addTo(map);
          popupRef.current = popup;
          popup.once('close', () => { popupRef.current = null; });
        });
        const m = new mapboxgl.Marker({ element: el }).setLngLat([markerStartLon, markerStartLat]).addTo(map);
        markersRef.current.push(m);
      }
      if (pointsToShow.length === 0 && markerEndLat != null && markerEndLon != null) {
        const el = document.createElement('div');
        el.className = 'trip-map-marker trip-map-marker--end';
        el.style.width = '16px';
        el.style.height = '16px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = '#ef4444';
        el.style.border = '2px solid #fff';
        el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)';
        el.style.cursor = 'pointer';
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', 'End');
        el.addEventListener('click', () => {
          if (popupRef.current) popupRef.current.remove();
          const popup = new mapboxgl.Popup({ anchor: 'bottom', offset: 16, closeButton: true, closeOnClick: false, className: 'trip-map-popup-container' })
            .setLngLat([markerEndLon, markerEndLat])
            .setHTML('<div class="trip-map-popup"><div class="trip-map-popup-title">End</div></div>')
            .addTo(map);
          popupRef.current = popup;
          popup.once('close', () => { popupRef.current = null; });
        });
        const m = new mapboxgl.Marker({ element: el }).setLngLat([markerEndLon, markerEndLat]).addTo(map);
        markersRef.current.push(m);
      }
      fitBounds(finalCoords);
    };

    const runUpdate = () => {
      if (map.isStyleLoaded()) {
        applyRoute(coords);
      } else {
        map.once('load', () => applyRoute(coords));
      }
    };

    let cancelled = false;
    if (coords.length >= 2 && coords.length <= 25) {
      const coordsStr = coords.map((c) => `${c[0]},${c[1]}`).join(';');
      fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsStr}?geometries=geojson&overview=full&access_token=${token}`
      )
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          const routeCoords = data?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
          const finalCoords = routeCoords && routeCoords.length >= 2 ? routeCoords : coords;
          if (map.isStyleLoaded()) applyRoute(finalCoords);
          else map.once('load', () => applyRoute(finalCoords));
        })
        .catch(() => {
          if (!cancelled) runUpdate();
        });
    } else {
      runUpdate();
    }

    return () => { cancelled = true; };
  }, [points, startLat, startLon, endLat, endLon]);

  if (!token) {
    return (
      <div className={className} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: 'var(--muted)' }}>
        Map not available
      </div>
    );
  }

  return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%', minHeight: 220 }} />;
}
