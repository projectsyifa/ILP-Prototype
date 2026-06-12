/**
 * Edge Function: google-form-create
 * Membuat Google Form baru dengan pertanyaan via Google Forms API,
 * lalu return publishedUrl, editUrl, formId, questionIds (numeric for prefill).
 *
 * POST body: { title, description?, fields: [{type, label, options?, required?}], folderId? }
 */

import { getGoogleAccessToken } from "../_shared/google-auth.ts";
import { corsHeaders, ok, err } from "../_shared/cors.ts";

const FORMS_API = "https://forms.googleapis.com/v1/forms";
const DRIVE_API = "https://www.googleapis.com/drive/v3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { title, description, fields = [], folderId } = await req.json();
    if (!title) return err("Judul form wajib diisi.");
    if (!fields.length) return err("Tambahkan minimal satu pertanyaan.");

    const token = await getGoogleAccessToken([
      "https://www.googleapis.com/auth/forms.body",
      "https://www.googleapis.com/auth/drive",
    ]);

    const authH = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };

    // 1. Create blank form
    const createRes = await fetch(FORMS_API, {
      method: "POST",
      headers: authH,
      body: JSON.stringify({ info: { title, documentTitle: title } }),
    });
    const created = await createRes.json();
    if (!created.formId) {
      throw new Error(`Google Forms API error (${createRes.status}): ${created?.error?.message || JSON.stringify(created)}`);
    }
    const formId = created.formId;

    // 2. Build batchUpdate requests: description + questions
    const requests: unknown[] = [];
    const hasDescription = !!description;

    if (hasDescription) {
      requests.push({
        updateFormInfo: { info: { description }, updateMask: "description" },
      });
    }

    fields.forEach((fld: { type: string; label: string; options?: string[]; required?: boolean }, i: number) => {
      const question: Record<string, unknown> = { required: fld.required ?? false };

      if (fld.type === "radio" || fld.type === "select") {
        question.choiceQuestion = {
          type: "RADIO",
          options: (fld.options || []).map((o: string) => ({ value: o })),
        };
      } else if (fld.type === "checkbox") {
        question.choiceQuestion = {
          type: "CHECKBOX",
          options: (fld.options || []).map((o: string) => ({ value: o })),
        };
      } else if (fld.type === "rating") {
        question.scaleQuestion = { low: 1, high: 5, lowLabel: "Sangat Buruk", highLabel: "Sangat Baik" };
      } else if (fld.type === "textarea") {
        question.textQuestion = { paragraph: true };
      } else {
        question.textQuestion = { paragraph: false };
      }

      requests.push({
        createItem: {
          item: { title: fld.label, questionItem: { question } },
          location: { index: i },
        },
      });
    });

    // 3. Apply questions
    const batchRes = await fetch(`${FORMS_API}/${formId}:batchUpdate`, {
      method: "POST",
      headers: authH,
      body: JSON.stringify({ requests }),
    });
    const batchData = await batchRes.json();
    if (batchData.error) throw new Error("Gagal menambah pertanyaan: " + batchData.error.message);

    // 4. Share form publicly (anyone with link can view) so google-form-schema can scrape it
    await fetch(`${DRIVE_API}/files/${formId}/permissions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    });

    // 5. Move to Drive folder if specified (remove from root, add to target)
    if (folderId) {
      try {
        const metaRes = await fetch(`${DRIVE_API}/${formId}?fields=parents`, {
          headers: { "Authorization": `Bearer ${token}` },
        });
        const meta = await metaRes.json();
        const oldParents = ((meta.parents as string[]) || []).join(",");
        await fetch(
          `${DRIVE_API}/${formId}?addParents=${folderId}${oldParents ? `&removeParents=${oldParents}` : ""}&fields=id`,
          { method: "PATCH", headers: { "Authorization": `Bearer ${token}` } }
        );
      } catch (_) { /* non-fatal — organize job will retry */ }
    }

    const publishedUrl = `https://docs.google.com/forms/d/${formId}/viewform`;
    const editUrl = `https://docs.google.com/forms/d/${formId}/edit`;

    // 5. Extract questionIds from batchUpdate replies — most reliable method.
    //    Google Forms API returns questionId as hex (e.g. "1e644aad").
    //    Prefill URLs require the DECIMAL equivalent (e.g. "509889197") as entry.509889197.
    const hexToDec = (h: string): string =>
      /^[0-9a-f]+$/i.test(h) && !/^\d+$/.test(h) ? parseInt(h, 16).toString() : h;

    const questionIds: Record<string, string> = {};
    const replies: unknown[] = batchData.replies || [];
    // replies are positionally aligned with requests; skip updateFormInfo reply if present
    let replyIdx = hasDescription ? 1 : 0;
    for (const fld of (fields as { label: string }[])) {
      const reply = replies[replyIdx++] as { createItem?: { questionId?: string[] } } | undefined;
      const qId = reply?.createItem?.questionId?.[0];
      if (qId) questionIds[fld.label] = hexToDec(qId);
    }
    console.error("[FormCreate] questionIds from batchUpdate (decimal):", JSON.stringify(questionIds));

    // 6. Also try re-fetching the form for cross-check (non-fatal)
    const apiQuestionIds: Record<string, string> = {};
    try {
      const formRes = await fetch(`${FORMS_API}/${formId}`, { headers: authH });
      const formData = await formRes.json();
      console.error("[FormCreate] formData items sample:", JSON.stringify((formData.items || []).slice(0, 2)));
      for (const item of (formData.items || [])) {
        const qId = item.questionItem?.question?.questionId;
        if (item.title && qId) apiQuestionIds[item.title] = hexToDec(qId);
      }
    } catch (_) { /* non-fatal */ }
    console.error("[FormCreate] apiQuestionIds:", JSON.stringify(apiQuestionIds));

    // 7. Fetch published form HTML to extract numeric entry IDs as extra verification.
    //    If questionIds from step 5 are already numeric (9-10 digits), entryIdMap will match.
    const entryIdMap: Record<string, string> = {};
    try {
      await new Promise(r => setTimeout(r, 2000));

      // Try with auth token first (form may be restricted to service account domain)
      let viewRes = await fetch(publishedUrl, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      });
      // If auth caused redirect/error, try without auth
      if (!viewRes.ok || viewRes.url.includes("accounts.google.com")) {
        viewRes = await fetch(publishedUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml",
          },
          redirect: "follow",
        });
      }

      const html = await viewRes.text();
      console.error("[FormCreate] viewform status:", viewRes.status, "html length:", html.length, "snippet:", html.slice(0, 300));

      // Strategy 1: name="entry.XXXXXXXX" in input elements
      const byName: string[] = [];
      const seenName = new Set<string>();
      const nameRegex = /name="entry\.(\d+)"/g;
      let nm: RegExpExecArray | null;
      while ((nm = nameRegex.exec(html)) !== null) {
        if (!seenName.has(nm[1])) { byName.push(nm[1]); seenName.add(nm[1]); }
      }

      // Strategy 2: FB_PUBLIC_LOAD_DATA_ — look for entry ID arrays [DIGIT{9,10},0|1,null,null,0|1]
      const byStruct: string[] = [];
      const seenStruct = new Set<string>();
      const structRegex = /\[(\d{9,10}),\s*[01],\s*null(?:,\s*null)?,\s*[01]\]/g;
      let sm: RegExpExecArray | null;
      while ((sm = structRegex.exec(html)) !== null) {
        if (!seenStruct.has(sm[1])) { byStruct.push(sm[1]); seenStruct.add(sm[1]); }
      }

      // Strategy 3: any 9-10 digit number sequences near "entry" keyword
      const byEntry: string[] = [];
      const seenEntry = new Set<string>();
      const entryRegex = /entry[._](\d{9,10})/g;
      let em: RegExpExecArray | null;
      while ((em = entryRegex.exec(html)) !== null) {
        if (!seenEntry.has(em[1])) { byEntry.push(em[1]); seenEntry.add(em[1]); }
      }

      console.error("[FormCreate] HTML entry IDs — byName:", byName, "byStruct:", byStruct, "byEntry:", byEntry);

      const entryIds = byName.length >= fields.length ? byName
                     : byEntry.length >= fields.length ? byEntry
                     : byStruct.length >= fields.length ? byStruct
                     : byName.length > 0 ? byName
                     : byEntry.length > 0 ? byEntry
                     : byStruct;

      (fields as { label: string }[]).forEach((fld, i) => {
        if (entryIds[i]) entryIdMap[fld.label] = entryIds[i];
      });
    } catch (htmlErr) {
      console.error("[FormCreate] HTML fetch failed:", (htmlErr as Error).message);
    }

    console.error("[FormCreate] final entryIdMap:", JSON.stringify(entryIdMap));

    // Merge: prefer HTML entryIdMap if available, otherwise use batchUpdate questionIds
    // (batchUpdate questionIds ARE numeric and work for prefill if questionId format is decimal)
    const finalIds = Object.keys(entryIdMap).length > 0 ? entryIdMap : questionIds;
    console.error("[FormCreate] finalIds (used for prefill):", JSON.stringify(finalIds));

    return ok({ formId, publishedUrl, editUrl, questionIds: finalIds, entryIdMap });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
