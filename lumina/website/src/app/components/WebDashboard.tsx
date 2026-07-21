"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Download, BarChart2, TrendingUp, Target, CheckCircle, Filter, Calendar } from "lucide-react";
import {
  ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, ReferenceLine, Brush
} from "recharts";
import type { ChartPreviewJson } from "@/lib/types";

import gsap from "gsap";
import { useGSAP } from "@gsap/react";

// Register GSAP plugins
gsap.registerPlugin(useGSAP);

// ── Mock data used before any file is generated ──────────────────────────────
const MOCK_SERIES = [
  { date: "2025-01-01", target_quantity: 120, actual_quantity: 102, target_hours: 8, actual_hours: 7.5, completion_rate: 0.85 },
  { date: "2025-01-02", target_quantity: 120, actual_quantity: 115, target_hours: 8, actual_hours: 8.0, completion_rate: 0.958 },
  { date: "2025-01-03", target_quantity: 120, actual_quantity: 89, target_hours: 8, actual_hours: 6.5, completion_rate: 0.741 },
  { date: "2025-01-04", target_quantity: 130, actual_quantity: 127, target_hours: 8.5, actual_hours: 8.2, completion_rate: 0.976 },
  { date: "2025-01-05", target_quantity: 130, actual_quantity: 134, target_hours: 8.5, actual_hours: 9.0, completion_rate: 1.03 },
  { date: "2025-01-06", target_quantity: 130, actual_quantity: 121, target_hours: 8.5, actual_hours: 8.0, completion_rate: 0.93 },
  { date: "2025-01-07", target_quantity: 140, actual_quantity: 138, target_hours: 9, actual_hours: 9.0, completion_rate: 0.985 },
  { date: "2025-01-08", target_quantity: 140, actual_quantity: 99, target_hours: 9, actual_hours: 7.0, completion_rate: 0.707 },
  { date: "2025-01-09", target_quantity: 140, actual_quantity: 143, target_hours: 9, actual_hours: 9.2, completion_rate: 1.02 },
  { date: "2025-01-10", target_quantity: 150, actual_quantity: 147, target_hours: 9.5, actual_hours: 9.5, completion_rate: 0.98 },
];

interface WebDashboardProps {
  chartData?: ChartPreviewJson | null;
  fileName?: string;
  status?: "compiling" | "ready" | "failed";
  storagePath?: string;
  onDownload?: () => void;
  isMock?: boolean;
  dataColors?: string[];
}

const DEFAULT_COLORS = ["#046241", "#FFB347", "#708E7C"];

function fmt(date: string) {
  if (date.length >= 10 && date[4] === "-") {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return date;
}

function kpiLabel(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  // Add commas to large numbers
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
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
    return { value: "0", label: getFieldLabel(field), rawNum: 0 };
  }
  if (field === "completion_rate") {
    const totalTarget = records.reduce((s, r) => s + (r.target_quantity ?? 0), 0);
    const totalActual = records.reduce((s, r) => s + (r.actual_quantity ?? 0), 0);
    if (totalTarget > 0) {
      const rate = (totalActual / totalTarget) * 100;
      return { value: `${rate.toFixed(1)}%`, label: "Completion Rate", rawNum: rate };
    }
    const validRates = records.filter(r => r.completion_rate != null);
    if (validRates.length > 0) {
      const avg = validRates.reduce((s, r) => s + r.completion_rate, 0) / validRates.length;
      const displayAvg = avg < 2.0 ? avg * 100 : avg;
      return { value: `${displayAvg.toFixed(1)}%`, label: "Completion Rate", rawNum: displayAvg };
    }
    return { value: "—", label: "Completion Rate", rawNum: null };
  }
  const total = records.reduce((sum, r) => sum + (r[field] ?? 0), 0);
  return { value: kpiLabel(total), label: getFieldLabel(field), rawNum: total };
}

