/**
 * ILP Academy 2026 — Google Form Generator (Apps Script Web App)
 * =============================================================================
 * Endpoint ini menerima definisi pertanyaan dari aplikasi ILP Academy lalu
 * MEMBUAT GOOGLE FORM SUNGGUHAN secara otomatis, beserta Spreadsheet respons,
 * dan mengembalikan URL form (publik), URL edit, serta ID spreadsheet.
 *
 * CARA DEPLOY (sekali saja):
 *   1. Buka https://script.google.com  ->  New project.
 *   2. Hapus isi default, tempel SELURUH berkas ini, simpan.
 *   3. Deploy  ->  New deployment  ->  pilih tipe "Web app".
 *        - Execute as           : Me (akun Google Anda)
 *        - Who has access       : Anyone
 *   4. Salin "Web app URL" (diakhiri /exec).
 *   5. Tempel URL itu di aplikasi ILP Academy: halaman Form Builder ->
 *      "Atur koneksi Google" -> simpan. (Tersimpan di perangkat Anda.)
 *
 * Setelah itu, setiap kali admin membuat form bertipe "Google Form (otomatis)",
 * form akan langsung dibuat di akun Google Anda.
 *
 * Payload yang dikirim aplikasi (JSON, sebagai text/plain):
 *   { "title": string, "description": string, "type": string,
 *     "fields": [ { "type": "text|textarea|radio|checkbox|select|rating|file",
 *                   "label": string, "options": string[], "required": bool } ] }
 */

function doPost(e) {
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var title = (data.title || "Formulir ILP Academy").toString();
    var form = FormApp.create(title);
    if (data.description) form.setDescription(data.description.toString());
    form.setCollectEmail(true);

    var fields = Array.isArray(data.fields) ? data.fields : [];
    fields.forEach(function (f) {
      var label = (f.label || "Pertanyaan").toString();
      var options = (Array.isArray(f.options) ? f.options : []).map(String).filter(function (s) { return s.length; });
      var required = !!f.required;
      var item;
      switch (f.type) {
        case "textarea":
          item = form.addParagraphTextItem().setTitle(label); break;
        case "radio":
          item = form.addMultipleChoiceItem().setTitle(label);
          if (options.length) item.setChoiceValues(options);
          break;
        case "checkbox":
          item = form.addCheckboxItem().setTitle(label);
          if (options.length) item.setChoiceValues(options);
          break;
        case "select":
          item = form.addListItem().setTitle(label);
          if (options.length) item.setChoiceValues(options);
          break;
        case "rating":
          item = form.addScaleItem().setTitle(label).setBounds(1, 5);
          break;
        case "file":
          // File upload di Google Forms butuh konfigurasi Drive khusus,
          // jadi diganti isian tautan agar selalu berfungsi.
          item = form.addTextItem().setTitle(label + " (tempel tautan berkas)");
          break;
        default:
          item = form.addTextItem().setTitle(label);
      }
      if (item && item.setRequired) item.setRequired(required);
    });

    // Spreadsheet respons
    var sheetId = null;
    try {
      var ss = SpreadsheetApp.create("Respons - " + title);
      form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
      sheetId = ss.getId();
    } catch (errSheet) {
      sheetId = null; // tetap lanjut walau gagal membuat sheet
    }

    var out = {
      ok: true,
      formId: form.getId(),
      editUrl: form.getEditUrl(),
      publishedUrl: form.getPublishedUrl(),
      sheetId: sheetId,
    };
    return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err && err.message || err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: "ILP Academy Google Form Generator", method: "POST" }))
    .setMimeType(ContentService.MimeType.JSON);
}
