/**
 * Edge Function: google-form-create
 * Membuat Google Form baru dengan pertanyaan via Google Forms API,
 * lalu return publishedUrl, editUrl, formId.
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
      "https://www.googleapis.com/auth/drive.file",
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

    if (description) {
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

    // 4. Move to Drive folder if specified
    if (folderId) {
      await fetch(`${DRIVE_API}/files/${formId}?addParents=${folderId}&fields=id`, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${token}` },
      });
    }

    // 5. Set response collection (Google Form auto-creates a linked Sheet)
    // Enable collecting email addresses for tracking (optional, can skip)

    const publishedUrl = `https://docs.google.com/forms/d/${formId}/viewform`;
    const editUrl = `https://docs.google.com/forms/d/${formId}/edit`;

    // 6. Fetch form to get question IDs (for prefill entry mapping)
    const formRes = await fetch(`https://forms.googleapis.com/v1/forms/${formId}`, {
      headers: authH,
    });
    const formData = await formRes.json();
    // Map field label → questionId
    const questionIds: Record<string, string> = {};
    for (const item of (formData.items || [])) {
      const qId = item.questionItem?.question?.questionId;
      if (item.title && qId) questionIds[item.title] = qId;
    }

    return ok({ formId, publishedUrl, editUrl, questionIds });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
