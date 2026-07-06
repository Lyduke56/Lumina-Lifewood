"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { AuthVisual } from "./AuthVisual";

// ── Avatar helpers ────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "#133020", "#046241", "#1B2A4A",
  "#5C3317", "#334155", "#6B3FA0",
];

function getAvatarColor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = char.charCodeAt(0) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (!parts.length || !parts[0]) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Field styles 

const inputBase: React.CSSProperties = {
  width: "100%", padding: "13px 14px",
  border: "1.5px solid #e5e7eb", borderRadius: 10,
  fontSize: 15, color: "#133020",
  background: "#f9f7f7", outline: "none",
  fontFamily: "'JetBrains Mono', monospace",
  transition: "border-color .15s, background .15s",
};

// Labels/headings
const labelStyle: React.CSSProperties = {
  display: "block", marginBottom: 6, fontSize: 12, fontWeight: 600,
  color: "#F5EEDB", fontFamily: "'JetBrains Mono', monospace",
  textTransform: "uppercase", letterSpacing: "0.06em",
};

function Field({
  id, label, required, hint, children,
}: {
  id?: string; label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>
        {label}
        {!required && (
          <span style={{ fontSize: 10.5, color: "#C9C2AC", marginLeft: 6, textTransform: "none", fontWeight: 400 }}>
            optional
          </span>
        )}
      </label>
      {children}
      {hint && <p style={{ marginTop: 5, fontSize: 11.5, color: "#C9C2AC", margin: "5px 0 0" }}>{hint}</p>}
    </div>
  );
}

function PasswordInput({
  id, value, onChange, placeholder, required, minLength,
}: {
  id: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        id={id} type={show ? "text" : "password"}
        value={value} required={required} minLength={minLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputBase, paddingRight: 44 }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "#046241"; e.currentTarget.style.background = "#fff"; }}
        onBlur={(e)  => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "#f9f7f7"; }}
      />
      <button
        type="button" tabIndex={-1} onClick={() => setShow((v) => !v)}
        style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", display: "flex" }}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}


function AuthButton({
  children, onClick, type = "button", disabled, loading,
  variant = "emerald",
}: {
  children: React.ReactNode; onClick?: () => void;
  type?: "button" | "submit"; disabled?: boolean; loading?: boolean;
  variant?: "emerald" | "amber";
}) {
  const [hover, setHover]   = useState(false);
  const [pressed, setPressed] = useState(false);

  const bg = variant === "emerald" ? "#046241" : "#FFB347";
  const bgHover = variant === "emerald" ? "#057A52" : "#FFC370";
  const color = variant === "emerald" ? "#fff" : "#133020";

  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        width: "100%", padding: "13px", borderRadius: 10,
        background: isDisabled ? bg : (hover ? bgHover : bg),
        color, border: "none",
        fontSize: 14.5, fontWeight: 600,
        fontFamily: "'JetBrains Mono', monospace",
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled && !loading ? 0.5 : 1,
        transform: pressed && !isDisabled ? "scale(0.98)" : "scale(1)",
        boxShadow: hover && !isDisabled ? "0 4px 14px rgba(0,0,0,0.18)" : "0 1px 3px rgba(0,0,0,0.08)",
        transition: "background .15s, transform .1s, box-shadow .15s, opacity .15s",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}
    >
      {loading && (
        <span style={{
          width: 14, height: 14, borderRadius: "50%",
          border: `2px solid ${variant === "emerald" ? "rgba(255,255,255,0.4)" : "rgba(19,48,32,0.3)"}`,
          borderTopColor: color,
          animation: "llSpin 0.7s linear infinite",
          display: "inline-block",
        }} />
      )}
      {children}
    </button>
  );
}

function TextLink({
  children, onClick, color = "#FFB347",
}: { children: React.ReactNode; onClick: () => void; color?: string }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "none", border: "none", cursor: "pointer",
        color, fontWeight: 500, fontSize: 13, padding: 0,
        textDecoration: hover ? "underline" : "none",
        transition: "opacity .15s",
        opacity: hover ? 0.85 : 1,
      }}
    >
      {children}
    </button>
  );
}
// ── Component ─────────────────────────────────────────────────────────────────

