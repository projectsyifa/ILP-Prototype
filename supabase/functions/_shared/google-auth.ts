/**
 * Google OAuth 2.0 authentication for Supabase Edge Functions.
 * Uses refresh token flow (works with regular Gmail accounts, no Workspace needed).
 *
 * Required Supabase secrets:
 *   GOOGLE_CLIENT_ID        — OAuth 2.0 client ID
 *   GOOGLE_CLIENT_SECRET    — OAuth 2.0 client secret
 *   GOOGLE_REFRESH_TOKEN    — refresh token (get from OAuth Playground, see GOOGLE_SETUP.md)
 */

export async function getGoogleAccessToken(_scopes?: string[]): Promise<string> {
  const clientId     = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google OAuth belum dikonfigurasi. Tambahkan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN di Supabase secrets. Lihat GOOGLE_SETUP.md."
    );
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    "refresh_token",
    }),
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error("Gagal mendapatkan Google access token: " + JSON.stringify(data));
  }
  return data.access_token;
}
