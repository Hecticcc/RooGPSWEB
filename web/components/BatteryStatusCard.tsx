'use client';

import { getBatteryStatus } from '@/lib/battery';
import BatteryLevelIcon from '@/components/BatteryLevelIcon';

const RING_SIZE = 56;
const RING_STROKE = 5;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_CX = RING_SIZE / 2;
const RING_CY = RING_SIZE / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

type Props = {
  voltageV?: number | null;
  percent?: number | null;
  showAdvanced?: boolean;
};

export default function BatteryStatusCard({ voltageV, percent, showAdvanced = false }: Props) {
  const status = getBatteryStatus({
    voltage_v: voltageV ?? undefined,
    percent: percent ?? undefined,
  });

  const ariaLabel =
    status.tier === 'unknown'
      ? 'Battery status: Unknown'
      : `Battery status: ${status.label}, ${status.microcopy}`;

  const dashOffset = RING_CIRCUMFERENCE - (status.ringValue / 100) * RING_CIRCUMFERENCE;

  return (
    <article
      className="battery-status-card"
      style={{
        background: `linear-gradient(135deg, ${status.color.bg} 0%, rgba(255,255,255,0.02) 100%)`,
        borderColor: status.color.ring,
        boxShadow: `0 0 20px ${status.color.glow}`,
      }}
      aria-label={ariaLabel}
    >
      <div className="battery-status-card__inner">
        <div className="battery-status-card__ring-wrap" style={{ filter: `drop-shadow(0 0 6px ${status.color.glow})` }}>
          <svg width={RING_SIZE} height={RING_SIZE} className="battery-status-card__ring-svg" aria-hidden>
            <circle
              className="battery-status-card__ring-bg"
              cx={RING_CX}
              cy={RING_CY}
              r={RING_R}
              fill="none"
              strokeWidth={RING_STROKE}
            />
            <circle
              className="battery-status-card__ring-fill"
              cx={RING_CX}
              cy={RING_CY}
              r={RING_R}
              fill="none"
              strokeWidth={RING_STROKE}
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              stroke={status.color.ring}
              transform={`rotate(-90 ${RING_CX} ${RING_CY})`}
            />
          </svg>
          <div className="battery-status-card__icon" style={{ color: status.color.ring }}>
            <BatteryLevelIcon tier={status.tier} size={24} color={status.color.ring} aria-hidden />
          </div>
        </div>

        <div className="battery-status-card__content">
          <p className="battery-status-card__label" style={{ color: status.color.text }}>
            {status.label}
          </p>
          <p className="battery-status-card__microcopy">{status.microcopy}</p>
          {showAdvanced && status.voltageV != null && (
            <p className="battery-status-card__advanced" aria-hidden>
              {status.voltageV.toFixed(2)}V
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
