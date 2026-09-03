import React, { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";

const INK = "#161B22";
const PAPER = "#F1EEE6";
const GOLD = "#C08A28";
const LINE = "#D8D2C2";
const TEXT_MUTED = "#6B7280";

const inputCls = "w-full rounded px-3 py-2 text-sm outline-none";
const inputStyle = { border: `1px solid ${LINE}`, backgroundColor: "#FFFFFF", color: INK };

export default function AuthScreen() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState("login"); // login | signup | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
      } else if (mode === "signup") {
        await signUp(email, password, fullName);
        setMessage("Check your email to confirm your account, then sign in.");
        setMode("login");
      } else if (mode === "reset") {
        await resetPassword(email);
        setMessage("Password reset email sent.");
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: PAPER }}>
      <div className="w-full max-w-sm rounded p-8" style={{ backgroundColor: "#FFFFFF", border: `1px solid ${LINE}` }}>
        <div className="text-xs mb-1" style={{ color: GOLD }}>Ledger for freelancers</div>
        <h1 className="text-2xl mb-6" style={{ fontFamily: "Georgia, serif", color: INK }}>FreelancerOS</h1>

        <form onSubmit={submit}>
          {mode === "signup" && (
            <label className="block mb-3">
              <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Full name</span>
              <input className={inputCls} style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </label>
          )}
          <label className="block mb-3">
            <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Email</span>
            <input type="email" className={inputCls} style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {mode !== "reset" && (
            <label className="block mb-4">
              <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Password</span>
              <input type="password" className={inputCls} style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </label>
          )}

          {error && <div className="text-xs mb-3" style={{ color: "#B4432D" }}>{error}</div>}
          {message && <div className="text-xs mb-3" style={{ color: "#2F6F4E" }}>{message}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded px-3.5 py-2 text-sm font-medium mb-3"
            style={{ backgroundColor: INK, color: PAPER, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset email"}
          </button>
        </form>

        <div className="flex justify-between text-xs" style={{ color: TEXT_MUTED }}>
          {mode === "login" && (
            <>
              <button onClick={() => { setMode("signup"); setError(""); setMessage(""); }}>Create account</button>
              <button onClick={() => { setMode("reset"); setError(""); setMessage(""); }}>Forgot password?</button>
            </>
          )}
          {mode !== "login" && (
            <button onClick={() => { setMode("login"); setError(""); setMessage(""); }}>&larr; Back to sign in</button>
          )}
        </div>
      </div>
    </div>
  );
}
