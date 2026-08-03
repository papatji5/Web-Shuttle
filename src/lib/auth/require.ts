import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "PASSENGER" | "DRIVER" | "ADMIN";

export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  return data.user;
}

export async function requireRole(role: AppRole) {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const hasProfile = !error && Boolean(profile);

  if (!hasProfile) {
    if (role !== "PASSENGER") {
      redirect("/");
    }

    await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        email: user.email ?? undefined,
        role: "PASSENGER",
      }, { onConflict: "id" });

    return user;
  }

  if (profile.role !== role) {
    redirect("/");
  }

  return user;
}
