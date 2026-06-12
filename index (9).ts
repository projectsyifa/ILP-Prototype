import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { users, defaultPassword } = await req.json();
    if (!Array.isArray(users) || !users.length) {
      return new Response(JSON.stringify({ error: "users array required" }), { status: 400, headers: corsHeaders });
    }

    const okList: object[] = [];
    const failList: { email: string; reason: string }[] = [];

    for (const u of users) {
      let userId: string | null = null;

      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password: defaultPassword || "123456",
        email_confirm: true,
        user_metadata: { full_name: u.full_name, institution: u.institution, role: "participant" },
      });

      if (error) {
        // If already registered, look up existing user, confirm email, and upsert profile
        if (error.message.toLowerCase().includes("already been registered") || error.message.toLowerCase().includes("already exists")) {
          const { data: listData } = await supabase.auth.admin.listUsers();
          const existing = listData?.users?.find((u2: any) => u2.email === u.email);
          if (existing) {
            userId = existing.id;
            // Confirm email + reset password for existing unconfirmed users
            await supabase.auth.admin.updateUserById(existing.id, {
              email_confirm: true,
              password: defaultPassword || "123456",
            });
          } else {
            failList.push({ email: u.email, reason: error.message });
            continue;
          }
        } else {
          failList.push({ email: u.email, reason: error.message });
          continue;
        }
      } else {
        userId = data.user?.id ?? null;
      }

      if (userId) {
        await supabase.from("profiles").upsert(
          { id: userId, email: u.email, full_name: u.full_name, institution: u.institution, role: "participant" },
          { onConflict: "id" },
        );
        okList.push({ email: u.email, full_name: u.full_name, institution: u.institution });
      }
    }

    return new Response(JSON.stringify({ ok: okList, fail: failList }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
