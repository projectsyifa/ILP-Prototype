/**
 * Edge Function: google-drive-upload
 * Upload file ke Google Drive dengan auto-create folder hierarchy.
 *
 * POST multipart/form-data:
 *   file: File
 *   filename?: string
 *   folderPath?: JSON array e.g. '["ILP Academy 2026","Materi"]' — auto-creates if missing
 *   folderId?: string — fallback direct folder ID
 * Returns: { ok, fileId, fileName, webViewLink, downloadUrl, mimeType, size }
 */

import { getGoogleAccessToken } from "../_shared/google-auth.ts";
import { corsHeaders, ok, err } from "../_shared/cors.ts";

const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,webContentLink";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

/** Find or create a folder by name inside a given parent (or root). Returns folder ID. */
async function ensureFolder(token: string, name: string, parentId?: string): Promise<string> {
  const inParent = parentId ? `and '${parentId}' in parents` : `and 'root' in parents`;
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false ${inParent}`;
  const searchRes = await fetch(`${DRIVE_API}?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  const searchData = await searchRes.json();
  if (searchData.files?.length > 0) return searchData.files[0].id as string;

  const meta: Record<string, unknown> = { name, mimeType: "application/vnd.google-apps.folder" };
  if (parentId) meta.parents = [parentId];
  const createRes = await fetch(`${DRIVE_API}?fields=id`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(meta),
  });
  const created = await createRes.json();
  if (!created.id) throw new Error("Gagal membuat folder: " + JSON.stringify(created));
  return created.id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = await getGoogleAccessToken([
      "https://www.googleapis.com/auth/drive",
    ]);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return err("File wajib disertakan.");

    const fileName = (formData.get("filename") as string | null) || file.name || "upload";
    let folderId = formData.get("folderId") as string | null;

    // Auto-create folder hierarchy from path array
    const folderPathRaw = formData.get("folderPath") as string | null;
    if (folderPathRaw) {
      const parts: string[] = JSON.parse(folderPathRaw);
      let parentId: string | undefined = undefined;
      for (const part of parts) {
        parentId = await ensureFolder(token, part, parentId);
      }
      folderId = parentId || folderId;
    }

    const fileBytes = await file.arrayBuffer();

    // Build multipart body
    const metadata: Record<string, unknown> = { name: fileName, mimeType: file.type || "application/octet-stream" };
    if (folderId) metadata.parents = [folderId];

    const boundary = "ILPBOUNDARY" + Date.now();
    const metaStr = JSON.stringify(metadata);

    // Manually build multipart body as Uint8Array
    const enc = new TextEncoder();
    const parts: Uint8Array[] = [
      enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaStr}\r\n`),
      enc.encode(`--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`),
      new Uint8Array(fileBytes),
      enc.encode(`\r\n--${boundary}--`),
    ];
    const totalLen = parts.reduce((a, p) => a + p.length, 0);
    const body = new Uint8Array(totalLen);
    let offset = 0;
    for (const p of parts) { body.set(p, offset); offset += p.length; }

    // Upload to Drive
    const uploadRes = await fetch(DRIVE_UPLOAD, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(totalLen),
      },
      body,
    });
    const uploaded = await uploadRes.json();
    if (!uploaded.id) throw new Error("Upload gagal: " + JSON.stringify(uploaded));

    const fileId = uploaded.id;

    // Make publicly readable (anyone with link can view)
    await fetch(`${DRIVE_API}/${fileId}/permissions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    });

    // Get final metadata with webViewLink
    const metaRes = await fetch(`${DRIVE_API}/${fileId}?fields=id,name,mimeType,size,webViewLink,webContentLink`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    const meta = await metaRes.json();

    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    const previewUrl = `https://drive.google.com/file/d/${fileId}/preview`;

    return ok({
      fileId,
      fileName: meta.name,
      mimeType: meta.mimeType,
      size: meta.size,
      webViewLink: meta.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
      downloadUrl,
      previewUrl,
    });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
