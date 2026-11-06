'use client';

import { useState } from 'react';
import { formatMoney } from '@/lib/currency';

/** Single-series daily bar chart. Data: [{ day: 'YYYY-MM-DD', net_kobo, orders }]. */
export default function BarChart({ data, title }) {
  const [hover, setHover] = useState(null);
  const W = 900, H = 260, PAD_L = 64, PAD_B = 28, PAD_T = 12;
  const plotW = W - PAD_L - 8, plotH = H - PAD_B - PAD_T;
  const max = Math.max(1, ...data.map((d) => Number(d.net_kobo)));
  const nice = niceMax(max);
  const step = plotW / Math.max(1, data.length);
  const barW = Math.max(1, step - 2); // 2px surface gap between bars
  const y = (v) => PAD_T + plotH - (Number(v) / nice) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * nice);
  const labelEvery = Math.ceil(data.length / 8);
  const h = hover !== null ? data[hover] : null;

  return (
    <figure className="relative">
      <figcaption className="mb-2 text-sm text-muted">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}. Use the table below for exact values.`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={W - 8} y1={y(t)} y2={y(t)} stroke="#e7d9cb" strokeWidth="1" />
            <text x={PAD_L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#6e5e60">{compact(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD_L + i * step + 1;
          const top = y(d.net_kobo);
          const hgt = PAD_T + plotH - top;
          const r = Math.min(4, barW / 2, hgt);
          return (
            <g key={d.day}>
              {hgt > 0 && (
                <path
                  d={`M${x},${PAD_T + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${PAD_T + plotH} Z`}
                  fill="#8F142A" opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {/* hit target: the whole column, larger than the mark */}
              <rect x={PAD_L + i * step} y={PAD_T} width={step} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
              {i % labelEvery === 0 && <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#6e5e60">{d.day.slice(5)}</text>}
            </g>
          );
        })}
        <line x1={PAD_L} x2={W - 8} y1={PAD_T + plotH} y2={PAD_T + plotH} stroke="#6e5e60" strokeWidth="1" />
      </svg>
      {h && (
        <div className="pointer-events-none absolute right-2 top-8 border border-line bg-white px-3 py-2 text-sm shadow-sm" role="status">
          <p className="text-muted">{h.day}</p>
          <p>{formatMoney(h.net_kobo)} net · {h.orders} {h.orders === 1 ? 'order' : 'orders'}</p>
        </div>
      )}
    </figure>
  );
}

function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((n) => n >= v) || v;
}
function compact(kobo) {
  const n = kobo / 100;
  return n >= 1e6 ? `₦${(n / 1e6).toFixed(1)}m` : n >= 1e3 ? `₦${Math.round(n / 1e3)}k` : `₦${Math.round(n)}`;
}
