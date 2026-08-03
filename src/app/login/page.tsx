"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function LoginPage() {
  const router = useRouter();
  const configured = isSupabaseConfigured();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
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

  async function onSocialSignIn(provider: "google") {
    setError(null);
    setStatus(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/login`,
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      if (data?.url) {
        window.location.assign(data.url);
        return;
      }

      setStatus("Redirecting to provider for login...");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Social login failed.";
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);

    if (!configured) {
      setError(
        "Supabase isn’t configured yet. Deploy is in demo mode — add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable login.",
      );
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      router.push("/passenger");
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Login failed";
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
            <h1>Login</h1></div>
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
                placeholder="••••••••"
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading || !configured}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          {status ? (
            <div className="alert">
              {status}
            </div>
          ) : null}
          {error ? (
            <div className="alert">
              <strong>Error:</strong> {error}
            </div>
          ) : null}

          <div className="grid gap-3">
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => onSocialSignIn("google")}
              disabled={loading || !configured}
            >
              Sign in with Google
            </button>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <p className="muted" style={{ margin: 0 }}>
              No account? <Link href="/signup">Sign up</Link>
            </p>
            <Link href="/reset-password" className="btn btn-ghost" style={{ marginLeft: "auto" }}>
              Forgot password?
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}


