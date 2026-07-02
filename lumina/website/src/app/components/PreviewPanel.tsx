import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { User } from "@supabase/supabase-js";

interface PreviewPanelProps {
  user: User | null;
  revenueData: any[];
}

export function PreviewPanel({ user, revenueData }: PreviewPanelProps) {
  const [activeTab, setActiveTab] = useState("viz");

  return (
    <aside className="ll-preview" style={{ width: 420, flexShrink: 0, background: "var(--white)", borderLeft: "1px solid var(--line)", display: "flex", flexDirection: "column", height: "100%" }}>
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
        </div>

        <div style={{ display: "flex", gap: 4, marginTop: 12, borderBottom: "1px solid var(--line)" }}>
          <div
            className="ll-tab"
            style={activeTab === "viz" ? { color: "var(--forest)", borderBottom: "2px solid var(--emerald)" } : { color: "rgba(19,48,32,0.55)", borderBottom: "2px solid transparent" }}
            onClick={() => setActiveTab("viz")}
          >
            Visualization
          </div>
          <div
            className="ll-tab"
            style={activeTab === "export" ? { color: "var(--forest)", borderBottom: "2px solid var(--emerald)" } : { color: "rgba(19,48,32,0.55)", borderBottom: "2px solid transparent" }}
            onClick={() => setActiveTab("export")}
          >
            Export
          </div>
        </div>
      </div>

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
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(19,48,32,0.12)" }} labelStyle={{ fontWeight: 600, color: "#133020" }} />
                  <Bar dataKey="revenue" fill="#046241" radius={[4, 4, 0, 0]} barSize={28} />
                  <Line type="monotone" dataKey="growth" stroke="#A65A12" strokeWidth={2} dot={{ r: 3, fill: "#A65A12" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>Download or open</div>
            <button className="ll-export-btn" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--offwhite)", fontSize: 13, fontWeight: 500, color: "var(--forest)", cursor: "pointer", marginBottom: 8 }}>
              Download Power BI project (.pbip) <Download size={14} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}