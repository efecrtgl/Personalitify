import { Suspense, lazy } from 'react';

const BarChartView = lazy(() => import('./BarChartView.jsx'));

/**
 * The area a chart is drawn in. It has its size from the start, so nothing moves when the
 * drawing arrives; the chart library itself is fetched the first time a chart is shown.
 * The drawing is decoration for assistive technology — pair it with a table.
 *
 * @param {object} props
 * @param {{ key?: string, label: string, title: string, value: number|null, display: string, detail?: string }[]} props.rows
 * @param {'percent'|'count'} props.scale
 * @param {number} [props.max]
 * @param {string} props.color
 * @param {string} [props.height]  A height class.
 */
export function BarChartArea({ rows, scale, color, max, height = 'h-44' }) {
  const data = rows.map((row) => ({ ...row, amount: row.value ?? 0 }));
  return (
    <div className={height} aria-hidden="true">
      <Suspense fallback={null}>
        <BarChartView data={data} scale={scale} color={color} max={max} />
      </Suspense>
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
 * @param {number} [props.max]    Upper end of a count scale that has a natural one.
 * @param {string} props.color    CSS color of the bars.
 * @param {string} props.caption  What the table holds.
 * @param {{ step: string, value: string, detail?: string }} props.columns  Table headings.
 */
export function BarSeries({ rows, scale, color, caption, columns, max, height = 'h-44' }) {
  return (
    <>
      <BarChartArea rows={rows} scale={scale} color={color} max={max} height={height} />
      {/* A table grows to its content whatever width it is given; the wrapper is clipped. */}
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
