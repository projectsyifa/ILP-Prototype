# ILP Academy 2026 — Learning Management System

Aplikasi LMS untuk program ILP Academy 2026. Dibangun sebagai Single Page
Application dengan **Vanilla JavaScript** (tanpa framework) dan **Supabase**
(Postgres + Auth + Storage) sebagai backend. Tidak ada proses build yang rumit:
seluruh berkas `.html`, `.css`, dan `.js` dilayani apa adanya, sehingga mudah
di-deploy ke GitHub Pages atau hosting statis mana pun.

Versi ini merupakan perombakan menyeluruh dari sisi UI/UX: sistem desain baru
berbasis font Plus Jakarta Sans dan palet biru Paragon, seluruh ikon memakai
SVG inline (tanpa emoji), serta penambahan fitur pencarian global, notifikasi,
halaman profil, dashboard analytics, dan form builder.

## Fitur

- **Dua peran**: Administrator dan Peserta, dengan navigasi serta hak akses berbeda.
- **Dashboard peserta**: ringkasan progres, aksi cepat, jadwal sesi (sedang berlangsung / akan datang / riwayat), dan feed aktivitas terbaru.
- **Dashboard admin**: KPI dengan indikator tren, grafik kehadiran dan status peserta, daftar peserta terbaru, tugas yang belum dinilai, serta tabel monitoring per sesi.
- **Analytics**: tren kehadiran per sesi, distribusi nilai, rata-rata nilai per training, corong keterlibatan, papan peringkat, insight otomatis, dan ekspor CSV.
- **Form Builder**: membuat formulir internal (pilihan ganda, isian, rating, dll.) atau menyematkan Google Form; melihat respons dalam tabel dan mengekspornya ke CSV.
- **Manajemen training, materi, tugas, submission, dan kehadiran** lengkap dengan unggah berkas dan penilaian.
- **Pencarian global** (tekan `Ctrl`/`Cmd` + `K`), **notifikasi**, dan **halaman profil** (informasi, keamanan, aktivitas).
- **Mobile friendly**: peserta mendapat navigasi bawah saat diakses dari ponsel.
- **PWA**: service worker untuk caching aset statis.

## Teknologi

- Vanilla JS (SPA berbasis hash routing), HTML, CSS.
- Supabase: Postgres, Auth, Row Level Security, Storage, Edge Functions.
- Chart.js (via CDN) untuk visualisasi data.
- Node.js (hanya untuk skrip migrasi `pg`).

## Struktur Folder

```
app.html                     Shell SPA (dimuat untuk semua halaman internal)
index.html                   Landing page
login.html / set-password.html
assets/
  auth.js                    Init Supabase, auth, ikon SVG, shell, modal, toast
  app.css                    Layout shell & komponen dasar
  style.css                  Token & komponen global
  ui.css                     Sistem desain 2026 (dimuat paling akhir)
  landing.css
scripts/
  main.js                    Seluruh logika halaman & fitur
  migrate.mjs                Runner migrasi database otomatis
supabase/
  schema.sql                 Skema lengkap (idempotent)
  migrations/0001_init.sql   Salinan skema untuk runner migrasi
  functions/generate-invite-links/  Edge function (Deno)
google-apps-script/
  Code.gs                    Web App pembuat Google Form otomatis
.github/workflows/
  migrate.yml                Migrasi otomatis saat push
  deploy.yml                 Deploy otomatis ke GitHub Pages
sw.js                        Service worker
```

## Persiapan Supabase

