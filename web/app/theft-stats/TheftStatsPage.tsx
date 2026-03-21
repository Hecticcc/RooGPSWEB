'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import MarketingHeader from '@/components/MarketingHeader';
import Logo from '@/components/Logo';
import Link from 'next/link';
import { Search, TrendingUp, TrendingDown, Minus, Shield, MapPin, AlertTriangle, ExternalLink, Car } from 'lucide-react';
import type { SuburbData } from './TheftMap';

const TheftMapDynamic = dynamic(() => import('./TheftMap'), {
  ssr: false,
  loading: () => (
    <div className="ts-chart-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 380, color: '#666', fontSize: '0.875rem' }}>
      Loading map…
    </div>
  ),
});

// ─── Types ───────────────────────────────────────────────────────────────────

type RawRecord = {
  Year: number;
  'Local Government Area': string;
  'Suburb/Town Name': string;
  'Offence Count': number;
};

const YEARS = [2016,2017,2018,2019,2020,2021,2022,2023,2024,2025];
const CHART_COLORS = ['#f97316','#fb923c','#fdba74','#fed7aa','#fef3c7'];
const BAR_COLOR = '#f97316';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function processData(raw: RawRecord[]): SuburbData[] {
  const map = new Map<string, SuburbData>();
  for (const r of raw) {
    const key = r['Suburb/Town Name'].trim().toUpperCase();
    if (!map.has(key)) {
      map.set(key, {
        suburb: r['Suburb/Town Name'].trim(),
        lga: r['Local Government Area'],
        byYear: {},
        total: 0,
      });
    }
    const entry = map.get(key)!;
    entry.byYear[r.Year] = (entry.byYear[r.Year] ?? 0) + r['Offence Count'];
    entry.total += r['Offence Count'];
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function getTrendYears(data: SuburbData): { olderYears: number[]; recentYears: number[] } {
  const available = YEARS.filter(y => (data.byYear[y] ?? 0) > 0).sort((a, b) => a - b);
  if (available.length < 4) return { olderYears: [], recentYears: [] };
  const n = Math.min(3, Math.floor(available.length / 2));
  return {
    olderYears:  available.slice(0, n),
    recentYears: available.slice(-n),
  };
}

function getTrend(data: SuburbData): 'up' | 'down' | 'stable' {
  const { olderYears, recentYears } = getTrendYears(data);
  if (!olderYears.length || !recentYears.length) return 'stable';
  const older  = olderYears.reduce((s, y)  => s + (data.byYear[y] ?? 0), 0) / olderYears.length;
  const recent = recentYears.reduce((s, y) => s + (data.byYear[y] ?? 0), 0) / recentYears.length;
  if (older === 0) return 'stable';
  const pct = ((recent - older) / older) * 100;
  if (pct > 15)  return 'up';
  if (pct < -15) return 'down';
  return 'stable';
}

function riskLevel(rank: number, total: number): 'critical' | 'high' | 'medium' | 'low' {
  const pct = rank / total;
  if (pct <= 0.05) return 'critical';
  if (pct <= 0.20) return 'high';
  if (pct <= 0.50) return 'medium';
  return 'low';
}

// ─── Mini sparkline ───────────────────────────────────────────────────────────

function Sparkline({ data, color = BAR_COLOR, height = 40, width = 120 }: { data: number[]; color?: string; height?: number; width?: number }) {
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - 4) + 2;
    const y = height - 2 - ((v / max) * (height - 4));
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

function BarChart({ labels, values, title }: { labels: string[]; values: number[]; title: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="ts-chart-wrap">
      <p className="ts-chart-title">{title}</p>
      <div className="ts-bar-chart">
        {labels.map((label, i) => (
          <div key={label} className="ts-bar-item">
            <div className="ts-bar-label">{label}</div>
            <div className="ts-bar-track">
              <div
                className="ts-bar-fill"
                style={{ width: `${(values[i]! / max) * 100}%`, background: CHART_COLORS[Math.min(i, CHART_COLORS.length - 1)] }}
              />
              <span className="ts-bar-value">{values[i]!.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Year line chart ─────────────────────────────────────────────────────────

function YearLineChart({ yearTotals }: { yearTotals: Record<number, number> }) {
  const vals = YEARS.map(y => yearTotals[y] ?? 0);
  const max = Math.max(...vals, 1);
  const W = 560, H = 100, PAD = { top: 10, right: 16, bottom: 28, left: 46 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;
  const pts = vals.map((v, i) => {
    const x = PAD.left + (i / (YEARS.length - 1)) * iW;
    const y = PAD.top + iH - (v / max) * iH;
    return { x, y, v, year: YEARS[i]! };
  });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${path} L${pts[pts.length-1]!.x},${PAD.top + iH} L${pts[0]!.x},${PAD.top + iH} Z`;

  const [hovered, setHovered] = useState<{ x: number; y: number; year: number; v: number } | null>(null);

  return (
    <div className="ts-chart-wrap" style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <p className="ts-chart-title">Total vehicle thefts per year — Victoria</p>
      <div style={{ overflowX: 'auto', flex: 1, display: 'flex', alignItems: 'center', position: 'relative' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ minWidth: 280 }}
          aria-label="Line chart of thefts by year"
          onMouseLeave={() => setHovered(null)}
        >
          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BAR_COLOR} stopOpacity="0.35" />
              <stop offset="100%" stopColor={BAR_COLOR} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {/* Grid lines */}
          {[0.25, 0.5, 0.75, 1].map(f => {
            const y = PAD.top + iH - f * iH;
            return (
              <g key={f}>
                <line x1={PAD.left} y1={y} x2={PAD.left + iW} y2={y} stroke="#2a2a32" strokeWidth="1" />
                <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize="9" fill="#666">
                  {Math.round(max * f).toLocaleString()}
                </text>
              </g>
            );
          })}
          {/* Area fill */}
          <path d={area} fill="url(#lineGrad)" />
          {/* Line */}
          <path d={path} fill="none" stroke={BAR_COLOR} strokeWidth="2" strokeLinejoin="round" />
          {/* Vertical crosshair */}
          {hovered && (
            <line
              x1={hovered.x} y1={PAD.top}
              x2={hovered.x} y2={PAD.top + iH}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}
          {/* Dots + year labels */}
          {pts.map(p => (
            <g key={p.year}>
              {/* Invisible large hit area */}
              <circle
                cx={p.x} cy={p.y} r="14"
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovered(p)}
              />
              <circle
                cx={p.x} cy={p.y}
                r={hovered?.year === p.year ? 5 : 3}
                fill={hovered?.year === p.year ? '#fff' : BAR_COLOR}
                stroke={hovered?.year === p.year ? BAR_COLOR : 'none'}
                strokeWidth="2"
                style={{ transition: 'r 0.1s, fill 0.1s', pointerEvents: 'none' }}
              />
              <text x={p.x} y={PAD.top + iH + 16} textAnchor="middle" fontSize="10" fill={hovered?.year === p.year ? '#ccc' : '#888'}>{p.year}</text>
            </g>
          ))}
        </svg>

        {/* Floating tooltip */}
        {hovered && (
          <div style={{
            position: 'absolute',
            left: `calc(${(hovered.x / W) * 100}% + 8px)`,
            top: `${(hovered.y / H) * 100}%`,
            transform: hovered.x / W > 0.7 ? 'translate(-110%, -50%)' : 'translateY(-50%)',
            background: '#1a1a24',
            border: '1px solid rgba(249,115,22,0.4)',
            borderRadius: '7px',
            padding: '7px 11px',
            pointerEvents: 'none',
            zIndex: 10,
            whiteSpace: 'nowrap',
          }}>
            <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: 2 }}>{hovered.year}</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: BAR_COLOR }}>{hovered.v.toLocaleString()}</div>
            <div style={{ fontSize: '0.6rem', color: '#666' }}>vehicle thefts</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Heatmap grid ────────────────────────────────────────────────────────────

function HeatmapGrid({ suburbs }: { suburbs: SuburbData[] }) {
  const top80 = suburbs.slice(0, 80);
  const maxVal = top80[0]?.total ?? 1;

  function getHeat(val: number): string {
    const pct = val / maxVal;
    if (pct > 0.8)  return '#7f1d1d';
    if (pct > 0.6)  return '#991b1b';
    if (pct > 0.45) return '#b91c1c';
    if (pct > 0.3)  return '#dc2626';
    if (pct > 0.2)  return '#ef4444';
    if (pct > 0.12) return '#f97316';
    if (pct > 0.06) return '#fb923c';
    return '#fdba74';
  }

  return (
    <div className="ts-chart-wrap">
      <p className="ts-chart-title">Theft intensity heatmap — top 80 Victoria suburbs</p>
      <div className="ts-heatmap-legend">
        <span style={{ color: '#aaa', fontSize: 12 }}>Lower risk</span>
        <div className="ts-heatmap-legend-bar" />
        <span style={{ color: '#aaa', fontSize: 12 }}>Higher risk</span>
      </div>
      <div className="ts-heatmap-grid">
        {top80.map((s) => (
          <div
            key={s.suburb}
            className="ts-heatmap-cell"
            style={{ background: getHeat(s.total) }}
            title={`${s.suburb}: ${s.total.toLocaleString()} thefts`}
          >
            <span className="ts-heatmap-name">{s.suburb}</span>
            <span className="ts-heatmap-count">{s.total.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Suburb search result ─────────────────────────────────────────────────────

function SuburbResult({ data, rank, total }: { data: SuburbData; rank: number; total: number }) {
  const trend = getTrend(data);
  const { olderYears, recentYears } = getTrendYears(data);
  const risk  = riskLevel(rank, total);
  const vals  = YEARS.map(y => data.byYear[y] ?? 0);
  const peak  = YEARS.reduce((best, y) => (data.byYear[y] ?? 0) > (data.byYear[best] ?? 0) ? y : best, YEARS[0]!);

  // Build a natural trend sentence using first & last year with data
  const dataYears   = YEARS.filter(y => (data.byYear[y] ?? 0) > 0).sort((a, b) => a - b);
  const firstYear   = dataYears[0];
  const lastYear    = dataYears[dataYears.length - 1];
  const firstVal    = firstYear ? (data.byYear[firstYear] ?? 0) : 0;
  const lastVal     = lastYear  ? (data.byYear[lastYear]  ?? 0) : 0;
  const overallPct  = firstVal > 0 ? Math.round(((lastVal - firstVal) / firstVal) * 100) : 0;
  const overallSign = overallPct > 0 ? '+' : '';

  // Describe the shape of the trend
  const midVals     = dataYears.slice(1, -1).map(y => data.byYear[y] ?? 0);
  const midAvg      = midVals.length ? midVals.reduce((s, v) => s + v, 0) / midVals.length : 0;
  const isSteady    = midVals.length > 2 && midVals.every((v, i) => i === 0 || v >= midVals[i-1]! * 0.85);
  const hadDip      = midAvg < Math.min(firstVal, lastVal) * 0.8;
  const latest2024 = data.byYear[2024] ?? 0;
  const latest2023 = data.byYear[2023] ?? 0;
  const yoy = latest2023 > 0 ? Math.round(((latest2024 - latest2023) / latest2023) * 100) : null;

  const riskLabel: Record<string, string> = {
    critical: '🔴 Critical Risk Zone',
    high:     '🟠 High Risk Zone',
    medium:   '🟡 Moderate Risk Zone',
    low:      '🟢 Lower Risk Zone',
  };

  return (
    <div className="ts-suburb-result">
      <div className="ts-suburb-result-header">
        <div>
          <h2 className="ts-suburb-result-name">{data.suburb}</h2>
          <p className="ts-suburb-result-lga">{data.lga} · Rank #{rank} most targeted in Victoria</p>
        </div>
        <div className={`ts-risk-badge ts-risk-${risk}`}>{riskLabel[risk]}</div>
      </div>

      <div className="ts-suburb-stats-grid">
        <div className="ts-stat-card">
          <p className="ts-stat-label">Total thefts (2016–2025)</p>
          <p className="ts-stat-value">{data.total.toLocaleString()}</p>
        </div>
        <div className="ts-stat-card">
          <p className="ts-stat-label">Peak year</p>
          <p className="ts-stat-value">{peak} <span style={{ fontSize: '0.8em', color: '#aaa' }}>({data.byYear[peak]?.toLocaleString()})</span></p>
        </div>
        <div className="ts-stat-card">
          <p className="ts-stat-label">2024 thefts</p>
          <p className="ts-stat-value">{latest2024.toLocaleString()}</p>
        </div>
        <div className="ts-stat-card">
          <p className="ts-stat-label">Year-on-year (2023→2024)</p>
          <p className="ts-stat-value" style={{ color: yoy == null ? undefined : yoy > 0 ? '#ef4444' : yoy < 0 ? '#4ade80' : '#aaa' }}>
            {yoy == null ? '—' : yoy > 0 ? `+${yoy}%` : `${yoy}%`}
          </p>
        </div>
      </div>

      {/* Trend */}
      <div className={`ts-trend-banner ts-trend-${trend}`}>
        {trend === 'up' && (
          <><TrendingUp size={16} />
          {isSteady
            ? <>Thefts have risen steadily from <strong>{firstVal}</strong> in {firstYear} to <strong>{lastVal}</strong> in {lastYear} (<strong>{overallSign}{overallPct}%</strong>).</>
            : hadDip
            ? <>After dipping mid-period, thefts have surged back — up from <strong>{firstVal}</strong> in {firstYear} to <strong>{lastVal}</strong> in {lastYear} (<strong>{overallSign}{overallPct}%</strong>).</>
            : <>Thefts have increased from <strong>{firstVal}</strong> in {firstYear} to <strong>{lastVal}</strong> in {lastYear} (<strong>{overallSign}{overallPct}%</strong> overall).</>
          }</>
        )}
        {trend === 'down' && (
          <><TrendingDown size={16} />
          Thefts have fallen from <strong>{firstVal}</strong> in {firstYear} to <strong>{lastVal}</strong> in {lastYear} (<strong>{overallSign}{overallPct}%</strong> overall).</>
        )}
        {trend === 'stable' && (
          <><Minus size={16} />
          Theft levels have remained relatively stable — <strong>{firstVal}</strong> in {firstYear}, <strong>{lastVal}</strong> in {lastYear} ({overallSign}{overallPct}% over the period).</>
        )}
      </div>

      {/* Mini chart */}
      <div className="ts-suburb-chart">
        <p className="ts-chart-title" style={{ marginBottom: 8 }}>Year-by-year breakdown</p>
        <div className="ts-mini-bar-chart">
          {YEARS.map((y, i) => {
            const v = vals[i] ?? 0;
            const maxV = Math.max(...vals, 1);
            return (
              <div key={y} className="ts-mini-bar-col">
                <div className="ts-mini-bar-track">
                  <div
                    className="ts-mini-bar-fill ts-mini-bar-fill--tip"
                    style={{ height: `${(v / maxV) * 100}%`, background: BAR_COLOR }}
                    data-tip={v > 0 ? String(v) : '0'}
                  />
                </div>
                <span className="ts-mini-bar-year">{y}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      <div className="ts-suburb-cta">
        <Shield size={20} />
        <div>
          {trend === 'up' && (
            <>
              <p className="ts-cta-title">Theft is rising in {data.suburb} — protect your vehicle now</p>
              <p className="ts-cta-desc">
                With thefts trending upward and {data.total.toLocaleString()} recorded since 2016, {data.suburb} is becoming increasingly high-risk.
                A RooGPS tracker gives you real-time alerts the moment your vehicle moves without you.
              </p>
            </>
          )}
          {trend === 'down' && (
            <>
              <p className="ts-cta-title">Thefts are down in {data.suburb} — but the risk isn't gone</p>
              <p className="ts-cta-desc">
                While theft numbers have improved in {data.suburb}, {data.total.toLocaleString()} vehicles have still been stolen since 2016.
                A RooGPS tracker keeps you covered with real-time alerts and live location tracking.
              </p>
            </>
          )}
          {trend === 'stable' && (
            <>
              <p className="ts-cta-title">Your vehicle is at risk in {data.suburb}</p>
              <p className="ts-cta-desc">
                With {data.total.toLocaleString()} recorded thefts since 2016, a RooGPS tracker gives you
                real-time location alerts the moment your vehicle moves without you — so you can act fast.
              </p>
            </>
          )}
        </div>
        <Link href="/order" className="ts-cta-btn">Protect my vehicle →</Link>
      </div>
    </div>
  );
}

// ─── Geographic theft map ────────────────────────────────────────────────────

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TheftStatsPage() {
  const [allData, setAllData]         = useState<SuburbData[]>([]);
  const [yearTotals, setYearTotals]   = useState<Record<number, number>>({});
  const [loading, setLoading]         = useState(true);
  const [query, setQuery]             = useState('');
  const [suggestions, setSuggestions] = useState<SuburbData[]>([]);
  const [result, setResult]           = useState<SuburbData | null>(null);
  const [notFound, setNotFound]       = useState(false);
  const inputRef    = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSuggestions([]);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetch('/vic_vehicle_theft_by_suburb_year.json')
      .then(r => r.json())
      .then((raw: RawRecord[]) => {
        const suburbs = processData(raw);
        setAllData(suburbs);
        // Year totals (Melbourne only)
        const totals: Record<number, number> = {};
        for (const s of suburbs) {
          for (const [y, v] of Object.entries(s.byYear)) {
            totals[Number(y)] = (totals[Number(y)] ?? 0) + v;
          }
        }
        setYearTotals(totals);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Autocomplete
  useEffect(() => {
    if (query.length < 2) { setSuggestions([]); return; }
    const q = query.toLowerCase();
    setSuggestions(allData.filter(s => s.suburb.toLowerCase().includes(q)).slice(0, 8));
  }, [query, allData]);

  function handleSearch(override?: string) {
    const q = (override ?? query).trim().toUpperCase();
    // Exact match first, then partial
    const found = allData.find(s => s.suburb.toUpperCase() === q)
      ?? allData.find(s => s.suburb.toUpperCase().startsWith(q));
    if (found) {
      setResult(found);
      setNotFound(false);
      setSuggestions([]);
      setTimeout(() => {
        document.getElementById('suburb-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } else {
      setResult(null);
      setNotFound(true);
    }
  }

  const top10 = allData.slice(0, 10);
  const lgaTotals = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of allData) {
      m[s.lga] = (m[s.lga] ?? 0) + s.total;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [allData]);

  const totalThefts = useMemo(() => allData.reduce((s, d) => s + d.total, 0), [allData]);

  return (
    <>
      <MarketingHeader />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="ts-hero">
        <div className="ts-hero-img-wrap">
          <Image
            src="/theft-hero.png"
            alt="Vehicle theft at night"
            className="ts-hero-img"
            fill
            priority
            sizes="100vw"
          />
          <div className="ts-hero-overlay" />
        </div>
        <div className="ts-hero-content page-content">
          <div className="ts-hero-badge">
            <AlertTriangle size={14} />
            Victoria Vehicle Theft Report
          </div>
          <h1 className="ts-hero-title">
            Is your suburb a<br />
            <span className="ts-hero-accent">vehicle theft hotspot?</span>
          </h1>
          <p className="ts-hero-sub">
            {loading ? 'Loading data…' : (
              <>Over <strong>{totalThefts.toLocaleString()}</strong> vehicle thefts recorded across Victoria
              between 2016 and 2025. Search your suburb below.</>
            )}
          </p>
          {/* Search */}
          <div className="ts-hero-search-wrap" ref={searchWrapRef}>
            <div className="ts-hero-search-box">
              <Search size={18} className="ts-search-icon" />
              <input
                ref={inputRef}
                className="ts-search-input"
                type="text"
                placeholder="Enter your suburb e.g. Richmond"
                value={query}
                onChange={e => { setQuery(e.target.value); setNotFound(false); }}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch(); if (e.key === 'Escape') setSuggestions([]); }}
                autoComplete="off"
              />
              <button className="ts-search-btn" onClick={() => handleSearch()}>Search</button>
            </div>
            {suggestions.length > 0 && (
              <ul className="ts-suggestions">
                {suggestions.map(s => (
                  <li key={s.suburb} onMouseDown={e => { e.preventDefault(); setQuery(s.suburb); handleSearch(s.suburb); setSuggestions([]); }}>
                    <MapPin size={13} /> {s.suburb} <span className="ts-suggestion-lga">{s.lga}</span>
                  </li>
                ))}
              </ul>
            )}
            {notFound && (
              <p className="ts-not-found">No suburb found matching &ldquo;{query}&rdquo;. Try a different spelling.</p>
            )}
          </div>
          <p className="ts-hero-source">
            Data: <a href="https://discover.data.vic.gov.au/" target="_blank" rel="noopener noreferrer">
              Victoria Government Data.Vic <ExternalLink size={11} />
            </a> · Crime Statistics Agency · 2016–2025
          </p>
        </div>
      </section>

      <div className="ts-page page-content">

        {/* ── Suburb result ──────────────────────────────────────────────── */}
        {result && (
          <div id="suburb-result">
            <SuburbResult
              data={result}
              rank={allData.findIndex(s => s.suburb === result.suburb) + 1}
              total={allData.length}
            />
          </div>
        )}

        {/* ── Key stats ─────────────────────────────────────────────────── */}
        {!loading && (
          <div className="ts-kpi-row">
            <div className="ts-kpi-card">
              <p className="ts-kpi-label">Total Victoria thefts</p>
              <p className="ts-kpi-value">{totalThefts.toLocaleString()}</p>
              <p className="ts-kpi-sub">2016 – 2025</p>
            </div>
            <div className="ts-kpi-card">
              <p className="ts-kpi-label">Suburbs tracked</p>
              <p className="ts-kpi-value">{allData.length.toLocaleString()}</p>
              <p className="ts-kpi-sub">Across Victoria</p>
            </div>
            <div className="ts-kpi-card">
              <p className="ts-kpi-label">Highest single suburb</p>
              <p className="ts-kpi-value">{allData[0]?.suburb}</p>
              <p className="ts-kpi-sub">{allData[0]?.total.toLocaleString()} thefts</p>
            </div>
            <div className="ts-kpi-card ts-kpi-highlight">
              <Car size={20} style={{ color: BAR_COLOR, marginBottom: 4 }} />
              <p className="ts-kpi-label">Avg per year (state-wide)</p>
              <p className="ts-kpi-value">{Math.round(totalThefts / YEARS.length).toLocaleString()}</p>
              <p className="ts-kpi-sub">vehicles stolen per year</p>
            </div>
          </div>
        )}

        {/* ── Charts ────────────────────────────────────────────────────── */}
        {!loading && (
          <>
            {/* Top section: line chart + bar charts left, map right spanning full height */}
            <div className="ts-main-grid" style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gridTemplateRows: 'auto auto',
              gap: '14px',
              alignItems: 'stretch',
              minWidth: 0,
            }}>
              {/* Line chart — top left */}
              <div style={{ gridColumn: '1', gridRow: '1', minWidth: 0 }}>
                <YearLineChart yearTotals={yearTotals} />
              </div>

              {/* Map — right column, spans both rows */}
              <div style={{ gridColumn: '2', gridRow: '1 / 3', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                <TheftMapDynamic suburbs={allData} />
              </div>

              {/* Bar charts stacked — bottom left */}
              <div style={{ gridColumn: '1', gridRow: '2', display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>
                <BarChart
                  title="Top 10 most targeted suburbs (all years)"
                  labels={top10.map(s => s.suburb)}
                  values={top10.map(s => s.total)}
                />
                <BarChart
                  title="Top 10 councils by total thefts"
                  labels={lgaTotals.map(([lga]) => lga)}
                  values={lgaTotals.map(([, v]) => v)}
                />
              </div>
            </div>

            {/* Trend leaders */}
            <div className="ts-chart-wrap">
              <p className="ts-chart-title">On the rise — suburbs with the biggest increase in recent years</p>
              <div className="ts-trend-cards">
                {allData
                  .filter(s => getTrend(s) === 'up' && s.total > 200)
                  .slice(0, 8)
                  .map(s => {
                    const { olderYears: oy, recentYears: ry } = getTrendYears(s);
                    const recentAvg = ry.reduce((a, y) => a + (s.byYear[y] ?? 0), 0) / (ry.length || 1);
                    const olderAvg  = oy.reduce((a, y) => a + (s.byYear[y] ?? 0), 0) / (oy.length || 1);
                    const pct = olderAvg > 0 ? Math.round(((recentAvg - olderAvg) / olderAvg) * 100) : 0;
                    const vals = YEARS.map(y => s.byYear[y] ?? 0);
                    return (
                      <div key={s.suburb} className="ts-trend-card ts-trend-up-card" onClick={() => { setQuery(s.suburb); handleSearch(s.suburb); }}>
                        <div className="ts-trend-card-top">
                          <span className="ts-trend-card-name">{s.suburb}</span>
                          <span className="ts-trend-card-pct">+{pct}%</span>
                        </div>
                        <Sparkline data={vals} color="#ef4444" />
                        <p className="ts-trend-card-sub">{s.total.toLocaleString()} total thefts</p>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Improving suburbs */}
            <div className="ts-chart-wrap">
              <p className="ts-chart-title">Improving — suburbs where thefts have declined in recent years</p>
              <div className="ts-trend-cards">
                {allData
                  .filter(s => getTrend(s) === 'down' && s.total > 200)
                  .slice(0, 8)
                  .map(s => {
                    const { olderYears: oy, recentYears: ry } = getTrendYears(s);
                    const recentAvg = ry.reduce((a, y) => a + (s.byYear[y] ?? 0), 0) / (ry.length || 1);
                    const olderAvg  = oy.reduce((a, y) => a + (s.byYear[y] ?? 0), 0) / (oy.length || 1);
                    const pct = olderAvg > 0 ? Math.round(((recentAvg - olderAvg) / olderAvg) * 100) : 0;
                    const vals = YEARS.map(y => s.byYear[y] ?? 0);
                    return (
                      <div key={s.suburb} className="ts-trend-card ts-trend-down-card" onClick={() => { setQuery(s.suburb); handleSearch(s.suburb); }}>
                        <div className="ts-trend-card-top">
                          <span className="ts-trend-card-name">{s.suburb}</span>
                          <span className="ts-trend-card-pct ts-pct-down">{pct}%</span>
                        </div>
                        <Sparkline data={vals} color="#4ade80" />
                        <p className="ts-trend-card-sub">{s.total.toLocaleString()} total thefts</p>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Heatmap grid */}
            <HeatmapGrid suburbs={allData} />
          </>
        )}

        {/* ── CTA Banner ────────────────────────────────────────────────── */}
        <div className="ts-cta-banner">
          <div className="ts-cta-banner-icon"><Shield size={36} /></div>
          <div className="ts-cta-banner-text">
            <h2>Your vehicle deserves better protection</h2>
            <p>
              Vehicle theft across Victoria is rising sharply — but most stolen vehicles are never recovered.
              RooGPS gives you real-time location tracking, instant movement alerts, and a full trip history,
              so you always know where your vehicle is. No hidden fees. Built in Australia. From just $5/month.
            </p>
          </div>
          <div className="ts-cta-banner-actions">
            <Link href="/order" className="ts-cta-banner-btn-primary">Get protected today</Link>
            <Link href="/features" className="ts-cta-banner-btn-secondary">See all features</Link>
          </div>
        </div>

        {/* ── Footer note ───────────────────────────────────────────────── */}
        <p className="ts-data-note">
          <ExternalLink size={12} /> Data sourced from the{' '}
          <a href="https://discover.data.vic.gov.au/" target="_blank" rel="noopener noreferrer">
            Victoria Government Data.Vic portal
          </a>{' '}
          · Crime Statistics Agency, Victorian Police. Covers vehicle theft offences across Victoria, 2016–2025.
          This page is provided for informational purposes. Data reflects recorded offences only.
        </p>
      </div>

      {/* Footer */}
      <footer className="marketing-footer">
        <div className="marketing-footer-inner">
          <div className="marketing-footer-left">
            <Link href="/" className="marketing-logo marketing-logo-footer">
              <Logo size={28} wide />
            </Link>
            <nav className="marketing-footer-nav" aria-label="Footer">
              <Link href="/order" className="marketing-footer-link">Buy Tracker</Link>
              <Link href="/features" className="marketing-footer-link">Features</Link>
              <Link href="/support" className="marketing-footer-link">Support</Link>
              <Link href="/theft-stats" className="marketing-footer-link">Theft Stats</Link>
              <a href="https://status.roogps.com" target="_blank" rel="noopener noreferrer" className="marketing-footer-link">Status</a>
            </nav>
          </div>
          <div className="marketing-footer-right">
            <div className="marketing-footer-aussie">
              <img
                src="https://flagcdn.com/w80/au.png"
                srcSet="https://flagcdn.com/w160/au.png 2x"
                width={20} height={12} alt="" aria-hidden
                className="marketing-aussie-flag-img"
              />
              <span>Australian Owned &amp; Supported</span>
            </div>
            <p className="marketing-footer-copy">© {new Date().getFullYear()} RooGPS</p>
          </div>
        </div>
      </footer>
    </>
  );
}
