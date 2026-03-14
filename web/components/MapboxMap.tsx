'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const MAP_STYLES = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
} as const;

type Props = {
  lat: number;
  lng: number;
  history: { latitude: number; longitude: number }[];
  /** 'pin' = default orange teardrop; 'circle-car' = circle with car icon (e.g. for share page) */
  markerVariant?: 'pin' | 'circle-car';
  /** 'dark' = default; 'satellite' = satellite imagery with streets */
  mapStyle?: keyof typeof MAP_STYLES;
};

export default function MapboxMap({ lat, lng, history, markerVariant = 'pin', mapStyle = 'dark' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || !token) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLES[mapStyle],
      center: [lng, lat],
      zoom: 14,
      maxBounds: [[112, -44], [154, -10]],
    });
    mapRef.current = map;
    const marker =
      markerVariant === 'circle-car'
        ? (() => {
            const el = document.createElement('div');
            el.className = 'mapbox-marker-circle-car';
            el.innerHTML = `
              <span class="mapbox-marker-circle-car__circle">
                <svg class="mapbox-marker-circle-car__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.9-2.2-2.7c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9C2.5 8.8 2 9.8 2 11v4c0 .6.4 1 1 1h2"/>
                  <circle cx="7.5" cy="17.5" r="2.5"/>
                  <circle cx="16.5" cy="17.5" r="2.5"/>
                </svg>
              </span>
            `;
            return new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
          })()
        : new mapboxgl.Marker({ color: '#f97316' }).setLngLat([lng, lat]).addTo(map);
    markerRef.current = marker;
    return () => {
      marker.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [mapStyle]);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setLngLat([lng, lat]);
    mapRef.current.setCenter([lng, lat]);
  }, [lat, lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !token || history.length < 2) return;
    const geojson: GeoJSON.LineString = {
      type: 'LineString',
      coordinates: history.map((p) => [p.longitude, p.latitude]),
    };

    function addOrUpdateHistory() {
      const m = mapRef.current;
      if (!m) return;
      const existing = m.getSource('history');
      if (existing) {
        (existing as mapboxgl.GeoJSONSource).setData(geojson);
        return;
      }
      m.addSource('history', { type: 'geojson', data: geojson });
      m.addLayer({
        id: 'history-line',
        type: 'line',
        source: 'history',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#f97316', 'line-width': 2 },
      });
    }

    if (map.isStyleLoaded()) {
      addOrUpdateHistory();
    } else {
      map.once('load', addOrUpdateHistory);
    }
  }, [history]);

  if (!token) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)' }}>
        Mapbox token not set
      </div>
    );
  }

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
