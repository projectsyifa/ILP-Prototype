export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function ok(data: unknown) {
  return new Response(JSON.stringify({ ok: true, ...( typeof data === "object" ? data : { data }) }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
