"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function SignupPage() {
  const router = useRouter();
  const configured = isSupabaseConfigured();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function checkSession() {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        router.replace("/passenger");
      }
    }
    checkSession();
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!configured) {
      setError(
        "Supabase isn’t configured yet. Deploy is in demo mode — add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable signup.",
      );
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      // If email confirmation is enabled, Supabase returns no session.
      if (!data.session) {
        setSuccess(
          "Account created. Check your email and click the confirmation link, then come back and log in.",
        );
        return;
      }

      router.push("/passenger");
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Signup failed";
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
            <h1>Sign up</h1>
            <p className="muted">Create a passenger account (default role)</p>
          </div>
        </div>

        {!configured ? (
          <div className="alert">
            This deployment is running without Supabase configured yet. You can still
            browse the UI skeleton, but auth is disabled.
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
            <div className="field">
              <span className="label">Password</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="At least 8 characters"
              />
            </div>

            <button className="btn btn-primary" type="submit" disabled={loading || !configured}>
              {loading ? "Creating..." : "Create account"}
            </button>
          </form>

          {error ? (
            <div className="alert">
              <strong>Error:</strong> {error}
            </div>
          ) : null}
          {success ? <div className="alert">{success}</div> : null}

          <p className="muted" style={{ textAlign: "center" }}>
            Already have an account? <Link href="/login">Login</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
