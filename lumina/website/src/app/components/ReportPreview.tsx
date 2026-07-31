"use client";

import { Download } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FlexiblePreview } from "@/lib/types";

/**
 * Draws a report built by conversation, on screen, beside the chat — Decision 2.
 *
 * Separate from WebDashboard rather than an extension of it, and deliberately so. That
 * component is built around six fixed figures with names like `target_quantity` and
 * `actual_hours`, and its filters, brush and table sorting are all keyed to a `date`
 * field. Reports built by conversation have neither — a customer counting videos or
 * revenue has none of those columns, which is the whole point of Decision 3. Retrofitting
 * it would have meant touching every one of those in a component the Studio and WhatsApp
 * flows also depend on, which John Peter specifically asked us not to disturb.
 *
 * So this reads the report's own description of itself: what its figures are called, how
 * each should be shown, and which of them the agent actually chose to put on the page.
 */

interface ReportPreviewProps {
  preview: FlexiblePreview;
  onDownload: () => void;
  /** Files exist before their storage does when a build is still running. */
  downloadable?: boolean;
}

function formatValue(value: number | null, format: string): string {
  if (value == null) return "—";
  if (format === "percent") return `${(value * 100).toFixed(1)}%`;
  if (Math.abs(value) >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/**
 * Totals a figure the same way the Power BI file does, so the two never disagree.
 *
 * A rate is recomputed from the totals it is made of rather than averaged — averaging
 * daily percentages is what once reported 129% for a plan that delivered exactly 100%.
 * A running total takes its largest value, since adding running totals together is
 * meaningless.
 */
function total(preview: FlexiblePreview, key: string): number | null {
  const measure = preview.measures.find((m) => m.key === key);
  if (!measure) return null;
  const values = preview.rows.map((r) => r[key]).filter((v): v is number => typeof v === "number");

  const pair = preview.rates?.[key];
  if (pair) {
    const [actualKey, targetKey] = pair;
    const sum = (k: string) =>
      preview.rows.reduce((s, r) => s + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);
    const planned = sum(targetKey);
    return planned === 0 ? null : sum(actualKey) / planned;
  }
  if (!values.length) return null;
  if (measure.aggregate === "max") return Math.max(...values);
  return values.reduce((s, v) => s + v, 0);
}

type Row = Record<string, string | number | null>;

/**
 * Roll the rows up to one per value of `key`, the way Power BI does.
 *
 * A visual in Power BI carries one column and its figures, and the engine totals
 * everything else — so a report grouped by month *and* studio still draws four monthly
 * points. This drew all sixteen rows instead, four of them labelled "Jan 2026", and a
 * chart of achievement by studio came out as months because the chart's own column was
 * never sent. The Power BI file was right both times; only the preview beside it was not.
 *
 * Rates are rebuilt from the totals they are made of rather than averaged — averaging
 * percentages is what once reported 129% for a plan that delivered exactly 100%.
 */
function rollUp(preview: FlexiblePreview, key: string): Row[] {
  const order: string[] = [];
  const buckets = new Map<string, Row[]>();
  for (const row of preview.rows) {
    const at = row[key];
    if (at == null) continue;
    const label = String(at);
    if (!buckets.has(label)) {
      buckets.set(label, []);
      order.push(label);
    }
    buckets.get(label)!.push(row);
  }

  return order.map((label) => {
    const group = buckets.get(label)!;
    const out: Row = { [key]: label };
    for (const measure of preview.measures) {
      const pair = preview.rates?.[measure.key];
      if (pair) {
        const [actualKey, plannedKey] = pair;
        const sum = (k: string) =>
          group.reduce((s, r) => s + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);
        const planned = sum(plannedKey);
        out[measure.key] = planned === 0 ? null : sum(actualKey) / planned;
        continue;
      }
      const values = group
        .map((r) => r[measure.key])
        .filter((v): v is number => typeof v === "number");
      out[measure.key] = !values.length
        ? null
        : measure.aggregate === "max"
          ? Math.max(...values)
          : values.reduce((s, v) => s + v, 0);
    }
    return out;
  });
}

/** The figures as a table. Used for a table visual and for the full listing below. */
function FigureTable({
  preview,
  measures,
  columns,
  rows,
}: {
  preview: FlexiblePreview;
  measures: FlexiblePreview["measures"];
  /** The grouping columns to show. More than one when the figures are split more than one way. */
  columns: Array<{ key: string; label: string }>;
  rows: Row[];
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="ll-preview-table">
        <thead>
          <tr>
            {columns.map((c) => <th key={c.key}>{c.label}</th>)}
            {measures.map((m) => <th key={m.key}>{m.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => <td key={c.key}>{String(row[c.key] ?? "")}</td>)}
              {measures.map((m) => (
                <td key={m.key} style={{ textAlign: "right" }}>
                  {formatValue(typeof row[m.key] === "number" ? (row[m.key] as number) : null, m.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={columns.length}>Total</td>
            {measures.map((m) => (
              <td key={m.key} style={{ textAlign: "right", fontWeight: 600 }}>
                {formatValue(total(preview, m.key), m.format)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function ReportPreview({ preview, onDownload, downloadable = true }: ReportPreviewProps) {
  const colors = preview.data_colors?.length ? preview.data_colors : ["#046241", "#FFB347"];
  const labelOf = (key: string) =>
    preview.measures.find((m) => m.key === key)?.label ?? key;
  const formatOf = (key: string) =>
    preview.measures.find((m) => m.key === key)?.format ?? "number";
  // Reports built before the preview knew about more than one grouping still carry just
  // the one, so fall back to it rather than showing nothing.
  const groupings = preview.groupings?.length ? preview.groupings : [preview.group_by];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 className="ll-brand-font" style={{ margin: 0, color: "var(--forest)", fontSize: 22 }}>
            {preview.title}
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.7, color: "var(--forest)" }}>
            {/* Sixteen rows grouped by month and studio are not sixteen months. Say what is
                true of any grouping, as the Power BI title band does. */}
            {preview.rows_seen
              ? `Built from ${preview.rows_used?.toLocaleString()} of ${preview.rows_seen.toLocaleString()} rows, grouped by ${groupings
                  .map((g) => g.label)
                  .join(", ")}`
              : `${preview.rows.length} rows, grouped by ${groupings.map((g) => g.label).join(", ")}`}
            {" · the same figures as the Power BI file"}
          </p>
        </div>
        {downloadable && (
          <button className="ll-report-card" style={{ width: "auto" }} onClick={onDownload}>
            <Download size={16} />
            <span style={{ fontWeight: 600 }}>Download Power BI file</span>
          </button>
        )}
      </div>

      {/* The headline figures the agent chose, not a fixed three. */}
      {preview.headline_figures.length > 0 && (
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {preview.headline_figures.map((kpi) => (
            <div key={kpi.measure} className="ll-kpi-card">
              <span className="ll-kpi-label">{kpi.label}</span>
              <strong className="ll-kpi-value ll-brand-font">
                {formatValue(total(preview, kpi.measure), formatOf(kpi.measure))}
              </strong>
              <span className="ll-kpi-foot">Across every {preview.group_by.label.toLowerCase()}</span>
            </div>
          ))}
        </div>
      )}

      {preview.charts.map((chart, index) => {
        const axis = chart.group_by ?? preview.group_by.key;
        const axisLabel = groupings.find((g) => g.key === axis)?.label ?? axis;
        const rows = rollUp(preview, axis);
        return (
        <div key={index} className="ll-preview-chart">
          <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600, color: "var(--forest)" }}>
            {chart.title}
          </h3>
          {/* Drawn here rather than by the chart library, which listed Actual before
              Target while the bars were drawn the other way round. Built from the
              chart's own measures in their own order, so it cannot disagree with them. */}
          <div className="ll-chart-legend">
            {chart.measures.map((measure, i) => (
              <span key={measure}>
                <i style={{ background: colors[i % colors.length] }} />
                {labelOf(measure)}
              </span>
            ))}
          </div>
          {chart.kind === "table" ? (
            <FigureTable
              preview={preview}
              columns={[{ key: axis, label: axisLabel }]}
              rows={rows}
              measures={chart.measures
                .map((k) => preview.measures.find((m) => m.key === k))
                .filter((m): m is FlexiblePreview["measures"][number] => !!m)}
            />
          ) : (
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <ComposedChart data={rows} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(19,48,32,0.12)" vertical={false} />
                <XAxis dataKey={axis} tick={{ fontSize: 11, fill: "#133020" }} />
                <YAxis tick={{ fontSize: 11, fill: "#133020" }} tickFormatter={(v) => formatValue(v, formatOf(chart.measures[0]))} />
                <Tooltip
                  formatter={(value, name) => [
                    formatValue(typeof value === "number" ? value : null, formatOf(String(name))),
                    labelOf(String(name)),
                  ]}
                />
                {chart.measures.map((measure, i) =>
                  chart.kind === "line" ? (
                    <Line key={measure} type="linear" dataKey={measure} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />
                  ) : (
                    <Bar key={measure} dataKey={measure} fill={colors[i % colors.length]} radius={[3, 3, 0, 0]} />
                  )
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>
        );
      })}

      {/* Every figure, so nothing in the report is only visible in Power BI. */}
      <div className="ll-preview-chart">
        <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "var(--forest)" }}>
          Every figure by {groupings.map((g) => g.label.toLowerCase()).join(" and ")}
        </h3>
        <FigureTable
          preview={preview}
          columns={groupings}
          rows={preview.rows}
          measures={preview.measures}
        />
      </div>
    </div>
  );
}