// ── Helper ────────────────────────────────────────────────────────────────
function hexToRgba(hex: string, alpha: number) {
  if (!hex || !hex.startsWith("#")) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (isNaN(r)) return `rgba(255,255,255,${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function WebDashboard({
  chartData,
  fileName,
  status,
  onDownload,
  isMock = false,
  dataColors = DEFAULT_COLORS,
  storagePath,
}: WebDashboardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Filter States
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [statusFilter, setStatusFilter] = useState<"all" | "good" | "bad">("all");
  const [tableSort, setTableSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useGSAP(() => {
    gsap.from(".ag-stagger-item", {
      y: 20,
      opacity: 0,
      duration: 0.6,
      stagger: 0.05,
      ease: "power3.out"
    });
  }, { scope: containerRef, dependencies: [chartData, fileName] });

  useEffect(() => {
    if (selectedDate) {
      const el = document.getElementById(`row-${selectedDate}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [selectedDate]);

  const rawSeries = chartData?.records ?? MOCK_SERIES;
  const isActualMock = isMock || !chartData;

  const headingFont = chartData?.heading_font || "Fraunces";
  const bodyFont = chartData?.body_font || "DM Sans";

  const c0 = dataColors[0] ?? DEFAULT_COLORS[0];
  const c1 = dataColors[1] ?? DEFAULT_COLORS[1];
  const c2 = dataColors[2] ?? DEFAULT_COLORS[2];

  // ── Dynamic Glassmorphism Styles ──────────────────────────────────────────
  const isDefaultTheme = c0.toUpperCase() === "#046241"; // Lifewood default
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

  // Apply filters
  const series = useMemo(() => {
    return rawSeries.filter(r => {
      // Date filter
      if (dateRange.start && r.date < dateRange.start) return false;
      if (dateRange.end && r.date > dateRange.end) return false;

      // Status filter
      if (statusFilter === "good" && (r.completion_rate == null || r.completion_rate < 0.9)) return false;
      if (statusFilter === "bad" && (r.completion_rate != null && r.completion_rate >= 0.9)) return false;

      return true;
    });
  }, [rawSeries, dateRange, statusFilter]);

  // Applied filters and sorting are already handled above
  const graphSeries = useMemo(() => {
    return series.map((r) => {
      const obj: Record<string, any> = { date: fmt(r.date), rawDate: r.date };
      Object.keys(r).forEach((key) => { if (key !== "date") obj[key] = (r as any)[key]; });
      return obj;
    });
  }, [series]);

  const tableSeries = useMemo(() => {
    const arr = [...graphSeries];
    if (tableSort) {
      arr.sort((a, b) => {
        const key = tableSort.key === "date" ? "rawDate" : tableSort.key;
        const aVal = a[key];
        const bVal = b[key];
        if (aVal == null && bVal != null) return 1;
        if (bVal == null && aVal != null) return -1;
        if (aVal < bVal) return tableSort.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return tableSort.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return arr;
  }, [graphSeries, tableSort]);

  const handleSort = (key: string) => {
    setTableSort(prev => {
      if (prev?.key === key) return prev.direction === "asc" ? { key, direction: "desc" } : null;
      return { key, direction: "asc" };
    });
  };

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
    if (isActualMock || !chartData?.visuals || chartData.visuals.length === 0) return FALLBACK_VISUALS;
    return chartData.visuals;
  }, [isActualMock, chartData, FALLBACK_VISUALS]);

  const cardVisuals = useMemo(() => visuals.filter(v => v.type === "card"), [visuals]);
  const contentVisuals = useMemo(() => visuals.filter(v => v.type !== "card"), [visuals]);

  const layoutItems = useMemo(() => {
    const items: Array<{ visual: typeof visuals[0]; span: number; isCard: boolean }> = [];
    const numCards = cardVisuals.length;
    const numCharts = contentVisuals.length;

    if (numCards === 1 && numCharts >= 1) {
      items.push({ visual: cardVisuals[0], span: 4, isCard: true });
      items.push({ visual: contentVisuals[0], span: 8, isCard: false });
      
      const remainingCharts = contentVisuals.slice(1);
      for (let i = 0; i < remainingCharts.length; i++) {
        const isLastAndOdd = (i === remainingCharts.length - 1) && (remainingCharts.length % 2 !== 0);
        items.push({ visual: remainingCharts[i], span: isLastAndOdd ? 12 : 6, isCard: false });
      }
    } else {
      const cardSpan = numCards === 1 ? 12 : numCards === 2 ? 6 : numCards === 3 ? 4 : 3;
      cardVisuals.forEach(v => items.push({ visual: v, span: cardSpan, isCard: true }));
      
      for (let i = 0; i < numCharts; i++) {
        const isLastAndOdd = (i === numCharts - 1) && (numCharts % 2 !== 0);
        items.push({ visual: contentVisuals[i], span: isLastAndOdd ? 12 : 6, isCard: false });
      }
    }

    return items;
  }, [cardVisuals, contentVisuals]);

  // Custom Chart Tooltip
  const CustomChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(10px)", padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.8)", boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
          <p style={{ fontWeight: 700, color: "var(--forest)", marginBottom: 8, fontSize: 13 }}>{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: entry.color }} />
              <span style={{ color: "rgba(19,48,32,0.7)", fontSize: 12, fontWeight: 500 }}>{entry.name}:</span>
              <span style={{ color: "var(--forest)", fontSize: 12, fontWeight: 700 }}>
                {entry.name.includes("Rate") ? `${(entry.value * (entry.value < 2 ? 100 : 1)).toFixed(1)}%` : entry.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderCard = (visual: typeof visuals[0], idx: number, span: number) => {
    const field = visual.fields[0];
    const cardSeries = selectedDate ? series.filter(r => r.date === selectedDate) : series;
    const { value, label, rawNum } = getFieldValue(cardSeries, field);

    let baseColor = c1;
    let icon = <Target size={22} color={c1} />;
    
    if (field.includes("actual")) {
      baseColor = c0;
      icon = <TrendingUp size={22} color={c0} />;
    } else if (field === "completion_rate") {
      baseColor = rawNum == null ? "var(--forest)" : rawNum >= 90 ? "var(--emerald)" : rawNum >= 70 ? "#A65A12" : "#B3261E";
      icon = <CheckCircle size={22} color={baseColor} />;
    }

    const valueColor = field === "completion_rate" && !isActualMock ? baseColor : undefined;

    return (
      <div 
        key={`card-${idx}`} 
        className="ag-stagger-item"
        title={`Exact value for ${label}: ${rawNum != null ? rawNum.toLocaleString("en-US") : "N/A"}`}
        style={{ 
          ...GLASS_PANEL_STYLE, 
          gridColumn: `span ${span}`,
          minHeight: "180px",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          opacity: isActualMock ? 0.7 : 1, cursor: "help",
          position: "relative", overflow: "hidden"
        }}
        onMouseEnter={(e) => { Object.assign(e.currentTarget.style, HOVER_CARD_STYLE); }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = GLASS_PANEL_STYLE.boxShadow; }}
      >
        {/* Decorative background orb */}
        <div style={{ position: "absolute", bottom: "-20%", right: "-5%", width: "160px", height: "160px", background: `radial-gradient(circle, ${hexToRgba(baseColor, 0.15)} 0%, transparent 70%)`, borderRadius: "50%", pointerEvents: "none" }} />
        
        {/* Top Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", zIndex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "rgba(19,48,32,0.6)" }}>
            {label}
          </span>
          <div style={{ background: `linear-gradient(135deg, rgba(255,255,255,0.8), rgba(255,255,255,0.3))`, padding: "8px", borderRadius: "12px", boxShadow: `0 4px 12px ${hexToRgba(baseColor, 0.08)}, inset 0 1px 0 rgba(255,255,255,0.6)` }}>
            {icon}
          </div>
        </div>

        {/* Main Value & Subtitle */}
        <div style={{ position: "relative", zIndex: 1, marginTop: "auto" }}>
          <div style={{ fontSize: 52, fontWeight: 800, color: valueColor ?? "var(--forest)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em", lineHeight: 1.1 }}>
            {value}
          </div>
          <div style={{ fontSize: 12, color: "rgba(19,48,32,0.75)", fontWeight: 600, marginTop: 4 }}>
            {selectedDate ? `On ${selectedDate}` : field === "completion_rate" ? "Average across period" : "Total across period"}
          </div>
        </div>
      </div>
    );
  };

  const renderContentVisual = (visual: typeof visuals[0], visIdx: number, span: number) => {
    const fields = visual.fields.filter((f) => f !== "date");
    const title = `${fields.map(getFieldLabel).join(" & ")} by Date`;

    const renderChartWrapper = (children: React.ReactNode, typeLabel: string) => (
      <div 
        key={`chart-${visIdx}`} 
        className="ag-stagger-item"
        style={{ ...GLASS_PANEL_STYLE, gridColumn: `span ${span}`, position: "relative" }}
        onMouseEnter={(e) => { Object.assign(e.currentTarget.style, HOVER_CHART_STYLE); }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = GLASS_PANEL_STYLE.boxShadow; }}
      >
        {isActualMock && (
          <div className="ll-lp-mock-overlay" style={{ borderRadius: 20 }}>
            <span style={{ background: "rgba(255,255,255,0.9)", padding: "4px 12px", borderRadius: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", color: "var(--forest)", fontWeight: 700 }}>Mock Preview</span>
          </div>
        )}
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--forest)", marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontFamily: `'${headingFont}', serif` }}>
          <span>{title}</span>
          <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(19,48,32,0.4)", background: "rgba(19,48,32,0.06)", padding: "2px 8px", borderRadius: 12 }}>{typeLabel}</span>
        </div>
        {children}
      </div>
    );

    if (visual.type === "line") {
      return renderChartWrapper(
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart 
            data={graphSeries} 
            margin={{ top: 4, right: 10, left: -16, bottom: 0 }}
            onClick={(e: any) => {
              if (e?.activePayload?.[0]?.payload?.rawDate) {
                const clickedDate = e.activePayload[0].payload.rawDate;
                setSelectedDate(prev => prev === clickedDate ? null : clickedDate);
              }
            }}
            style={{ cursor: "pointer" }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(19,48,32,0.07)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--forest)" }} axisLine={false} tickLine={false} interval={Math.max(0, Math.floor(graphSeries.length / 8) - 1)} />
            <YAxis tick={{ fontSize: 11, fill: "var(--forest)" }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomChartTooltip />} />
            <Legend iconSize={12} iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 16, color: "var(--forest)", fontWeight: 600 }} />
            {selectedDate && <ReferenceLine x={graphSeries.find(c => c.rawDate === selectedDate)?.date} stroke={c0} strokeDasharray="3 3" strokeWidth={2} />}
            {fields.map((f, i) => (
              <Line 
                key={f} 
                type="monotone" 
                dataKey={f} 
                stroke={getFieldColor(f, i)} 
                name={getFieldLabel(f)} 
                strokeWidth={3} 
                dot={false} 
                activeDot={{ 
                  r: 6, 
                  strokeWidth: 0, 
                  onClick: (_e: any, payload: any) => {
                    const clickedDate = payload?.payload?.rawDate;
                    if (clickedDate) setSelectedDate(prev => prev === clickedDate ? null : clickedDate);
                  },
                  cursor: "pointer"
                }} 
              />
            ))}
            <Brush dataKey="date" height={30} stroke={hexToRgba(c0, 0.4)} fill="rgba(255,255,255,0.2)" travellerWidth={12} />
          </ComposedChart>
        </ResponsiveContainer>,
        "Trend"
      );
    }

    if (visual.type === "bar") {
      return renderChartWrapper(
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart 
            data={graphSeries} 
            margin={{ top: 4, right: 10, left: -16, bottom: 0 }}
            onClick={(e: any) => {
              if (e?.activePayload?.[0]?.payload?.rawDate) {
                const clickedDate = e.activePayload[0].payload.rawDate;
                setSelectedDate(prev => prev === clickedDate ? null : clickedDate);
              }
            }}
            style={{ cursor: "pointer" }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(19,48,32,0.07)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--forest)" }} axisLine={false} tickLine={false} interval={Math.max(0, Math.floor(graphSeries.length / 8) - 1)} />
            <YAxis tick={{ fontSize: 11, fill: "var(--forest)" }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomChartTooltip />} />
            <Legend iconSize={12} iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 16, color: "var(--forest)", fontWeight: 600 }} />
            {fields.map((f, i) => (
              <Bar 
                key={f} 
                dataKey={f} 
                name={getFieldLabel(f)} 
                radius={[4, 4, 0, 0]} 
                barSize={16}
                onClick={(data: any) => {
                  const clickedDate = data?.rawDate;
                  if (clickedDate) setSelectedDate(prev => prev === clickedDate ? null : clickedDate);
                }}
              >
                {graphSeries.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={getFieldColor(f, i)} 
                    fillOpacity={selectedDate && entry.rawDate !== selectedDate ? 0.3 : 1} 
                    style={{ transition: "fill-opacity 0.3s", cursor: "pointer" }}
                    onClick={() => setSelectedDate(prev => prev === entry.rawDate ? null : entry.rawDate)}
                  />
                ))}
              </Bar>
            ))}
            <Brush dataKey="date" height={30} stroke={hexToRgba(c0, 0.4)} fill="rgba(255,255,255,0.2)" travellerWidth={12} />
          </ComposedChart>
        </ResponsiveContainer>,
        "Comparison"
      );
    }

    if (visual.type === "table") {
      return renderChartWrapper(
        <div style={{ maxHeight: 260, overflow: "auto", borderRadius: 12, border: `1px solid ${hexToRgba(c0, 0.1)}`, background: "rgba(255,255,255,0.15)" }} className="ll-scrollbar">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left", whiteSpace: "nowrap" }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, zIndex: 1 }}>
                <th 
                  onClick={() => handleSort("date")}
                  style={{ padding: "12px 16px", color: "var(--forest)", fontWeight: 700, borderBottom: `1px solid ${hexToRgba(c0, 0.1)}`, background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", fontFamily: `'${headingFont}', serif`, cursor: "pointer", userSelect: "none" }}
                >
                  Date {tableSort?.key === "date" ? (tableSort.direction === "asc" ? "↑" : "↓") : ""}
                </th>
                {fields.map(f => (
                  <th 
                    key={f} 
                    onClick={() => handleSort(f)}
                    style={{ padding: "12px 16px", color: "var(--forest)", fontWeight: 700, borderBottom: `1px solid ${hexToRgba(c0, 0.1)}`, background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", fontFamily: `'${headingFont}', serif`, cursor: "pointer", userSelect: "none" }}
                  >
                    {getFieldLabel(f)} {tableSort?.key === f ? (tableSort.direction === "asc" ? "↑" : "↓") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableSeries.map((row, idx) => {
                const isSelected = selectedDate === row.rawDate;
                return (
                <tr 
                  id={`row-${row.rawDate}`}
                  key={idx} 
                  onClick={() => setSelectedDate(prev => prev === row.rawDate ? null : row.rawDate)}
                  style={{ 
                    scrollMarginTop: "56px",
                    borderBottom: `1px solid ${hexToRgba(c0, 0.05)}`, 
                    background: isSelected ? hexToRgba(c0, 0.15) : (idx % 2 === 1 ? hexToRgba(c0, 0.03) : "transparent"),
                    cursor: "pointer",
                    transition: "background 0.2s ease"
                  }}
                >
                  <td style={{ padding: "10px 16px", color: isSelected ? "var(--forest)" : "rgba(19,48,32,0.9)", fontWeight: isSelected ? 800 : 600 }}>{fmt(row.date)}</td>
                  {fields.map(f => {
                    const val = (row as any)[f];
                    let displayVal = val == null ? "—" : String(val);
                    if (f === "completion_rate" && val != null) {
                      const rateVal = val < 2.0 ? val * 100 : val;
                      displayVal = `${rateVal.toFixed(1)}%`;
                    } else if (typeof val === "number") {
                      displayVal = val.toLocaleString("en-US", { maximumFractionDigits: 2 });
                    }
                    return (
                      <td key={f} style={{ padding: "10px 16px", color: isSelected ? "var(--forest)" : "rgba(19,48,32,0.7)", fontWeight: isSelected ? 700 : 400 }}>
                        {displayVal}
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>,
        "Data Table"
      );
    }

    return null;
  };

  return (
    <div ref={containerRef} className="ag-dashboard-container" style={{ padding: "20px 0", perspective: "1200px", fontFamily: `'${bodyFont}', sans-serif` }}>
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="ag-stagger-item" style={{ 
        display: "flex", justifyContent: "space-between", alignItems: "flex-start", 
        marginBottom: 24, ...GLASS_PANEL_STYLE, padding: "16px 24px" 
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "var(--emerald-tint)", padding: 8, borderRadius: 12 }}>
              <BarChart2 size={20} color="var(--emerald)" />
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--forest)", margin: 0, letterSpacing: "-0.02em", fontFamily: `'${headingFont}', serif` }}>
              {isActualMock ? "Dashboard Preview" : (fileName ?? "Generated Report")}
            </h1>
            {status && !isActualMock && (
              <span style={{ 
                background: status === "ready" ? "var(--emerald-tint)" : "var(--amber-tint)", 
                color: status === "ready" ? "var(--emerald-dark)" : "var(--amber-dark)",
                padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 
              }}>
                {status === "ready" ? "Live" : status === "compiling" ? "Building…" : "Failed"}
              </span>
            )}
          </div>
          <div style={{ fontSize: 14, color: "rgba(19,48,32,0.5)", marginTop: 6, fontWeight: 500, paddingLeft: 46 }}>
            {isActualMock
              ? "Configure your report and hit Generate to build the dashboard"
              : `Reference: ${storagePath?.split("/").pop() ?? "N/A"}`}
          </div>
        </div>

        {onDownload && !isActualMock && status === "ready" && (
          <button
            onClick={onDownload}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "linear-gradient(135deg, var(--amber) 0%, #E69D35 100%)",
              color: "white", border: "none", borderRadius: 12,
              padding: "10px 20px", fontSize: 14, fontWeight: 700,
              cursor: "pointer", boxShadow: "0 8px 16px rgba(255, 179, 71, 0.3)",
              transition: "transform 0.2s, box-shadow 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 12px 20px rgba(255, 179, 71, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.boxShadow = "0 8px 16px rgba(255, 179, 71, 0.3)";
            }}
          >
            <Download size={16} /> Export PBIP
          </button>
        )}
      </div>

      {/* ── Filters (Slicers) ────────────────────────────────────── */}
      <div className="ag-stagger-item" style={{ 
        display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center",
        marginBottom: 24, ...GLASS_PANEL_STYLE, padding: "16px 24px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Filter size={16} color="var(--emerald)" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--forest)", fontFamily: `'${headingFont}', serif` }}>Performance:</span>
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
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--forest)", fontFamily: `'${headingFont}', serif` }}>Date Range:</span>
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
          {(dateRange.start || dateRange.end || statusFilter !== "all" || selectedDate) && (
            <button
              onClick={() => { setDateRange({ start: "", end: "" }); setStatusFilter("all"); setSelectedDate(null); }}
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

      {/* ── Dynamic Visuals Grid ─────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 24, width: "100%" }}>
        {layoutItems.map((item, idx) => 
          item.isCard 
            ? renderCard(item.visual, idx, item.span) 
            : renderContentVisual(item.visual, idx, item.span)
        )}
      </div>

    </div>
  );
}
