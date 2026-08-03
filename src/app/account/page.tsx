import { requireUser } from "@/lib/auth/require";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function updateProfileAction(formData: FormData) {
  "use server";
  const user = await requireUser();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name, phone }).eq("id", user.id);
  if (error) {
    throw new Error(error.message);
  }
  return;
}

export default async function AccountPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("full_name,phone,email,role").eq("id", user.id).maybeSingle();

  return (
    <section className="stack">
      <div className="stack">
        <h1>Account</h1>
        <p className="muted">Manage your profile details.</p>
      </div>

      <div className="card stack">
        <form action={updateProfileAction} className="stack">
          <div className="field">
            <label className="label">Full name</label>
            <input name="full_name" defaultValue={profile?.full_name ?? ""} className="input" />
          </div>
          <div className="field">
            <label className="label">Phone</label>
            <input name="phone" defaultValue={profile?.phone ?? ""} className="input" />
          </div>
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <button type="submit" className="btn btn-primary">Save</button>
            {profile?.role === "DRIVER" ? (
              <Link className="btn btn-ghost" href="/account/past-offers">
                Past offers
              </Link>
            ) : (
              <Link className="btn btn-ghost" href="/account/recent-rides">
                Recent rides
              </Link>
            )}
            <Link className="btn btn-ghost" href="/">
              Home
            </Link>
          </div>
        </form>
      </div>
    </section>
  );
}