type Mode = "intro" | "login" | "signup";

export default function LoginScreen() {
  const supabase = createClient();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("intro");
  const [step, setStep] = useState<1 | 2>(1);

  const [email, setEmail]                     = useState("");
  const [password, setPassword]               = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [fullName, setFullName]           = useState("");
  const [username, setUsername]           = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [organization, setOrganization]   = useState("");

  const [error, setError]     = useState<string | null>(null);
  const [notice, setNotice]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [usernameStatus, setUsernameStatus] =
    useState<"idle" | "checking" | "taken" | "available">("idle");
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLogin = mode === "login";

  function reset() {
    setStep(1);
    setEmail(""); setPassword(""); setConfirmPassword("");
    setFullName(""); setUsername(""); setContactNumber(""); setOrganization("");
    setError(null); setNotice(null);
    setUsernameStatus("idle");
  }

  function goIntro() {
    setMode("intro");
    reset();
  }

  function switchMode() {
    setMode(isLogin ? "signup" : "login");
    reset();
  }

  function handleUsernameChange(value: string) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsername(cleaned);
    setUsernameStatus("idle");

    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    if (cleaned.length < 3) return;

    usernameTimer.current = setTimeout(async () => {
      setUsernameStatus("checking");
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", cleaned)
        .maybeSingle();
      setUsernameStatus(data ? "taken" : "available");
    }, 500);
  }

  function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    setStep(2);
  }

  async function handleStep2(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fullName.trim())       { setError("Full name is required."); return; }
    if (username.length < 3)    { setError("Username must be at least 3 characters."); return; }
    if (usernameStatus === "taken")    { setError("That username is already taken."); return; }
    if (usernameStatus === "checking") { setError("Still checking username — try again in a moment."); return; }
    if (!contactNumber.trim())  { setError("Contact number is required."); return; }

    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) throw signUpError;

      if (data.user?.identities?.length === 0) {
        setError("This email is already registered. Please log in instead.");
        setStep(1);
        return;
      }

      const userId = data.user?.id;
      if (!userId) throw new Error("Signup failed — no user ID returned.");

      const res = await fetch("/api/auth/create-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, fullName, username, contactNumber, organization }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save profile.");

      setNotice("Account created! Check your email to confirm, then log in.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error(
          error.message.toLowerCase().includes("invalid")
            ? "Incorrect email or password."
            : error.message
        );
      }
      router.push("/");
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  const avatarBg       = getAvatarColor(fullName || "?");
  const avatarInitials = getInitials(fullName);

  const usernameHint =
    usernameStatus === "checking"    ? "Checking…"
    : usernameStatus === "taken"     ? "⚠ Username already taken"
    : usernameStatus === "available" ? "✓ Available"
    : "Letters, numbers, and underscores only";

  const usernameHintColor =
    usernameStatus === "taken"       ? "#ff8a8a"
    : usernameStatus === "available" ? "#5FD3A0"
    : "#C9C2AC";

  const submitDisabled =
    loading || usernameStatus === "taken" || usernameStatus === "checking";

  return (
    <div style={{
      height: "100vh", width: "100%",
      display: "grid",
      gridTemplateColumns: "2fr 1fr",
      gridTemplateRows: "1fr auto",
      fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
      overflow: "hidden",
    }}>
      <style>{`
        @keyframes llNodePulse {
          0%, 100% { opacity: 0.35; }
          50%      { opacity: 1; }
        }
        @keyframes llLineDraw {
          0%   { stroke-dashoffset: 240; opacity: 0; }
          15%  { opacity: 0.7; }
          60%  { stroke-dashoffset: 0; opacity: 0.7; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
        @keyframes llFloatSlow {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-14px); }
        }
        @keyframes llDrift {
          0%   { transform: translateY(0) translateX(0); opacity: 0; }
          10%  { opacity: 0.7; }
          90%  { opacity: 0.5; }
          100% { transform: translateY(-420px) translateX(20px); opacity: 0; }
        }
        @keyframes llGradientShift {
          0%, 100% { background-position: 0% 0%; }
          50%      { background-position: 100% 100%; }
        }
      `}</style>

      {/* Left — visual*/}
      <div style={{
        gridColumn: 1, gridRow: "1 / span 2",
        position: "relative",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        overflow: "hidden", minWidth: 0,
        background: "linear-gradient(155deg, #FFFFFF 0%, #F9F7F7 45%, #F5EEDB 75%, #FFFFFF 100%)",
        backgroundSize: "220% 220%",
        animation: "llGradientShift 18s ease-in-out infinite",
      }}>
        <AuthVisual light />

        <div style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 25 }}>
            <img src="/lumina-symbol-final.svg" alt="" style={{ height: 140, width: "auto" }} />
            <img src="/lumina-text.svg" alt="Lumina" style={{ height: 150, width: "auto" }} />
          </div>
          <p style={{
            margin: "10px 0 0", fontSize: 20, letterSpacing: "0.16em",
            textTransform: "uppercase", color: "#FFB347", fontWeight: 600,
          }}>
            illuminate insights
          </p>
        </div>

        <div style={{ position: "absolute", left: 48, bottom: 40, zIndex: 2, maxWidth: 360 }}>
          <h2 style={{
            fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600,
            color: "#133020", margin: "0 0 8px", lineHeight: 1.3,
          }}>
            Your data, reasoned about.
          </h2>
          <p style={{ fontSize: 13.5, color: "rgba(19,48,32,0.6)", lineHeight: 1.6, margin: 0 }}>
            Upload a plan, describe what you need, and Lumina figures out
            the right charts and builds the dashboard for you.
          </p>
        </div>
      </div>

      {/* Right — form / intro */}
      <div style={{
        gridColumn: 2, gridRow: 1,
        background: "#133020", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: 40,
        minWidth: 0, overflowY: "auto",
      }}>
        <div style={{ width: "100%", maxWidth: 360 }}>
          <div key={`${mode}-${step}`} style={{ animation: "llFadeSlideIn 0.35s ease-out" }}>
          {/* ── Intro: two entry buttons ─────────────────────────────── */}
          {mode === "intro" && (
            <div>
              <h1 style={{
                margin: 0, fontSize: 22, fontWeight: 700, color: "#F5EEDB",
                fontFamily: "'Fraunces', serif", lineHeight: 1.3,
              }}>
                Welcome to Lumina
              </h1>
              <p style={{ margin: "10px 0 28px", fontSize: 13.5, color: "#C9C2AC", lineHeight: 1.6 }}>
                Sign in to pick up your conversations and dashboards, or
                create an account to get started.
              </p>

              <div style={{ display: "flex", flexDirection: "row", gap: 12 }}>
                <AuthButton variant="emerald" onClick={() => setMode("login")}>Log in</AuthButton>
                <AuthButton variant="amber" onClick={() => setMode("signup")}>Sign up</AuthButton>
              </div>
            </div>
          )}

          {/* ── Login / Signup forms ─────────────────────────────────── */}
          {mode !== "intro" && (
            <>
              <div style={{ marginBottom: 22 }}>
                {/* ── Navigation Buttons Group ── */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12, marginBottom: 24 }}>
                  <button
                    onClick={goIntro}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#F5EEDB"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "#C9C2AC"; }}
                    style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "#C9C2AC", fontSize: 13, padding: 0, transition: "color .15s" }}
                  >
                    <ArrowLeft size={13} /> Back
                  </button>
                  
                  {!isLogin && step === 2 && (
                    <button
                      onClick={() => { setStep(1); setError(null); }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "#F5EEDB"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "#C9C2AC"; }}
                      style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "#C9C2AC", fontSize: 13, padding: 0, transition: "color .15s" }}
                    >
                      <ArrowLeft size={13} /> Change credentials
                    </button>
                  )}
                </div>

                {/* ── Headings ── */}
                <h1 style={{
                  margin: 0, fontSize: 17, fontWeight: 600, color: "#F5EEDB",
                  fontFamily: "'Fraunces', serif", display: "inline-block",
                  borderBottom: "2px solid #FFB347", paddingBottom: 4,
                }}>
                  {isLogin ? "Welcome back" : step === 1 ? "Create your account" : "Set up your profile"}
                </h1>
                <p style={{ margin: "10px 0 0", fontSize: 13.5, color: "#C9C2AC" }}>
                  {isLogin
                    ? "Sign in to see your conversations and dashboards."
                    : step === 1 ? "Step 1 of 2 — your login credentials."
                    : "Step 2 of 2 — how you'll appear in Lumina."}
                </p>
              </div>

              {!isLogin && (
                <div style={{ display: "flex", gap: 4, marginBottom: 22 }}>
                  {[1, 2].map((s) => (
                    <div key={s} style={{
                      flex: 1, height: 3, borderRadius: 2,
                      background: s <= step ? "#FFB347" : "rgba(245,238,219,0.15)",
                      transition: "background .2s",
                    }} />
                  ))}
                </div>
              )}

              {notice && (
                <div style={{
                  marginBottom: 16, padding: "10px 14px", borderRadius: 9,
                  background: "#eef6f1", border: "1px solid #a7d7be",
                  fontSize: 13, color: "#034D34", lineHeight: 1.5,
                }}>
                  {notice}
                  <div style={{ marginTop: 10 }}>
                    <button
                      onClick={() => setMode("login")}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#046241", fontWeight: 600, fontSize: 13, padding: 0, textDecoration: "underline" }}
                    >
                      Go to log in →
                    </button>
                  </div>
                </div>
              )}

              {isLogin && (
                <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <Field id="login-email" label="Email" required>
                    <input
                      id="login-email" type="email" value={email} autoFocus required
                      onChange={(e) => setEmail(e.target.value)}
                      style={inputBase}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "#046241"; e.currentTarget.style.background = "#fff"; }}
                      onBlur={(e)  => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "#f9f7f7"; }}
                    />
                  </Field>
                  <Field id="login-password" label="Password" required>
                    <PasswordInput id="login-password" value={password} onChange={setPassword} required />
                  </Field>
                  {error && (
                    <p key={error} style={{
                      fontSize: 13, color: "#ff8a8a", margin: 0,
                      animation: "llShake 0.4s ease-in-out",
                    }}>
                      {error}
                    </p>
                  )}

                  <AuthButton type="submit" variant="amber" loading={loading}>
                    {loading ? "Signing in…" : "Log in"}
                  </AuthButton>
                </form>
              )}

              {!isLogin && step === 1 && !notice && (
                <form onSubmit={handleStep1} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <Field id="su-email" label="Email" required>
                    <input
                      id="su-email" type="email" value={email} autoFocus required
                      onChange={(e) => setEmail(e.target.value)}
                      style={inputBase}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "#046241"; e.currentTarget.style.background = "#fff"; }}
                      onBlur={(e)  => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "#f9f7f7"; }}
                    />
                  </Field>
                  <Field id="su-password" label="Password" required hint="Minimum 8 characters.">
                    <PasswordInput id="su-password" value={password} onChange={setPassword} required minLength={8} />
                  </Field>
                  <Field id="su-confirm" label="Confirm password" required>
                    <PasswordInput id="su-confirm" value={confirmPassword} onChange={setConfirmPassword} required />
                  </Field>
                  {error && <p style={{ fontSize: 13, color: "#ff8a8a", margin: 0 }}>{error}</p>}

                  <AuthButton 
                    type="submit" variant="amber">Continue →
                  </AuthButton>
                </form>
              )}

              {!isLogin && step === 2 && !notice && (
                <form onSubmit={handleStep2} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", borderRadius: 12, background: "#f9f7f7", border: "1px solid #e5e7eb" }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: "50%",
                      background: avatarBg, color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, fontWeight: 700, flexShrink: 0,
                      fontFamily: "Fraunces, serif", transition: "background .3s",
                    }}>
                      {avatarInitials}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#133020" }}>Your avatar</div>
                      <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2, lineHeight: 1.4 }}>
                        Generated from your name. Upload a photo later in Settings.
                      </div>
                    </div>
                  </div>

                  <Field id="su-fullname" label="Full name" required>
                    <input
                      id="su-fullname" type="text" value={fullName} autoFocus required
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Juan dela Cruz"
                      style={inputBase}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "#046241"; e.currentTarget.style.background = "#fff"; }}
                      onBlur={(e)  => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "#f9f7f7"; }}
                    />
                  </Field>

                  <Field id="su-username" label="Username" required>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#9ca3af" }}>@</span>
                      <input
                        id="su-username" type="text" value={username} required
                        onChange={(e) => handleUsernameChange(e.target.value)}
                        placeholder="juandelacruz"
                        style={{
                          ...inputBase, paddingLeft: 28,
                          borderColor:
                            usernameStatus === "taken" ? "#ef4444"
                            : usernameStatus === "available" ? "#046241"
                            : "#e5e7eb",
                        }}
                        onFocus={(e) => { e.currentTarget.style.background = "#fff"; }}
                        onBlur={(e)  => { e.currentTarget.style.background = "#f9f7f7"; }}
                      />
                    </div>
                    {/* Keep only this custom hint to preserve the dynamic coloring */}
                    <p style={{ marginTop: 5, fontSize: 11.5, margin: "5px 0 0", color: usernameHintColor }}>
                      {usernameHint}
                    </p>
                  </Field>

                  <Field id="su-contact" label="Contact number" required hint="Used to whitelist your number for the WhatsApp bot.">
                    <input
                      id="su-contact" type="tel" value={contactNumber} required
                      onChange={(e) => setContactNumber(e.target.value)}
                      placeholder="+63 912 345 6789"
                      style={inputBase}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "#046241"; e.currentTarget.style.background = "#fff"; }}
                      onBlur={(e)  => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "#f9f7f7"; }}
                    />
                  </Field>

                  <Field id="su-org" label="Organization">
                    <input
                      id="su-org" type="text" value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      placeholder="Lifewood Data Technology"
                      style={inputBase}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "#046241"; e.currentTarget.style.background = "#fff"; }}
                      onBlur={(e)  => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "#f9f7f7"; }}
                    />
                  </Field>

                  {error && <p style={{ fontSize: 13, color: "#ff8a8a", margin: 0 }}>{error}</p>}

                  <AuthButton type="submit" variant="amber" disabled={submitDisabled} loading={loading}>
                    {loading ? "Creating account…" : "Create account"}
                  </AuthButton>
                </form>
              )}

              {!notice && (
              <div style={{ marginTop: 20, textAlign: "center", fontSize: 13 }}>
                <TextLink onClick={switchMode}>
                  {isLogin ? "Don't have an account? Sign up" : "Already have an account? Log in"}
                </TextLink>
              </div>
              )}
            </>
          )}
          </div>
        </div>
      </div>

    {/* Footer */}
      <div style={{
        gridColumn: 2, gridRow: 2,
        height: 80, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 6,
        borderTop: "1px solid rgba(245,238,219,0.1)", background: "#133020",
        fontSize: 11.5, color: "#C9C2AC", fontFamily: "'JetBrains Mono', monospace",
      }}>
         <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 , fontSize: 25}}>
            <img src="/lifewood-full-cream.svg" alt="Lifewood" style={{ height: 20, width: "auto" }} />
            |
            <img src="/lumina-full-cream.svg" alt="Lumina" style={{ height: 35, width: "auto", transform: "translateY(1px)" }} />
          </div>
          
          <div style={{ fontSize: 10, opacity: 0.6, letterSpacing: "0.02em" }}>
            &copy; 2026 All Rights Reserved.
          </div>
      </div>

    </div>
  );
}