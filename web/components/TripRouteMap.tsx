'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

type Point = { lat: number; lon: number; occurred_at?: string };

type Props = {
  points: Point[];
  startLat: number | null;
  startLon: number | null;
  endLat: number | null;
  endLon: number | null;
  className?: string;
};

export default function TripRouteMap({ points, startLat, startLon, endLat, endLon, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

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

    const coords = points.length >= 2
      ? points.map((p) => [p.lon, p.lat] as [number, number])
      : startLat != null && startLon != null && endLat != null && endLon != null
        ? [[startLon, startLat] as [number, number], [endLon, endLat] as [number, number]]
        : [];

    // Use first/last point from route data for markers when available, so end marker shows
    // actual last recorded position (e.g. where you parked) not trip detection's "last moving" point
    const first = points.length > 0 ? points[0] : null;
    const last = points.length > 0 ? points[points.length - 1] : null;
    const markerStartLat = first ? first.lat : startLat;
    const markerStartLon = first ? first.lon : startLon;
    const markerEndLat = last ? last.lat : endLat;
    const markerEndLon = last ? last.lon : endLon;

    const fitBounds = () => {
      if (coords.length < 2) return;
      const lngs = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 40, maxZoom: 16, duration: 0 }
      );
    };

    const onLoad = () => {
      if (map.getLayer('route')) map.removeLayer('route');
      if (map.getSource('route')) map.removeSource('route');
      if (coords.length >= 2) {
        map.addSource('route', {
          type: 'geojson',
          data: { type: 'LineString', coordinates: coords },
        });
        map.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#3b82f6', 'line-width': 3 },
        });
      }
      if (markerStartLat != null && markerStartLon != null) {
        const el = document.createElement('div');
        el.className = 'trip-map-marker trip-map-marker--start';
        el.style.width = '16px';
        el.style.height = '16px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = '#22c55e';
        el.style.border = '2px solid #fff';
        el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)';
        const m = new mapboxgl.Marker({ element: el }).setLngLat([markerStartLon, markerStartLat]).addTo(map);
        markersRef.current.push(m);
      }
      if (markerEndLat != null && markerEndLon != null) {
        const el = document.createElement('div');
        el.className = 'trip-map-marker trip-map-marker--end';
        el.style.width = '16px';
        el.style.height = '16px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = '#ef4444';
        el.style.border = '2px solid #fff';
        el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)';
        const m = new mapboxgl.Marker({ element: el }).setLngLat([markerEndLon, markerEndLat]).addTo(map);
        markersRef.current.push(m);
      }
      fitBounds();
    };

    if (map.isStyleLoaded()) {
      onLoad();
    } else {
      map.once('load', onLoad);
    }
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
