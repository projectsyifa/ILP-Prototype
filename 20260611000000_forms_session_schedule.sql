/**
 * Edge Function: google-form-responses
 * Mengambil semua respons dari Google Form via Forms API.
 *
 * GET ?formId=xxx
 * Returns: { ok, formId, totalResponses, headers: [...], rows: [[...], ...] }
 */

import { getGoogleAccessToken } from "../_shared/google-auth.ts";
import { corsHeaders, ok, err } from "../_shared/cors.ts";

const FORMS_API = "https://forms.googleapis.com/v1/forms";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const formId = url.searchParams.get("formId");
    if (!formId) return err("formId wajib disertakan.");

    const token = await getGoogleAccessToken([
      "https://www.googleapis.com/auth/forms.responses.readonly",
      "https://www.googleapis.com/auth/forms.body.readonly",
    ]);

    const authH = { "Authorization": `Bearer ${token}` };

    // Fetch form schema (to get question labels in order)
    const [schemaRes, respRes] = await Promise.all([
      fetch(`${FORMS_API}/${formId}`, { headers: authH }),
      fetch(`${FORMS_API}/${formId}/responses?pageSize=1000`, { headers: authH }),
    ]);

    const schema = await schemaRes.json();
    if (schema.error) throw new Error("Form tidak ditemukan atau tidak dapat diakses: " + schema.error.message);

    const respData = await respRes.json();
    if (respData.error) throw new Error("Gagal mengambil respons: " + respData.error.message);

    // Build ordered question list from schema
    const questions: { id: string; title: string }[] = [];
    (schema.items || []).forEach((item: { itemId?: string; questionItem?: { question?: { questionId: string } }; title?: string }) => {
      if (item.questionItem?.question?.questionId) {
        questions.push({ id: item.questionItem.question.questionId, title: item.title || "" });
      }
    });

    const responses = respData.responses || [];
    const headers = ["Timestamp", ...questions.map((q) => q.title)];

    const rows = responses.map((r: { createTime?: string; answers?: Record<string, { textAnswers?: { answers?: { value: string }[] }; grade?: unknown }> }) => {
      const ts = r.createTime ? new Date(r.createTime).toLocaleString("id-ID") : "";
      const cells = questions.map((q) => {
        const ans = r.answers?.[q.id];
        if (!ans) return "";
        const texts = ans.textAnswers?.answers?.map((a) => a.value) || [];
        return texts.join(", ");
      });
      return [ts, ...cells];
    });

    return ok({ formId, totalResponses: responses.length, headers, rows });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
