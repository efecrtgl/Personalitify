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
 * One series as bars: a single measure over the steps of a period.
 *
 * The picture is decoration for assistive technology; the same numbers follow as a table
 * that screen readers reach instead. Hovering or touching a bar shows its exact value.
 *
 * @param {object} props
 * @param {{ key: string, label: string, title: string, value: number|null, display: string, detail?: string }[]} props.rows
 *   `label` goes on the axis, `title` names the step in full, `display` is the value as text.
 * @param {'percent'|'count'} props.scale  Percent charts always run from 0 to 100.
 * @param {string} props.color    CSS color of the bars.
 * @param {string} props.caption  What the table holds.
 * @param {{ step: string, value: string, detail?: string }} props.columns  Table headings.
 */
export function BarSeries({ rows, scale, color, caption, columns, height = 'h-44' }) {
  const data = rows.map((row) => ({ ...row, amount: row.value ?? 0 }));
  return (
    <>
      <div className={height} aria-hidden="true">
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
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={AXIS_TICK} />
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
      </div>
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">{columns.step}</th>
              <th scope="col">{columns.value}</th>
              {columns.detail && <th scope="col">{columns.detail}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.title}</th>
                <td>{row.display}</td>
                {columns.detail && <td>{row.detail}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
