/**
 * Edge Function: google-drive-organize
 * Move existing Drive files into the correct folder.
 * Idempotent — skips files already in the target folder.
 *
 * POST { files: [{ fileId, name }], folderId: string }
 * Returns: { ok, moved, skipped, failed }
 */

import { getGoogleAccessToken } from "../_shared/google-auth.ts";
import { corsHeaders, ok, err } from "../_shared/cors.ts";

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { files, folderId } = await req.json();
    if (!folderId) return err("folderId wajib diisi.");
    if (!Array.isArray(files) || files.length === 0) return ok({ moved: 0, skipped: 0, failed: 0 });

    const token = await getGoogleAccessToken([
      "https://www.googleapis.com/auth/drive.file",
    ]);

    let moved = 0, skipped = 0, failed = 0;
    const results: { fileId: string; status: string; name?: string }[] = [];

    for (const { fileId, name } of files) {
      if (!fileId) { failed++; continue; }
      try {
        // Get current parents
        const metaRes = await fetch(`${DRIVE_API}/${fileId}?fields=id,name,parents`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const meta = await metaRes.json();

        if (meta.error) {
          // File not accessible (deleted or no permission)
          failed++;
          results.push({ fileId, status: "not_found", name });
          continue;
        }

        const parents: string[] = meta.parents || [];

        // Already in target folder
        if (parents.includes(folderId)) {
          skipped++;
          results.push({ fileId, status: "already_there", name: meta.name });
          continue;
        }

        // Move: add new parent, remove old parents
        const removeParents = parents.join(",");
        const patchUrl = `${DRIVE_API}/${fileId}?addParents=${folderId}${removeParents ? `&removeParents=${removeParents}` : ""}&fields=id,parents`;
        const patchRes = await fetch(patchUrl, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const patched = await patchRes.json();

        if (patched.error) {
          failed++;
          results.push({ fileId, status: "error: " + patched.error.message, name: meta.name });
        } else {
          moved++;
          results.push({ fileId, status: "moved", name: meta.name });
        }
      } catch (e) {
        failed++;
        results.push({ fileId, status: "exception: " + (e as Error).message, name });
      }
    }

    return ok({ moved, skipped, failed, results });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
