/**
 * Edge Function: google-drive-setup
 * Auto-create the full ILP Academy folder hierarchy in Google Drive.
 * Idempotent — safe to call multiple times (finds existing, doesn't duplicate).
 *
 * POST {} → { ok, folders: { root, materi, tugas, formulir, ... } }
 */

import { getGoogleAccessToken } from "../_shared/google-auth.ts";
import { corsHeaders, ok, err } from "../_shared/cors.ts";

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

/** Find or create a Drive folder by name inside a parent (or root). Returns folder ID. */
async function ensureFolder(token: string, name: string, parentId?: string): Promise<string> {
  const inParent = parentId
    ? `and '${parentId}' in parents`
    : `and 'root' in parents`;
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false ${inParent}`;
  const searchRes = await fetch(
    `${DRIVE_API}?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const searchData = await searchRes.json();
  if (searchData.files?.length > 0) return searchData.files[0].id as string;

  const meta: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) meta.parents = [parentId];

  const createRes = await fetch(`${DRIVE_API}?fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(meta),
  });
  const created = await createRes.json();
  if (!created.id) throw new Error("Gagal membuat folder: " + JSON.stringify(created));
  return created.id as string;
}

/** Make a folder publicly visible (anyone with link can view its contents) */
async function shareFolder(token: string, folderId: string) {
  await fetch(`${DRIVE_API}/${folderId}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = await getGoogleAccessToken([
      "https://www.googleapis.com/auth/drive.file",
    ]);

    // ── Root ──────────────────────────────────────────────────────────────
    const rootId = await ensureFolder(token, "ILP Academy 2026");

    // ── Level-1 sub-folders ───────────────────────────────────────────────
    const [
      materiId,
      tugasId,
      formulirId,
      pesertaId,
      laporanId,
    ] = await Promise.all([
      ensureFolder(token, "Materi", rootId),
      ensureFolder(token, "Tugas", rootId),
      ensureFolder(token, "Formulir", rootId),
      ensureFolder(token, "Data Peserta", rootId),
      ensureFolder(token, "Laporan", rootId),
    ]);

    // Return folder IDs so the app can cache them (optional)
    return ok({
      folders: {
        root:     { id: rootId,     name: "ILP Academy 2026" },
        materi:   { id: materiId,   name: "Materi" },
        tugas:    { id: tugasId,    name: "Tugas" },
        formulir: { id: formulirId, name: "Formulir" },
        peserta:  { id: pesertaId,  name: "Data Peserta" },
        laporan:  { id: laporanId,  name: "Laporan" },
      },
      driveUrl: `https://drive.google.com/drive/folders/${rootId}`,
    });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
