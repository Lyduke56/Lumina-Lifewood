"use client";

import { useState, useEffect } from "react";
import { useRef } from "react";
import { UploadCloud, X, FileSpreadsheet, ChevronDown } from "lucide-react";
import {
  ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { ReportConfig, ColorPresetId, FontPresetId, ReportTypeId } from "@/lib/types";

// ── Presets ──────────────────────────────────────────────────────────────────

const COLOR_PRESETS: {
  id: ColorPresetId;
  label: string;
  sub: string;
  colors: string[];
}[] = [
  { id: "lifewood",    label: "Forest + Gold", sub: "Lifewood Default", colors: ["#133020", "#FFB347", "#046241", "#FFC370", "#417256", "#C17710", "#708E7C", "#9CAFA4"] },
  { id: "plum-citrus", label: "Plum + Citrus",  sub: "",                 colors: ["#4A235A", "#F4D03F", "#7D3C98", "#F8C471", "#6C3483", "#F5B041", "#A569BD", "#F39C12"] },
  { id: "slate-coral", label: "Slate + Coral", sub: "",                 colors: ["#334155", "#F87171", "#475569", "#FCA5A5", "#1E293B", "#EF4444", "#64748B", "#FECACA"] },
  { id: "custom",      label: "Custom",        sub: "",                 colors: [] },
];

const REPORT_TYPE_PRESETS: { id: ReportTypeId; label: string; sub: string }[] = [
  { id: "Progress Overview",  label: "Progress Overview",  sub: "Trends over time + completion" },
  { id: "Executive Summary",  label: "Executive Summary",  sub: "A few high-level KPIs only" },
  { id: "Detailed Breakdown", label: "Detailed Breakdown", sub: "Full data table + trends" },
  { id: "Custom",             label: "Custom",             sub: "Let AI decide from instructions" },
];


const FONT_PRESETS: {
  id: FontPresetId;
  heading: string;
  body: string;
  googleName?: string;
}[] = [
  { id: "inter-inter",     heading: "Inter",            body: "Inter"    },
  { id: "playfair-inter",  heading: "Playfair Display", body: "Inter",   googleName: "Playfair+Display:wght@700" },
  { id: "montserrat-lato", heading: "Montserrat",       body: "Lato",    googleName: "Montserrat:wght@700&family=Lato:wght@400" },
  { id: "fraunces-dm",     heading: "Fraunces",         body: "DM Sans", googleName: "DM+Sans:wght@400" },
  { id: "custom",          heading: "",                 body: ""         },
];

const HEADING_FONT_OPTIONS = [
  "Inter", "Playfair Display", "Montserrat", "Fraunces",
  "DM Sans", "Lato", "Poppins", "Raleway", "Merriweather",
];
const BODY_FONT_OPTIONS = [
  "Inter", "Lato", "DM Sans", "Roboto",
  "Open Sans", "Source Sans 3", "Nunito", "Mulish",
];

// Mock data for the color preview chart
const MOCK_DATA = [
  { name: "Jan", actual: 42, target: 60 },
  { name: "Feb", actual: 68, target: 65 },
  { name: "Mar", actual: 55, target: 70 },
  { name: "Apr", actual: 81, target: 74 },
  { name: "May", actual: 74, target: 78 },
  { name: "Jun", actual: 90, target: 85 },
  { name: "Jul", actual: 86, target: 88 },
];

// ── Props ────────────────────────────────────────────────────────────────────

interface SetupCardProps {
  onComplete: (config: ReportConfig) => void;
  onCancel:   () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SetupCard({ onComplete, onCancel }: SetupCardProps) {
  // Basic
  const [reportName, setReportName] = useState("");
  const [reportType, setReportType] = useState<ReportTypeId>("Progress Overview");


  // Theme
  const [colorPreset, setColorPreset] = useState<ColorPresetId>("lifewood");
  const [customColors, setCustomColors] = useState<string[]>([
    "#133020", "#FFB347", "#046241", "#FFC370", "#417256", "#C17710", "#708E7C", "#9CAFA4",
  ]);

  function updateCustomColor(index: number, value: string) {
    setCustomColors((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }


  // Typography
  const [fontPreset,    setFontPreset]    = useState<FontPresetId>("fraunces-dm");
  const [customHeading, setCustomHeading] = useState("Inter");
  const [customBody,    setCustomBody]    = useState("Inter");

  // File
  const [file, setFile]         = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Instructions
  const [instructions, setInstructions] = useState("");

  const [goodThreshold, setGoodThreshold]       = useState(90);
  const [neutralThreshold, setNeutralThreshold] = useState(70);


  // ── Load additional Google Fonts for preview ───────────────────────────
  useEffect(() => {
    const toLoad = FONT_PRESETS
      .filter((p) => p.googleName)
      .map((p) => p.googleName!);

    toLoad.forEach((name) => {
      const id = `gf-${name.split(":")[0]}`;
      if (document.getElementById(id)) return;
      const link = document.createElement("link");
      link.id   = id;
      link.rel  = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${name}&display=swap`;
      document.head.appendChild(link);
    });
  }, []);

  // ── Derived values ─────────────────────────────────────────────────────
  function resolvedColors(): string[] {
    if (colorPreset === "custom") return customColors;
    return COLOR_PRESETS.find((p) => p.id === colorPreset)!.colors;
  }

  function resolvedFonts() {
    if (fontPreset === "custom") return { heading: customHeading, body: customBody };
    const p = FONT_PRESETS.find((p) => p.id === fontPreset)!;
    return { heading: p.heading, body: p.body };
  }

  const dataColors = resolvedColors();
  const { heading, body } = resolvedFonts();

  // ── File handling ──────────────────────────────────────────────────────
  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }
  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  }

  // ── Submit ─────────────────────────────────────────────────────────────
  const canSubmit = reportName.trim().length > 0 && file !== null;

  function handleSubmit() {
    if (!canSubmit) return;
    const { heading, body } = resolvedFonts();
    onComplete({
      reportName:   reportName.trim(),
      reportType,
      goodThreshold:    goodThreshold / 100,
      neutralThreshold: neutralThreshold / 100,
      colorPreset,
      dataColors: resolvedColors(),
      fontPreset,
      headingFont:  heading,
      bodyFont:     body,
      file,
      instructions: instructions.trim(),
      source: "web",
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    // Backdrop
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(19,48,32,0.45)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px 16px",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      {/* Card — 4:3 ratio: 840 × 630 */}
      <div style={{
        background: "var(--white)",
        borderRadius: 18,
        width: "min(1024px, 96vw)",
        height: "min(768px, 92vh)",
        display: "flex", flexDirection: "column",
        boxShadow: "0 12px 48px rgba(19,48,32,0.2)",
        overflow: "hidden",
      }}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 26px 14px",
          borderBottom: "1px solid var(--line)",
          flexShrink: 0,
        }}>
          <div>
            <div className="ll-brand-font" style={{ fontSize: 18, fontWeight: 600, color: "var(--forest)" }}>
              New report
            </div>
            <div style={{ fontSize: 12.5, color: "rgba(19,48,32,0.5)", marginTop: 2 }}>
              Configure your report before the conversation starts.
            </div>
          </div>
          <button onClick={onCancel} className="ll-icon-btn" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────── */}
        <div className="ll-scrollbar" style={{
          flex: 1, overflowY: "auto",
          padding: "22px 26px",
          display: "flex", flexDirection: "column", gap: 26,
        }}>

          {/* 1. Report name */}
          <section>
            <SectionLabel>Report name</SectionLabel>
            <input
              type="text"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder="e.g. Lifewood Q2 Production Plan"
              style={{
                width: "100%", padding: "9px 13px",
                border: "1px solid var(--line)", borderRadius: 9,
                fontSize: 13.5, color: "var(--forest)",
                background: "var(--offwhite)", outline: "none",
                fontFamily: `'${body}', sans-serif`,
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--emerald)"; e.currentTarget.style.background = "var(--white)"; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = "var(--line)";    e.currentTarget.style.background = "var(--offwhite)"; }}
            />
          </section>

          {/* 2. Report type */}
          <section>
            <SectionLabel>Report type</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
              {REPORT_TYPE_PRESETS.map((p) => {
                const active = reportType === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setReportType(p.id)}
                    style={{
                      border: active ? "2px solid var(--emerald)" : "1px solid var(--line)",
                      borderRadius: 10, padding: "10px 12px",
                      background: active ? "var(--emerald-tint)" : "var(--offwhite)",
                      cursor: "pointer", textAlign: "left",
                      transition: "border-color .15s, background .15s",
                    }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--forest)" }}>
                      {p.label}
                    </div>
                    <div style={{ fontSize: 10.5, color: "rgba(19,48,32,0.45)", marginTop: 2 }}>
                      {p.sub}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. Color theme */}
          <section>
            <SectionLabel>Color theme</SectionLabel>

            {/* Preset cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 14 }}>
              {COLOR_PRESETS.map((p) => {
                const active = colorPreset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setColorPreset(p.id)}
                    style={{
                      border: active ? "2px solid var(--emerald)" : "1px solid var(--line)",
                      borderRadius: 10, padding: "10px 8px",
                      background: active ? "var(--emerald-tint)" : "var(--offwhite)",
                      cursor: "pointer", textAlign: "center",
                      transition: "border-color .15s, background .15s",
                    }}
                  >
                    {p.id !== "custom" ? (
                      <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 6 }}>
                        {p.colors.slice(0, 5).map((c, i) => (
                          <div key={i} style={{ width: 13, height: 13, borderRadius: "50%", background: c }} />
                        ))}
                      </div>
                    ) : (

                      <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
                        <div style={{ width: 32, height: 16, borderRadius: 8, background: "linear-gradient(90deg,#a855f7,#ec4899,#f97316)" }} />
                      </div>
                    )}
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--forest)", lineHeight: 1.3 }}>
                      {p.label}
                    </div>
                    {p.sub && (
                      <div style={{ fontSize: 10.5, color: "rgba(19,48,32,0.4)", marginTop: 1 }}>{p.sub}</div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Custom hex inputs with color pickers */}
            {colorPreset === "custom" && (
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8,
                padding: "12px 14px", borderRadius: 10,
                background: "var(--offwhite)", border: "1px solid var(--line)",
                marginBottom: 14,
              }}>
                {customColors.map((c, i) => (
                  <ColorPickerInput
                    key={i}
                    label={`Color ${i + 1}`}
                    value={c}
                    onChange={(v) => updateCustomColor(i, v)}
                    fallback="#133020"
                  />
                ))}
              </div>
            )}


            {/* Live color preview chart */}
            <div style={{
              border: "1px solid var(--line)", borderRadius: 12,
              background: "var(--offwhite)", padding: "14px 12px 8px",
              transition: "all .2s",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingLeft: 4 }}>
                <span style={{ 
                  fontSize: 11.5, fontWeight: 600, 
                  color: "rgba(19,48,32,0.55)",
                  fontFamily: `'${heading}', sans-serif`,
                }}>
                  {reportName.trim() || "No Title"} — Actual vs. Target (Mock Preview — not necessarily the actual output)
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <LegendDot color={dataColors[0]} label="Actual" />
                  <LegendDot color={dataColors[1]} label="Target" dot />
                </div>
              </div>
              <ResponsiveContainer width="100%" height={130}>
                <ComposedChart data={MOCK_DATA} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(19,48,32,0.07)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ 
                      fontSize: 10.5, 
                      fill: "rgba(19,48,32,0.45)",
                      fontFamily: `'${body}', sans-serif`,
                    }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tick={{ 
                      fontSize: 10, 
                      fill: "rgba(19,48,32,0.4)",
                      fontFamily: `'${body}', sans-serif`,
                    }}
                    axisLine={false} tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ 
                      fontSize: 12, borderRadius: 8, 
                      border: "1px solid rgba(19,48,32,0.1)", 
                      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                      fontFamily: `'${body}', sans-serif`,
                    }}
                    labelStyle={{ fontWeight: 600, color: "var(--forest)" }}
                  />
                  <Bar dataKey="actual" fill={dataColors[0]} radius={[4, 4, 0, 0]} barSize={22} />
                  <Line
                    type="monotone" dataKey="target"
                    stroke={dataColors[1]} strokeWidth={2.5}
                    dot={{ r: 3.5, fill: dataColors[1], strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* 3. Typography */}
          <section>
            <SectionLabel>Typography</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
              {FONT_PRESETS.map((p) => {
                const active = fontPreset === p.id;
                const isCustom = p.id === "custom";
                return (
                  <button
                    key={p.id}
                    onClick={() => setFontPreset(p.id)}
                    style={{
                      border: active ? "2px solid var(--emerald)" : "1px solid var(--line)",
                      borderRadius: 10, padding: "11px 8px",
                      background: active ? "var(--emerald-tint)" : "var(--offwhite)",
                      cursor: "pointer", textAlign: "center",
                      transition: "border-color .15s, background .15s",
                    }}
                  >
                    {isCustom ? (
                      <>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--forest)", marginBottom: 5, lineHeight: 1 }}>Aa</div>
                        <div style={{ fontSize: 11, color: "rgba(19,48,32,0.5)" }}>Custom</div>
                      </>
                    ) : (
                      <>
                        <div style={{
                          fontSize: 20, fontWeight: 700,
                          fontFamily: `'${p.heading}', serif`,
                          color: "var(--forest)", lineHeight: 1, marginBottom: 5,
                        }}>
                          Aa
                        </div>
                        <div style={{
                          fontSize: 10.5, fontWeight: 600,
                          fontFamily: `'${p.heading}', sans-serif`,
                          color: "var(--forest)", lineHeight: 1.3,
                        }}>
                          {p.heading.split(" ")[0]}
                        </div>
                        <div style={{
                          fontSize: 10,
                          fontFamily: `'${p.body}', sans-serif`,
                          color: "rgba(19,48,32,0.45)", marginTop: 2,
                        }}>
                          {p.body.split(" ")[0]}
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Custom font dropdowns */}
            {fontPreset === "custom" && (
              <div style={{
                marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
                padding: "12px 14px", borderRadius: 10,
                background: "var(--offwhite)", border: "1px solid var(--line)",
              }}>
                <FontSelect label="Heading font" value={customHeading} options={HEADING_FONT_OPTIONS} onChange={setCustomHeading} />
                <FontSelect label="Body font"    value={customBody}    options={BODY_FONT_OPTIONS}    onChange={setCustomBody}    />
              </div>
            )}
          </section>

          {/* 4. File upload */}
          <section>
            <SectionLabel>Production plan</SectionLabel>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragging ? "var(--emerald)" : "var(--tan-muted)"}`,
                borderRadius: 10, background: isDragging ? "var(--emerald-tint)" : "var(--offwhite)",
                padding: "20px 16px", textAlign: "center", cursor: "pointer",
                transition: "border-color .15s, background .15s",
              }}
            >
              <input
                ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
                style={{ display: "none" }} onChange={handleFileInput}
              />
              {file ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <FileSpreadsheet size={18} color="var(--emerald)" />
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--forest)" }}>{file.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(19,48,32,0.4)", display: "flex", padding: 2 }}
                    aria-label="Remove file"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <UploadCloud size={24} color="var(--tan-muted)" style={{ margin: "0 auto 8px" }} />
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--forest)", marginBottom: 3 }}>
                    Drop your Excel file here
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(19,48,32,0.45)" }}>
                    or click to browse · .xlsx accepted
                  </div>
                </>
              )}
            </div>
          </section>

          {/* 5. Instructions */}
          <section>
            <SectionLabel optional>Optional instructions</SectionLabel>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              placeholder="e.g. Highlight variance between actual and target output. Flag anything below 80% achievement."
              style={{
                width: "100%", resize: "none", padding: "9px 13px",
                border: "1px solid var(--line)", borderRadius: 9,
                fontSize: 13.5, color: "var(--forest)",
                background: "var(--offwhite)", outline: "none",
                lineHeight: 1.55, 
                fontFamily: `'${body}', sans-serif`,
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--emerald)"; e.currentTarget.style.background = "var(--white)"; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = "var(--line)";    e.currentTarget.style.background = "var(--offwhite)"; }}
            />
            <div style={{ fontSize: 11.5, color: "rgba(19,48,32,0.4)", marginTop: 5 }}>
              This becomes the agent's first instruction and seeds the conversation.
            </div>
          </section>

          {/* 6. KPI thresholds */}
          <section>
            <SectionLabel optional>Completion rate thresholds</SectionLabel>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, color: "rgba(19,48,32,0.55)", marginBottom: 4 }}>Good at or above (%)</div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={goodThreshold}
                  onChange={(e) => setGoodThreshold(Number(e.target.value))}
                  style={{
                    width: "100%", padding: "9px 13px",
                    border: "1px solid var(--line)", borderRadius: 9,
                    fontSize: 13.5, color: "var(--forest)",
                    background: "var(--offwhite)", outline: "none",
                    fontFamily: `'${body}', sans-serif`,
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, color: "rgba(19,48,32,0.55)", marginBottom: 4 }}>Neutral at or above (%)</div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={neutralThreshold}
                  onChange={(e) => setNeutralThreshold(Number(e.target.value))}
                  style={{
                    width: "100%", padding: "9px 13px",
                    border: "1px solid var(--line)", borderRadius: 9,
                    fontSize: 13.5, color: "var(--forest)",
                    background: "var(--offwhite)", outline: "none",
                    fontFamily: `'${body}', sans-serif`,
                  }}
                />
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: "rgba(19,48,32,0.4)", marginTop: 5 }}>
              Below the neutral threshold is flagged as needing attention. Applies to the completion rate KPI.
            </div>
          </section>


        </div>

        {/* ── Footer — actions ─────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 26px",
          borderTop: "1px solid var(--line)",
          flexShrink: 0, background: "var(--white)",
        }}>
          <button
            onClick={onCancel}
            style={{
              background: "none", border: "1px solid var(--line)",
              borderRadius: 9, padding: "8px 18px",
              fontSize: 13.5, fontWeight: 500,
              color: "rgba(19,48,32,0.6)", cursor: "pointer",
            }}
          >
            Cancel
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!canSubmit && (
              <span style={{ fontSize: 12, color: "rgba(19,48,32,0.4)" }}>
                {!reportName.trim() ? "Add a report name" : "Upload a file to continue"}
              </span>
            )}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="ll-btn-amber"
              style={{ opacity: canSubmit ? 1 : 0.45, cursor: canSubmit ? "pointer" : "not-allowed" }}
            >
              Generate report →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 9 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--emerald)" }}>
        {children}
      </span>
      {optional && (
        <span style={{ fontSize: 11, color: "rgba(19,48,32,0.38)", fontWeight: 500 }}>optional</span>
      )}
    </div>
  );
}

function ColorPickerInput({ label, value, onChange, fallback }: {
  label: string; value: string; onChange: (v: string) => void; fallback: string;
}) {
  // Format hex to ensure it has # prefix
  const displayValue = value && !value.startsWith("#") ? `#${value}` : value;
  
  return (
    <div>
      <div style={{ fontSize: 11.5, color: "rgba(19,48,32,0.5)", marginBottom: 5, fontWeight: 500 }}>{label}</div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        border: "1px solid var(--line)", borderRadius: 8,
        padding: "4px 8px 4px 4px",
        background: "var(--white)",
      }}>
        <input
          type="color"
          value={displayValue || fallback}
          onChange={(e) => {
            const newColor = e.target.value;
            onChange(newColor);
          }}
          style={{
            width: 40,
            height: 40,
            padding: 0,
            border: "none",
            cursor: "pointer",
            background: "none",
          }}
        />
        <div style={{ 
          display: "flex", 
          flexDirection: "column",
          flex: 1,
          gap: 2,
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}>
            <span style={{
              fontSize: 11,
              color: "rgba(19,48,32,0.4)",
              fontWeight: 500,
              fontFamily: "monospace",
            }}>#</span>
            <input
              type="text" 
              value={value?.replace("#", "") || ""} 
              onChange={(e) => {
                let newValue = e.target.value;
                // Remove any non-hex characters
                newValue = newValue.replace(/[^0-9a-fA-F]/g, "");
                // Limit to 6 characters
                newValue = newValue.slice(0, 6);
                // Auto-add # prefix
                if (newValue.length === 6) {
                  onChange(`#${newValue}`);
                } else {
                  onChange(newValue ? `#${newValue}` : "");
                }
              }}
              onBlur={(e) => {
                // Auto-complete to 6 digits if user left it short
                let val = e.target.value.replace(/[^0-9a-fA-F]/g, "");
                if (val.length === 3) {
                  // Expand 3-digit hex to 6-digit
                  val = val.split('').map(c => c + c).join('');
                  onChange(`#${val}`);
                } else if (val.length > 0 && val.length < 6) {
                  // Pad with zeros if user typed partial
                  val = val.padEnd(6, '0');
                  onChange(`#${val}`);
                }
              }}
              placeholder={fallback.replace("#", "")} 
              maxLength={6}
              style={{ 
                flex: 1, 
                border: "none", 
                outline: "none", 
                fontSize: 13, 
                background: "transparent", 
                color: "var(--forest)",
                padding: "2px 0",
                fontFamily: "monospace",
                textTransform: "uppercase",
              }}
            />
          </div>
          <div style={{
            height: 2,
            borderRadius: 1,
            background: value || fallback,
            transition: "background 0.15s",
          }} />
        </div>
      </div>
    </div>
  );
}

function FontSelect({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: "rgba(19,48,32,0.5)", marginBottom: 5, fontWeight: 500 }}>{label}</div>
      <div style={{ position: "relative" }}>
        <select
          value={value} onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%", padding: "7px 28px 7px 10px",
            border: "1px solid var(--line)", borderRadius: 8,
            background: "var(--white)", fontSize: 13,
            color: "var(--forest)", appearance: "none", cursor: "pointer", outline: "none",
          }}
        >
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown size={13} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: "rgba(19,48,32,0.4)", pointerEvents: "none" }} />
      </div>
    </div>
  );
}

function LegendDot({ color, label, dot }: { color: string; label: string; dot?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {dot ? (
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      ) : (
        <div style={{ width: 12, height: 8, borderRadius: 3, background: color }} />
      )}
      <span style={{ fontSize: 11, color: "rgba(19,48,32,0.5)", fontWeight: 500 }}>{label}</span>
    </div>
  );
}