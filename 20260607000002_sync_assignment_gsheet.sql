/**
 * Edge Function: google-drive-setup
 * Auto-create the full ILP Academy folder hierarchy inside the existing
 * "ILP 2026" root folder in Google Drive.
 * Idempotent — safe to call multiple times (finds existing, doesn't duplicate).
 *
 * POST {} → { ok, folders: { root, materi, tugas, formulir, presensi, pretest,
 *                             posttest, tugasForm, laporanMandiri, feedback,
 *                             peserta, laporan } }
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
  // orderBy=createdTime so that, if duplicate same-named folders exist, every call
  // deterministically resolves to the SAME (oldest) folder. Without this, different
  // calls could pick different duplicates — the form gets organized into one folder
  // while the Drive breadcrumb navigates into another (file "in folder" but invisible).
  const searchRes = await fetch(
    `${DRIVE_API}?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)&orderBy=createdTime&pageSize=10`,
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

/** Move a file into a target folder (add parent, remove old parents) */
async function moveFile(token: string, fileId: string, targetFolderId: string) {
  // Get current parents first
  const metaRes = await fetch(`${DRIVE_API}/${fileId}?fields=parents`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meta = await metaRes.json();
  const oldParents = (meta.parents || []).join(",");

  await fetch(
    `${DRIVE_API}/${fileId}?addParents=${targetFolderId}&removeParents=${oldParents}&fields=id`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
}

/** Make a folder publicly visible (anyone with link can view) */
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
      "https://www.googleapis.com/auth/drive",
    ]);

    // ── Root: existing "ILP 2026" folder ──────────────────────────────────
    const rootId = await ensureFolder(token, "ILP 2026");

    // ── Level-1 sub-folders ───────────────────────────────────────────────
    const [
      formulirId,
      materiId,
      tugasPesertaId,
      pesertaId,
      laporanId,
    ] = await Promise.all([
      ensureFolder(token, "Formulir", rootId),
      ensureFolder(token, "Materi", rootId),
      ensureFolder(token, "Tugas Peserta", rootId),
      ensureFolder(token, "Data Peserta", rootId),
      ensureFolder(token, "Laporan & Analitik", rootId),
    ]);

    // ── Level-2: Formulir sub-folders ─────────────────────────────────────
    const [
      presensiId,
      pretestId,
      posttestId,
      tugasFormId,
      laporanMandiriId,
      feedbackId,
    ] = await Promise.all([
      ensureFolder(token, "Presensi", formulirId),
      ensureFolder(token, "Pretest", formulirId),
      ensureFolder(token, "Post Test", formulirId),
      ensureFolder(token, "Tugas", formulirId),
      ensureFolder(token, "Laporan Mandiri", formulirId),
      ensureFolder(token, "Feedback", formulirId),
    ]);

    return ok({
      folders: {
        root:           { id: rootId,          name: "ILP 2026" },
        formulir:       { id: formulirId,       name: "Formulir" },
        materi:         { id: materiId,         name: "Materi" },
        tugas:          { id: tugasPesertaId,   name: "Tugas Peserta" },
        peserta:        { id: pesertaId,        name: "Data Peserta" },
        laporan:        { id: laporanId,        name: "Laporan & Analitik" },
        presensi:       { id: presensiId,       name: "Presensi" },
        pretest:        { id: pretestId,        name: "Pretest" },
        posttest:       { id: posttestId,       name: "Post Test" },
        tugasForm:      { id: tugasFormId,      name: "Tugas" },
        laporanMandiri: { id: laporanMandiriId, name: "Laporan Mandiri" },
        feedback:       { id: feedbackId,       name: "Feedback" },
      },
      driveUrl: `https://drive.google.com/drive/folders/${rootId}`,
    });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
