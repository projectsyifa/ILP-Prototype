# Setup Google Integration — ILP Academy

Integrasi Google (Forms, Drive) menggunakan **OAuth 2.0 Refresh Token**.
Cocok untuk akun Gmail biasa — tidak perlu Google Workspace.

---

## Langkah 1 — Aktifkan APIs di Google Cloud Console

1. Buka https://console.cloud.google.com → pilih project Anda
2. Menu **APIs & Services → Library**, aktifkan:
   - **Google Forms API**
   - **Google Drive API**

---

## Langkah 2 — Buat OAuth 2.0 Client ID

1. Menu **APIs & Services → Credentials**
2. Klik **"+ Create Credentials" → "OAuth client ID"**
3. Jika diminta, setup **OAuth consent screen** dulu:
   - User Type: **External**
   - App name: `ILP Academy`
   - Support email: email Anda
   - Scopes: tambahkan `.../auth/forms.body` dan `.../auth/drive.file`
   - Test users: tambahkan email Google Anda sendiri
4. Kembali buat OAuth client ID:
   - Application type: **Web application**
   - Name: `ILP Backend`
   - Authorized redirect URIs: tambahkan `https://developers.google.com/oauthplayground`
5. Klik **Create** → catat **Client ID** dan **Client Secret**

---

## Langkah 3 — Ambil Refresh Token (via OAuth Playground)

1. Buka https://developers.google.com/oauthplayground
2. Klik ikon **gear** (Settings) di kanan atas
3. Centang **"Use your own OAuth credentials"**
4. Isi **Client ID** dan **Client Secret** dari langkah 2 → Close
5. Di panel kiri (Step 1), cari dan centang scope berikut:
   - `https://www.googleapis.com/auth/forms.body`
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/drive` *(untuk akses penuh Drive)*
6. Klik **"Authorize APIs"** → login dengan akun Google Anda → Allow
7. Di Step 2, klik **"Exchange authorization code for tokens"**
8. Salin nilai **Refresh token** yang muncul

---

## Langkah 4 — Simpan Secrets di Supabase

Buka **Supabase Dashboard → Settings → Edge Functions → Secrets**, tambahkan:

| Name | Value |
|------|-------|
| `GOOGLE_CLIENT_ID` | Client ID dari langkah 2 |
| `GOOGLE_CLIENT_SECRET` | Client Secret dari langkah 2 |
| `GOOGLE_REFRESH_TOKEN` | Refresh token dari langkah 3 |

> Hapus `GOOGLE_SERVICE_ACCOUNT_JSON` jika masih ada (tidak dipakai lagi).

---

## Langkah 5 — Deploy Edge Functions

```bash
supabase functions deploy google-form-create
supabase functions deploy google-form-responses
supabase functions deploy google-drive-upload
```

---

## Cara Kerja

- **Form dibuat** di Google Drive akun Anda sendiri (bukan service account)
- **Respons** dibaca via Google Forms API langsung ke web
- **File upload** (materi, tugas) diunggah ke Google Drive akun Anda
- Semua file di-share "anyone with link" — bisa diakses inline di web via iframe
