'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

export type SuburbData = {
  suburb: string;
  lga: string;
  byYear: Record<number, number>;
  total: number;
};

const SUBURB_COORDS: Record<string, [number, number]> = {
  // ── Greater Melbourne ──────────────────────────────────────────────────────
  'Frankston':         [-38.1440, 145.1268],
  'Dandenong':         [-37.9870, 145.2150],
  'Pakenham':          [-38.0716, 145.4877],
  'Werribee':          [-37.8999, 144.6565],
  'Melton':            [-37.6882, 144.5798],
  'Cranbourne':        [-38.1194, 145.2833],
  'Ringwood':          [-37.8130, 145.2260],
  'Epping':            [-37.6452, 145.0233],
  'Springvale':        [-37.9476, 145.1509],
  'Hampton Park':      [-38.0257, 145.2451],
  'Bayswater':         [-37.8450, 145.2639],
  'Narre Warren':      [-38.0243, 145.3005],
  'Thomastown':        [-37.6863, 145.0131],
  'Broadmeadows':      [-37.6813, 144.9203],
  'Reservoir':         [-37.7192, 145.0073],
  'Sunshine':          [-37.7885, 144.8317],
  'Footscray':         [-37.8001, 144.8997],
  'Campbellfield':     [-37.6638, 144.9609],
  'Berwick':           [-38.0360, 145.3480],
  'Coburg':            [-37.7432, 144.9661],
  'Heidelberg':        [-37.7535, 145.0666],
  'Clayton':           [-37.9193, 145.1218],
  'Moorabbin':         [-37.9316, 145.0526],
  'Dandenong North':   [-37.9637, 145.2223],
  'Keysborough':       [-37.9923, 145.1752],
  'Hoppers Crossing':  [-37.8834, 144.6988],
  'Tarneit':           [-37.8600, 144.6700],
  'Wyndham Vale':      [-37.9016, 144.6362],
  'Roxburgh Park':     [-37.6445, 144.9375],
  'Craigieburn':       [-37.6032, 144.9490],
  'Mill Park':         [-37.6703, 145.0614],
  'Bundoora':          [-37.7047, 145.0534],
  'Deer Park':         [-37.7806, 144.7736],
  'St Albans':         [-37.7488, 144.8028],
  'Altona':            [-37.8683, 144.8326],
  'Laverton':          [-37.8626, 144.7735],
  'Point Cook':        [-37.9117, 144.7493],
  'Truganina':         [-37.8633, 144.7117],
  'Dandenong South':   [-38.0050, 145.2020],
  'Noble Park':        [-37.9666, 145.1636],
  'Hallam':            [-38.0320, 145.2670],
  'Cheltenham':        [-37.9548, 145.0620],
  'Mordialloc':        [-38.0048, 145.0891],
  'Carrum Downs':      [-38.1027, 145.1808],
  'Seaford':           [-38.1138, 145.1745],
  'Doveton':           [-37.9996, 145.2308],
  'Oakleigh':          [-37.8986, 145.0960],
  'Chadstone':         [-37.8914, 145.0721],
  'Nunawading':        [-37.8193, 145.1760],
  'Boronia':           [-37.8610, 145.2864],
  'Ferntree Gully':    [-37.8843, 145.2964],
  'Wantirna':          [-37.8490, 145.2382],
  'Lilydale':          [-37.7549, 145.3508],
  'Mooroolbark':       [-37.7793, 145.3147],
  'Croydon':           [-37.7952, 145.2819],
  'Mitcham':           [-37.8111, 145.1965],
  'Doncaster':         [-37.7878, 145.1224],
  'Eltham':            [-37.7131, 145.1494],
  'Greensborough':     [-37.7042, 145.1000],
  'Lalor':             [-37.6650, 145.0190],
  'Preston':           [-37.7445, 145.0222],
  'Thornbury':         [-37.7517, 145.0066],
  'Northcote':         [-37.7656, 145.0073],
  'Brunswick':         [-37.7674, 144.9605],
  'Carlton':           [-37.7993, 144.9672],
  'Melbourne':         [-37.8136, 144.9631],
  'Richmond':          [-37.8231, 145.0001],
  'Collingwood':       [-37.8014, 144.9876],
  'South Yarra':       [-37.8389, 144.9904],
  'St Kilda':          [-37.8678, 144.9818],
  'Brighton':          [-37.9055, 144.9980],
  'Bentleigh':         [-37.9160, 145.0311],
  'Malvern':           [-37.8593, 145.0290],
  'Hawthorn':          [-37.8223, 145.0299],
  'Camberwell':        [-37.8384, 145.0578],
  'Box Hill':          [-37.8199, 145.1218],
  'Blackburn':         [-37.8201, 145.1528],
  'Glen Waverley':     [-37.8787, 145.1636],
  'Mount Waverley':    [-37.8768, 145.1310],
  'Rowville':          [-37.9355, 145.2261],
  'Endeavour Hills':   [-38.0131, 145.2636],
  'Lyndhurst':         [-38.0476, 145.2419],
  'Chelsea':           [-38.0454, 145.1201],
  'Edithvale':         [-38.0248, 145.1024],
  'Mentone':           [-37.9783, 145.0617],
  'Parkdale':          [-37.9883, 145.0774],
  'Dingley Village':   [-37.9826, 145.1253],
  'Clayton South':     [-37.9400, 145.1250],
  'Mornington':        [-38.2170, 145.0380],
  'Frankston South':   [-38.1788, 145.1330],
  'Skye':              [-38.0865, 145.2158],
  'Braeside':          [-37.9930, 145.1118],
  'Aspendale':         [-38.0131, 145.0949],
  'Heatherton':        [-37.9630, 145.0876],
  'Springvale South':  [-37.9680, 145.1510],
  'Wheelers Hill':     [-37.9071, 145.1879],
  'Vermont':           [-37.8322, 145.1895],
  'Doncaster East':    [-37.7988, 145.1534],
  'Templestowe':       [-37.7528, 145.1590],
  'Wantirna South':    [-37.8620, 145.2440],
  'Knoxfield':         [-37.9012, 145.2448],
  'Bayswater North':   [-37.8253, 145.2842],
  'Kilsyth':           [-37.8135, 145.3192],
  'Scoresby':          [-37.9162, 145.2565],
  'Syndal':            [-37.8842, 145.1534],
  'Narre Warren North':[-37.9890, 145.3370],
  'Cranbourne North':  [-38.0800, 145.2900],
  'Cranbourne East':   [-38.1100, 145.3200],
  'Officer':           [-38.0680, 145.4220],
  'Clyde':             [-38.1120, 145.3550],
  'Clyde North':       [-38.1300, 145.3300],
  'Berwick South':     [-38.0580, 145.3630],
  'Botanic Ridge':     [-38.1620, 145.2990],
  'Langwarrin':        [-38.1580, 145.1820],
  'Somerville':        [-38.2220, 145.1720],
  'Tyabb':             [-38.2480, 145.1870],
  'Hastings':          [-38.3060, 145.1920],
  'Rosebud':           [-38.3580, 144.9000],
  'Rye':               [-38.3720, 144.8280],
  'Sorrento':          [-38.3440, 144.7380],
  'Mount Eliza':       [-38.1920, 145.0960],
  'Frankston North':   [-38.1130, 145.1380],
  'Carrum':            [-38.0680, 145.1240],
  'Patterson Lakes':   [-38.0430, 145.1090],
  'Sandringham':       [-37.9498, 145.0049],
  'Hampton':           [-37.9320, 144.9990],
  'Beaumaris':         [-37.9770, 145.0360],
  'Black Rock':        [-37.9680, 145.0160],
  'Highett':           [-37.9440, 145.0430],
  'Moorleigh':         [-37.9210, 145.0730],
  'Murrumbeena':       [-37.9010, 145.0600],
  'Carnegie':          [-37.8900, 145.0560],
  'Elsternwick':       [-37.8840, 145.0020],
  'Caulfield':         [-37.8770, 145.0230],
  'Glen Iris':         [-37.8620, 145.0490],
  'Prahran':           [-37.8500, 144.9930],
  'Windsor':           [-37.8560, 144.9950],
  'Toorak':            [-37.8440, 145.0180],
  'Glen Huntly':       [-37.8920, 145.0450],
  'Ormond':            [-37.9020, 145.0390],
  'McKinnon':          [-37.9120, 145.0450],
  'Bentleigh East':    [-37.9220, 145.0560],
  'Moorabbin Airport': [-37.9750, 145.1020],
  'Bonbeach':          [-38.0900, 145.1190],
  'Chelsea Heights':   [-38.0590, 145.1280],
  'Bangholme':         [-38.0220, 145.1830],
  'Keilor':            [-37.7280, 144.8270],
  'Keilor East':       [-37.7450, 144.8610],
  'Keilor Downs':      [-37.7500, 144.8220],
  'Sunshine North':    [-37.7700, 144.8380],
  'Sunshine West':     [-37.8020, 144.8090],
  'Derrimut':          [-37.8010, 144.7570],
  'Brooklyn':          [-37.8260, 144.8490],
  'Altona North':      [-37.8420, 144.8470],
  'Altona Meadows':    [-37.8990, 144.7860],
  'Seabrook':          [-37.8930, 144.7540],
  'Williamstown':      [-37.8640, 144.8990],
  'Newport':           [-37.8490, 144.8850],
  'Spotswood':         [-37.8330, 144.8900],
  'Yarraville':        [-37.8180, 144.8900],
  'Seddon':            [-37.8180, 144.8790],
  'Kingsville':        [-37.8220, 144.8720],
  'West Footscray':    [-37.7980, 144.8730],
  'Maidstone':         [-37.7830, 144.8680],
  'Maribyrnong':       [-37.7700, 144.8900],
  'Essendon':          [-37.7490, 144.9210],
  'Moonee Ponds':      [-37.7620, 144.9220],
  'Ascot Vale':        [-37.7740, 144.9230],
  'Flemington':        [-37.7830, 144.9290],
  'Kensington':        [-37.7950, 144.9300],
  'North Melbourne':   [-37.8000, 144.9490],
  'Parkville':         [-37.7870, 144.9530],
  'East Melbourne':    [-37.8130, 144.9820],
  'Fitzroy':           [-37.7990, 145.0000],
  'Abbotsford':        [-37.8044, 144.9980],
  'Clifton Hill':      [-37.7930, 145.0050],
  'Alphington':        [-37.7780, 145.0190],
  'Fairfield':         [-37.7810, 145.0230],
  'Ivanhoe':           [-37.7680, 145.0440],
  'Eaglemont':         [-37.7620, 145.0670],
  'Rosanna':           [-37.7480, 145.0670],
  'Macleod':           [-37.7330, 145.0760],
  'Watsonia':          [-37.7110, 145.0850],
  'Briar Hill':        [-37.7110, 145.1020],
  'Diamond Creek':     [-37.6716, 145.1600],
  'Mernda':            [-37.6072, 145.0931],
  'South Morang':      [-37.6452, 145.1002],
  'Wollert':           [-37.5900, 145.0440],
  'Doreen':            [-37.6170, 145.1440],
  'Yan Yean':          [-37.5720, 145.1440],
  'Whittlesea':        [-37.5150, 145.1220],
  'Plenty':            [-37.6710, 145.1250],
  'Yarrambat':         [-37.6490, 145.1340],
  'St Helena':         [-37.7030, 145.1440],
  'Montmorency':       [-37.7181, 145.1228],
  'Eltham North':      [-37.6980, 145.1510],
  'Research':          [-37.6990, 145.1850],
  'Warrandyte':        [-37.7380, 145.2280],
  'Park Orchards':     [-37.7920, 145.2280],
  'Ringwood East':     [-37.8200, 145.2540],
  'Ringwood North':    [-37.7942, 145.2349],
  'Heathmont':         [-37.8340, 145.2440],
  'Donvale':           [-37.7980, 145.2000],
  'Forest Hill':       [-37.8350, 145.1730],
  'Burwood':           [-37.8490, 145.1200],
  'Burwood East':      [-37.8530, 145.1570],
  'Notting Hill':      [-37.9000, 145.1360],
  'Mulgrave':          [-37.9340, 145.1840],
  'Lysterfield':       [-37.9480, 145.2660],

  // ── Geelong & Surf Coast ──────────────────────────────────────────────────
  'Geelong':           [-38.1499, 144.3617],
  'Geelong West':      [-38.1440, 144.3390],
  'Belmont':           [-38.1770, 144.3710],
  'Norlane':           [-38.1090, 144.3570],
  'Corio':             [-38.0980, 144.3570],
  'Newcomb':           [-38.1620, 144.4010],
  'Whittington':       [-38.1950, 144.4010],
  'Thomson':           [-38.1700, 144.4160],
  'Grovedale':         [-38.2050, 144.3770],
  'Waurn Ponds':       [-38.2300, 144.3100],
  'Lara':              [-38.0200, 144.4070],
  'Leopold':           [-38.1890, 144.4680],
  'Torquay':           [-38.3300, 144.3230],
  'Ocean Grove':       [-38.2650, 144.5230],
  'Drysdale':          [-38.1760, 144.5680],
  'Portarlington':     [-38.1120, 144.6540],
  'Clifton Springs':   [-38.1530, 144.5590],

  // ── Ballarat ──────────────────────────────────────────────────────────────
  'Ballarat':          [-37.5622, 143.8503],
  'Ballarat East':     [-37.5600, 143.8800],
  'Ballarat North':    [-37.5400, 143.8500],
  'Wendouree':         [-37.5400, 143.8220],
  'Sebastopol':        [-37.5920, 143.8540],
  'Mount Clear':       [-37.6060, 143.8720],
  'Alfredton':         [-37.5640, 143.8090],
  'Delacombe':         [-37.5900, 143.8090],
  'Lucas':             [-37.5470, 143.7940],

  // ── Bendigo ───────────────────────────────────────────────────────────────
  'Bendigo':           [-36.7570, 144.2794],
  'Kangaroo Flat':     [-36.8050, 144.2540],
  'Eaglehawk':         [-36.7180, 144.2520],
  'Flora Hill':        [-36.7700, 144.3070],
  'Strathdale':        [-36.7430, 144.3020],
  'Golden Square':     [-36.7820, 144.2720],
  'Long Gully':        [-36.7350, 144.2650],
  'Epsom':             [-36.7130, 144.3240],
  'Jackass Flat':      [-36.6900, 144.3220],

  // ── Shepparton ────────────────────────────────────────────────────────────
  'Shepparton':        [-36.3803, 145.3990],
  'Shepparton East':   [-36.3700, 145.4300],
  'Mooroopna':         [-36.3870, 145.3570],
  'Kialla':            [-36.4100, 145.3890],
  'Tatura':            [-36.4440, 145.2230],

  // ── Wodonga / Albury ──────────────────────────────────────────────────────
  'Wodonga':           [-36.1215, 146.8880],
  'Wodonga West':      [-36.1350, 146.8700],
  'Baranduda':         [-36.1550, 146.9240],
  'Bandiana':          [-36.1290, 146.9180],

  // ── Mildura ───────────────────────────────────────────────────────────────
  'Mildura':           [-34.1850, 142.1621],
  'Merbein':           [-34.1710, 142.0750],
  'Irymple':           [-34.2340, 142.1740],
  'Nichols Point':     [-34.2060, 142.1890],
  'Red Cliffs':        [-34.3080, 142.1900],

  // ── Latrobe Valley ───────────────────────────────────────────────────────
  'Traralgon':         [-38.1956, 146.5406],
  'Morwell':           [-38.2340, 146.3970],
  'Moe':               [-38.1720, 146.2640],
  'Churchill':         [-38.3140, 146.4140],
  'Newborough':        [-38.2230, 146.2810],
  'Yallourn North':    [-38.1760, 146.3540],

  // ── Wangaratta / Benalla ──────────────────────────────────────────────────
  'Wangaratta':        [-36.3581, 146.3128],
  'Benalla':           [-36.5520, 146.0070],

  // ── Warrnambool ───────────────────────────────────────────────────────────
  'Warrnambool':       [-38.3837, 142.4863],
  'Dennington':        [-38.3680, 142.4580],
  'Merrivale':         [-38.3980, 142.4830],

  // ── Horsham / Ararat ──────────────────────────────────────────────────────
  'Horsham':           [-36.7120, 142.1998],
  'Ararat':            [-37.2830, 142.9230],

  // ── Colac / Camperdown ────────────────────────────────────────────────────
  'Colac':             [-38.3380, 143.5840],
  'Camperdown':        [-38.2320, 143.1500],

  // ── Drouin / Pakenham region ─────────────────────────────────────────────
  'Drouin':            [-38.1360, 145.8600],
  'Warragul':          [-38.1620, 145.9310],
  'Trafalgar':         [-38.2110, 146.1610],
  'Yarragon':          [-38.2100, 146.0010],

  // ── Echuca ────────────────────────────────────────────────────────────────
  'Echuca':            [-36.1420, 144.7520],
  'Moama':             [-36.1030, 144.7450],

  // ── Swan Hill ─────────────────────────────────────────────────────────────
  'Swan Hill':         [-35.3380, 143.5530],
};

