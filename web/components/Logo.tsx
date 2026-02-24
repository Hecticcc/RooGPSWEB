'use client';

type Props = { size?: number; wide?: boolean; inline?: boolean };

export default function Logo({ size = 120, wide = false, inline = false }: Props) {
  const w = wide ? Math.round(size * 2.4) : size;
  const h = size;
  const img = (
    <img
      src="/logo.png"
      alt="RooGPS"
      width={w}
      height={h}
      fetchPriority="high"
      decoding="async"
      style={{ objectFit: 'contain', display: 'block' }}
    />
  );
  if (inline) {
    return <span style={{ display: 'flex', alignItems: 'center', width: w, height: h }}>{img}</span>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ width: w, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {img}
      </div>
    </div>
  );
}
