'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

type Props = {
  lat: number;
  lng: number;
  history: { latitude: number; longitude: number }[];
};

export default function MapboxMap({ lat, lng, history }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || !token) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [lng, lat],
      zoom: 14,
    });
    mapRef.current = map;
    const marker = new mapboxgl.Marker({ color: '#f97316' }).setLngLat([lng, lat]).addTo(map);
    markerRef.current = marker;
    return () => {
      marker.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

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
    if (map.getSource('history')) {
      (map.getSource('history') as mapboxgl.GeoJSONSource).setData(geojson);
    } else {
      map.on('load', () => {
        map.addSource('history', { type: 'geojson', data: geojson });
        map.addLayer({
          id: 'history-line',
          type: 'line',
          source: 'history',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#f97316', 'line-width': 2 },
        });
      });
      if (map.isStyleLoaded()) map.fire('load');
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
