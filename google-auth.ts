import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Tidak ada authorization header");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Verifikasi caller adalah admin
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Tidak terautentikasi");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") throw new Error("Hanya admin yang bisa generate link");

    const { participants, siteUrl } = await req.json();
    if (!Array.isArray(participants) || participants.length === 0) {
      throw new Error("Daftar peserta kosong");
    }

    const results = [];

    for (const p of participants) {
      const email = (p.email || "").trim().toLowerCase();
      if (!email) continue;

      // Buat user baru jika belum ada
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          full_name: p.full_name || "",
          institution: p.institution || "",
          role: "participant",
        },
      });

      // Jika user sudah ada, ambil user yang existing
      let userId = created?.user?.id;
      if (createErr && createErr.message?.toLowerCase().includes("already")) {
        const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
        const found = existing?.users?.find((u) => u.email === email);
        userId = found?.id;
      }

      if (!userId) {
        results.push({ email, full_name: p.full_name, institution: p.institution, link: null, error: createErr?.message || "Gagal membuat user" });
        continue;
      }

      // Generate magic link → redirect ke set-password.html
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: (siteUrl || "").replace(/\/$/, "") + "/set-password.html" },
      });

      if (linkErr) {
        results.push({ email, full_name: p.full_name, institution: p.institution, link: null, error: linkErr.message });
      } else {
        results.push({
          email,
          full_name: p.full_name || "",
          institution: p.institution || "",
          link: linkData.properties.action_link,
          error: null,
        });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