1. Buat project di [supabase.com](https://supabase.com).
2. Terapkan skema database dengan salah satu cara berikut:
   - **Cara cepat (manual)**: buka SQL Editor di dashboard Supabase, salin seluruh isi `supabase/schema.sql`, lalu jalankan. Skema bersifat idempotent sehingga aman dijalankan berulang kali.
   - **Cara otomatis**: lihat bagian [Migrasi Otomatis](#migrasi-otomatis) di bawah.
3. Skema akan otomatis membuat tabel, kebijakan Row Level Security, trigger pembuatan profil saat user baru mendaftar, serta bucket Storage (`materials`, `submissions`, `avatars`).
4. **Menjadikan akun pertama sebagai admin.** Daftarkan satu user melalui aplikasi, lalu jalankan SQL berikut di Supabase (ganti emailnya):

   ```sql
   update public.profiles
   set role = 'admin'
   where email = 'email-anda@contoh.com';
   ```

## Menjalankan Secara Lokal

Karena ini situs statis, Anda cukup melayaninya dengan server statis apa pun.

```bash
npm install        # opsional, hanya diperlukan untuk migrasi
npm run dev        # menjalankan server di http://localhost:5500
```

Atau gunakan ekstensi seperti "Live Server", atau perintah `python3 -m http.server`.

## Migrasi Otomatis

Skrip `scripts/migrate.mjs` menerapkan setiap berkas `.sql` di
`supabase/migrations` secara berurutan ke database Supabase Anda.

**Secara lokal:**

```bash
npm install
export SUPABASE_DB_URL="postgresql://postgres:KATA-SANDI-DB@db.REF-PROJECT.supabase.co:5432/postgres"
npm run migrate
```

String koneksi dapat ditemukan di Supabase: **Project Settings → Database →
Connection string → URI**. Lihat juga `.env.example`.

**Otomatis di GitHub Actions:** workflow `.github/workflows/migrate.yml` akan
menjalankan migrasi setiap kali Anda push perubahan pada `supabase/migrations`
atau `supabase/schema.sql`. Tambahkan repository secret bernama
`SUPABASE_DB_URL` berisi string koneksi di atas (**Repo → Settings → Secrets and
variables → Actions → New repository secret**).

Untuk menambah perubahan skema di masa depan, buat berkas baru di
`supabase/migrations` (mis. `0002_tambah_kolom.sql`) berisi SQL yang idempotent;
runner akan menjalankannya sesuai urutan nama berkas.

## Deploy ke GitHub Pages

1. Push repository ini ke GitHub.
2. Aktifkan Pages sekali saja: **Repo → Settings → Pages → Source = "GitHub Actions"**.
3. Setiap push ke branch `main` akan otomatis men-deploy situs melalui workflow `.github/workflows/deploy.yml`.

Berkas `.nojekyll` sudah disertakan agar folder `assets/` dan `scripts/`
dilayani apa adanya tanpa diproses Jekyll.

## Mengganti Kredensial Supabase

URL project dan anon key tertanam di `assets/auth.js` (nilai bawaan mengarah ke
project yang sudah ada). Untuk menggantinya tanpa mengubah kode, definisikan
`window.ILP_CONFIG` **sebelum** `auth.js` dimuat, misalnya di `app.html`:

```html
<script>
  window.ILP_CONFIG = {
    SUPABASE_URL: "https://PROJECT-ANDA.supabase.co",
    SUPABASE_ANON_KEY: "anon-key-anda",
  };
</script>
```

Atau cukup ubah nilai konstanta `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di bagian
atas `assets/auth.js`. Anon key memang aman ditaruh di sisi klien — keamanan
data dijaga oleh kebijakan Row Level Security di database.

## Edge Function (Tautan Undangan)

Folder `supabase/functions/generate-invite-links` berisi edge function (Deno)
untuk membuat tautan undangan massal. Deploy menggunakan Supabase CLI:

```bash
supabase functions deploy generate-invite-links
```

Function ini memerlukan environment variable `SUPABASE_SERVICE_ROLE_KEY` yang
dikonfigurasi melalui Supabase CLI/Dashboard. Tanpa men-deploy function ini,
seluruh fitur lain tetap berfungsi normal.

## Google Form Otomatis (Form Builder)

Form Builder kini berupa **halaman penuh** (bukan popup). Saat membuat form, admin
memilih **Jenis Form**:

- **Form Internal** — pertanyaan & jawaban tersimpan di sistem ini (tabel
  `forms` dan `form_responses`), dengan ekspor CSV. Cocok untuk pretest/posttest.
- **Google Form** — dengan dua metode: *Buat Otomatis* (membuat Google Form
  sungguhan dari pertanyaan yang Anda susun) atau *Tempel URL* (menautkan form
  yang sudah ada).

Untuk mengaktifkan pembuatan **otomatis**, deploy skrip Google sekali saja:

1. Buka <https://script.google.com> → **New project**.
2. Hapus isi default, tempel seluruh isi `google-apps-script/Code.gs`, simpan.
3. **Deploy → New deployment → Web app**. Setel **Execute as: Me** dan
   **Who has access: Anyone**. Salin **Web app URL** (diakhiri `/exec`).
4. Di aplikasi: buka **Form Builder → Buat Form → Google Form → Buat Otomatis →
   Atur Koneksi**, tempel URL `/exec`, lalu **Simpan**. URL tersimpan di
   perangkat Anda (atau setel global melalui `window.ILP_CONFIG.GFORM_SCRIPT_URL`).

Setelah terhubung, setiap form Google yang dibuat otomatis akan langsung muncul
di akun Google Anda lengkap dengan Spreadsheet respons. Aplikasi menyimpan URL
publik, URL edit (`gform_edit_url`), dan ID spreadsheet pada tabel `forms`.
Respons Google Form tetap berada di Google dan ditampilkan sebagai tautan.

> Catatan: kolom `gform_edit_url` ditambahkan ke tabel `forms`. Skema bersifat
> idempotent, jadi cukup jalankan ulang migrasi (`npm run migrate`) untuk
> menambahkannya pada database yang sudah ada.

## Catatan

- Seluruh antarmuka memakai ikon SVG inline; tidak ada emoji di mana pun.
- Halaman **Beranda peserta** dirancang ringkas tanpa banner: satu kartu fokus
  yang langsung mengarahkan ke aktivitas yang sedang berlangsung / akan dimulai /
  tugas terdekat, pil statistik, dan tombol aksi cepat.
- Penilaian tugas menyimpan nilai numerik (0–100) yang dipakai oleh papan peringkat dan analytics.
- Formulir internal di Form Builder dapat diisi langsung melalui tombol "Isi" untuk pengujian; respons tersimpan di tabel `form_responses`. Form bertipe Google Form menyimpan respons di Google sehingga ditampilkan sebagai tautan.
- Pengiriman berkas (materi/tugas) memakai pola unggah ke Supabase Storage maupun penempelan tautan, sesuai alur aplikasi sebelumnya.
