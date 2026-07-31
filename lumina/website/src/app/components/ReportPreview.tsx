"use client";

import { Download, Target, TrendingUp, CheckCircle, BarChart2, Filter, Calendar } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  Brush,
} from "recharts";
import type { FlexiblePreview } from "@/lib/types";

import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useRef, useState, useMemo } from "react";

gsap.registerPlugin(useGSAP);

function hexToRgba(hex: string, alpha: number) {
  if (!hex || !hex.startsWith("#")) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (isNaN(r)) return `rgba(255,255,255,${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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
  selectedValue,
  onSelect,
}: {
  preview: FlexiblePreview;
  measures: FlexiblePreview["measures"];
  /** The grouping columns to show. More than one when the figures are split more than one way. */
  columns: Array<{ key: string; label: string }>;
  rows: Row[];
  selectedValue?: { axis: string; val: any } | null;
  onSelect?: (axis: string, val: any) => void;
}) {
  const [tableSort, setTableSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    if (tableSort) {
      arr.sort((a, b) => {
        const aVal = a[tableSort.key];
        const bVal = b[tableSort.key];
        if (aVal == null && bVal != null) return 1;
        if (bVal == null && aVal != null) return -1;
        if (aVal != null && bVal != null) {
           if (aVal < bVal) return tableSort.direction === "asc" ? -1 : 1;
           if (aVal > bVal) return tableSort.direction === "asc" ? 1 : -1;
        }
        return 0;
      });
    }
    return arr;
  }, [rows, tableSort]);

  const handleSort = (key: string) => {
    setTableSort(prev => {
      if (prev?.key === key) return prev.direction === "asc" ? { key, direction: "desc" } : null;
      return { key, direction: "asc" };
    });
  };

  return (
    <div className="ll-scrollbar" style={{ maxHeight: 260, overflow: "auto", borderRadius: 12, border: "1px solid rgba(19,48,32,0.1)", background: "rgba(255,255,255,0.15)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left", whiteSpace: "nowrap" }}>
        <thead>
          <tr style={{ position: "sticky", top: 0, zIndex: 1 }}>
            {columns.map((c) => (
              <th 
                key={c.key}
                onClick={() => handleSort(c.key)}
                style={{ padding: "12px 16px", color: "var(--forest)", fontWeight: 700, borderBottom: "1px solid rgba(19,48,32,0.1)", background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", cursor: "pointer", userSelect: "none" }}
              >
                {c.label} {tableSort?.key === c.key ? (tableSort.direction === "asc" ? "↑" : "↓") : ""}
              </th>
            ))}
            {measures.map((m) => (
              <th 
                key={m.key}
                onClick={() => handleSort(m.key)}
                style={{ padding: "12px 16px", color: "var(--forest)", fontWeight: 700, borderBottom: "1px solid rgba(19,48,32,0.1)", background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", cursor: "pointer", userSelect: "none", textAlign: "right" }}
              >
                {m.label} {tableSort?.key === m.key ? (tableSort.direction === "asc" ? "↑" : "↓") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => {
            const axisKey = columns[0]?.key;
            const isSelected = selectedValue?.axis === axisKey && selectedValue?.val === row[axisKey];
            return (
              <tr 
                key={i} 
                onClick={() => {
                  if (axisKey && onSelect) {
                    onSelect(axisKey, isSelected ? null : row[axisKey]);
                  }
                }}
                style={{ 
                  borderBottom: "1px solid rgba(19,48,32,0.05)",
                  background: isSelected ? "rgba(4, 98, 65, 0.15)" : (i % 2 === 1 ? "rgba(4, 98, 65, 0.03)" : "transparent"),
                  cursor: onSelect ? "pointer" : "default",
                  transition: "background 0.2s ease"
                }}
              >
                {columns.map((c) => (
                  <td key={c.key} style={{ padding: "10px 16px", color: isSelected ? "var(--forest)" : "rgba(19,48,32,0.9)", fontWeight: isSelected ? 800 : (i % 2 === 1 ? 500 : 400) }}>
                    {String(row[c.key] ?? "")}
                  </td>
                ))}
                {measures.map((m) => (
                  <td key={m.key} style={{ padding: "10px 16px", textAlign: "right", color: isSelected ? "var(--forest)" : "rgba(19,48,32,0.7)", fontWeight: isSelected ? 700 : 400 }}>
                    {formatValue(typeof row[m.key] === "number" ? (row[m.key] as number) : null, m.format)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: "rgba(19,48,32,0.03)", borderTop: "1px solid rgba(19,48,32,0.1)" }}>
            <td colSpan={columns.length} style={{ padding: "10px 16px", fontWeight: 700, color: "var(--forest)" }}>Total</td>
            {measures.map((m) => (
              <td key={m.key} style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700, color: "var(--forest)" }}>
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

  const containerRef = useRef<HTMLDivElement>(null);

  const c0 = colors[0] ?? "#046241";
  const c1 = colors[1] ?? "#FFB347";
  
  const isDefaultTheme = c0.toUpperCase() === "#046241";
  const panelBgAlpha = isDefaultTheme ? 0.15 : 0.08;
  const panelBgColor = isDefaultTheme ? "rgba(255,255,255,0.15)" : hexToRgba(c0, panelBgAlpha);
  const panelBorderColor = isDefaultTheme ? "rgba(255,255,255,0.4)" : hexToRgba(c0, 0.15);

  const GLASS_PANEL_STYLE = useMemo(() => ({
    background: `linear-gradient(135deg, ${panelBgColor} 0%, rgba(255,255,255,0.2) 100%)`,
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: `1px solid ${panelBorderColor}`,
    boxShadow: `0 8px 32px ${hexToRgba(c0, 0.04)}, inset 0 1px 0 rgba(255,255,255,0.4)`,
    borderRadius: "20px",
    padding: "24px",
    backfaceVisibility: "hidden" as const,
    WebkitBackfaceVisibility: "hidden" as const,
    transform: "translateZ(0)",
    transition: "transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.4s ease, border-color 0.4s ease",
  }), [panelBgColor, panelBorderColor, c0]);

  const HOVER_CARD_STYLE = useMemo(() => ({
    transform: "translateY(-4px)",
    boxShadow: `0 16px 32px ${hexToRgba(c1, 0.15)}, inset 0 0 0 1px ${hexToRgba(c1, 0.4)}`,
  }), [c1]);

  const HOVER_CHART_STYLE = useMemo(() => ({
    transform: "translateY(-4px)",
    boxShadow: `0 16px 32px ${hexToRgba(c0, 0.15)}, inset 0 0 0 1px ${hexToRgba(c0, 0.3)}`,
  }), [c0]);

  useGSAP(() => {
    gsap.from(".ag-stagger-item", {
      y: 20,
      opacity: 0,
      duration: 0.6,
      stagger: 0.05,
      ease: "power3.out"
    });
  }, { scope: containerRef, dependencies: [preview] });

  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [statusFilter, setStatusFilter] = useState<"all" | "good" | "bad">("all");
  const [selectedValue, setSelectedValue] = useState<{ axis: string; val: any } | null>(null);

  const dateKey = useMemo(() => {
    return groupings.find(g => g.key.toLowerCase().includes('date') || g.key.toLowerCase().includes('month') || g.key.toLowerCase().includes('year'))?.key ?? groupings[0].key;
  }, [groupings]);
  
  const rateMeasure = useMemo(() => preview.measures.find(m => m.format === "percent")?.key, [preview]);

  const filteredPreview = useMemo(() => {
    const filteredRows = preview.rows.filter(r => {
      // Dynamic Date filtering
      const dateVal = r[dateKey];
      if (dateVal && typeof dateVal === "string") {
        const d = new Date(dateVal).getTime();
        if (!isNaN(d)) {
          if (dateRange.start && d < new Date(dateRange.start).getTime()) return false;
          if (dateRange.end && d > new Date(dateRange.end).getTime()) return false;
        } else {
           if (dateRange.start && dateVal < dateRange.start) return false;
           if (dateRange.end && dateVal > dateRange.end) return false;
        }
      }
      
      // Dynamic Status filtering
      if (statusFilter !== "all" && rateMeasure) {
         let rate = r[rateMeasure];
         if (typeof rate !== "number" && preview.rates?.[rateMeasure]) {
            const [actualKey, targetKey] = preview.rates[rateMeasure];
            const actual = r[actualKey] as number;
            const target = r[targetKey] as number;
            if (target) rate = actual / target;
         }
         if (typeof rate === "number") {
             if (statusFilter === "good" && rate < 0.9) return false;
             if (statusFilter === "bad" && rate >= 0.9) return false;
         }
      }
      return true;
    });
    return { ...preview, rows: filteredRows };
  }, [preview, dateRange, statusFilter, dateKey, rateMeasure]);

  const cardPreview = useMemo(() => {
    if (!selectedValue) return filteredPreview;
    const rows = filteredPreview.rows.filter(r => r[selectedValue.axis] === selectedValue.val);
    return { ...filteredPreview, rows };
  }, [filteredPreview, selectedValue]);

  // ── Layout Balancing Logic (12-column grid) ──
  const layoutItems: Array<{ type: "card" | "chart" | "table"; index: number; span: number }> = [];
  const numCards = preview.headline_figures.length;
  const numCharts = preview.charts.length;

  if (numCards === 1 && numCharts >= 1) {
    layoutItems.push({ type: "card", index: 0, span: 4 });
    layoutItems.push({ type: "chart", index: 0, span: 8 });
    
    for (let i = 1; i < numCharts; i++) {
      const isLastAndOdd = (i === numCharts - 1) && ((numCharts - 1) % 2 !== 0);
      layoutItems.push({ type: "chart", index: i, span: isLastAndOdd ? 12 : 6 });
    }
  } else {
    // 1 card -> 12, 2 cards -> 6, 3 cards -> 4, 4+ cards -> 3
    const cardSpan = numCards === 1 ? 12 : numCards === 2 ? 6 : numCards === 3 ? 4 : 3;
    for (let i = 0; i < numCards; i++) {
      layoutItems.push({ type: "card", index: i, span: cardSpan });
    }
    for (let i = 0; i < numCharts; i++) {
      const isLastAndOdd = (i === numCharts - 1) && (numCharts % 2 !== 0);
      layoutItems.push({ type: "chart", index: i, span: isLastAndOdd ? 12 : 6 });
    }
  }
  // The global table always spans 12 columns at the end
  layoutItems.push({ type: "table", index: 0, span: 12 });

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="ag-stagger-item" style={{ 
        display: "flex", justifyContent: "space-between", alignItems: "flex-start", 
        ...GLASS_PANEL_STYLE, padding: "16px 24px" 
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "var(--emerald-tint)", padding: 8, borderRadius: 12 }}>
              <BarChart2 size={20} color="var(--emerald)" />
            </div>
            <h1 className="ll-brand-font" style={{ fontSize: 24, fontWeight: 800, color: "var(--forest)", margin: 0, letterSpacing: "-0.02em" }}>
              {preview.title}
            </h1>
            <span style={{ 
              background: "var(--emerald-tint)", color: "var(--emerald-dark)",
              padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 
            }}>
              Live
            </span>
          </div>
          <div style={{ fontSize: 14, color: "rgba(19,48,32,0.5)", marginTop: 6, fontWeight: 500, paddingLeft: 46 }}>
            Reference: N/A
          </div>
        </div>

        {downloadable && (
          <button
            onClick={onDownload}
            className="ll-export-btn"
            style={{ 
              display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", marginTop: 0,
              background: "linear-gradient(135deg, var(--amber) 0%, var(--amber-safe) 100%)",
              color: "#FFF", borderRadius: 100, border: "none", fontWeight: 700, fontSize: 13,
              cursor: "pointer", boxShadow: "0 4px 14px rgba(245,158,11,0.3)",
              transition: "all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)"
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 6px 20px rgba(245,158,11,0.4)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.boxShadow = "0 4px 14px rgba(245,158,11,0.3)";
            }}
          >
            <Download size={15} strokeWidth={2.5} />
            Export PBIP
          </button>
        )}
      </div>

      {/* ── Filters (Slicers) ────────────────────────────────────── */}
      <div className="ag-stagger-item" style={{ 
        display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center",
        ...GLASS_PANEL_STYLE, padding: "16px 24px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Filter size={16} color="var(--emerald)" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--forest)" }}>Performance:</span>
          <div style={{ display: "flex", background: "rgba(19,48,32,0.06)", borderRadius: 10, padding: 4 }}>
            {(["all", "good", "bad"] as const).map(sf => (
              <button
                key={sf}
                onClick={() => setStatusFilter(sf)}
                style={{
                  padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
                  background: statusFilter === sf ? "var(--white)" : "transparent",
                  color: statusFilter === sf ? "var(--forest)" : "rgba(19,48,32,0.5)",
                  boxShadow: statusFilter === sf ? "0 4px 12px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
                }}
              >
                {sf === "all" ? "All Days" : sf === "good" ? "On Track (≥90%)" : "At Risk (<90%)"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ width: "1px", height: "24px", background: "var(--line)" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Calendar size={16} color="var(--emerald)" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--forest)" }}>Date Range:</span>
          <input 
            type="date" 
            value={dateRange.start} 
            onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))} 
            style={{ 
              padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(19,48,32,0.1)", 
              background: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600, color: "var(--forest)",
              outline: "none", transition: "border-color 0.2s"
            }} 
          />
          <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(19,48,32,0.4)" }}>to</span>
          <input 
            type="date" 
            value={dateRange.end} 
            onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))} 
            style={{ 
              padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(19,48,32,0.1)", 
              background: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600, color: "var(--forest)",
              outline: "none", transition: "border-color 0.2s"
            }} 
          />
          {(dateRange.start || dateRange.end || statusFilter !== "all") && (
            <button
              onClick={() => { setDateRange({ start: "", end: "" }); setStatusFilter("all"); }}
              style={{
                marginLeft: "auto", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: "1px solid rgba(179, 38, 30, 0.2)", background: "rgba(179, 38, 30, 0.08)",
                color: "#B3261E", cursor: "pointer", transition: "all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(179, 38, 30, 0.15)"; e.currentTarget.style.transform = "scale(1.02)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(179, 38, 30, 0.08)"; e.currentTarget.style.transform = "none"; }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 24, width: "100%" }}>
        {layoutItems.map((item, loopIdx) => {
          if (item.type === "card") {
            const kpi = preview.headline_figures[item.index];
            const rawVal = total(cardPreview, kpi.measure);
            const displayVal = formatValue(rawVal, formatOf(kpi.measure));
            const isRate = formatOf(kpi.measure) === "percent";
            
            let baseColor = colors[item.index % colors.length];
            let Icon = Target;
            
            if (kpi.measure.includes("actual")) {
              Icon = TrendingUp;
            } else if (isRate) {
              baseColor = rawVal == null ? "var(--forest)" : rawVal >= 0.9 ? "var(--emerald)" : rawVal >= 0.7 ? "#A65A12" : "#B3261E";
              Icon = CheckCircle;
            }

            return (
              <div 
                key={`card-${item.index}`} 
                className="ll-kpi-card ag-stagger-item"
                style={{
                  ...GLASS_PANEL_STYLE,
                  gridColumn: `span ${item.span}`,
                  minHeight: "180px",
                  display: "flex", flexDirection: "column", justifyContent: "space-between",
                  position: "relative", overflow: "hidden", cursor: "default"
                }}
                onMouseEnter={(e) => { Object.assign(e.currentTarget.style, HOVER_CARD_STYLE); }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow = GLASS_PANEL_STYLE.boxShadow;
                }}
              >
                <div style={{ position: "absolute", bottom: "-20%", right: "-5%", width: "160px", height: "160px", background: `radial-gradient(circle, ${hexToRgba(baseColor, 0.15)} 0%, transparent 70%)`, borderRadius: "50%", pointerEvents: "none" }} />
                
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", zIndex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "rgba(19,48,32,0.6)" }}>
                    {kpi.label}
                  </span>
                  <div style={{ background: `linear-gradient(135deg, rgba(255,255,255,0.8), rgba(255,255,255,0.3))`, padding: "8px", borderRadius: "12px", boxShadow: `0 4px 12px ${hexToRgba(baseColor, 0.08)}, inset 0 1px 0 rgba(255,255,255,0.6)` }}>
                    <Icon size={22} color={baseColor} />
                  </div>
                </div>

                <div style={{ position: "relative", zIndex: 1, marginTop: "auto" }}>
                  <div style={{ fontSize: 52, fontWeight: 800, color: (isRate ? baseColor : "var(--forest)"), fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em", lineHeight: 1.1 }}>
                    {displayVal}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(19,48,32,0.75)", fontWeight: 600, marginTop: 4 }}>
                    {selectedValue ? `For ${selectedValue.val}` : `Across every ${preview.group_by.label.toLowerCase()}`}
                  </div>
                </div>
              </div>
            );
          }

          if (item.type === "chart") {
            const chart = preview.charts[item.index];
            const axis = chart.group_by ?? preview.group_by.key;
            const axisLabel = groupings.find((g) => g.key === axis)?.label ?? axis;
            const rows = rollUp(filteredPreview, axis);

            const primaryColor = colors[0];
            return (
              <div 
                key={`chart-${item.index}`} 
                className="ll-preview-chart ag-stagger-item" 
                style={{ 
                  ...GLASS_PANEL_STYLE,
                  gridColumn: `span ${item.span}`, cursor: "crosshair",
                  position: "relative"
                }}
                onMouseEnter={(e) => { Object.assign(e.currentTarget.style, HOVER_CHART_STYLE); }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow = GLASS_PANEL_STYLE.boxShadow;
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--forest)", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{chart.title}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(19,48,32,0.4)", background: "rgba(19,48,32,0.06)", padding: "2px 8px", borderRadius: 12 }}>{chart.kind === "line" ? "Trend" : "Comparison"}</span>
                </div>
                <div className="ll-chart-legend">
                  {chart.measures.map((measure, i) => (
                    <span key={measure} style={{ fontSize: 12, fontWeight: 600 }}>
                      <i style={{ background: colors[i % colors.length], width: 10, height: 10, borderRadius: 5 }} />
                      {labelOf(measure)}
                    </span>
                  ))}
                </div>
                {chart.kind === "table" ? (
                  <FigureTable
                    preview={filteredPreview}
                    columns={[{ key: axis, label: axisLabel }]}
                    rows={rows}
                    measures={chart.measures
                      .map((k) => preview.measures.find((m) => m.key === k))
                      .filter((m): m is FlexiblePreview["measures"][number] => !!m)}
                    selectedValue={selectedValue}
                    onSelect={(a, v) => setSelectedValue(v === null ? null : { axis: a, val: v })}
                  />
                ) : (
                <div style={{ width: "100%", height: 300 }}>
                  <ResponsiveContainer>
                    <ComposedChart 
                      data={rows} 
                      margin={{ top: 10, right: 10, bottom: 0, left: -10 }}
                      onClick={(e: any) => {
                        if (e?.activePayload?.[0]?.payload) {
                          const clickedVal = e.activePayload[0].payload[axis];
                          if (clickedVal) setSelectedValue(prev => prev?.val === clickedVal ? null : { axis, val: clickedVal });
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(19,48,32,0.07)" vertical={false} />
                      <XAxis dataKey={axis} tick={{ fontSize: 11, fill: "var(--forest)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--forest)" }} tickFormatter={(v) => formatValue(v, formatOf(chart.measures[0]))} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(10px)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.8)", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", color: "var(--forest)" }}
                        itemStyle={{ fontWeight: 700, fontSize: 12 }}
                        labelStyle={{ fontWeight: 700, color: "var(--forest)", marginBottom: 8, fontSize: 13 }}
                        formatter={(value, name) => [
                          formatValue(typeof value === "number" ? value : null, formatOf(String(name))),
                          labelOf(String(name)),
                        ]}
                      />
                      {chart.measures.map((measure, i) =>
                        chart.kind === "line" ? (
                          <Line 
                            key={measure} type="monotone" dataKey={measure} 
                            stroke={colors[i % colors.length]} strokeWidth={3} dot={false} 
                            activeDot={{ 
                              r: 6, strokeWidth: 0,
                              onClick: (_e: any, payload: any) => {
                                const clickedVal = payload?.payload?.[axis];
                                if (clickedVal) setSelectedValue(prev => prev?.val === clickedVal ? null : { axis, val: clickedVal });
                              },
                              cursor: "pointer"
                            }} 
                          />
                        ) : (
                          <Bar 
                            key={measure} dataKey={measure} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} barSize={20}
                            onClick={(data: any) => {
                              const clickedVal = data?.[axis];
                              if (clickedVal) setSelectedValue(prev => prev?.val === clickedVal ? null : { axis, val: clickedVal });
                            }}
                          >
                            {rows.map((entry, rIdx) => (
                              <Cell 
                                key={`cell-${rIdx}`} 
                                fill={colors[i % colors.length]} 
                                fillOpacity={selectedValue && selectedValue.val !== entry[axis] ? 0.3 : 1}
                                style={{ transition: "fill-opacity 0.3s" }}
                              />
                            ))}
                          </Bar>
                        )
                      )}
                      {rows.length > 5 && (
                        <Brush 
                          dataKey={axis} 
                          height={20} 
                          stroke={hexToRgba(primaryColor, 0.2)} 
                          fill={hexToRgba(primaryColor, 0.05)}
                          tickFormatter={() => ""}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                )}
              </div>
            );
          }

          if (item.type === "table") {
            const primaryColor = colors[0];
            return (
              <div 
                key="table" 
                className="ll-preview-chart ag-stagger-item" 
                style={{ 
                  ...GLASS_PANEL_STYLE,
                  gridColumn: `span ${item.span}`, cursor: "default",
                  position: "relative"
                }}
                onMouseEnter={(e) => { Object.assign(e.currentTarget.style, HOVER_CHART_STYLE); }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow = GLASS_PANEL_STYLE.boxShadow;
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--forest)", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>Every figure by {groupings.map((g) => g.label.toLowerCase()).join(" and ")}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(19,48,32,0.4)", background: "rgba(19,48,32,0.06)", padding: "2px 8px", borderRadius: 12 }}>Data Table</span>
                </div>
                <FigureTable
                  preview={filteredPreview}
                  columns={groupings}
                  rows={filteredPreview.rows}
                  measures={preview.measures}
                  selectedValue={selectedValue}
                  onSelect={(a, v) => setSelectedValue(v === null ? null : { axis: a, val: v })}
                />
              </div>
            );
          }
        })}
      </div>
    </div>
  );
}
