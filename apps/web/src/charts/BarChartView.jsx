import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const AXIS_TICK = { fill: 'var(--pfy-ink-3)', fontSize: 12 };

function HoverCard({ active, payload }) {
  const row = active ? payload?.[0]?.payload : null;
  if (!row) return null;
  return (
    <div className="rounded-[0.5rem] bg-ink px-2.5 py-1.5 text-caption text-canvas shadow-raised">
      <p className="font-medium">{row.title}</p>
      <p>
        {row.display}
        {row.detail ? ` · ${row.detail}` : ''}
      </p>
    </div>
  );
}

/**
 * The drawing of a bar series. This module is the only one that imports the chart library,
 * and it is loaded on demand (see `BarChartArea`), so the library is not part of the first
 * download.
 *
 * @param {object} props
 * @param {{ label: string, title: string, amount: number, display: string, detail?: string }[]} props.data
 * @param {'percent'|'count'} props.scale
 * @param {number} [props.max]
 * @param {string} props.color
 */
export default function BarChartView({ data, scale, color, max }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -24 }}>
        <CartesianGrid vertical={false} stroke="var(--pfy-line)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
          interval="preserveStartEnd"
          minTickGap={12}
        />
        {scale === 'percent' ? (
          <YAxis
            domain={[0, 100]}
            ticks={[0, 50, 100]}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
          />
        ) : (
          <YAxis
            allowDecimals={false}
            // A scale with a natural top shows every step; otherwise at least 0 to 4, so a
            // week without data still reads as an empty chart and not as a broken one.
            domain={[0, max ?? ((dataMax) => Math.max(4, dataMax))]}
            ticks={max && max <= 10 ? Array.from({ length: max + 1 }, (_, i) => i) : undefined}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
          />
        )}
        <Tooltip
          content={<HoverCard />}
          cursor={{ fill: 'var(--pfy-surface-2)' }}
          isAnimationActive={false}
        />
        <Bar
          dataKey="amount"
          fill={color}
          radius={[4, 4, 0, 0]}
          maxBarSize={32}
          // The grow-in restarts on every container resize, which reads as flicker.
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
