/**
 * Battery status tier and display for consumer UI.
 * Prefers voltage for tier (more stable); falls back to percent when voltage missing.
 * 1-cell Li-ion: voltage clamped 3.0–4.25 V.
 */

export type BatteryTier = 'high' | 'medium' | 'low' | 'very_low' | 'unknown';

export type BatteryStatus = {
  tier: BatteryTier;
  label: string;
  microcopy: string;
  ringValue: number;
  approxPercent?: number | null;
  voltageV?: number | null;
  color: {
    text: string;
    ring: string;
    glow: string;
    bg: string;
  };
  icon: 'full' | 'half' | 'low' | 'alert' | 'unknown';
};

const VOLTAGE_HIGH = 4.0;
const VOLTAGE_MEDIUM = 3.8;
const VOLTAGE_LOW = 3.6;
const VOLTAGE_CLAMP_MIN = 3.0;
const VOLTAGE_CLAMP_MAX = 4.25;

const PERCENT_HIGH = 75;
const PERCENT_MEDIUM = 40;
const PERCENT_LOW = 20;

const RING_HIGH = 100;
const RING_MEDIUM = 70;
const RING_LOW = 40;
const RING_VERY_LOW = 15;
const RING_UNKNOWN = 0;

const VOLTAGE_CURVE: [number, number][] = [
  [4.2, 100],
  [4.1, 90],
  [4.0, 80],
  [3.9, 70],
  [3.8, 60],
  [3.7, 50],
  [3.4, 20],
  [3.2, 0],
];

function voltageToApproxPercent(v: number): number {
  const clamped = Math.max(VOLTAGE_CLAMP_MIN, Math.min(VOLTAGE_CLAMP_MAX, v));
  for (let i = 0; i < VOLTAGE_CURVE.length - 1; i++) {
    const [v1, p1] = VOLTAGE_CURVE[i];
    const [v2, p2] = VOLTAGE_CURVE[i + 1];
    if (clamped <= v1 && clamped >= v2) {
      const t = (v1 - clamped) / (v1 - v2);
      return Math.round(p1 + t * (p2 - p1));
    }
  }
  if (clamped >= VOLTAGE_CURVE[0][0]) return 100;
  return 0;
}

function getTierFromVoltage(v: number): BatteryTier {
  if (v >= VOLTAGE_HIGH) return 'high';
  if (v >= VOLTAGE_MEDIUM) return 'medium';
  if (v >= VOLTAGE_LOW) return 'low';
  return 'very_low';
}

function getTierFromPercent(p: number): BatteryTier {
  if (p >= PERCENT_HIGH) return 'high';
  if (p >= PERCENT_MEDIUM) return 'medium';
  if (p >= PERCENT_LOW) return 'low';
  return 'very_low';
}

function getRingValue(tier: BatteryTier): number {
  switch (tier) {
    case 'high': return RING_HIGH;
    case 'medium': return RING_MEDIUM;
    case 'low': return RING_LOW;
    case 'very_low': return RING_VERY_LOW;
    default: return RING_UNKNOWN;
  }
}

const TIER_CONFIG: Record<
  BatteryTier,
  { label: string; microcopy: string; icon: BatteryStatus['icon']; color: BatteryStatus['color'] }
> = {
  high: {
    label: 'High',
    microcopy: 'Good to go',
    icon: 'full',
    color: {
      text: '#22c55e',
      ring: '#22c55e',
      glow: 'rgba(34, 197, 94, 0.35)',
      bg: 'rgba(34, 197, 94, 0.08)',
    },
  },
  medium: {
    label: 'Medium',
    microcopy: 'Charge soon',
    icon: 'half',
    color: {
      text: '#eab308',
      ring: '#eab308',
      glow: 'rgba(234, 179, 8, 0.3)',
      bg: 'rgba(234, 179, 8, 0.06)',
    },
  },
  low: {
    label: 'Low',
    microcopy: 'Low battery',
    icon: 'low',
    color: {
      text: '#f97316',
      ring: '#f97316',
      glow: 'rgba(249, 115, 22, 0.3)',
      bg: 'rgba(249, 115, 22, 0.06)',
    },
  },
  very_low: {
    label: 'Very Low',
    microcopy: 'Charge now',
    icon: 'alert',
    color: {
      text: '#ef4444',
      ring: '#ef4444',
      glow: 'rgba(239, 68, 68, 0.35)',
      bg: 'rgba(239, 68, 68, 0.08)',
    },
  },
  unknown: {
    label: 'Unknown',
    microcopy: 'Battery data unavailable',
    icon: 'unknown',
    color: {
      text: '#8b8b9e',
      ring: '#4b5563',
      glow: 'rgba(75, 85, 99, 0.2)',
      bg: 'rgba(255, 255, 255, 0.03)',
    },
  },
};

export function getBatteryStatus(input: {
  voltage_v?: number | null;
  percent?: number | null;
}): BatteryStatus {
  const voltage_v = input.voltage_v != null && !Number.isNaN(input.voltage_v) ? input.voltage_v : null;
  const percent = input.percent != null && !Number.isNaN(input.percent) ? input.percent : null;

  let tier: BatteryTier;
  let approxPercent: number | null = null;

  if (voltage_v != null) {
    const clamped = Math.max(VOLTAGE_CLAMP_MIN, Math.min(VOLTAGE_CLAMP_MAX, voltage_v));
    tier = getTierFromVoltage(clamped);
    approxPercent = percent != null ? Math.max(0, Math.min(100, Math.round(percent))) : voltageToApproxPercent(clamped);
  } else if (percent != null) {
    const p = Math.max(0, Math.min(100, percent));
    tier = getTierFromPercent(p);
    approxPercent = Math.round(p);
  } else {
    tier = 'unknown';
  }

  const config = TIER_CONFIG[tier];
  return {
    tier,
    label: config.label,
    microcopy: config.microcopy,
    ringValue: getRingValue(tier),
    approxPercent: approxPercent ?? null,
    voltageV: voltage_v ?? null,
    color: config.color,
    icon: config.icon,
  };
}
