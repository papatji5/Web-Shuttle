import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/require";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import AdminFinance from "@/app/admin/finance";

export const dynamic = "force-dynamic";

type Role = "PASSENGER" | "DRIVER" | "ADMIN";

type AdminPageProps = {
  searchParams?: Promise<{ msg?: string; error?: string }>;
};

async function setRoleAction(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const role = String(formData.get("role") ?? "")
    .trim()
    .toUpperCase() as Role;

  if (!email) {
    redirect("/admin?error=" + encodeURIComponent("Email is required."));
  }
  if (role !== "PASSENGER" && role !== "DRIVER" && role !== "ADMIN") {
    redirect("/admin?error=" + encodeURIComponent("Invalid role."));
  }

  await requireRole("ADMIN");
  const supabase = await createClient();

  const { data: profile, error: findError } = await supabase
    .from("profiles")
    .select("id,email,role")
    .eq("email", email)
    .maybeSingle();

  if (findError) {
    redirect("/admin?error=" + encodeURIComponent(findError.message));
  }
  if (!profile) {
    redirect(
      "/admin?error=" +
        encodeURIComponent(
          "No profile found for that email. Ask the user to sign up/login once, then try again.",
        ),
    );
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", profile.id);

  if (updateError) {
    redirect("/admin?error=" + encodeURIComponent(updateError.message));
  }

  if (role === "DRIVER") {
    const { error: driverInsertError } = await supabase
      .from("drivers")
      .insert({ id: profile.id });

    if (
      driverInsertError &&
      !/duplicate|already exists/i.test(driverInsertError.message)
    ) {
      redirect(
        "/admin?error=" +
          encodeURIComponent(
            `Role updated, but creating driver row failed: ${driverInsertError.message}`,
          ),
      );
    }
  }

  redirect("/admin?msg=" + encodeURIComponent(`Updated ${email} to ${role}.`));
}

export default async function AdminPage(props: AdminPageProps) {
  const sp = props.searchParams ? await props.searchParams : {};

  if (!isSupabaseConfigured()) {
    return (
      <section className="stack">
        <div className="stack">
          <h1>Admin (Demo)</h1>
          <p className="muted">
            Supabase isn’t configured yet. Once you add env vars and create your
            Supabase project, this page will require an ADMIN role and show
            admin tools.
          </p>
        </div>
        <div className="row">
          <Link className="btn" href="/">
            Home
          </Link>
        </div>
      </section>
    );
  }

  await requireRole("ADMIN");

  return (
    <section className="stack">
      <div className="stack">
        <h1>Admin</h1>
      </div>

      {sp?.msg ? (
        <div className="alert">
          <strong>OK:</strong> {sp.msg}
        </div>
      ) : null}
      {sp?.error ? (
        <div className="alert">
          <strong>Error:</strong> {sp.error}
        </div>
      ) : null}

      <div className="card stack">
        <h2>Set user role</h2>
        <form action={setRoleAction} className="stack">
          <div className="field">
            <span className="label">User email</span>
            <input
              name="email"
              type="email"
              placeholder="user@email.com"
              className="input"
              required
            />
          </div>

          <div className="field">
            <span className="label">Role</span>
            <select name="role" className="select" defaultValue="PASSENGER">
              <option value="PASSENGER">PASSENGER</option>
              <option value="DRIVER">DRIVER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>

          <div className="row">
            <button type="submit" className="btn btn-primary">
              Update role
            </button>
            <Link className="btn btn-ghost" href="/">
              Home
            </Link>
          </div>
        </form>
      </div>

      <AdminFinance />
    </section>
  );
}
