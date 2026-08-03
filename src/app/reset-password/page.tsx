"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function ResetPasswordPage() {
  const configured = isSupabaseConfigured();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);

    if (!configured) {
      setError(
        "Supabase isn’t configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable password recovery.",
      );
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email);

      if (error) {
        setError(error.message);
        return;
      }

      setStatus(
        "If an account exists for that email, a password reset link has been sent. Check your inbox and follow the instructions.",
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Password reset request failed.";
      if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
        setError(
          "Cannot reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL in .env.local and your network/DNS.",
        );
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-wrap">
      <div style={{ maxWidth: 520, width: "100%" }}>
        <div style={{ display: "grid", placeItems: "center", gap: 12, marginBottom: 12 }}>
          <img src="/logo.jpeg" alt="Swift" className="brand-mark" width={64} height={64} />
          <div className="stack" style={{ textAlign: "center" }}>
            <h1>Forgot password</h1>
            <p className="muted">Enter your email to receive a password reset link.</p>
          </div>
        </div>

        {!configured ? (
          <div className="alert">
            This deployment is running without Supabase configured yet. Password reset is disabled until the environment is configured.
          </div>
        ) : null}

        <div className="card stack">
          <form onSubmit={onSubmit} className="stack">
            <div className="field">
              <span className="label">Email</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
              />
            </div>

            <button className="btn btn-primary" type="submit" disabled={loading || !configured}>
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>

          {error ? (
            <div className="alert">
              <strong>Error:</strong> {error}
            </div>
          ) : null}
          {status ? <div className="alert">{status}</div> : null}

          <p className="muted" style={{ textAlign: "center" }}>
            Remembered your password? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
