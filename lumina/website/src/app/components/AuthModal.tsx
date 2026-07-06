"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff, X, ArrowLeft } from "lucide-react";

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

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputBase: React.CSSProperties = {
  width: "100%", padding: "9px 12px",
  border: "1px solid #e5e7eb", borderRadius: 8,
  fontSize: 14, color: "#133020",
  background: "#f9f7f7", outline: "none",
  transition: "border-color .15s, background .15s",
};

function Field({
  id, label, required, hint, children,
}: {
  id?: string; label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        style={{ display: "block", marginBottom: 5, fontSize: 13, fontWeight: 500, color: "#133020" }}
      >
        {label}
        {!required && (
          <span style={{ fontSize: 11.5, color: "#9ca3af", marginLeft: 5 }}>optional</span>
        )}
      </label>
      {children}
      {hint && <p style={{ marginTop: 4, fontSize: 11.5, color: "#9ca3af", margin: "4px 0 0" }}>{hint}</p>}
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
        style={{ ...inputBase, paddingRight: 40 }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "#046241"; e.currentTarget.style.background = "#fff"; }}
        onBlur={(e)  => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "#f9f7f7"; }}
      />
      <button
        type="button" tabIndex={-1} onClick={() => setShow((v) => !v)}
        style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", display: "flex" }}
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AuthModal({
  open, onClose,
}: {
  open: boolean; onClose: () => void;
}) {
  const supabase = createClient();

  const [isLogin, setIsLogin] = useState(true);
  const [step, setStep]       = useState<1 | 2>(1);

  // Step 1
  const [email, setEmail]                   = useState("");
  const [password, setPassword]             = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Step 2
  const [fullName, setFullName]           = useState("");
  const [username, setUsername]           = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [organization, setOrganization]   = useState("");

  // Feedback
  const [error, setError]     = useState<string | null>(null);
  const [notice, setNotice]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Username check
  const [usernameStatus, setUsernameStatus] =
    useState<"idle" | "checking" | "taken" | "available">("idle");
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!open) return null;

  function reset() {
    setStep(1);
    setEmail(""); setPassword(""); setConfirmPassword("");
    setFullName(""); setUsername(""); setContactNumber(""); setOrganization("");
    setError(null); setNotice(null);
    setUsernameStatus("idle");
  }

  function switchMode() {
    setIsLogin((v) => !v);
    reset();
  }

  // ── Username availability ─────────────────────────────────────────────────
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

  // ── Step 1: validate then advance ─────────────────────────────────────────
  function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    setStep(2);
  }

  // ── Step 2: signUp + profile insert via API route ─────────────────────────
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
      // 1. Create the auth user
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) throw signUpError;

      // 2. Duplicate email check
      if (data.user?.identities?.length === 0) {
        setError("This email is already registered. Please log in instead.");
        setStep(1);
        return;
      }

      const userId = data.user?.id;
      if (!userId) throw new Error("Signup failed — no user ID returned.");

      // 3. Insert profile via API route (uses service role, bypasses RLS)
      //    This works even before the user confirms their email.
      const res = await fetch("/api/auth/create-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          fullName,
          username,
          contactNumber,
          organization,
        }),
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

  // ── Login ─────────────────────────────────────────────────────────────────
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
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const avatarBg       = getAvatarColor(fullName || "?");
  const avatarInitials = getInitials(fullName);

  const usernameHint =
    usernameStatus === "checking"    ? "Checking…"
    : usernameStatus === "taken"     ? "⚠ Username already taken"
    : usernameStatus === "available" ? "✓ Available"
    : "Letters, numbers, and underscores only";

  const usernameHintColor =
    usernameStatus === "taken"       ? "#ef4444"
    : usernameStatus === "available" ? "#046241"
    : "#9ca3af";

  const submitDisabled =
    loading || usernameStatus === "taken" || usernameStatus === "checking";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px 16px",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 16,
        width: "100%", maxWidth: 440,
        boxShadow: "0 12px 48px rgba(0,0,0,0.18)",
        overflow: "hidden",
      }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          padding: "22px 24px 16px", borderBottom: "1px solid #f3f4f6",
        }}>
          <div>
            {!isLogin && step === 2 && (
              <button
                onClick={() => { setStep(1); setError(null); }}
                style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 13, marginBottom: 8, padding: 0 }}
              >
                <ArrowLeft size={13} /> Back
              </button>
            )}
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#133020" }}>
              {isLogin ? "Log in to Lumina" : step === 1 ? "Create your account" : "Set up your profile"}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
              {isLogin
                ? "Sign in to see your conversations and dashboards."
                : step === 1 ? "Step 1 of 2 — your login credentials."
                : "Step 2 of 2 — how you'll appear in Lumina."}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 4, borderRadius: 6, flexShrink: 0, marginLeft: 12 }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Step bar */}
        {!isLogin && (
          <div style={{ display: "flex", gap: 4, padding: "12px 24px 0" }}>
            {[1, 2].map((s) => (
              <div key={s} style={{
                flex: 1, height: 3, borderRadius: 2,
                background: s <= step ? "#046241" : "#e5e7eb",
                transition: "background .2s",
              }} />
            ))}
          </div>
        )}

        {/* Body */}
        <div style={{ padding: "20px 24px 24px" }}>

          {/* Notice */}
          {notice && (
            <div style={{
              marginBottom: 16, padding: "10px 14px", borderRadius: 9,
              background: "#eef6f1", border: "1px solid #a7d7be",
              fontSize: 13, color: "#034D34", lineHeight: 1.5,
            }}>
              {notice}
              <div style={{ marginTop: 10 }}>
                <button
                  onClick={switchMode}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#046241", fontWeight: 600, fontSize: 13, padding: 0, textDecoration: "underline" }}
                >
                  Go to log in →
                </button>
              </div>
            </div>
          )}

          {/* ── Login ──────────────────────────────────────────────────── */}
          {isLogin && (
            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
              {error && <p style={{ fontSize: 13, color: "#ef4444", margin: 0 }}>{error}</p>}
              <button type="submit" disabled={loading} style={{
                width: "100%", padding: "10px", borderRadius: 9,
                background: "#046241", color: "#fff", border: "none",
                fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1, marginTop: 4,
              }}>
                {loading ? "Signing in…" : "Log in"}
              </button>
            </form>
          )}

          {/* ── Signup step 1 ───────────────────────────────────────────── */}
          {!isLogin && step === 1 && !notice && (
            <form onSubmit={handleStep1} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
              {error && <p style={{ fontSize: 13, color: "#ef4444", margin: 0 }}>{error}</p>}
              <button type="submit" style={{
                width: "100%", padding: "10px", borderRadius: 9,
                background: "#046241", color: "#fff", border: "none",
                fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 4,
              }}>
                Continue →
              </button>
            </form>
          )}

          {/* ── Signup step 2 ───────────────────────────────────────────── */}
          {!isLogin && step === 2 && !notice && (
            <form onSubmit={handleStep2} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Avatar preview */}
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

              <Field id="su-username" label="Username" required hint={usernameHint}>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#9ca3af" }}>@</span>
                  <input
                    id="su-username" type="text" value={username} required
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    placeholder="juandelacruz"
                    style={{
                      ...inputBase, paddingLeft: 26,
                      borderColor:
                        usernameStatus === "taken" ? "#ef4444"
                        : usernameStatus === "available" ? "#046241"
                        : "#e5e7eb",
                    }}
                    onFocus={(e) => { e.currentTarget.style.background = "#fff"; }}
                    onBlur={(e)  => { e.currentTarget.style.background = "#f9f7f7"; }}
                  />
                </div>
                {/* Coloured hint text */}
                <p style={{ marginTop: 4, fontSize: 11.5, margin: "4px 0 0", color: usernameHintColor }}>
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

              {error && <p style={{ fontSize: 13, color: "#ef4444", margin: 0 }}>{error}</p>}

              <button
                type="submit" disabled={submitDisabled}
                style={{
                  width: "100%", padding: "10px", borderRadius: 9,
                  background: "#046241", color: "#fff", border: "none",
                  fontSize: 14, fontWeight: 600, marginTop: 4,
                  cursor: submitDisabled ? "not-allowed" : "pointer",
                  opacity: submitDisabled ? 0.5 : 1,
                }}
              >
                {loading ? "Creating account…" : "Create account"}
              </button>
            </form>
          )}

          {/* Mode switch */}
          {!notice && (
            <div style={{ marginTop: 18, textAlign: "center", fontSize: 13 }}>
              <button
                onClick={switchMode}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#A65A12", fontWeight: 500 }}
              >
                {isLogin ? "Don't have an account? Sign up" : "Already have an account? Log in"}
              </button>
            </div>  
          )}
        </div>
      </div>
    </div>
  );
}