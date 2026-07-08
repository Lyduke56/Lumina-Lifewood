"use client";

import { useMemo } from "react";
import { Download, BarChart2, TrendingUp, Target, CheckCircle } from "lucide-react";
import {
  ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import type { ChartPreviewJson } from "@/lib/types";

// ── Mock data used before any file is generated ──────────────────────────────
const MOCK_SERIES = [
  { date: "Jan 01", target_quantity: 120, actual_quantity: 102, target_hours: 8, actual_hours: 7.5, completion_rate: 0.85 },
  { date: "Jan 02", target_quantity: 120, actual_quantity: 115, target_hours: 8, actual_hours: 8.0, completion_rate: 0.958 },
  { date: "Jan 03", target_quantity: 120, actual_quantity: 89, target_hours: 8, actual_hours: 6.5, completion_rate: 0.741 },
  { date: "Jan 04", target_quantity: 130, actual_quantity: 127, target_hours: 8.5, actual_hours: 8.2, completion_rate: 0.976 },
  { date: "Jan 05", target_quantity: 130, actual_quantity: 134, target_hours: 8.5, actual_hours: 9.0, completion_rate: 1.03 },
  { date: "Jan 06", target_quantity: 130, actual_quantity: 121, target_hours: 8.5, actual_hours: 8.0, completion_rate: 0.93 },
  { date: "Jan 07", target_quantity: 140, actual_quantity: 138, target_hours: 9, actual_hours: 9.0, completion_rate: 0.985 },
  { date: "Jan 08", target_quantity: 140, actual_quantity: 99, target_hours: 9, actual_hours: 7.0, completion_rate: 0.707 },
  { date: "Jan 09", target_quantity: 140, actual_quantity: 143, target_hours: 9, actual_hours: 9.2, completion_rate: 1.02 },
  { date: "Jan 10", target_quantity: 150, actual_quantity: 147, target_hours: 9.5, actual_hours: 9.5, completion_rate: 0.98 },
];

interface LivePreviewProps {
  chartData?: ChartPreviewJson | null;
  fileName?: string;
  status?: "compiling" | "ready" | "failed";
  storagePath?: string;
  onDownload?: () => void;
  /** When true, shows mock data with a "preview" overlay label */
  isMock?: boolean;
  /** Active data colors from SetupCard */
  dataColors?: string[];
  fileName2?: string;
}

const DEFAULT_COLORS = ["#046241", "#FFB347", "#708E7C"];

function fmt(date: string) {
  // If date is ISO (2025-01-01), extract month/day
  if (date.length >= 10 && date[4] === "-") {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return date;
}

function kpiLabel(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function getFieldLabel(field: string): string {
  switch (field) {
    case "target_quantity": return "Total Target";
    case "actual_quantity": return "Total Actual";
    case "target_hours": return "Target Hours";
    case "actual_hours": return "Actual Hours";
    case "completion_rate": return "Completion Rate";
    default: return field.replace(/_/g, " ");
  }
}

function getFieldValue(records: any[], field: string): { value: string; label: string; rawNum: number | null } {
  if (!records || records.length === 0) {
    return { value: "—", label: getFieldLabel(field), rawNum: null };
  }
  
  if (field === "completion_rate") {
    const totalTarget = records.reduce((s, r) => s + (r.target_quantity ?? 0), 0);
    const totalActual = records.reduce((s, r) => s + (r.actual_quantity ?? 0), 0);
    if (totalTarget > 0) {
      const rate = (totalActual / totalTarget) * 100;
      return {
        value: `${rate.toFixed(1)}%`,
        label: "Completion Rate",
        rawNum: rate
      };
    }
    const validRates = records.filter(r => r.completion_rate != null);
    if (validRates.length > 0) {
      const avg = validRates.reduce((s, r) => s + r.completion_rate, 0) / validRates.length;
      const displayAvg = avg < 2.0 ? avg * 100 : avg;
      return {
        value: `${displayAvg.toFixed(1)}%`,
        label: "Completion Rate",
        rawNum: displayAvg
      };
    }
    return { value: "—", label: "Completion Rate", rawNum: null };
  }

  const total = records.reduce((sum, r) => sum + (r[field] ?? 0), 0);
  return {
    value: kpiLabel(total),
    label: getFieldLabel(field),
    rawNum: total
  };
}

export function LivePreview({
  chartData,
  fileName,
  status,
  onDownload,
  isMock = false,
  dataColors = DEFAULT_COLORS,
}: LivePreviewProps) {
  const series = chartData?.records ?? MOCK_SERIES;
  const isActualMock = isMock || !chartData;

  const chartSeries = useMemo(() => {
    return series.map((r) => {
      const obj: Record<string, any> = {
        date: fmt(r.date),
      };
      Object.keys(r).forEach((key) => {
        if (key !== "date") {
          obj[key] = (r as any)[key];
        }
      });
      return obj;
    });
  }, [series]);

  // Color assignments
  const c0 = dataColors[0] ?? DEFAULT_COLORS[0];
  const c1 = dataColors[1] ?? DEFAULT_COLORS[1];
  const c2 = dataColors[2] ?? DEFAULT_COLORS[2];

  const getFieldColor = (field: string, index: number) => {
    if (field === "actual_quantity" || field === "actual_hours") return c0;
    if (field === "target_quantity" || field === "target_hours") return c1;
    if (field === "completion_rate") return c2;
    return dataColors[index % dataColors.length] ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length];
  };

  const FALLBACK_VISUALS = useMemo(() => [
    { type: "card", fields: ["target_quantity"] },
    { type: "card", fields: ["actual_quantity"] },
    { type: "card", fields: ["completion_rate"] },
    { type: "line", fields: ["date", "target_quantity", "actual_quantity"] },
  ], []);

  const visuals = useMemo(() => {
    if (isActualMock || !chartData?.visuals || chartData.visuals.length === 0) {
      return FALLBACK_VISUALS;
    }
    return chartData.visuals;
  }, [isActualMock, chartData, FALLBACK_VISUALS]);

  const cardVisuals = useMemo(() => visuals.filter(v => v.type === "card"), [visuals]);
  const contentVisuals = useMemo(() => visuals.filter(v => v.type !== "card"), [visuals]);

  const renderContentVisual = (visual: typeof visuals[0], visIdx: number) => {
    const fields = visual.fields.filter((f) => f !== "date");
    const title = `${fields.map(getFieldLabel).join(" & ")} by Date`;

    if (visual.type === "line") {
      return (
        <div key={visIdx} className="ll-lp-chart-wrap" style={{ position: "relative" }}>
          {isActualMock && (
            <div className="ll-lp-mock-overlay">
              <span>Mock Preview</span>
            </div>
          )}
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(19,48,32,0.6)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span>{title}</span>
            <span style={{ fontSize: 11, fontWeight: 400, color: "rgba(19,48,32,0.4)" }}>— daily trend</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartSeries} margin={{ top: 4, right: 10, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(19,48,32,0.07)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10.5, fill: "rgba(19,48,32,0.45)" }}
                axisLine={false} tickLine={false}
                interval={Math.max(0, Math.floor(chartSeries.length / 8) - 1)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "rgba(19,48,32,0.4)" }}
                axisLine={false} tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12, borderRadius: 8,
                  border: "1px solid rgba(19,48,32,0.1)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                }}
                labelStyle={{ fontWeight: 600, color: "var(--forest)" }}
              />
              <Legend
                iconSize={10}
                iconType="square"
                wrapperStyle={{ fontSize: 11.5, paddingTop: 8, color: "rgba(19,48,32,0.6)" }}
              />
              {fields.map((f, i) => (
                <Line
                  key={f}
                  type="monotone"
                  dataKey={f}
                  stroke={getFieldColor(f, i)}
                  name={getFieldLabel(f)}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (visual.type === "bar") {
      return (
        <div key={visIdx} className="ll-lp-chart-wrap" style={{ position: "relative" }}>
          {isActualMock && (
            <div className="ll-lp-mock-overlay">
              <span>Mock Preview</span>
            </div>
          )}
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(19,48,32,0.6)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span>{title}</span>
            <span style={{ fontSize: 11, fontWeight: 400, color: "rgba(19,48,32,0.4)" }}>— comparison</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartSeries} margin={{ top: 4, right: 10, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(19,48,32,0.07)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10.5, fill: "rgba(19,48,32,0.45)" }}
                axisLine={false} tickLine={false}
                interval={Math.max(0, Math.floor(chartSeries.length / 8) - 1)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "rgba(19,48,32,0.4)" }}
                axisLine={false} tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12, borderRadius: 8,
                  border: "1px solid rgba(19,48,32,0.1)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                }}
                labelStyle={{ fontWeight: 600, color: "var(--forest)" }}
              />
              <Legend
                iconSize={10}
                iconType="square"
                wrapperStyle={{ fontSize: 11.5, paddingTop: 8, color: "rgba(19,48,32,0.6)" }}
              />
              {fields.map((f, i) => (
                <Bar
                  key={f}
                  dataKey={f}
                  fill={getFieldColor(f, i)}
                  name={getFieldLabel(f)}
                  radius={[3, 3, 0, 0]}
                  barSize={12}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (visual.type === "table") {
      return (
        <div key={visIdx} className="ll-lp-chart-wrap" style={{ position: "relative", padding: "16px 14px 14px" }}>
          {isActualMock && (
            <div className="ll-lp-mock-overlay">
              <span>Mock Preview</span>
            </div>
          )}
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(19,48,32,0.6)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span>{title}</span>
            <span style={{ fontSize: 11, fontWeight: 400, color: "rgba(19,48,32,0.4)" }}>— data table</span>
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 8 }} className="ll-scrollbar">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--line)", background: "var(--offwhite)", position: "sticky", top: 0, zIndex: 1 }}>
                  <th style={{ padding: "8px 10px", color: "var(--forest)", fontWeight: 600 }}>Date</th>
                  {fields.map(f => (
                    <th key={f} style={{ padding: "8px 10px", color: "var(--forest)", fontWeight: 600 }}>
                      {getFieldLabel(f)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {series.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid rgba(19,48,32,0.05)", background: idx % 2 === 1 ? "rgba(19,48,32,0.02)" : "var(--white)" }}>
                    <td style={{ padding: "8px 10px", color: "rgba(19,48,32,0.85)", fontWeight: 500 }}>{fmt(row.date)}</td>
                    {fields.map(f => {
                      const val = (row as any)[f];
                      let displayVal = val == null ? "—" : String(val);
                      if (f === "completion_rate" && val != null) {
                        const rateVal = val < 2.0 ? val * 100 : val;
                        displayVal = `${rateVal.toFixed(1)}%`;
                      }
                      return (
                        <td key={f} style={{ padding: "8px 10px", color: "rgba(19,48,32,0.75)" }}>
                          {displayVal}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="ll-live-preview">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="ll-lp-header">
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BarChart2 size={15} color="var(--emerald)" />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--forest)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {isActualMock ? "Live Preview" : (fileName ?? "Generated Report")}
            </span>
            {status && !isActualMock && (
              <span className={`ll-status-badge ${status}`} style={{ flexShrink: 0 }}>
                {status === "ready" ? "Ready" : status === "compiling" ? "Building…" : "Failed"}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: "rgba(19,48,32,0.5)", marginTop: 2, paddingLeft: 23 }}>
            {isActualMock
              ? "Configure your report and hit Generate — your data will appear here"
              : "Data preview · open the .pbip in Power BI Desktop for the full report"}
          </div>
        </div>

        {onDownload && !isActualMock && status === "ready" && (
          <button
            onClick={onDownload}
            className="ll-btn-amber"
            style={{ fontSize: 12.5, padding: "7px 14px", gap: 6, flexShrink: 0 }}
          >
            <Download size={13} /> Download .zip
          </button>
        )}
      </div>

      {/* ── KPI strip ────────────────────────────────────────────── */}
      {cardVisuals.length > 0 && (
        <div className="ll-lp-kpi-strip" style={{ display: "grid", gridTemplateColumns: `repeat(${cardVisuals.length}, 1fr)`, gap: 10 }}>
          {cardVisuals.map((v, i) => {
            const field = v.fields[0];
            const { value, label, rawNum } = getFieldValue(series, field);

            // Icon selection
            let icon = <Target size={14} color={c1} />;
            if (field.includes("actual")) {
              icon = <TrendingUp size={14} color={c0} />;
            } else if (field === "completion_rate") {
              const cardRateColor =
                rawNum == null
                  ? "var(--forest)"
                  : rawNum >= 90
                  ? "var(--emerald)"
                  : rawNum >= 70
                  ? "#A65A12"
                  : "#B3261E";
              icon = <CheckCircle size={14} color={cardRateColor} />;
            }

            const valueColor = field === "completion_rate" && !isActualMock
              ? (rawNum == null
                  ? undefined
                  : rawNum >= 90
                  ? "var(--emerald)"
                  : rawNum >= 70
                  ? "#A65A12"
                  : "#B3261E")
              : undefined;

            return (
              <KPICard
                key={i}
                icon={icon}
                label={label}
                value={value}
                valueColor={valueColor}
                faded={isActualMock}
              />
            );
          })}
        </div>
      )}

      {/* ── Content visuals (Charts & Tables) ────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {contentVisuals.map((visual, idx) => renderContentVisual(visual, idx))}
      </div>

      {/* ── Footer note ──────────────────────────────────────────── */}
      {!isActualMock && (
        <div style={{
          marginTop: 14,
          padding: "10px 14px",
          borderRadius: 8,
          background: "var(--emerald-tint)",
          border: "1px solid rgba(4,98,65,0.15)",
          fontSize: 12,
          color: "var(--emerald-dark)",
          lineHeight: 1.5,
        }}>
          ✓ Dashboard package generated. Download the <strong>.zip</strong> and open
          the <strong>.pbip</strong> file in Power BI Desktop to see the full interactive report.
        </div>
      )}
    </div>
  );
}

// ── KPI Card sub-component ────────────────────────────────────────────────────

function KPICard({
  icon, label, value, valueColor, faded,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
  faded?: boolean;
}) {
  return (
    <div className="ll-lp-kpi" style={{ opacity: faded ? 0.45 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: "rgba(19,48,32,0.5)" }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: valueColor ?? "var(--forest)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}
