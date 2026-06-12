/**
 * Edge Function: google-form-schema
 * Fetch Google Form structure by scraping the public viewform HTML.
 * No OAuth needed — works on any published Google Form.
 * GET ?formId=xxx
 */

import { corsHeaders, ok, err } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const formId = url.searchParams.get("formId");
    if (!formId) return err("formId wajib diisi.");

    // Fetch the public form page — Google embeds all question data in a JSON blob
    const viewUrl = `https://docs.google.com/forms/d/${formId}/viewform`;
    const res = await fetch(viewUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) throw new Error(`Google Forms returned ${res.status} for form ${formId}`);

    const html = await res.text();

    // Google Forms embeds all form data as FB_PUBLIC_LOAD_DATA_ = [...];
    // Use indexOf + bracket-balancing instead of regex to handle large nested JSON.
    const marker = "FB_PUBLIC_LOAD_DATA_ = ";
    const markerIdx = html.indexOf(marker);
    if (markerIdx === -1) throw new Error("Tidak dapat menemukan data form. Pastikan form sudah dipublikasikan dan bisa diakses publik.");

    const start = html.indexOf("[", markerIdx + marker.length);
    if (start === -1) throw new Error("Data form tidak valid.");

    // Walk brackets to find the matching closing bracket
    let depth = 0, end = start;
    for (; end < html.length; end++) {
      if (html[end] === "[") depth++;
      else if (html[end] === "]") { depth--; if (depth === 0) break; }
    }
    const jsonStr = html.slice(start, end + 1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = JSON.parse(jsonStr);

    // Form items can be at data[1][1] or data[1][0][1] depending on form version
    let rawItems = data?.[1]?.[1];
    if (!Array.isArray(rawItems) || !rawItems.length) rawItems = data?.[1]?.[0]?.[1];
    if (!Array.isArray(rawItems) || !rawItems.length) rawItems = data?.[0]?.[1];
    if (!Array.isArray(rawItems)) throw new Error("Struktur data form tidak dikenali. Data: " + JSON.stringify(data).slice(0, 200));

    const formTitle = String(data?.[1]?.[8] || data?.[1]?.[3] || "");
    const formDesc  = String(data?.[1]?.[0] || "");

    const items = [];
    for (const raw of rawItems) {
      // raw[0] = item ID, raw[1] = title, raw[2] = description(?), raw[3] = type marker
      // raw[4] = question data array
      if (!Array.isArray(raw) || !raw[4]) continue;

      const title = raw[1] as string;
      const description = (raw[2] as string) || "";
      const questionData = raw[4][0]; // first question in this item
      if (!Array.isArray(questionData)) continue;

      const questionId = String(questionData[0]); // numeric entry ID
      const required   = questionData[2] === 1;
      const typeCode   = questionData[3]; // 0=text, 1=checkbox, 2=radio, 3=dropdown, 4=scale, 5=grid, 7=date, 8=time, 9=textarea

      let type = "text";
      let options: string[] = [];

      if (typeCode === 0) {
        type = "text";
      } else if (typeCode === 9) {
        type = "textarea";
      } else if (typeCode === 2) {
        type = "radio";
        options = (questionData[1] || []).map((o: unknown[]) => String(o[0]));
      } else if (typeCode === 1) {
        type = "checkbox";
        options = (questionData[1] || []).map((o: unknown[]) => String(o[0]));
      } else if (typeCode === 3) {
        type = "dropdown";
        options = (questionData[1] || []).map((o: unknown[]) => String(o[0]));
      } else if (typeCode === 4) {
        type = "rating";
        // Scale: questionData[1][0] = low, questionData[1][1] = high, questionData[3] = lowLabel, questionData[4] = highLabel
        const low      = questionData[1]?.[0] ?? 1;
        const high     = questionData[1]?.[1] ?? 5;
        const lowLabel  = questionData[3] || "";
        const highLabel = questionData[4] || "";
        options = [String(low), String(high), String(lowLabel), String(highLabel)];
      } else if (typeCode === 7) {
        type = "date";
      } else if (typeCode === 8) {
        type = "time";
      }

      if (!questionId || questionId === "undefined") continue;

      items.push({ questionId, title, description, required, type, options });
    }

    if (!items.length) throw new Error("Form tidak memiliki pertanyaan yang dapat dibaca.");

    // DEBUG: include raw structure of first few items to diagnose wrong entry ID
    const rawDebug = rawItems.slice(0, 8).map((r: unknown[]) => ({
      title: r[1],
      raw4_0: Array.isArray(r[4]) ? r[4][0] : r[4],
    }));

    return ok({
      formId,
      title: formTitle,
      description: formDesc,
      publishedUrl: viewUrl,
      editUrl: `https://docs.google.com/forms/d/${formId}/edit`,
      items,
      rawDebug,
    });
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
