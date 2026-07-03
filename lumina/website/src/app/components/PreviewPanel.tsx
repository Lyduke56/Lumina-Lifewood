"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download, RotateCcw } from "lucide-react";
import {
  ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { User } from "@supabase/supabase-js";

interface PreviewPanelProps {
  user: User | null;
  revenueData: any[];
}

const MIN_WIDTH = 300;
const MAX_WIDTH = 1000;
const DEFAULT_WIDTH = 600;

export function PreviewPanel({ user, revenueData }: PreviewPanelProps) {
  const [activeTab, setActiveTab] = useState("viz");

  // ── Resize + collapse state ──────────────────────────────────────────────
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [isOpen, setIsOpen] = useState(true);

  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(DEFAULT_WIDTH);

  const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = panelWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [panelWidth]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isResizing.current) return;
      // dragging left (negative delta) → panel grows
      const delta = startX.current - e.clientX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
      setPanelWidth(next);
    }
    function onMouseUp() {
      if (!isResizing.current) return;
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);
  // ────────────────────────────────────────────────────────────────────────

  return (
    // Outer wrapper: relative so the drag handle + toggle button can be
    // positioned relative to this element rather than the viewport.
    <div style={{ position: "relative", display: "flex", flexShrink: 0 }}>

      {/* ── Drag handle ─────────────────────────────────────────────────────
          Sits at the LEFT edge of the panel. mousedown kicks off the resize.
          Only rendered when the panel is open — no point dragging a closed panel.
      */}
      {isOpen && (
        <div
          onMouseDown={onHandleMouseDown}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: -3,
            width: 6,
            cursor: "col-resize",
            zIndex: 10,
            // Subtle highlight on hover/active via a CSS class below
          }}
          className="ll-resize-handle"
        />
      )}

      {/* ── Collapse / expand toggle button ─────────────────────────────────
          Floats at the top-left corner of the panel (just outside its border).
          The chevron flips direction depending on open state.
      */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-label={isOpen ? "Collapse preview panel" : "Expand preview panel"}
        style={{
          position: "absolute",
          top: 14,
          left: -28,
          zIndex: 20,
          width: 24,
          height: 24,
          borderRadius: "6px 0 0 6px",
          border: "1px solid var(--line)",
          borderRight: "none",
          background: "var(--white)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: "rgba(19,48,32,0.45)",
          padding: 0,
        }}
        className="ll-toggle-btn"
      >
        {isOpen
          ? <ChevronRight size={13} />
          : <ChevronLeft size={13} />}
      </button>

      {/* ── Panel itself ────────────────────────────────────────────────────
          Width transitions between 0 (collapsed) and panelWidth (open).
          overflow: hidden is what makes the collapse animation clean.
      */}
      <aside
        className="ll-preview"
        style={{
          width: isOpen ? panelWidth : 0,
          flexShrink: 0,
          background: "var(--white)",
          borderLeft: "1px solid var(--line)",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
          transition: "width 0.25s ease",
          // min-width prevents content from wrapping during the transition
          minWidth: 0,
        }}
      >
        {/* Inner wrapper keeps content at a stable width while the panel
            animates — without this, content would squish during the transition */}
        <div style={{ width: panelWidth, display: "flex", flexDirection: "column", height: "100%" }}>

          {/* Panel header */}
          <div style={{ padding: "14px 18px 0", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user ? "Regional Revenue.pbip" : "No file yet"}
                </div>
                <div style={{ fontSize: 11.5, color: "rgba(19,48,32,0.55)" }}>
                  {user ? "Updated just now" : "Upload a plan to see a preview"}
                </div>
              </div>

              {/* Width readout + reset — helpful during development, can remove later */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: "rgba(19,48,32,0.35)", fontVariantNumeric: "tabular-nums" }}>
                  {panelWidth}px
                </span>
                <button
                  onClick={() => setPanelWidth(DEFAULT_WIDTH)}
                  title="Reset panel width"
                  aria-label="Reset panel width"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "rgba(19,48,32,0.35)", display: "flex" }}
                  className="ll-toggle-btn"
                >
                  <RotateCcw size={12} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, marginTop: 12, borderBottom: "1px solid var(--line)" }}>
              {(["viz", "export"] as const).map((tab) => (
                <div
                  key={tab}
                  className="ll-tab"
                  style={
                    activeTab === tab
                      ? { color: "var(--forest)", borderBottom: "2px solid var(--emerald)" }
                      : { color: "rgba(19,48,32,0.55)", borderBottom: "2px solid transparent" }
                  }
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === "viz" ? "Visualization" : "Export"}
                </div>
              ))}
            </div>
          </div>

          {/* Panel body — scrollable */}
          <div className="ll-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
            {!user ? (
              <div className="ll-empty-state" style={{ padding: "24px 8px" }}>
                <p>Nothing to preview yet. Log in and upload a plan to see charts here.</p>
              </div>
            ) : activeTab === "viz" ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>Revenue & QoQ growth by region</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11.5, color: "var(--amber-safe)", fontWeight: 500 }}>
                    Combo chart <ChevronDown size={12} />
                  </span>
                </div>
                <div style={{ background: "var(--offwhite)", borderRadius: 12, padding: "12px 8px 4px", border: "1px solid var(--line)" }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={revenueData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(19,48,32,0.08)" vertical={false} />
                      <XAxis dataKey="region" tick={{ fontSize: 11, fill: "#133020" }} axisLine={{ stroke: "rgba(19,48,32,0.15)" }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#133020" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(19,48,32,0.12)" }}
                        labelStyle={{ fontWeight: 600, color: "#133020" }}
                      />
                      <Bar dataKey="revenue" fill="#046241" radius={[4, 4, 0, 0]} barSize={28} />
                      <Line type="monotone" dataKey="growth" stroke="#A65A12" strokeWidth={2} dot={{ r: 3, fill: "#A65A12" }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>Download or open</div>
                <button
                  className="ll-export-btn"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    width: "100%", padding: "10px 12px", borderRadius: 10,
                    border: "1px solid var(--line)", background: "var(--offwhite)",
                    fontSize: 13, fontWeight: 500, color: "var(--forest)", cursor: "pointer", marginBottom: 8,
                  }}
                >
                  Download Power BI project (.pbip) <Download size={14} />
                </button>
              </div>
            )}
          </div>

        </div>
      </aside>
    </div>
  );
}