'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const DEFAULT_CENTER: [number, number] = [151.2093, -33.8688]; // Sydney fallback if no geolocation
const DEFAULT_ZOOM = 12;

/** Create a GeoJSON polygon approximating a circle (center [lng, lat], radius in meters). */
function circleToPolygon(centerLng: number, centerLat: number, radiusMeters: number, steps = 64): GeoJSON.Polygon {
  const km = radiusMeters / 1000;
  const latRad = (centerLat * Math.PI) / 180;
  const dx = km / (111.32 * Math.cos(latRad));
  const dy = km / 110.574;
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    coords.push([centerLng + dx * Math.cos(theta), centerLat + dy * Math.sin(theta)]);
  }
  return { type: 'Polygon', coordinates: [coords] };
}

export const GEOFENCE_COLORS = {
  keep_in: '#22c55e',
  keep_out: '#f97316',
} as const;

/** Text size for label: scale by radius so larger circles get larger text (clamped). */
function labelTextSize(radiusMeters: number): number {
  return Math.min(20, Math.max(10, 10 + radiusMeters / 400));
}

function buildExistingGeofencesGeoJSON(geofences: ExistingGeofence[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = geofences.map((g) => {
    const polygon = circleToPolygon(g.center_lng, g.center_lat, g.radius_meters);
    const color = g.alert_type === 'keep_out' ? GEOFENCE_COLORS.keep_out : GEOFENCE_COLORS.keep_in;
    return {
      type: 'Feature',
      properties: { color },
      geometry: polygon,
    };
  });
  return { type: 'FeatureCollection', features };
}

function buildGeofenceLabelsGeoJSON(geofences: ExistingGeofence[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = geofences.map((g) => ({
    type: 'Feature' as const,
    properties: {
      name: g.name || 'Geofence',
      textSize: labelTextSize(g.radius_meters),
    },
    geometry: {
      type: 'Point' as const,
      coordinates: [g.center_lng, g.center_lat],
    },
  }));
  return { type: 'FeatureCollection', features };
}

function updateExistingGeofences(map: mapboxgl.Map, geofences: ExistingGeofence[]) {
  const src = map.getSource('geofences-existing') as mapboxgl.GeoJSONSource | undefined;
  if (src) src.setData(buildExistingGeofencesGeoJSON(geofences));
  const labelsSrc = map.getSource('geofences-labels') as mapboxgl.GeoJSONSource | undefined;
  if (labelsSrc) labelsSrc.setData(buildGeofenceLabelsGeoJSON(geofences));
}

export type ExistingGeofence = {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  alert_type?: 'keep_in' | 'keep_out';
};

export type GeofencePickerMapProps = {
  centerLat: number | null;
  centerLng: number | null;
  radiusMeters: number;
  alertType?: 'keep_in' | 'keep_out';
  existingGeofences?: ExistingGeofence[];
  onCenterChange: (lat: number, lng: number) => void;
  onRadiusChange?: (meters: number) => void;
  showRadiusSlider?: boolean;
  className?: string;
};

export default function GeofencePickerMap({
  centerLat,
  centerLng,
  radiusMeters,
  alertType = 'keep_in',
  existingGeofences = [],
  onCenterChange,
  onRadiusChange,
  showRadiusSlider = true,
  className = '',
}: GeofencePickerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const stateRef = useRef({ centerLat, centerLng, radiusMeters, alertType, existingGeofences });
  stateRef.current = { centerLat, centerLng, radiusMeters, alertType, existingGeofences };

  const hasCenter = centerLat != null && centerLng != null && Number.isFinite(centerLat) && Number.isFinite(centerLng);

  const center: [number, number] = hasCenter ? [centerLng!, centerLat!] : DEFAULT_CENTER;

  useEffect(() => {
    if (!containerRef.current || !token) return;
    const container = containerRef.current;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container,
      style: 'mapbox://styles/mapbox/dark-v11',
      center,
      zoom: DEFAULT_ZOOM,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    mapRef.current = map;

    const resizeMap = () => {
      map.resize();
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resizeMap) : null;
    if (ro) ro.observe(container);
    window.addEventListener('resize', resizeMap);

    // Center map on user's location
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const [lng, lat] = [pos.coords.longitude, pos.coords.latitude];
          if (mapRef.current) {
            mapRef.current.setCenter([lng, lat]);
            mapRef.current.setZoom(14);
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    }

    map.on('click', (e) => {
      const { lng, lat } = e.lngLat;
      onCenterChange(lat, lng);
    });

    map.on('load', () => {
      // Existing geofences (drawn first, below preview)
      if (!map.getSource('geofences-existing')) {
        map.addSource('geofences-existing', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: 'geofences-existing-fill',
          type: 'fill',
          source: 'geofences-existing',
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.25,
          },
        });
        map.addLayer({
          id: 'geofences-existing-line',
          type: 'line',
          source: 'geofences-existing',
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 2.5,
          },
        });
      }
      // Labels at center of each existing geofence (name, text size scaled by radius)
      if (!map.getSource('geofences-labels')) {
        map.addSource('geofences-labels', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: 'geofences-labels-text',
          type: 'symbol',
          source: 'geofences-labels',
          layout: {
            'text-field': ['get', 'name'],
            'text-size': ['get', 'textSize'],
            'text-anchor': 'center',
            'text-allow-overlap': false,
            'text-ignore-placement': false,
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(0,0,0,0.75)',
            'text-halo-width': 1.5,
          },
        });
      }
      // Preview circle (new geofence being created)
      if (!map.getSource('geofence-circle')) {
        map.addSource('geofence-circle', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: 'geofence-circle-fill',
          type: 'fill',
          source: 'geofence-circle',
          paint: { 'fill-color': '#f97316', 'fill-opacity': 0.2 },
        });
        map.addLayer({
          id: 'geofence-circle-line',
          type: 'line',
          source: 'geofence-circle',
          paint: { 'line-color': '#f97316', 'line-width': 2 },
        });
      }
      updateExistingGeofences(map, stateRef.current.existingGeofences);
      const { centerLat: clat, centerLng: clng, radiusMeters: r, alertType: aType } = stateRef.current;
      const hasC = clat != null && clng != null && Number.isFinite(clat) && Number.isFinite(clng);
      const color = GEOFENCE_COLORS[aType ?? 'keep_in'];
      if (hasC && r > 0) {
        const polygon = circleToPolygon(clng!, clat!, r);
        const geojson: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: [{ type: 'Feature', properties: {}, geometry: polygon }],
        };
        (map.getSource('geofence-circle') as mapboxgl.GeoJSONSource).setData(geojson);
        map.setPaintProperty('geofence-circle-fill', 'fill-color', color);
        map.setPaintProperty('geofence-circle-line', 'line-color', color);
      }
    });

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', resizeMap);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    updateExistingGeofences(map, existingGeofences);
  }, [existingGeofences]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const color = GEOFENCE_COLORS[alertType];
    if (map.getLayer('geofence-circle-fill')) map.setPaintProperty('geofence-circle-fill', 'fill-color', color);
    if (map.getLayer('geofence-circle-line')) map.setPaintProperty('geofence-circle-line', 'line-color', color);
    if (hasCenter) {
      map.setCenter([centerLng!, centerLat!]);
      const polygon = circleToPolygon(centerLng!, centerLat!, radiusMeters);
      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: polygon }],
      };
      const src = map.getSource('geofence-circle') as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(geojson);
    } else {
      const src = map.getSource('geofence-circle') as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [hasCenter, centerLat, centerLng, radiusMeters, alertType]);

  if (!token) {
    return (
      <div className={className} style={{ padding: 12, background: 'var(--surface)', borderRadius: 8, color: 'var(--muted)' }}>
        Mapbox token not set. Set center and radius in the form below.
      </div>
    );
  }

  return (
    <div className={className} style={{ width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          flex: 1,
          minHeight: 420,
          borderRadius: 8,
          overflow: 'hidden',
          cursor: 'crosshair',
          border: '1px solid var(--border)',
        }}
        title="Click to set geofence center and draw the circle"
      />
      {showRadiusSlider && onRadiusChange && (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Radius</label>
          <input
            type="range"
            className="geofence-radius-range"
            min={50}
            max={50000}
            step={100}
            value={Math.min(50000, Math.max(50, radiusMeters))}
            onChange={(e) => onRadiusChange(parseInt(e.target.value, 10))}
            style={{
              flex: 1,
              ['--range-percent' as string]: `${((Math.min(50000, Math.max(50, radiusMeters)) - 50) / (50000 - 50)) * 100}%`,
            }}
          />
          <span style={{ fontSize: 13, color: 'var(--muted)', minWidth: 52 }}>{radiusMeters} m</span>
        </div>
      )}
      <p style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
        Click on the map to set the center and draw the circle. Adjust the slider for radius.
      </p>
    </div>
  );
}
