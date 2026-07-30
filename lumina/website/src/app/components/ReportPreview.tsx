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

export function ReportPreview({ preview, onDownload, downloadable = true }: ReportPreviewProps) {
  const colors = preview.data_colors?.length ? preview.data_colors : ["#046241", "#FFB347"];
  const labelOf = (key: string) =>
    preview.measures.find((m) => m.key === key)?.label ?? key;
  const formatOf = (key: string) =>
    preview.measures.find((m) => m.key === key)?.format ?? "number";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 className="ll-brand-font" style={{ margin: 0, color: "var(--forest)", fontSize: 22 }}>
            {preview.title}
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.7, color: "var(--forest)" }}>
            {preview.rows.length} {preview.group_by.label.toLowerCase()}
            {preview.rows.length === 1 ? "" : "s"} · the same figures as the Power BI file
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

      {preview.charts.map((chart, index) => (
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
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <ComposedChart data={preview.rows} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(19,48,32,0.12)" vertical={false} />
                <XAxis dataKey={preview.group_by.key} tick={{ fontSize: 11, fill: "#133020" }} />
                <YAxis tick={{ fontSize: 11, fill: "#133020" }} tickFormatter={(v) => formatValue(v, formatOf(chart.measures[0]))} />
                <Tooltip
                  formatter={(value, name) => [
                    formatValue(typeof value === "number" ? value : null, formatOf(String(name))),
                    labelOf(String(name)),
                  ]}
                />
                {chart.measures.map((measure, i) =>
                  chart.kind === "line" ? (
                    <Line key={measure} type="monotone" dataKey={measure} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />
                  ) : (
                    <Bar key={measure} dataKey={measure} fill={colors[i % colors.length]} radius={[3, 3, 0, 0]} />
                  )
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}

      {/* Every figure, so nothing in the report is only visible in Power BI. */}
      <div className="ll-preview-chart" style={{ overflowX: "auto" }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "var(--forest)" }}>
          Every figure by {preview.group_by.label.toLowerCase()}
        </h3>
        <table className="ll-preview-table">
          <thead>
            <tr>
              <th>{preview.group_by.label}</th>
              {preview.measures.map((m) => <th key={m.key}>{m.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, i) => (
              <tr key={i}>
                <td>{String(row[preview.group_by.key] ?? "")}</td>
                {preview.measures.map((m) => (
                  <td key={m.key} style={{ textAlign: "right" }}>
                    {formatValue(typeof row[m.key] === "number" ? (row[m.key] as number) : null, m.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              {preview.measures.map((m) => (
                <td key={m.key} style={{ textAlign: "right", fontWeight: 600 }}>
                  {formatValue(total(preview, m.key), m.format)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
