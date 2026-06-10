/**
 * Edge Function: google-form-schema
 * Fetch Google Form structure (questions, types, options) for inline rendering.
 * GET ?formId=xxx
 */

import { getGoogleAccessToken } from "../_shared/google-auth.ts";
import { corsHeaders, ok, err } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const formId = url.searchParams.get("formId");
    if (!formId) return err("formId wajib diisi.");

    const token = await getGoogleAccessToken();
    const res = await fetch(`https://forms.googleapis.com/v1/forms/${formId}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    const form = await res.json();
    if (form.error) throw new Error(form.error.message);

    const items = (form.items || []).map((item: Record<string, unknown>) => {
      const qi = item.questionItem as Record<string, unknown> | undefined;
      if (!qi) return null;
      const q = qi.question as Record<string, unknown>;
      const qId = q?.questionId as string;

      let type = "text";
      let options: string[] = [];

      if (q?.choiceQuestion) {
        const cq = q.choiceQuestion as Record<string, unknown>;
        type = cq.type === "CHECKBOX" ? "checkbox" : "radio";
        options = ((cq.options as Array<Record<string, string>>) || []).map((o) => o.value);
      } else if (q?.scaleQuestion) {
        type = "rating";
        const sq = q.scaleQuestion as Record<string, unknown>;
        options = [String(sq.low ?? 1), String(sq.high ?? 5), String(sq.lowLabel ?? ""), String(sq.highLabel ?? "")];
      } else if (q?.textQuestion) {
        const tq = q.textQuestion as Record<string, unknown>;
        type = tq.paragraph ? "textarea" : "text";
      } else if (q?.dateQuestion) {
        type = "date";
      } else if (q?.timeQuestion) {
        type = "time";
      }

      return {
        questionId: qId,
        title: item.title as string,
        description: (item.description as string) || "",
        required: (q?.required as boolean) || false,
        type,
        options,
      };
    }).filter(Boolean);

    return ok({
      formId: form.formId,
      title: form.info?.title,
      description: form.info?.description,
      publishedUrl: `https://docs.google.com/forms/d/${formId}/viewform`,
      editUrl: `https://docs.google.com/forms/d/${formId}/edit`,
      items,
    });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
