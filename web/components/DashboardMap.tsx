'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const DEFAULT_CENTER: [number, number] = [133.8, -25.3];
const DEFAULT_ZOOM = 3;

export type MapMarker = { id: string; name: string | null; lat: number; lng: number };

type Props = {
  markers?: MapMarker[];
};

export default function DashboardMap({ markers = [] }: Props) {
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
    const valid = markers.filter((m) => typeof m.lat === 'number' && typeof m.lng === 'number');
    valid.forEach((m) => {
      const marker = new mapboxgl.Marker({ color: '#f97316' })
        .setLngLat([m.lng, m.lat])
        .addTo(map);
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
  }, [markers]);

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
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        background: 'var(--surface)',
      }}
    />
  );
}