function getSuburbCoords(name: string): [number, number] | null {
  const key = Object.keys(SUBURB_COORDS).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? SUBURB_COORDS[key]! : null;
}

function buildFeatures(suburbs: SuburbData[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const maxTheft = suburbs[0]?.total ?? 1;
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (const s of suburbs) {
    const coords = getSuburbCoords(s.suburb);
    if (!coords) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [coords[1], coords[0]] },
      properties: { suburb: s.suburb, lga: s.lga, total: s.total, intensity: s.total / maxTheft },
    });
  }
  return { type: 'FeatureCollection', features };
}

export default function TheftMap({ suburbs }: { suburbs: SuburbData[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<mapboxgl.Map | null>(null);
  const loadedRef    = useRef(false);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    if (!containerRef.current || !token || mapRef.current) return;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [145.0, -37.0],
      zoom: 6.5,
      maxBounds: [[140.9, -39.2], [150.0, -33.9]],
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      map.addSource('thefts', { type: 'geojson', data: buildFeatures([]) });

      map.addLayer({
        id: 'theft-heat', type: 'heatmap', source: 'thefts', maxzoom: 13,
        paint: {
          'heatmap-weight':     ['interpolate', ['linear'], ['get', 'intensity'], 0, 0, 1, 1],
          'heatmap-intensity':  ['interpolate', ['linear'], ['zoom'], 5, 0.4, 10, 1.5],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)', 0.15, '#fdba74', 0.35, '#f97316',
            0.6, '#dc2626', 0.85, '#991b1b', 1, '#7f1d1d',
          ],
          'heatmap-radius':   ['interpolate', ['linear'], ['zoom'], 5, 14, 10, 40],
          'heatmap-opacity':  ['interpolate', ['linear'], ['zoom'], 10, 0.85, 13, 0],
        },
      });

      map.addLayer({
        id: 'theft-circles', type: 'circle', source: 'thefts',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            5,  ['interpolate', ['linear'], ['get', 'intensity'], 0, 3,  1, 10],
            8,  ['interpolate', ['linear'], ['get', 'intensity'], 0, 5,  1, 16],
            12, ['interpolate', ['linear'], ['get', 'intensity'], 0, 6,  1, 24],
          ],
          'circle-color': [
            'interpolate', ['linear'], ['get', 'intensity'],
            0, '#fdba74', 0.2, '#f97316', 0.5, '#ef4444', 0.8, '#991b1b', 1, '#7f1d1d',
          ],
          'circle-opacity': 0.75,
          'circle-stroke-color': 'rgba(255,255,255,0.12)',
          'circle-stroke-width': 1,
        },
      });

      map.addLayer({
        id: 'theft-labels', type: 'symbol', source: 'thefts', minzoom: 9.5,
        layout: {
          'text-field': ['concat', ['get', 'suburb'], '\n', ['to-string', ['get', 'total']]],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': 11, 'text-offset': [0, 1.6], 'text-anchor': 'top', 'text-max-width': 8,
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.7)', 'text-halo-width': 1.5 },
      });

      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
      map.on('mouseenter', 'theft-circles', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const f = e.features?.[0];
        if (!f) return;
        const { suburb, lga, total } = f.properties as { suburb: string; lga: string; total: number };
        popup.setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(`<div style="font-size:12px;line-height:1.5;color:#fff">
            <strong style="font-size:13px">${suburb}</strong><br/>
            <span style="color:#aaa">${lga}</span><br/>
            <span style="color:#f97316;font-weight:700">${total.toLocaleString()} thefts</span>
          </div>`).addTo(map);
      });
      map.on('mouseleave', 'theft-circles', () => { map.getCanvas().style.cursor = ''; popup.remove(); });

      loadedRef.current = true;
      if (suburbs.length > 0) {
        (map.getSource('thefts') as mapboxgl.GeoJSONSource)?.setData(buildFeatures(suburbs));
      }
    });

    return () => { mapRef.current?.remove(); mapRef.current = null; loadedRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loadedRef.current || !mapRef.current || suburbs.length === 0) return;
    const src = mapRef.current.getSource('thefts') as mapboxgl.GeoJSONSource | undefined;
    src?.setData(buildFeatures(suburbs));
  }, [suburbs]);

  if (!token) return null;

  return (
    <div className="ts-chart-wrap" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <p className="ts-chart-title" style={{ margin: 0 }}>Geographic Vehicle Theft Heatmap — Victoria</p>
        <p style={{ margin: '3px 0 0', fontSize: '0.6875rem', color: '#666' }}>
          Zoom in to see individual suburb circles. Hover for details.
        </p>
      </div>
      <div ref={containerRef} style={{ flex: 1, minHeight: 380, width: '100%' }} />
    </div>
  );
}
