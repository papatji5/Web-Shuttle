import { requireRole } from "@/lib/auth/require";

export async function GET() {
  try {
    const user = await requireRole("PASSENGER");
    
    return new Response(
      JSON.stringify({
        id: user.id,
        email: user.email,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
}
