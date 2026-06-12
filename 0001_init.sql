/**
 * Edge Function: google-drive-delete
 * Permanently delete (trash) a file from Google Drive by fileId.
 * POST { fileId: string }
 */

import { getGoogleAccessToken } from "../_shared/google-auth.ts";
import { corsHeaders, ok, err } from "../_shared/cors.ts";

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { fileId } = await req.json();
    if (!fileId) return err("fileId wajib diisi.");

    const token = await getGoogleAccessToken([
      "https://www.googleapis.com/auth/drive",
    ]);

    // Move to trash (recoverable)
    const res = await fetch(`${DRIVE_API}/${fileId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // File not found or no access — treat as already gone
      if (res.status === 404 || res.status === 403) return ok({ deleted: false, reason: "not_found_or_no_access" });
      throw new Error(`Drive API error ${res.status}: ${(body as { error?: { message?: string } })?.error?.message || JSON.stringify(body)}`);
    }

    return ok({ deleted: true, fileId });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
