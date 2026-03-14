'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const STYLE_MAP = 'mapbox://styles/mapbox/dark-v11';
const STYLE_SATELLITE = 'mapbox://styles/mapbox/satellite-streets-v12';

type Point = { lat: number; lon: number; occurred_at?: string; speed_kph?: number | null; gps_valid?: boolean | null };

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
  const reapplyRouteRef = useRef<(() => void) | null>(null);
  const [mapStyle, setMapStyle] = useState<'map' | 'satellite'>('map');

  useEffect(() => {
    if (!containerRef.current || !token) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLE_MAP,
      center: startLon != null && startLat != null ? [startLon, startLat] : [145, -37.8],
      zoom: 12,
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const url = mapStyle === 'satellite' ? STYLE_SATELLITE : STYLE_MAP;
    map.setStyle(url);
    map.once('style.load', () => {
      reapplyRouteRef.current?.();
    });
  }, [mapStyle]);

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
      const allPoints = points.length >= 2 ? points : (markerStartLat != null && markerStartLon != null && markerEndLat != null && markerEndLon != null ? [{ lat: markerStartLat, lon: markerStartLon, occurred_at: undefined, speed_kph: undefined }, { lat: markerEndLat, lon: markerEndLon, occurred_at: undefined, speed_kph: undefined }] : []);

      // Thin waypoint markers so the map stays readable.
      // Route line always uses all coords (unaffected). End marker always sits at the
      // stored parked position (endLat/endLon) regardless of which points are shown.
      // Strategy: keep first + last; pick one intermediate point per MIN_INTERVAL_MS.
      // No hard cap — long trips just get more markers spaced ~2 min apart.
      const MIN_INTERVAL_MS = 2 * 60 * 1000;
      function downsampleMarkers(pts: typeof allPoints): typeof allPoints {
        if (pts.length <= 2) return pts;
        const first = pts[0]!;
        const last = pts[pts.length - 1]!;
        const middle = pts.slice(1, -1);
        const hasTimestamps = middle.some((p) => !!p.occurred_at);
        let kept: typeof allPoints;
        if (hasTimestamps) {
          let lastTs = first.occurred_at ? new Date(first.occurred_at).getTime() : 0;
          kept = middle.filter((p) => {
            const ts = p.occurred_at ? new Date(p.occurred_at).getTime() : lastTs + MIN_INTERVAL_MS;
            if (ts - lastTs >= MIN_INTERVAL_MS) { lastTs = ts; return true; }
            return false;
          });
        } else {
          // No timestamps: evenly pick up to 18 middle points
          const want = Math.min(18, middle.length);
          const step = (middle.length - 1) / Math.max(1, want - 1);
          kept = Array.from({ length: want }, (_, i) => middle[Math.round(i * step)]!);
        }
        return [first, ...kept, last];
      }

      const pointsToShow = downsampleMarkers(allPoints);
      const CLOSE_DEG = 0.00025;
      const NUDGE_DEG = 0.00012;
      const total = pointsToShow.length;

      const addMarker = (p: { lat: number; lon: number; occurred_at?: string; speed_kph?: number | null; gps_valid?: boolean | null }, i: number, isFirst: boolean, isLast: boolean, mlon: number, mlat: number) => {
        const label = isFirst ? 'Start' : isLast ? 'End' : `Waypoint ${i + 1}`;
        const timeStr = formatPointTime(p.occurred_at);
        const pointLabel = total > 0 ? `Point ${i + 1} of ${total}` : '';
        const speedStr = p.speed_kph != null && !Number.isNaN(p.speed_kph) ? `${Math.round(p.speed_kph)} km/h` : '';
        const gpsStr = p.gps_valid != null ? (p.gps_valid ? 'Locked' : 'Not locked') : '';
        const popupHtml = `<div class="trip-map-popup"><div class="trip-map-popup-title">${label}</div>${pointLabel ? `<div class="trip-map-popup-row trip-map-popup-meta">${pointLabel}</div>` : ''}${timeStr ? `<div class="trip-map-popup-row"><span class="trip-map-popup-label">Time</span> ${timeStr}</div>` : ''}${speedStr ? `<div class="trip-map-popup-row"><span class="trip-map-popup-label">Speed</span> ${speedStr}</div>` : ''}${gpsStr ? `<div class="trip-map-popup-row"><span class="trip-map-popup-label">GPS</span> ${gpsStr}</div>` : ''}<div class="trip-map-popup-row trip-map-popup-coords">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</div></div>`;
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
        const m = new mapboxgl.Marker({ element: el }).setLngLat([mlon, mlat]).addTo(map);
        markersRef.current.push(m);
      };

      // Add waypoints first, then start, then end so start/end are always on top
      for (let i = 0; i < pointsToShow.length; i++) {
        const p = pointsToShow[i];
        const isFirst = i === 0;
        const isLast = i === pointsToShow.length - 1;
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
        if (!isFirst && !isLast) addMarker(p, i, false, false, markerLon, markerLat);
      }
      if (pointsToShow.length > 0) {
        const first = pointsToShow[0];
        addMarker(first, 0, true, pointsToShow.length === 1, first.lon, first.lat);
      }
      if (pointsToShow.length > 1) {
        const lastPt = pointsToShow[pointsToShow.length - 1];
        // Use the stored parked position (endLat/endLon from the trips table) for the end
        // marker if it exists — that's where the car actually stopped, not the last moving
        // GPS ping (which can be mid-road if the vehicle was still in motion when the trip
        // was last processed, e.g. on a freeway just before a coverage gap).
        const endPt =
          markerEndLat != null && markerEndLon != null
            ? { ...lastPt, lat: markerEndLat, lon: markerEndLon }
            : lastPt;
        addMarker(endPt, pointsToShow.length - 1, false, true, endPt.lon, endPt.lat);
      }
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

    const runUpdate = (fallbackCoords: [number, number][]) => {
      const run = () => {
        reapplyRouteRef.current = () => applyRoute(fallbackCoords);
        applyRoute(fallbackCoords);
      };
      if (map.isStyleLoaded()) run();
      else {
        map.once('load', run);
        map.once('style.load', run);
      }
    };

    // Downsample to max N points (keeps first, last, evenly spaced); returns chosen indices and downsampled array
    function downsampleIndices(len: number, max: number): number[] {
      if (len <= max) return Array.from({ length: len }, (_, i) => i);
      const indices = [0];
      const step = (len - 1) / (max - 1);
      for (let i = 1; i < max - 1; i++) indices.push(Math.round(i * step));
      indices.push(len - 1);
      return indices;
    }

    let cancelled = false;
    const MAX_MAPMATCH_COORDS = 100;
    const indices = downsampleIndices(coords.length, MAX_MAPMATCH_COORDS);
    const mapMatchCoords = indices.map((i) => coords[i]) as [number, number][];

    if (coords.length >= 2 && mapMatchCoords.length >= 2) {
      const coordsStr = mapMatchCoords.map((c) => `${c[0]},${c[1]}`).join(';');
      const allIndicesInPoints = indices.every((i) => i < points.length);
      const ts =
        allIndicesInPoints &&
        points.length >= 2 &&
        indices
          .map((i) => points[i]?.occurred_at)
          .every(Boolean)
          ? indices.map((i) => Math.floor(new Date(points[i].occurred_at!).getTime() / 1000))
          : null;
      const timestampsParam = ts && ts.length === mapMatchCoords.length ? `&timestamps=${ts.join(';')}` : '';
      // Map Matching follows the actual trace (turns, stops); Directions can add detours between waypoints
      fetch(
        `https://api.mapbox.com/matching/v5/mapbox/driving/${coordsStr}?geometries=geojson&overview=full&tidy=true${timestampsParam}&access_token=${token}`
      )
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          const matchings = data?.matchings as Array<{ geometry?: { coordinates?: [number, number][] } }> | undefined;
          let finalCoords: [number, number][] | undefined;
          if (matchings && matchings.length > 0) {
            const merged = matchings
              .map((m) => m.geometry?.coordinates ?? [])
              .filter((c) => c.length >= 2);
            if (merged.length === 1) {
              finalCoords = merged[0];
            } else if (merged.length > 1) {
              finalCoords = merged[0];
              for (let i = 1; i < merged.length; i++) {
                const prev = finalCoords![finalCoords!.length - 1];
                const next = merged[i] as [number, number][];
                if (next.length >= 2 && Math.hypot(Number(prev[0]) - Number(next[0]), Number(prev[1]) - Number(next[1])) < 1e-6) {
                  finalCoords = [...finalCoords!, ...next.slice(1)];
                } else {
                  finalCoords = [...finalCoords!, ...next];
                }
              }
            }
          }
          if (finalCoords && finalCoords.length >= 2) {
            reapplyRouteRef.current = () => applyRoute(finalCoords);
            if (map.isStyleLoaded()) applyRoute(finalCoords);
            else map.once('load', () => applyRoute(finalCoords));
          } else if (coords.length >= 2 && coords.length <= 25) {
            // Fallback: Directions (may choose different path between waypoints)
            const dirStr = coords.map((c) => `${c[0]},${c[1]}`).join(';');
            fetch(
              `https://api.mapbox.com/directions/v5/mapbox/driving/${dirStr}?geometries=geojson&overview=full&access_token=${token}`
            )
              .then((r2) => r2.json())
              .then((dirData) => {
                if (cancelled) return;
                const routeCoords = dirData?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
                const fc = routeCoords && routeCoords.length >= 2 ? routeCoords : coords;
                runUpdate(fc);
              })
              .catch(() => { if (!cancelled) runUpdate(coords); });
          } else {
            runUpdate(coords);
          }
        })
        .catch(() => {
          if (cancelled) return;
          if (coords.length >= 2 && coords.length <= 25) {
            const coordsStr = coords.map((c) => `${c[0]},${c[1]}`).join(';');
            fetch(
              `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsStr}?geometries=geojson&overview=full&access_token=${token}`
            )
              .then((r) => r.json())
              .then((dirData) => {
                if (cancelled) return;
                const routeCoords = dirData?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
                runUpdate(routeCoords && routeCoords.length >= 2 ? routeCoords : coords);
              })
              .catch(() => runUpdate(coords));
          } else {
            runUpdate(coords);
          }
        });
    } else {
      runUpdate(coords);
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

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 220 }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 220 }} />
      <div className="trip-map-style-control">
        <button
          type="button"
          onClick={() => setMapStyle((s) => (s === 'map' ? 'satellite' : 'map'))}
          title={mapStyle === 'map' ? 'Switch to satellite' : 'Switch to map'}
        >
          {mapStyle === 'map' ? 'Satellite' : 'Map'}
        </button>
      </div>
    </div>
  );
}
