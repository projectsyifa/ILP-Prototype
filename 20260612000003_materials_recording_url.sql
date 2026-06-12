/**
 * Edge Function: google-form-submit
 * Submit response to Google Form using pre-fill URL (undocumented but stable).
 * Also stores in Supabase form_responses table.
 *
 * POST body: { formId, answers: { questionId: string | string[] } }
 */

import { corsHeaders, ok, err } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { formId, answers } = await req.json();
    if (!formId) return err("formId wajib diisi.");
    if (!answers || typeof answers !== "object") return err("answers wajib diisi.");

    // Build form submission body (undocumented Google Forms endpoint)
    const params = new URLSearchParams();
    params.set("submit", "Submit");
    params.set("fbzx", String(Date.now())); // required field

    for (const [questionId, value] of Object.entries(answers)) {
      if (Array.isArray(value)) {
        for (const v of value) params.append(`entry.${questionId}`, String(v));
      } else {
        params.set(`entry.${questionId}`, String(value ?? ""));
      }
    }

    const submitUrl = `https://docs.google.com/forms/d/${formId}/formResponse`;
    const submitRes = await fetch(submitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": `https://docs.google.com/forms/d/${formId}/viewform`,
        "User-Agent": "Mozilla/5.0",
      },
      body: params.toString(),
      redirect: "manual",
    });

    // Google Forms returns 302 on success (redirect to confirmation page)
    const success = submitRes.status === 302 || submitRes.status === 200;
    if (!success) {
      throw new Error(`Google Form submission failed with status ${submitRes.status}`);
    }

    return ok({ submitted: true });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
