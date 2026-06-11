/* =====================================================================
   ILP Academy LMS 2026 — scripts/main.js
   Per-page logic. Dispatched by <body data-page="..."> attribute.
   Depends on assets/auth.js (loaded first).
   ===================================================================== */

/* =====================================================================
   GLOBAL PROGRESS BAR + BUTTON LOADING HELPERS
   ===================================================================== */
(function () {
  const bar = document.createElement("div");
  bar.id = "_npbar";
  document.body.appendChild(bar);
})();

let _npTimer = null;
const _progress = {
  start() {
    const bar = document.getElementById("_npbar");
    if (!bar) return;
    bar.classList.remove("done");
    bar.style.opacity = "1";
    bar.style.width = "15%";
    clearTimeout(_npTimer);
    // Simulate incremental progress
    let w = 15;
    _npTimer = setInterval(() => {
      if (w >= 85) { clearInterval(_npTimer); return; }
      w += Math.random() * 12;
      bar.style.width = Math.min(w, 85) + "%";
    }, 350);
  },
  done() {
    clearInterval(_npTimer);
    const bar = document.getElementById("_npbar");
    if (!bar) return;
    bar.style.width = "100%";
    setTimeout(() => bar.classList.add("done"), 250);
    setTimeout(() => { bar.style.width = "0%"; bar.classList.remove("done"); }, 700);
  },
};

// Wrap a button in loading state, returns restore function
function _btnLoad(btn, text = "") {
  if (!btn) return () => {};
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add("btn-loading");
  const spinClass = btn.style.background?.includes("#") ? "btn-spin" : "btn-spin dark";
  btn.innerHTML = `<span class="${spinClass}"></span>${text || ""}`;
  return () => { btn.disabled = false; btn.classList.remove("btn-loading"); btn.innerHTML = orig; };
}

// Page-level loading indicator
function _contentLoading(c, msg = "Memuat data…") {
  if (!c) return;
  c.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:360px;gap:20px">
    <div style="position:relative;width:56px;height:56px">
      <div style="position:absolute;inset:0;border-radius:50%;border:4px solid #E2E8F0;border-top-color:#1A437B;border-right-color:#2563EB;animation:spin 0.75s cubic-bezier(0.4,0,0.2,1) infinite"></div>
      <div style="position:absolute;inset:8px;border-radius:50%;border:3px solid transparent;border-top-color:#60A5FA;animation:spin 1.2s cubic-bezier(0.4,0,0.2,1) infinite reverse"></div>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
        <div style="width:8px;height:8px;border-radius:50%;background:linear-gradient(135deg,#1A437B,#3B82F6);animation:skpulse 1.2s ease-in-out infinite"></div>
      </div>
    </div>
    <div style="text-align:center">
      <div style="font-size:14px;font-weight:600;color:#374151;margin-bottom:4px">${msg}</div>
      <div style="font-size:12px;color:#94A3B8">Mohon tunggu sebentar…</div>
    </div>
  </div>`;
}

/* =====================================================================
   SPA ROUTER
   Single entry via app.html with hash-based routing.
   Old .html files redirect to app.html#pagename instantly.
   ===================================================================== */

/* Pages that require a specific role */
const _ROUTE_ROLES = {
  dashboard:       "participant",
  training:        "participant",
  materi:          "participant",
  tugas:           "participant",
  feedback:        "participant",
  admin:           "admin",
  adminPeserta:    "admin",
  adminTraining:   "admin",
  adminMateri:     "admin",
  adminTugas:      "admin",
  adminSubmission: "admin",
  adminKehadiran:  "admin",
  adminAnalytics:  "admin",
  adminForms:      "admin",
  forms:           "participant",
  profile:         null,
};

/* HTML snapshot cache: store rendered innerHTML per route.
   < SNAP_FRESH_MS  → show instantly, skip background refresh (very recent)
   < SNAP_MAX_MS    → show instantly, re-render in background silently
   ≥ SNAP_MAX_MS    → show spinner, fetch fresh                            */
const _snapshots = new Map();
const SNAP_FRESH_MS = 10_000;  // 10 s
const SNAP_MAX_MS   = 90_000;  // 90 s
/* Pages with <canvas> charts must always re-run their render (canvas pixels
   are not captured by an innerHTML snapshot), so we skip the snapshot path. */
const NO_SNAPSHOT = new Set(["admin", "adminAnalytics", "adminForms", "tugas", "training"]);

async function _spaRoute() {
  const hash = location.hash.slice(1);

  /* Unknown or empty hash — redirect to role default after auth */
  if (!hash || !(hash in _ROUTE_ROLES)) {
    const session = await getSession();
    if (!session) { window.location.href = "login.html"; return; }
    const profile = await getProfile();
    if (!profile) { window.location.href = "login.html"; return; }
    _cachedProfile = profile;
    navigate(profile.role === "admin" ? "admin" : "dashboard");
    return;
  }

  const fn = PAGES[hash];
  if (!fn) return;

  const c = document.getElementById("content");
  const snap = _snapshots.get(hash);
  const age  = snap ? Date.now() - snap.ts : Infinity;

  /* ── Instant path: serve snapshot ── */
  if (snap && age < SNAP_MAX_MS && c && _shellRendered && !NO_SNAPSHOT.has(hash)) {
    c.style.opacity = "1";
    c.innerHTML = snap.html;
    _updateActiveNav(); // snapshot path skips fn() so update nav manually

    if (age < SNAP_FRESH_MS) return; // very fresh — skip background refresh

    /* Stale snapshot: silently re-render in background.
       qc() returns cached data so fn() completes in <5 ms and produces
       the same HTML → no visible change unless data actually changed.    */
    fn().then(() => {
      if (!c.isConnected) return;
      const fresh = c.innerHTML;
      _snapshots.set(hash, { html: fresh, ts: Date.now() });
      /* If data changed, do a barely-perceptible fade to signal update */
      if (fresh !== snap.html) {
        c.style.opacity = "0.6";
        requestAnimationFrame(() => { c.style.opacity = "1"; });
      }
    }).catch(console.error);
    return;
  }

  /* ── Cold path: show spinner while fetching ── */
  _progress.start();
  if (c && _shellRendered) { _contentLoading(c, "Memuat halaman…"); }

  try {
    await fn();
  } finally {
    _progress.done();
    const c2 = document.getElementById("content");
    if (c2) {
      if (c2.isConnected) _snapshots.set(hash, { html: c2.innerHTML, ts: Date.now() });
      requestAnimationFrame(() => { c2.style.opacity = "1"; });
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const filename = location.pathname.split("/").pop();

  if (filename === "app.html" || filename === "" || filename === "/") {
    /* SPA mode */
    window.addEventListener("hashchange", () => _spaRoute().catch(console.error));
    _spaRoute().catch(console.error);
  } else {
    /* Legacy / standalone page mode (login.html, set-password.html, etc.) */
    const page = document.body.dataset.page;
    const fn = PAGES[page];
    if (fn) fn().catch((err) => console.error(err));
  }
});

/* ---------- Progress calculation (shared) ---------- */
async function computeProgress(userId) {
  const [{ count: totT }, { count: totA }] = await Promise.all([
    _supabase.from("trainings").select("*", { count: "exact", head: true }),
    _supabase.from("assignments").select("*", { count: "exact", head: true }),
  ]);
  const { count: attended } = await _supabase
    .from("attendances")
    .select("*", { count: "exact", head: true })
    .eq("participant_id", userId)
    .eq("attendance_status", "present");
  const { count: completed } = await _supabase
    .from("submissions")
    .select("*", { count: "exact", head: true })
    .eq("participant_id", userId)
    .or("status.eq.submitted,status.eq.late,status.eq.reviewed");

  const totalT = totT || 0;
  const totalA = totA || 0;
  const denom = totalT + totalA;
  const numer = (attended || 0) + (completed || 0);
  return {
    totalTrainings: totalT,
    totalAssignments: totalA,
    attended: attended || 0,
    completed: completed || 0,
    pending: Math.max(totalA - (completed || 0), 0),
    percent: denom === 0 ? 0 : Math.round((numer / denom) * 100),
  };
}

const PAGES = {};

/* =====================================================================
   LOGIN
   ===================================================================== */
PAGES.login = async function () {
  // Form handling sudah dikelola oleh inline script di login.html.
  // Di sini hanya redirect jika peserta sudah login.
  const session = await getSession();
  if (session) {
    const p = await getProfile();
    if (p) {
      window.location.href = p.role === "admin" ? "app.html#admin" : "app.html#dashboard";
    }
  }
};

/* =====================================================================
   SET PASSWORD (dari undangan email)
   ===================================================================== */
PAGES.setPassword = async function () {
  const form = document.getElementById("pwForm");
  const errBox = document.getElementById("pwError");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errBox.classList.add("hidden");
    const pw = form.password.value;
    const cpw = form.confirm.value;
    if (pw.length < 8) {
      errBox.textContent = "Password minimal 8 karakter.";
      errBox.classList.remove("hidden");
      return;
    }
    if (pw !== cpw) {
      errBox.textContent = "Konfirmasi password tidak cocok.";
      errBox.classList.remove("hidden");
      return;
    }
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Menyimpan...";
    const { error } = await _supabase.auth.updateUser({ password: pw });
    if (error) {
      errBox.textContent =
        "Gagal menyimpan password. Tautan undangan mungkin kedaluwarsa.";
      errBox.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "Simpan & Masuk";
      return;
    }
    window.location.href = "app.html#dashboard";
  });
};

/* =====================================================================
   PARTICIPANT — DASHBOARD (Aktivitasku)
   ===================================================================== */
PAGES.dashboard = async function () {
  const profile = await requireAuth("participant");
  if (!profile) return;
  renderShell(profile, PARTICIPANT_NAV, profile.institution || "Peserta");
  const c = document.getElementById("content");

  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: trainingsRaw },
    { data: materials },
    { data: assignments },
    { data: attendances },
    { data: submissions },
  ] = await Promise.all([
    qc("trainings:p", () => _supabase.from("trainings").select("*").or(`visible_from.is.null,visible_from.lte.${new Date().toISOString()}`)),
    qc("materials:p", () => _supabase.from("materials").select("*").or(`visible_from.is.null,visible_from.lte.${new Date().toISOString()}`)),
    qc("assignments:p", () => _supabase.from("assignments").select("*").or(`visible_from.is.null,visible_from.lte.${new Date().toISOString()}`)),
    qc("att:" + profile.id, () => _supabase.from("attendances").select("training_id").eq("participant_id", profile.id).eq("attendance_status", "present")),
    qc("sub:" + profile.id, () => _supabase.from("submissions").select("*").eq("participant_id", profile.id)),
  ]);

  // Sort ascending by week_number then date
  const tListAsc = [...(trainingsRaw || [])].sort((a, b) => {
    if (a.week_number && b.week_number) return a.week_number - b.week_number;
    if (a.week_number) return -1;
    if (b.week_number) return 1;
    return (a.training_date || "").localeCompare(b.training_date || "");
  });

  const matByTid = {};
  (materials || []).forEach(m => { if (m.training_id) matByTid[m.training_id] = m; });

  const asgByTid = {};
  (assignments || []).forEach(a => { if (a.training_id) asgByTid[a.training_id] = a; });

  const attendedSet = new Set((attendances || []).map(a => a.training_id));

  const subByAsgId = {};
  (submissions || []).forEach(s => { subByAsgId[s.assignment_id] = s; });

  const weekNum = t => t.week_number || (tListAsc.findIndex(x => x.id === t.id) + 1);
  const nowMs = Date.now();
  const tomorrowStr = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();

  // Sedang Berlangsung: H-1, Hari-H, ATAU training lampau dengan deadline masih aktif
  const isSedang = t => {
    if (t.training_date === today || t.training_date === tomorrowStr) return true;
    if (t.training_date < today) {
      const a = asgByTid[t.id];
      if (a && a.deadline && new Date(a.deadline).getTime() > nowMs) return true;
    }
    return false;
  };

  const sedangList     = tListAsc.filter(isSedang);
  const akanDatangList = tListAsc.filter(t => t.training_date > tomorrowStr);
  const riwayatList    = [...tListAsc.filter(t => !isSedang(t) && t.training_date < today)].reverse();

  // Progress stats — dari training pertama hingga saat ini
  const totalSesi      = tListAsc.length;
  const pastSesi       = tListAsc.filter(t => t.training_date <= today);
  const sesiSelesai    = pastSesi.filter(t => attendedSet.has(t.id)).length;
  const totalPastSesi  = pastSesi.length;
  const attendancePct  = totalPastSesi > 0 ? Math.round(sesiSelesai / totalPastSesi * 100) : 0;
  const totalAsg       = (assignments || []).length;
  const tugasSelesai   = (submissions || []).length;
  const asgPct         = totalAsg > 0 ? Math.round(tugasSelesai / totalAsg * 100) : 0;

  const firstName = _greetName(profile.full_name);
  const todayLabel = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const _cd = (iso) => { const d = new Date(iso).getTime() - Date.now(); if (d <= 0) return "lewat tenggat"; const h = Math.floor(d / 3600000); if (h < 1) return Math.max(1, Math.floor(d / 60000)) + " menit lagi"; if (h < 24) return h + " jam lagi"; return Math.floor(h / 24) + " hari lagi"; };

  const nextSession = [...tListAsc].filter((t) => t.training_date >= today)
    .sort((a, b) => (a.training_date || "").localeCompare(b.training_date || "") || (a.start_time || "").localeCompare(b.start_time || ""))[0] || null;
  const pendingTasks = (assignments || []).filter((a) => !subByAsgId[a.id] && a.deadline && new Date(a.deadline).getTime() > nowMs)
    .sort((x, y) => new Date(x.deadline) - new Date(y.deadline));
  const nearTask = pendingTasks[0] || null;
  const liveT = sedangList.find((t) => _zoomState(t) === "live") || null;
  const soonT = !liveT ? (sedangList.find((t) => _zoomState(t) === "soon") || null) : null;
  const _zoomAttrs = (t) => `data-zoom="${escapeHTML(t.zoom_link)}" data-tid="${t.id}" data-date="${t.training_date}" data-start="${t.start_time || ""}" data-end="${t.end_time || ""}"`;

  let focus;
  if (liveT) {
    focus = { mod: "is-live", ic: "video", eyebrow: `<span class="dot-live"></span> Sedang berlangsung`,
      title: liveT.title, meta: `Sesi ${weekNum(liveT)}${liveT.speaker ? " &middot; " + escapeHTML(liveT.speaker) : ""}${_lmsTimeStr(liveT) ? " &middot; " + _lmsTimeStr(liveT) : ""}`,
      cta: `<a class="hf-cta" href="${escapeHTML(liveT.zoom_link)}" target="_blank" ${_zoomAttrs(liveT)}>${icon("video", 17)} Gabung Zoom Sekarang</a>` };
  } else if (soonT) {
    focus = { mod: "is-soon", ic: "video", eyebrow: "Segera dimulai",
      title: soonT.title, meta: `Sesi ${weekNum(soonT)}${_lmsTimeStr(soonT) ? " &middot; " + _lmsTimeStr(soonT) : ""}`,
      cta: `<a class="hf-cta" href="${escapeHTML(soonT.zoom_link)}" target="_blank" ${_zoomAttrs(soonT)}>${icon("video", 17)} Gabung Zoom</a>` };
  } else if (nearTask && (new Date(nearTask.deadline).getTime() - nowMs) <= 48 * 3600000) {
    focus = { mod: "is-task", ic: "task", eyebrow: "Tenggat terdekat",
      title: nearTask.title, meta: `Deadline ${fmtDateShort(nearTask.deadline)} &middot; ${_cd(nearTask.deadline)}`,
      cta: `<button class="hf-cta" data-upload-asg="${nearTask.id}" data-upload-deadline="${nearTask.deadline || ""}">${icon("upload", 17)} Kumpulkan Tugas</button>` };
  } else if (nextSession && (nextSession.training_date === today || nextSession.training_date === tomorrowStr)) {
    const zs = _zoomState(nextSession);
    const cta = (nextSession.zoom_link && zs)
      ? `<a class="hf-cta" href="${escapeHTML(nextSession.zoom_link)}" target="_blank" ${_zoomAttrs(nextSession)}>${icon("video", 17)} Gabung Zoom</a>`
      : `<a class="hf-cta" href="#training">${icon("calendar", 17)} Lihat Detail</a>`;
    focus = { mod: "is-soon", ic: "calendar", eyebrow: nextSession.training_date === today ? "Hari ini" : "Besok",
      title: nextSession.title, meta: `Sesi ${weekNum(nextSession)}${_lmsTimeStr(nextSession) ? " &middot; " + _lmsTimeStr(nextSession) : ""}`, cta };
  } else if (nearTask) {
    focus = { mod: "is-task", ic: "task", eyebrow: "Tugas menunggu",
      title: nearTask.title, meta: `Deadline ${fmtDateShort(nearTask.deadline)} &middot; ${_cd(nearTask.deadline)}`,
      cta: `<button class="hf-cta" data-upload-asg="${nearTask.id}" data-upload-deadline="${nearTask.deadline || ""}">${icon("upload", 17)} Kumpulkan Tugas</button>` };
  } else if (nextSession) {
    const daysLeft = Math.max(0, Math.ceil((new Date(nextSession.training_date) - new Date(today)) / 86400000));
    focus = { mod: "is-upcoming", ic: "calendar", eyebrow: "Sesi berikutnya",
      title: nextSession.title, meta: `${fmtDateShort(nextSession.training_date)} &middot; ${daysLeft} hari lagi`,
      cta: `<a class="hf-cta" href="#training">${icon("calendar", 17)} Lihat Jadwal</a>` };
  } else {
    focus = { mod: "is-idle", ic: "check", eyebrow: "Anda sudah terkini",
      title: "Tidak ada aktivitas mendesak", meta: "Manfaatkan waktu luang untuk mengulang materi pembelajaran.",
      cta: `<a class="hf-cta" href="#materi">${icon("book", 17)} Buka Materi</a>` };
  }

  // ---- Activity feed data (rendered inside the "Aktivitas" tab) ----
  const _asgById = {};
  (assignments || []).forEach((a) => (_asgById[a.id] = a));
  const _actFeed = [];
  (submissions || []).forEach((s) => _actFeed.push({ ts: s.submitted_at, type: s.status === "reviewed" ? "graded" : "submit", title: (_asgById[s.assignment_id] || {}).title, grade: s.grade }));
  [...(materials || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 4).forEach((m) => _actFeed.push({ ts: m.publish_date || m.created_at, type: "material", title: m.title }));
  _actFeed.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const _feedTop = _actFeed.slice(0, 6);
  const _feedCfg = {
    submit: { ic: "upload", bg: "var(--info-c-bg)", col: "var(--info-c)", verb: "Mengumpulkan tugas" },
    graded: { ic: "star", bg: "var(--warn-bg)", col: "var(--warn)", verb: "Nilai keluar untuk" },
    material: { ic: "book", bg: "var(--primary-tint)", col: "var(--primary)", verb: "Materi tersedia" },
  };
  const feedPanelHTML = _feedTop.length
    ? `<div class="feed">${_feedTop.map((f) => { const k = _feedCfg[f.type] || _feedCfg.submit; const extra = f.type === "graded" && f.grade != null ? ` — <strong>${f.grade}/100</strong>` : ""; return `<div class="feed-item"><span class="feed-ico" style="background:${k.bg};color:${k.col}">${icon(k.ic, 17)}</span><div style="flex:1;min-width:0"><div class="feed-title">${k.verb} <strong>${escapeHTML(f.title || "-")}</strong>${extra}</div><div class="feed-meta">${escapeHTML(timeAgo(f.ts))}</div></div></div>`; }).join("")}</div>`
    : `<div class="empty">Belum ada aktivitas terbaru.</div>`;

  const tabCounts = { now: sedangList.length, soon: akanDatangList.length, done: riwayatList.length };
  const defaultTab = sedangList.length ? "now" : akanDatangList.length ? "soon" : riwayatList.length ? "done" : "feed";

  const _reviewed = (submissions || []).filter((s) => s.status === "reviewed" && s.grade != null);
  const avgGrade = _reviewed.length ? Math.round(_reviewed.reduce((a, s) => a + Number(s.grade), 0) / _reviewed.length) : null;

  c.innerHTML = `
    <div class="home-greet">
      <div>
        <h1 class="home-hi">Halo, ${escapeHTML(firstName)}</h1>
        <p class="home-sub">${icon("calendar", 13)} ${todayLabel}</p>
      </div>
    </div>

    <div class="home-focus ${focus.mod}">
      <span class="hf-ico">${icon(focus.ic, 24)}</span>
      <div class="hf-body">
        <span class="hf-eyebrow">${focus.eyebrow}</span>
        <h2 class="hf-title">${escapeHTML(focus.title)}</h2>
        <p class="hf-meta">${focus.meta}</p>
      </div>
      <div class="hf-actions">${focus.cta}</div>
    </div>

    ${kpiStrip([
      { icon:"user-check",  bg:"var(--ok-bg)",        color:"var(--ok)",      value:`${attendancePct}%`,         label:"Kehadiran",         sub:`${sesiSelesai}/${totalPastSesi} sesi` },
      { icon:"task",        bg:"var(--warn-bg)",       color:"var(--warn)",    value:`${tugasSelesai}/${totalAsg}`,label:"Tugas Dikumpulkan", sub:"" },
      ...(avgGrade != null ? [{ icon:"award", bg:"var(--primary-tint)", color:"var(--primary)", value:avgGrade, label:"Nilai Rata-rata", sub:"" }] : []),
    ])}

    <div class="qa-row">
      <a class="qa-chip" href="#materi"><span class="qa-chip-ico" style="background:var(--primary-tint);color:var(--primary)">${icon("book", 18)}</span><span class="qa-chip-txt"><span class="qa-chip-title">Materi</span><span class="qa-chip-sub">Bahan belajar</span></span><span class="qa-chip-arrow">${icon("chevron-right", 16)}</span></a>
      <a class="qa-chip" href="#tugas">${(totalAsg - tugasSelesai) > 0 ? `<span class="qa-chip-badge">${totalAsg - tugasSelesai}</span>` : ""}<span class="qa-chip-ico" style="background:var(--warn-bg);color:var(--warn)">${icon("task", 18)}</span><span class="qa-chip-txt"><span class="qa-chip-title">Tugas</span><span class="qa-chip-sub">${(totalAsg - tugasSelesai) > 0 ? (totalAsg - tugasSelesai) + " menunggu" : "Selesai semua"}</span></span><span class="qa-chip-arrow">${icon("chevron-right", 16)}</span></a>
      <a class="qa-chip" href="#training"><span class="qa-chip-ico" style="background:var(--ok-bg);color:var(--ok)">${icon("calendar", 18)}</span><span class="qa-chip-txt"><span class="qa-chip-title">Jadwal</span><span class="qa-chip-sub">Training &amp; sesi</span></span><span class="qa-chip-arrow">${icon("chevron-right", 16)}</span></a>
      <a class="qa-chip" href="#feedback"><span class="qa-chip-ico" style="background:var(--info-c-bg);color:var(--info-c)">${icon("chat", 18)}</span><span class="qa-chip-txt"><span class="qa-chip-title">Feedback</span><span class="qa-chip-sub">Nilai &amp; umpan balik</span></span><span class="qa-chip-arrow">${icon("chevron-right", 16)}</span></a>
    </div>

    <div class="home-tabs">
      <div class="ht-bar" role="tablist">
        <button type="button" class="ht-tab ${defaultTab === "now" ? "active" : ""}" data-tab="now">${icon("video", 15)} Berlangsung${tabCounts.now ? ` <span class="ht-count">${tabCounts.now}</span>` : ""}</button>
        <button type="button" class="ht-tab ${defaultTab === "soon" ? "active" : ""}" data-tab="soon">${icon("calendar", 15)} Akan Datang${tabCounts.soon ? ` <span class="ht-count">${tabCounts.soon}</span>` : ""}</button>
        <button type="button" class="ht-tab ${defaultTab === "done" ? "active" : ""}" data-tab="done">${icon("check", 15)} Riwayat${tabCounts.done ? ` <span class="ht-count">${tabCounts.done}</span>` : ""}</button>
        <button type="button" class="ht-tab ${defaultTab === "feed" ? "active" : ""}" data-tab="feed">${icon("activity", 15)} Aktivitas</button>
      </div>
      <div class="ht-panels">
        <div class="ht-panel ${defaultTab === "now" ? "active" : ""}" data-panel="now">
          ${sedangList.length ? sedangList.map(t => { const asg = asgByTid[t.id]; const sub = asg ? subByAsgId[asg.id] : null; return buildLmsHeroCard(t, weekNum(t), attendedSet.has(t.id), matByTid[t.id], asg, sub, today); }).join("") : `<div class="empty">Tidak ada sesi yang sedang berlangsung saat ini.</div>`}
        </div>
        <div class="ht-panel ${defaultTab === "soon" ? "active" : ""}" data-panel="soon">
          ${akanDatangList.length ? `<div class="lms-cards-list">${akanDatangList.map(t => buildLmsUpcomingCard(t, weekNum(t), today)).join("")}</div>` : `<div class="empty">Belum ada sesi yang akan datang.</div>`}
        </div>
        <div class="ht-panel ${defaultTab === "done" ? "active" : ""}" data-panel="done">
          ${riwayatList.length ? `<div class="lms-cards-list">${riwayatList.map(t => { const asg = asgByTid[t.id]; const sub = asg ? subByAsgId[asg.id] : null; return buildLmsDoneCard(t, weekNum(t), attendedSet.has(t.id), matByTid[t.id], asg, sub); }).join("")}</div>` : `<div class="empty">Belum ada riwayat sesi.</div>`}
        </div>
        <div class="ht-panel ${defaultTab === "feed" ? "active" : ""}" data-panel="feed">
          ${feedPanelHTML}
        </div>
      </div>
    </div>
  `;

  // Bind Kumpulkan Tugas → inline upload modal
  c.querySelectorAll("[data-upload-asg]").forEach(btn => {
    btn.addEventListener("click", () => {
      openTugasUploadModal(btn.dataset.uploadAsg, btn.dataset.uploadDeadline, profile, () => PAGES.dashboard());
    });
  });

  // Bind Join Zoom → catat kehadiran otomatis
  c.querySelectorAll("[data-zoom]").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.preventDefault();
      const { zoom: zoomUrl, tid: trainingId, date, start, end } = btn.dataset;
      window.open(zoomUrl, "_blank");
      if (!isTrainingNow({ training_date: date, start_time: start || null, end_time: end || null })) {
        toast("Kehadiran hanya dicatat saat jam Training & Workshop berlangsung.", "error");
        return;
      }
      const { error } = await _supabase.from("attendances").upsert(
        { training_id: trainingId, participant_id: profile.id, attendance_status: "present" },
        { onConflict: "training_id,participant_id" }
      );
      if (!error) { qcInvalidate("att:", "att:all"); toast("Kehadiran Anda telah dicatat."); }
    });
  });

  // Bind feedback
  c.querySelectorAll("[data-feedback-sub]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const { data: fbs } = await _supabase
        .from("feedbacks").select("*").eq("submission_id", btn.dataset.feedbackSub).order("created_at", { ascending: true });
      const list = fbs && fbs.length
        ? fbs.map(f => `<div style="background:#F0F4FB;border-radius:12px;padding:16px;margin-bottom:10px"><p style="font-size:14px;color:#334155;line-height:1.65">${escapeHTML(f.comment)}</p><p style="font-size:12px;color:#94A3B8;margin-top:8px">${fmtDateTime(f.created_at)} WIB</p></div>`).join("")
        : `<div class="empty">Belum ada feedback untuk tugas ini.</div>`;
      openModal("Feedback Tugas", list);
    });
  });

  // Tab switching (client-side, no re-render)
  c.querySelectorAll(".ht-tab").forEach((tab) => tab.addEventListener("click", () => {
    const key = tab.dataset.tab;
    c.querySelectorAll(".ht-tab").forEach((t) => t.classList.toggle("active", t === tab));
    c.querySelectorAll(".ht-panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === key));
  }));

  bindMaterialViewers(c);
};

// Convert stored UTC/ISO datetime to local time string for datetime-local input
function toLocalDatetimeInput(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (isNaN(d)) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function fmtDateShort(d) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

// Extract a friendly first name from full names that carry academic titles/degrees,
// e.g. "D.Sc.(Tech.) Ir. Syifa Fauziah, S.T, M.Phil." -> "Syifa".
function _greetName(full) {
  if (!full) return "Peserta";
  let s = String(full).split(",")[0].trim();
  let parts = s.split(/\s+/);
  const titleWord = /^(prof|dr|drs|dra|ir|h|hj|st|mt|me|mm|mba|phd|dipl)\.?$/i;
  while (parts.length > 1 && (parts[0].includes(".") || titleWord.test(parts[0]))) parts.shift();
  return parts[0] || String(full).trim().split(/\s+/)[0] || "Peserta";
}

/* ---------------- View mode (card | table) per-list, remembered ---------------- */
function _viewMode(key, def) { try { return localStorage.getItem("ILP_VIEW_" + key) || def; } catch (_) { return def; } }
function _setViewMode(key, v) { try { localStorage.setItem("ILP_VIEW_" + key, v); } catch (_) {} }
function viewToggleHTML(key, current) {
  const cardActive = current === "card";
  const tableActive = current === "table";
  const btnStyle = (active) => `padding:5px 13px;border-radius:7px;border:none;cursor:pointer;font-size:12.5px;font-weight:600;display:inline-flex;align-items:center;gap:5px;transition:all .15s;background:${active?"#fff":"transparent"};color:${active?"#1A437B":"#64748B"};box-shadow:${active?"0 1px 4px rgba(0,0,0,.1)":"none"}`;
  return `<div style="display:inline-flex;background:#F1F5F9;border-radius:9px;padding:3px;gap:2px" class="view-toggle" data-vt="${key}">
    <button type="button" data-view="card" style="${btnStyle(cardActive)}">${icon("grid",13)} Kartu</button>
    <button type="button" data-view="table" style="${btnStyle(tableActive)}">${icon("list",13)} Tabel</button>
  </div>`;
}
function wireViewToggle(c, key) {
  const seg = c.querySelector(`.view-toggle[data-vt="${key}"]`);
  if (!seg) return;
  const apply = (v) => {
    c.querySelectorAll(".view-card").forEach((el) => (el.hidden = v !== "card"));
    c.querySelectorAll(".view-table").forEach((el) => (el.hidden = v !== "table"));
  };
  const syncStyles = (activeView) => {
    seg.querySelectorAll("[data-view]").forEach((b) => {
      const active = b.dataset.view === activeView;
      b.style.background = active ? "#fff" : "transparent";
      b.style.color = active ? "#1A437B" : "#64748B";
      b.style.boxShadow = active ? "0 1px 4px rgba(0,0,0,.1)" : "none";
    });
  };
  seg.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
    const v = b.dataset.view;
    _setViewMode(key, v); apply(v); syncStyles(v);
  }));
}

/* ---------------- Inline material viewer (no new tab) ---------------- */
function _embedUrl(url) {
  if (!url) return url;
  let m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
  m = url.match(/[?&]id=([^&]+)/);
  if (m && /drive\.google\.com\/open/.test(url)) return `https://drive.google.com/file/d/${m[1]}/preview`;
  if (/docs\.google\.com\/(document|spreadsheets|presentation)\//.test(url)) return url.replace(/\/(edit|view|preview)(\?[^#]*)?(#.*)?$/, "/preview");
  return url;
}
function openMaterialViewer(url, title) {
  if (!url) return;
  const embed = _embedUrl(url);
  let overlay = document.getElementById("matViewerOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "matViewerOverlay";
    overlay.className = "mat-fv-overlay";
    overlay.innerHTML = `
      <div class="mat-fv-bar">
        <button class="mat-fv-back" id="matFvBack">${icon("arrow-left",16)} Kembali</button>
        <span class="mat-fv-title" id="matFvTitle"></span>
        <a class="mat-fv-ext" id="matFvExt" href="#" target="_blank" rel="noopener">${icon("arrow-right",15)} Buka di tab baru</a>
      </div>
      <div class="mat-fv-body">
        <iframe id="matFvFrame" src="" title="" allow="autoplay" referrerpolicy="no-referrer"></iframe>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById("matFvBack").addEventListener("click", () => {
      overlay.classList.remove("open");
      document.body.style.overflow = "";
    });
  }
  document.getElementById("matFvTitle").textContent = title || "Materi";
  document.getElementById("matFvFrame").src = escapeHTML(embed);
  document.getElementById("matFvExt").href = escapeHTML(url);
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";
}
function bindMaterialViewers(c) {
  c.querySelectorAll("[data-view-mat]").forEach((b) => b.addEventListener("click", (e) => {
    e.preventDefault();
    openMaterialViewer(b.dataset.viewMat, b.dataset.viewTitle || "Materi");
  }));
}

/* =====================================================================
   LMS DASHBOARD HELPERS
   ===================================================================== */

function buildTimeline(tListAsc, today, attendedSet, activeTraining) {
  if (!tListAsc.length) return "";
  const items = tListAsc.map((t, i) => {
    const wn = t.week_number || (i + 1);
    const isActive  = activeTraining && t.id === activeTraining.id;
    const isPast    = t.training_date < today;
    const isAttended = attendedSet.has(t.id);
    let cls = "upcoming";
    if (isActive) cls = "active";
    else if (isPast && isAttended) cls = "done";
    else if (isPast && !isAttended) cls = "missed";
    const dotInner = (isPast || isActive) && isAttended
      ? `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`
      : isActive ? '<span style="width:8px;height:8px;border-radius:50%;background:currentColor;display:inline-block"></span>' : "";
    const connector = i < tListAsc.length - 1
      ? `<div class="lms-tl-line ${isPast ? "filled" : ""}"></div>`
      : "";
    return `<div class="lms-tl-item ${cls}"><div class="lms-tl-dot">${dotInner}</div><span class="lms-tl-label">${wn}</span></div>${connector}`;
  }).join("");
  return `<div class="lms-timeline-wrap"><div class="lms-timeline">${items}</div></div>`;
}

function _lmsZoomBtn(t, today) {
  if (!t.zoom_link) return "";
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  let show = false;
  if (t.training_date === tomorrowStr) { show = true; }
  else if (t.training_date === today) {
    if (!t.end_time) { show = true; }
    else {
      const cutoff = new Date(`${t.training_date}T${t.end_time}:00`);
      cutoff.setHours(cutoff.getHours() + 1);
      show = now <= cutoff;
    }
  }
  if (!show) return "";
  return `<a class="lms-btn lms-btn-primary" href="${escapeHTML(t.zoom_link)}" target="_blank" data-zoom="${escapeHTML(t.zoom_link)}" data-tid="${t.id}" data-date="${t.training_date}" data-start="${t.start_time || ""}" data-end="${t.end_time || ""}">${icon("video", 16)} Join Zoom</a>`;
}

// Returns: "live" | "soon" | "default" | null (hidden)
function _zoomState(t) {
  if (!t.zoom_link) return null;
  const now = new Date();
  const nowMs = now.getTime();
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  // H-1 (tomorrow): show default, no time check yet
  if (t.training_date === tomorrowStr) return "default";

  // Not today and not tomorrow: hide
  if (t.training_date !== todayStr) return null;

  // Today but no time info: default
  if (!t.start_time) return "default";

  const startMs = new Date(`${t.training_date}T${t.start_time}:00`).getTime();
  const endMs = t.end_time
    ? new Date(`${t.training_date}T${t.end_time}:00`).getTime()
    : startMs + 2 * 60 * 60 * 1000;

  if (nowMs > endMs) return null;                          // session ended
  if (nowMs >= startMs) return "live";                     // in progress
  if (startMs - nowMs <= 15 * 60 * 1000) return "soon";   // within 15 min → aktif
  return "default";
}

function _lmsTimeStr(t) {
  if (!t.start_time) return "";
  let s = fmtTime(t.start_time).replace(":", ".");
  s += t.end_time ? " – " + fmtTime(t.end_time).replace(":", ".") + " WIB" : " WIB";
  return s;
}

// Compact inline deadline chip (replaces the bulky deadline banner)
function _deadlineChip(deadline) {
  if (!deadline) return "";
  const diff = new Date(deadline).getTime() - Date.now();
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
  let cls, sisa;
  if (diff <= 0) { cls = "dl-over"; sisa = "Lewat tenggat"; }
  else if (h < 1) { cls = "dl-urgent"; sisa = `${Math.max(1, m)} menit lagi`; }
  else if (h < 24) { cls = "dl-urgent"; sisa = `${h} jam lagi`; }
  else if (d < 3) { cls = "dl-warn"; sisa = `${d} hari lagi`; }
  else { cls = "dl-ok"; sisa = `${d} hari lagi`; }
  const ds = new Date(deadline).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(/\./g, ".");
  return `<span class="sx-deadline ${cls}">${icon("clock", 12)} ${ds} WIB · ${sisa}</span>`;
}

// Unified compact session card. ctx: 'now' | 'upcoming' | 'past'
function buildSessionCard(t, wn, o) {
  o = o || {};
  const ctx = o.ctx || "now";
  const today = o.today || new Date().toISOString().slice(0, 10);
  const ds = t.training_date ? fmtDateShort(t.training_date) : "Jadwal menyusul";
  const time = _lmsTimeStr(t);
  const zs = _zoomState(t);
  const isLive = ctx === "now" && zs === "live";

  const badges = [];
  if (isLive) badges.push(`<span class="sx-badge sx-live"><span class="dot-live"></span> Berlangsung</span>`);
  if (ctx === "upcoming") {
    const dl = t.training_date ? Math.max(0, Math.ceil((new Date(t.training_date) - new Date(today)) / 86400000)) : null;
    badges.push(`<span class="sx-badge sx-soon">${icon("clock", 11)} ${dl === null ? "Terjadwal" : dl === 0 ? "Hari ini" : dl === 1 ? "Besok" : dl + " hari lagi"}</span>`);
  }
  if (ctx === "now" || ctx === "past") {
    badges.push(o.attended
      ? `<span class="sx-badge sx-ok">${icon("check", 11)} Hadir</span>`
      : `<span class="sx-badge sx-muted">${icon("clock", 11)} ${ctx === "past" ? "Tidak hadir" : "Belum hadir"}</span>`);
    if (o.asg) {
      if (!o.sub) badges.push(`<span class="sx-badge sx-warn">${icon("task", 11)} Tugas belum</span>`);
      else {
        const late = o.asg.deadline ? new Date(o.sub.submitted_at) > new Date(o.asg.deadline) : false;
        badges.push(late
          ? `<span class="sx-badge sx-warn">${icon("clock", 11)} Terlambat</span>`
          : `<span class="sx-badge sx-ok">${icon("check", 11)} Tugas terkumpul</span>`);
      }
    }
  }

  // Zoom button — selalu tampil di header jika ada link, disabled saat sudah selesai
  let zoomHeadBtn = "";
  if (t.zoom_link) {
    if (ctx === "past") {
      zoomHeadBtn = `<span class="sx-zoom-head sx-zoom-head-done" title="Sesi telah selesai">${icon("video", 13)} Zoom</span>`;
    } else if (zs) {
      const live = zs === "live";
      const label = live ? "Gabung Sekarang" : zs === "soon" ? "Segera" : "Gabung Zoom";
      zoomHeadBtn = `<a class="sx-zoom-head${live ? " sx-zoom-head-live" : ""}" href="${escapeHTML(t.zoom_link)}" target="_blank" data-zoom="${escapeHTML(t.zoom_link)}" data-tid="${t.id}" data-date="${t.training_date}" data-start="${t.start_time || ""}" data-end="${t.end_time || ""}">${icon("video", 13)} ${label}</a>`;
    } else {
      zoomHeadBtn = `<a class="sx-zoom-head" href="${escapeHTML(t.zoom_link)}" target="_blank">${icon("video", 13)} Zoom</a>`;
    }
  }

  const acts = [];
  if ((ctx === "now" || ctx === "past") && o.mat && o.mat.file_url) acts.push(`<button class="sx-btn sx-btn-teal" data-view-mat="${escapeHTML(o.mat.file_url)}" data-view-title="${escapeHTML(t.title)}">${icon("book", 15)} Materi</button>`);
  if ((ctx === "now" || ctx === "past") && o.asg) {
    if (!o.sub) acts.push(`<button class="sx-btn sx-btn-warn" data-upload-asg="${o.asg.id}" data-upload-deadline="${o.asg.deadline || ""}">${icon("upload", 15)} Kumpulkan Tugas</button>`);
    else {
      if (o.sub.file_url) acts.push(`<button class="sx-btn sx-btn-soft" data-view-mat="${escapeHTML(o.sub.file_url)}" data-view-title="File Tugas">${icon("file", 15)} File Tugas</button>`);
      if (o.sub.status === "reviewed") acts.push(`<button class="sx-btn sx-btn-soft" data-feedback-sub="${o.sub.id}">${icon("star", 15)} Feedback</button>`);
    }
  }
  if (ctx === "upcoming" && t.attachment_url) acts.push(`<a class="sx-btn sx-btn-soft" href="${escapeHTML(t.attachment_url)}" target="_blank">${icon("file", 15)} Lampiran</a>`);

  // Master form buttons with inline status pill underneath each button
  let mfActionsHtml = "";
  if (Array.isArray(o.masterForms)) {
    const mfByCategory = {};
    o.masterForms.forEach(mf => { mfByCategory[mf.master_category] = mf; });
    const styleMap = { presensi: "sx-btn-teal", pretest: "sx-btn-primary", posttest: "sx-btn-soft", tugas: "sx-btn-warn", laporan_mandiri: "sx-btn-cyan" };
    const cols = MASTER_FORM_CATS.map((cat) => {
      const mf = mfByCategory[cat.key];
      const btn = mf?.gform_url
        ? `<button class="sx-btn ${styleMap[cat.key] || "sx-btn-soft"}" data-masterform="${cat.key}" data-tid="${t.id}">${icon(cat.icon, 15)} ${cat.label}</button>`
        : `<span class="sx-btn sx-btn-soft" style="opacity:.4;cursor:not-allowed" title="Form belum tersedia">${icon(cat.icon, 15)} ${cat.label}</span>`;
      let pill = "";
      if (mf?.gform_url) {
        // Semua status dari form_responses (gform response per form + training)
        const done = !!(o.submittedKeys && o.submittedKeys.has(`${mf.id}:${t.id}`));
        const doneLabel = cat.key === "presensi" ? "Hadir" : "Terisi";
        pill = done
          ? `<span class="mf-pill mf-pill-done">${icon("check",9)} ${doneLabel}</span>`
          : `<span class="mf-pill mf-pill-pending">${icon("clock",9)} Belum</span>`;
      }
      return `<div class="mf-btn-col">${btn}${pill ? `<div class="mf-pill-under">${pill}</div>` : ""}</div>`;
    }).join("");
    mfActionsHtml = `<div class="mf-actions-row">${cols}</div>`;
  }

  const deadlineChip = (ctx !== "upcoming" && o.asg && !o.sub) ? _deadlineChip(o.asg.deadline) : "";

  return `<div class="sx-card${isLive ? " is-live" : ""}">
    <div class="sx-head">
      <div class="sx-badges"><span class="sx-week">Sesi ${wn}</span>${badges.join("")}${zoomHeadBtn}</div>
      <div class="sx-when"><span>${icon("calendar", 13)} ${ds}</span>${time ? `<span>${icon("clock", 13)} ${time}</span>` : ""}</div>
    </div>
    <h3 class="sx-title">${escapeHTML(t.title)}</h3>
    ${t.speaker ? `<p class="sx-speaker">${icon("user", 13)} ${escapeHTML(t.speaker)}</p>` : ""}
    ${deadlineChip ? `<div class="sx-dl-row">${deadlineChip}</div>` : ""}
    ${acts.length ? `<div class="sx-actions">${acts.join("")}</div>` : ""}
    ${mfActionsHtml}
  </div>`;
}

// Thin wrappers (keep existing call sites working)
function buildLmsHeroCard(t, wn, attended, mat, asg, sub, today) {
  return buildSessionCard(t, wn, { ctx: "now", attended, mat, asg, sub, today });
}
function buildLmsUpcomingCard(t, wn, today) {
  return buildSessionCard(t, wn, { ctx: "upcoming", today });
}
function buildLmsDoneCard(t, wn, attended, mat, asg, sub) {
  return buildSessionCard(t, wn, { ctx: "past", attended, mat, asg, sub });
}

function buildDeadlineCard(deadline) {
  if (!deadline) return "";
  const dlMs = new Date(deadline).getTime();
  const nowMs = Date.now();
  const diffMs = dlMs - nowMs;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr  = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  let sisaLabel, style, overdue = false;
  if (diffMs <= 0) {
    sisaLabel = "Deadline telah terlewat";
    style = "dl-overdue"; overdue = true;
  } else if (diffMin < 60) {
    sisaLabel = `Sisa ${diffMin} menit`;
    style = "dl-urgent";
  } else if (diffHr < 24) {
    sisaLabel = `Sisa ${diffHr} jam ${diffMin % 60} menit`;
    style = "dl-urgent";
  } else if (diffDay < 3) {
    sisaLabel = `Sisa ${diffDay} hari ${diffHr % 24} jam`;
    style = "dl-warning";
  } else {
    sisaLabel = `Sisa ${diffDay} hari`;
    style = "dl-normal";
  }

  const dlDate = new Date(deadline).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const dlTime = new Date(deadline).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ".") + " WIB";
  const clockSvg = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;

  return `<div class="lms-deadline-card ${style}">
    <div class="lms-deadline-row">
      <div class="lms-deadline-left">
        ${clockSvg}
        <div>
          <span class="lms-deadline-label">${overdue ? "Deadline Terlewat" : "Deadline Tugas"}</span>
          <span class="lms-deadline-date">${dlDate} • ${dlTime}</span>
        </div>
      </div>
      <span class="lms-deadline-sisa">${sisaLabel}</span>
    </div>
  </div>`;
}

function _extractFormId(url) {
  if (!url) return null;
  const m = url.match(/\/forms\/d\/([^/?#]+)/);
  return m ? m[1] : null;
}

function _renderInlineForm(schema, prefill, lockedIds = new Set()) {
  const items = schema.items || [];
  const rows = items.map((item, idx) => {
    const prefillVal = prefill[item.questionId] ?? "";
    const isLocked = lockedIds.has(item.questionId);
    let inputHtml = "";

    if (isLocked) {
      inputHtml = `<div class="gf-locked-val">${escapeHTML(String(prefillVal) || "—")}<input type="hidden" name="q_${item.questionId}" value="${escapeHTML(String(prefillVal))}"></div>`;
    } else if (item.type === "radio") {
      inputHtml = `<div class="gf-choices">
        ${item.options.map((opt) => `<label class="gf-choice-label">
          <input type="radio" name="q_${item.questionId}" value="${escapeHTML(opt)}" ${item.required ? "required" : ""} ${prefillVal === opt ? "checked" : ""}>
          <span class="gf-choice-indicator"></span>
          <span>${escapeHTML(opt)}</span>
        </label>`).join("")}
      </div>`;
    } else if (item.type === "checkbox") {
      const preArr = Array.isArray(prefillVal) ? prefillVal : [];
      inputHtml = `<div class="gf-choices">
        ${item.options.map((opt) => `<label class="gf-choice-label">
          <input type="checkbox" name="q_${item.questionId}" value="${escapeHTML(opt)}" ${preArr.includes(opt) ? "checked" : ""}>
          <span class="gf-choice-indicator sq"></span>
          <span>${escapeHTML(opt)}</span>
        </label>`).join("")}
      </div>`;
    } else if (item.type === "rating") {
      const lo = parseInt(item.ratingLow ?? item.options?.[0]) || 1;
      const hi = parseInt(item.ratingHigh ?? item.options?.[1]) || 5;
      const loLabel = item.ratingLowLabel ?? item.options?.[2] ?? "";
      const hiLabel = item.ratingHighLabel ?? item.options?.[3] ?? "";
      inputHtml = `<div>
        <div class="gf-rating-wrap" style="display:flex;gap:6px;flex-wrap:wrap">
          ${Array.from({length: hi - lo + 1}, (_, i) => lo + i).map((n) => `
            <label class="gf-rating-label" title="${n}">
              <input type="radio" name="q_${item.questionId}" value="${n}" ${item.required ? "required" : ""} ${prefillVal == n ? "checked" : ""}>
              <span class="gf-rating-btn">${n}</span>
            </label>`).join("")}
        </div>
        ${(loLabel || hiLabel) ? `<div class="gf-rating-labels"><span>${escapeHTML(loLabel)}</span><span>${escapeHTML(hiLabel)}</span></div>` : ""}
      </div>`;
    } else if (item.type === "textarea") {
      inputHtml = `<textarea class="gf-textarea-input" name="q_${item.questionId}" rows="4" placeholder="Tulis jawaban Anda…" ${item.required ? "required" : ""}>${escapeHTML(prefillVal)}</textarea>`;
    } else if (item.type === "select") {
      inputHtml = `<select class="gf-text-input" name="q_${item.questionId}" ${item.required ? "required" : ""}>
        <option value="">— Pilih —</option>
        ${item.options.map((o) => `<option value="${escapeHTML(o)}" ${prefillVal === o ? "selected" : ""}>${escapeHTML(o)}</option>`).join("")}
      </select>`;
    } else if (item.type === "date") {
      inputHtml = `<input type="date" class="gf-text-input" name="q_${item.questionId}" value="${escapeHTML(prefillVal)}" ${item.required ? "required" : ""}>`;
    } else if (item.type === "time") {
      inputHtml = `<input type="time" class="gf-text-input" name="q_${item.questionId}" value="${escapeHTML(prefillVal)}" ${item.required ? "required" : ""}>`;
    } else if (item.type === "number") {
      inputHtml = `<input type="number" class="gf-text-input" name="q_${item.questionId}" value="${escapeHTML(prefillVal)}" placeholder="Tulis angka…" ${item.required ? "required" : ""}>`;
    } else if (item.type === "file") {
      inputHtml = `<input type="url" class="gf-text-input" name="q_${item.questionId}" value="${escapeHTML(prefillVal)}" placeholder="Tempel link file (Google Drive, dll.)" ${item.required ? "required" : ""}>`;
    } else {
      inputHtml = `<input type="text" class="gf-text-input" name="q_${item.questionId}" value="${escapeHTML(prefillVal)}" placeholder="Tulis jawaban Anda…" ${item.required ? "required" : ""}>`;
    }

    return `<div class="gf-question${isLocked ? " gf-question-locked" : ""}">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:${item.description ? "4px" : "10px"}">
        ${isLocked ? `<span class="gf-q-lock">${icon("lock", 12)}</span>` : `<span class="gf-q-num">${idx + 1}</span>`}
        <span class="gf-q-title">${escapeHTML(item.title)}${item.required && !isLocked ? `<span class="req">*</span>` : ""}</span>
      </div>
      ${item.description ? `<p class="gf-q-desc">${escapeHTML(item.description)}</p>` : ""}
      <div class="gf-input-area">${inputHtml}</div>
    </div>`;
  }).join("");

  return { rows, items };
}

async function openTugasUploadModal(assignmentId, deadline, profile, onSuccess) {
  const c = document.getElementById("content");
  const [{ data: asg }, masterForm] = await Promise.all([
    _supabase.from("assignments").select("title,description,training_id").eq("id", assignmentId).single(),
    _getMasterForm(),
  ]);

  const formFields = Array.isArray(masterForm?.fields) && masterForm.fields.length ? masterForm.fields
    : [
        { type: "text",     label: "Email",                   prefill: "email",       required: true, locked: true },
        { type: "text",     label: "Nama Lengkap",            prefill: "full_name",   required: true, locked: true },
        { type: "text",     label: "Institusi / Universitas", prefill: "institution", required: true, locked: true },
        { type: "textarea", label: "Link / Jawaban Tugas",    required: true },
      ];
  const settings = (masterForm?.schema && typeof masterForm.schema === "object" && !Array.isArray(masterForm.schema)) ? masterForm.schema : {};
  const allowUpload = settings.allowFileUpload !== false;
  const maxMB = settings.maxFileSizeMB || 5;

  const profileMap = { email: profile.email || "", full_name: profile.full_name || "", institution: profile.institution || "" };
  _tugasUploadFile = null;

  // Separate prefill fields (shown as readonly chips) vs editable fields
  const prefillFields = formFields.filter(f => f.prefill);
  const editFields = formFields.filter(f => !f.prefill);

  // Compact prefill chips
  const profileChips = prefillFields.map(f =>
    `<div style="display:flex;flex-direction:column;gap:2px;min-width:0">
      <span style="font-size:10px;font-weight:600;color:#10B981;text-transform:uppercase;letter-spacing:.5px">${escapeHTML(f.label)}</span>
      <span style="font-size:13px;font-weight:600;color:#1E293B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(profileMap[f.prefill] || "—")}</span>
    </div>`).join("");

  // Editable fields layout — 2 columns for short text, full-width for textarea
  const editRows = editFields.map((f, i) => {
    const isWide = f.type === "textarea" || f.type === "url";
    const nameKey = `efield_${i}`;
    const inputHtml = f.type === "textarea"
      ? `<textarea class="input" name="${nameKey}" rows="3" placeholder="${escapeHTML(f.label)}" ${f.required ? "required" : ""} style="resize:vertical;min-height:80px"></textarea>`
      : `<input type="${f.type === "url" ? "url" : "text"}" class="input" name="${nameKey}" placeholder="${escapeHTML(f.label)}" ${f.required ? "required" : ""}>`;
    return `<div style="grid-column:${isWide ? "1/-1" : "auto"}">
      <label class="label" style="margin-bottom:5px">${escapeHTML(f.label)}${f.required ? ' <span style="color:var(--bad)">*</span>' : ""}</label>
      ${inputHtml}
    </div>`;
  }).join("");

  const late = deadline && Date.now() > new Date(deadline).getTime();

  c.innerHTML = `
    <div style="display:grid;grid-template-columns:300px 1fr;gap:0;height:calc(100vh - 120px);overflow:hidden;border-radius:16px;border:1px solid #E2E8F0;box-shadow:0 4px 24px rgba(30,64,175,.08)">

      <!-- LEFT PANEL: info + profile -->
      <div style="background:linear-gradient(160deg,#122D55 0%,#1A437B 55%,#1E5094 100%);padding:24px 22px;display:flex;flex-direction:column;gap:0;overflow:hidden;position:relative">
        <div style="position:absolute;right:-40px;bottom:-40px;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,.06)"></div>
        <div style="position:absolute;right:20px;top:20px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.04)"></div>

        <button id="tugasBackBtn" style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;margin-bottom:20px;width:fit-content">${icon("arrow-left",13)} Kembali</button>

        <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:rgba(255,255,255,.6);text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;gap:5px">${icon("upload",11)} Pengumpulan Tugas</div>
        <h2 style="font-size:16px;font-weight:800;color:#fff;line-height:1.4;margin:0 0 10px">${escapeHTML(asg?.title || "Kumpulkan Tugas")}</h2>
        ${asg?.description ? `<p style="font-size:12px;color:rgba(255,255,255,.75);line-height:1.5;margin:0 0 12px">${escapeHTML(asg.description.length>120?asg.description.slice(0,120)+"…":asg.description)}</p>` : ""}

        ${deadline ? `<div style="display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.12);border-radius:8px;padding:8px 12px;margin-bottom:16px;border:1px solid rgba(255,255,255,.15)">
          ${icon("clock",13)}
          <div>
            <div style="font-size:10px;color:rgba(255,255,255,.6);font-weight:600">DEADLINE</div>
            <div style="font-size:12.5px;color:#fff;font-weight:700">${fmtDateTime(deadline)} WIB</div>
          </div>
          ${late ? `<span style="margin-left:auto;background:#EF4444;color:#fff;border-radius:5px;padding:2px 7px;font-size:10px;font-weight:700">Terlewat</span>` : `<span style="margin-left:auto;background:#10B981;color:#fff;border-radius:5px;padding:2px 7px;font-size:10px;font-weight:700">Aktif</span>`}
        </div>` : ""}

        <div style="flex:1"></div>

        <!-- Profile auto-fill info -->
        ${prefillFields.length ? `
        <div style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:12px 14px">
          <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.7);letter-spacing:.5px;margin-bottom:10px;display:flex;align-items:center;gap:4px">${icon("check-circle",11)} DATA DARI PROFIL ANDA</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${prefillFields.map(f => `<div>
              <div style="font-size:10px;color:rgba(255,255,255,.55);font-weight:600;text-transform:uppercase;letter-spacing:.4px">${escapeHTML(f.label)}</div>
              <div style="font-size:12.5px;color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(profileMap[f.prefill]||"—")}</div>
            </div>`).join("")}
          </div>
        </div>` : ""}
      </div>

      <!-- RIGHT PANEL: form -->
      <form id="tugasSubmitForm" style="background:#fff;display:flex;flex-direction:column;overflow:hidden">
        <div style="padding:20px 24px;border-bottom:1px solid #F1F5F9;flex-shrink:0">
          <h3 style="font-size:15px;font-weight:700;color:#1E293B;margin:0">Lengkapi Pengumpulan</h3>
          <p style="font-size:12px;color:#94A3B8;margin:3px 0 0">Semua field wajib diisi sebelum mengirim.</p>
        </div>
        <div style="flex:1;overflow-y:auto;padding:18px 24px;display:flex;flex-direction:column;gap:14px">
          ${editRows}
          ${allowUpload ? `
          <div>
            <label class="label" style="margin-bottom:6px;font-size:12.5px">${icon("upload",12)} Upload Dokumen <span style="font-size:11px;color:#94A3B8;font-weight:400">Opsional · Maks. ${maxMB}MB</span></label>
            <div id="fileDropZone" style="border:2px dashed #CBD5E1;border-radius:10px;padding:14px;text-align:center;cursor:pointer;transition:all .2s;background:#FAFBFC" onclick="document.getElementById('tugasFileInput').click()">
              <div id="fileDropLabel" style="display:flex;align-items:center;justify-content:center;gap:8px">
                ${icon("upload",16)}<span style="font-size:12.5px;color:#64748B;font-weight:500">Klik atau drag file ke sini</span><span style="font-size:11px;color:#CBD5E1">PDF, Word, gambar</span>
              </div>
            </div>
            <input type="file" id="tugasFileInput" style="display:none" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.zip">
          </div>` : ""}
        </div>
        <div id="tugasFormErr" style="display:none;padding:6px 24px;color:var(--bad);font-size:12.5px;flex-shrink:0"></div>
        <div style="padding:14px 24px;background:#F8FAFC;border-top:1px solid #F1F5F9;display:flex;gap:10px;flex-shrink:0">
          <button type="button" id="tugasFormBack" class="btn btn-ghost" style="height:40px;font-size:13px">Batal</button>
          <button type="submit" id="tugasSubmitBtn" style="flex:1;height:40px;font-size:14px;font-weight:700;background:linear-gradient(135deg,#122D55,#1A437B);color:#fff;border:none;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:opacity .2s">
            ${icon("check",16)} Kirim & Kumpulkan
          </button>
        </div>
      </form>
    </div>`;

  document.getElementById("tugasBackBtn").addEventListener("click", () => { if (onSuccess) onSuccess(); else if (typeof renderTugas === "function") renderTugas(profile); });
  document.getElementById("tugasFormBack").addEventListener("click", () => { if (onSuccess) onSuccess(); else if (typeof renderTugas === "function") renderTugas(profile); });

  // File upload drag & drop
  if (allowUpload) {
    const dropZone = document.getElementById("fileDropZone");
    const fileInput = document.getElementById("tugasFileInput");
    const dropLabel = document.getElementById("fileDropLabel");
    const maxBytes = maxMB * 1024 * 1024;

    function setFile(file) {
      if (!file) return;
      if (file.size > maxBytes) { toast(`File terlalu besar. Maksimal ${maxMB}MB.`, "error"); return; }
      _tugasUploadFile = file;
      dropLabel.innerHTML = `${icon("check-circle",18)}<span style="font-size:13px;color:#059669;font-weight:600">${escapeHTML(file.name)}</span><span style="font-size:11px;color:#10B981">${(file.size/1024/1024).toFixed(2)} MB · Klik untuk ganti</span>`;
      dropZone.style.borderColor = "#10B981";
      dropZone.style.background = "#F0FDF9";
    }
    fileInput.addEventListener("change", () => setFile(fileInput.files[0]));
    dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.style.borderColor = "#3B82F6"; dropZone.style.background = "#EFF6FF"; });
    dropZone.addEventListener("dragleave", () => { dropZone.style.borderColor = _tugasUploadFile ? "#10B981" : "#CBD5E1"; dropZone.style.background = _tugasUploadFile ? "#F0FDF9" : "#FAFBFC"; });
    dropZone.addEventListener("drop", e => { e.preventDefault(); setFile(e.dataTransfer.files[0]); });
  }

  document.getElementById("tugasSubmitForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("tugasSubmitBtn");
    const errEl = document.getElementById("tugasFormErr");
    const _restore = _btnLoad(btn, " Menyimpan…");
    errEl.style.display = "none";
    _progress.start();

    try {
      const fd = new FormData(e.target);
      let fileUrl = null;

      // Upload file to Drive if provided
      if (_tugasUploadFile) {
        btn.innerHTML = `<span class="btn-spin"></span> Mengunggah file…`;
        const result = await _driveUpload(_tugasUploadFile, _tugasUploadFile.name, ["ILP Academy 2026", "Tugas"]);
        fileUrl = result?.webViewLink || null;
      }

      // First editable non-prefill field as fallback file_url (link answer)
      if (!fileUrl) {
        editFields.forEach((f, i) => { if (!fileUrl) fileUrl = fd.get(`efield_${i}`) || null; });
      }

      const isLate = deadline && Date.now() > new Date(deadline).getTime();
      const { error } = await _supabase.from("submissions").upsert(
        { assignment_id: assignmentId, participant_id: profile.id, file_url: fileUrl, status: isLate ? "late" : "submitted", submitted_at: new Date().toISOString() },
        { onConflict: "assignment_id,participant_id" }
      );
      if (error) throw new Error(error.message);
      qcInvalidate("sub:", "sub:all", "fb:");
      _progress.done();
      toast(isLate ? "Tugas tercatat (terlambat)." : "Tugas berhasil dikumpulkan!");
      if (onSuccess) onSuccess();
    } catch (err) {
      _progress.done();
      errEl.textContent = "Gagal: " + ((err && err.message) || String(err));
      errEl.style.display = "block";
      _restore();
    }
  });
}

/* ===================================================================== */


/* Build a single week card */
function buildWeekCard(t, weekNum, mat, asg, sub, attended, status) {
  const headerBg = { current: "bg-current", completed: "bg-completed", incomplete: "bg-incomplete", upcoming: "bg-upcoming" }[status] || "bg-upcoming";

  const badge = {
    current:    `<span class="badge" style="background:rgba(255,255,255,.2);color:#fff;font-size:11px;padding:4px 10px"><span style="width:7px;height:7px;border-radius:50%;background:#fff;display:inline-block;margin-right:5px;vertical-align:middle"></span>Sedang Berlangsung</span>`,
    completed:  `<span class="badge badge-success" style="font-size:11px">${icon("check",12)} Selesai</span>`,
    incomplete: `<span class="badge badge-warning" style="font-size:11px">${icon("clock",12)} Belum Lengkap</span>`,
    locked:     `<span style="color:#94A3B8;font-size:12px;display:flex;align-items:center;gap:5px">${icon("lock",13)} Dibuka ${fmtDate(t.training_date)}</span>`,
  }[status] || "";

  const header = `
    <div class="wk-header ${headerBg}">
      <div class="wk-header-left">
        <span class="wk-num">Training ke-${weekNum}</span>
        <span class="wk-title">${escapeHTML(t.title)}</span>
      </div>
      <div class="wk-badges">${badge}</div>
    </div>`;

  // Training column
  const tDone = attended;
  const zoomBtn = t.zoom_link
    ? `<button class="btn btn-primary btn-sm" data-zoom="${escapeHTML(t.zoom_link)}" data-tid="${t.id}" data-date="${t.training_date}" data-start="${t.start_time || ""}" data-end="${t.end_time || ""}">${icon("video",14)}Join Zoom</button>`
    : "";
  const trainingCol = `
    <div class="wk-item">
      <div class="wk-item-head">
        <span class="wk-item-icon ${tDone ? "done-icon" : ""}">${icon(tDone ? "check" : "video", 15)}</span>
        <span class="wk-item-label">Training</span>
      </div>
      <div class="wk-item-meta">
        ${t.training_date ? `<span>${icon("calendar",11)} ${fmtDate(t.training_date)}</span>` : ""}
        ${t.start_time ? `<span>${icon("clock",11)} ${fmtTime(t.start_time)}${t.end_time ? " – " + fmtTime(t.end_time) : ""} WIB</span>` : ""}
        ${t.speaker ? `<span>${icon("user",11)} ${escapeHTML(t.speaker)}</span>` : ""}
      </div>
      <span class="wk-status ${tDone ? "done" : "not-done"}">${tDone ? icon("check",11) + " Hadir" : icon("clock",11) + " Belum Hadir"}</span>
      <div class="wk-actions">${zoomBtn}</div>
    </div>`;

  // Material column
  const matCol = mat
    ? `<div class="wk-item">
        <div class="wk-item-head">
          <span class="wk-item-icon done-icon">${icon("book",15)}</span>
          <span class="wk-item-label">Materi</span>
        </div>
        <p class="wk-item-title">${escapeHTML(mat.title)}</p>
        <div class="wk-item-meta">
          ${mat.publish_date ? `<span>${icon("calendar",11)} ${fmtDate(mat.publish_date)}</span>` : ""}
        </div>
        <span class="wk-status done">${icon("check",11)} Tersedia</span>
        <div class="wk-actions">
          ${mat.file_url ? `<button class="btn-view-file" data-view-mat="${escapeHTML(mat.file_url)}" data-view-title="${escapeHTML(mat.title || "Materi")}">${icon("book",14)} Buka Materi</button>` : ""}
        </div>
      </div>`
    : `<div class="wk-item">
        <div class="wk-item-head">
          <span class="wk-item-icon">${icon("book",15)}</span>
          <span class="wk-item-label">Materi</span>
        </div>
        <p class="wk-item-title" style="color:#94A3B8;font-size:13px">Belum tersedia</p>
        <span class="wk-status not-done">Belum Tersedia</span>
      </div>`;

  // Assignment column — hitung ulang status late berdasarkan deadline terkini
  let subCls = "not-done", subTxt = icon("clock",11) + " Belum Dikumpulkan";
  if (sub) {
    if (sub.status === "reviewed") {
      subCls = "reviewed"; subTxt = icon("star",11) + " Sudah Direview";
    } else {
      // Hitung ulang: apakah submission_at melewati deadline saat ini?
      const actuallyLate = asg && asg.deadline
        ? new Date(sub.submitted_at) > new Date(asg.deadline)
        : false;
      if (actuallyLate) { subCls = "late"; subTxt = icon("clock",11) + " Terlambat"; }
      else              { subCls = "done"; subTxt = icon("check",11) + " Terkumpul"; }
    }
  }

  const asgCol = asg
    ? `<div class="wk-item">
        <div class="wk-item-head">
          <span class="wk-item-icon ${sub ? "done-icon" : "warn-icon"}">${icon(sub ? "check" : "task", 15)}</span>
          <span class="wk-item-label">Tugas</span>
        </div>
        <p class="wk-item-title">${escapeHTML(asg.title)}</p>
        <div class="wk-item-meta">
          ${asg.deadline ? `<span>${icon("clock",11)} Deadline ${fmtDateTime(asg.deadline)} WIB</span>` : ""}
        </div>
        ${sub && sub.status === "reviewed"
          ? `<button class="wk-status reviewed" style="cursor:pointer;border:none;background:#EAF1FA" data-feedback-sub="${sub.id}" title="Klik untuk lihat feedback">${icon("star",11)} Sudah Direview — Lihat Feedback</button>`
          : `<span class="wk-status ${subCls}">${subTxt}</span>`}
        <div class="wk-actions">
          ${!sub
            ? `<button class="btn btn-primary btn-sm" data-open-tugas="${asg.id}" data-deadline="${asg.deadline || ""}">${icon("upload",14)} Kumpulkan Tugas</button>`
            : sub.file_url ? `<button class="btn-view-file" data-view-mat="${escapeHTML(sub.file_url)}" data-view-title="File Tugas">${icon("file",15)} Lihat File</button>` : ""}
        </div>
      </div>`
    : `<div class="wk-item">
        <div class="wk-item-head">
          <span class="wk-item-icon">${icon("task",15)}</span>
          <span class="wk-item-label">Tugas</span>
        </div>
        <p class="wk-item-title" style="color:#94A3B8;font-size:13px">Belum tersedia</p>
        <span class="wk-status not-done">Belum Tersedia</span>
      </div>`;

  return `<div class="week-card wk-${status}">
    ${header}
    <div class="wk-body">${trainingCol}${matCol}${asgCol}</div>
  </div>`;
}

/* =====================================================================
   MASTER FORM — Inline renderer (2-panel, same design as Kumpulkan Tugas)
   ===================================================================== */
async function openMasterFormInline(form, training, profile, onDone) {
  const c = document.getElementById("content");
  // Make content fill its flex parent exactly so height:100% works inside
  c.style.cssText += ";display:flex;flex-direction:column;padding:10px;box-sizing:border-box;";
  const cat = MASTER_FORM_CATS.find(c => c.key === form.master_category) || { label: form.title, icon: "clipboard", color: "#215AA9", bg: "#EFF6FF" };
  const wn = training.week_number ? `Sesi ${training.week_number}` : "";
  const trainingLabel = wn ? `${wn} — ${training.title}` : training.title;
  const goBack = () => {
    c.style.cssText = "";  // restore content styles
    if (typeof onDone === "function") onDone(); else navigate("training");
  };

  // Show loading state in the two-panel layout
  c.innerHTML = `
    <div style="display:grid;grid-template-columns:300px 1fr;gap:0;height:calc(100% - 10px);margin-bottom:10px;border-radius:16px;border:1px solid #E2E8F0;box-shadow:0 4px 24px rgba(30,64,175,.08);overflow:hidden">
      <div style="background:linear-gradient(160deg,#122D55 0%,#1A437B 55%,#1E5094 100%);padding:24px 22px;display:flex;flex-direction:column;gap:0">
        <button id="mfBackBtn" style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;margin-bottom:20px;width:fit-content">${icon("arrow-left",13)} Kembali</button>
        <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:rgba(255,255,255,.6);text-transform:uppercase;margin-bottom:8px">${escapeHTML(cat.label)}</div>
        <h2 style="font-size:14px;font-weight:800;color:#fff;line-height:1.4">${escapeHTML(training.title)}</h2>
      </div>
      <div style="background:#fff;display:flex;align-items:center;justify-content:center">
        <div class="loader"><div class="spinner"></div>Memuat formulir…</div>
      </div>
    </div>`;
  document.getElementById("mfBackBtn").addEventListener("click", goBack);

  // Convert hex questionId/entryId to decimal string (Google Forms prefill format)
  const _hexToDec = (h) => {
    if (!h) return null;
    const s = String(h);
    return /^[0-9a-f]+$/i.test(s) && !/^\d+$/.test(s) ? parseInt(s, 16).toString() : s;
  };

  // Profile field → stored entry column mapping (decimal for Google Forms entry.XXXX)
  const profileEntries = {
    "Nama Lengkap":  _hexToDec(form.entry_nama),
    "ID Peserta":    _hexToDec(form.entry_id_peserta),
    "Email":         _hexToDec(form.entry_email),
    "Institusi":     _hexToDec(form.entry_institusi),
    "Sesi Training": _hexToDec(form.entry_training),
  };

  // Profile field values for auto-fill
  const trainingCode = training.training_code || "";
  const profileFieldMap = {
    "Nama Lengkap":  profile.full_name   || "",
    "ID Peserta":    profile.id          || "",
    "Email":         profile.email       || "",
    "Institusi":     profile.institution || "",
    "Sesi Training": trainingLabel,
    "ID Training":   trainingCode,
  };

  // Fetch live schema from Google Forms API — this is the authoritative field list.
  // form.fields in DB may only have profile fields and miss custom ones (e.g. "Konfirmasi Kehadiran").
  let liveEntryIdByLabel = {};
  let allFieldDefs = [];
  let schemaError = null;

  if (!form.gsheet_id) {
    schemaError = "Form ini belum terhubung ke Google Form (gsheet_id kosong). Hubungi admin.";
  } else {
    try {
      const schemaRes = await fetch(_edgeFnUrl("google-form-schema") + "?formId=" + encodeURIComponent(form.gsheet_id), {
        headers: _edgeFnHeaders(),
      });
      const schemaJson = await schemaRes.json();
      if (!schemaJson.ok) {
        schemaError = "Gagal memuat skema form: " + (schemaJson.error || "Unknown error");
      } else if (!Array.isArray(schemaJson.items) || !schemaJson.items.length) {
        schemaError = "Google Form tidak memiliki pertanyaan. Tambahkan pertanyaan di Google Form terlebih dahulu.";
      } else {
        console.log("[MF] rawDebug:", JSON.stringify(schemaJson.rawDebug));
        schemaJson.items.forEach(item => {
          if (item.questionId && item.title) liveEntryIdByLabel[item.title] = item.questionId;
        });
        console.log("[MF] liveEntryIdByLabel:", JSON.stringify(liveEntryIdByLabel));
        // DB fields are authoritative (admin-managed). Google Forms API only provides live entryIds.
        // Only fall back to Google Forms items if DB has no fields at all.
        const dbFields = Array.isArray(form.fields) && form.fields.length ? form.fields : null;
        if (dbFields) {
          allFieldDefs = dbFields.map(f => ({
            label:           f.label,
            type:            f.type            || "text",
            required:        !!f.required,
            options:         f.options         || [],
            entryId:         liveEntryIdByLabel[f.label] || f.entryId || "",
            description:     f.description     || "",
            ratingLow:       f.ratingLow,
            ratingHigh:      f.ratingHigh,
            ratingLowLabel:  f.ratingLowLabel,
            ratingHighLabel: f.ratingHighLabel,
          }));
        } else {
          allFieldDefs = schemaJson.items.map(item => ({
            label:          item.title,
            type:           item.type,
            required:       item.required,
            options:        item.options || [],
            entryId:        item.questionId,
            description:    item.description || "",
            ratingLow:      item.type === "rating" ? (parseInt(item.options?.[0]) || 1) : undefined,
            ratingHigh:     item.type === "rating" ? (parseInt(item.options?.[1]) || 5) : undefined,
            ratingLowLabel: item.type === "rating" ? (item.options?.[2] || "") : undefined,
            ratingHighLabel:item.type === "rating" ? (item.options?.[3] || "") : undefined,
          }));
        }
      }
    } catch (e) {
      schemaError = "Koneksi ke Google Forms gagal: " + e.message;
      console.error("[form-schema fetch]", e);
    }
  }

  // If schema fetch failed, show error — do NOT fall back to DB fields silently
  if (schemaError) {
    const rightPanel = c.querySelector("[data-mf-right]") || c.querySelector("div:last-child > div:last-child");
    const errHtml = `<div style="padding:40px 32px;text-align:center">
      <div style="color:#F59E0B;margin-bottom:12px">${icon("alert-triangle",32)}</div>
      <p style="font-weight:700;font-size:15px;color:#1E293B;margin-bottom:8px">Gagal Memuat Pertanyaan</p>
      <p style="font-size:13px;color:#64748B;margin-bottom:16px">${escapeHTML(schemaError)}</p>
      <button class="btn btn-primary btn-sm" id="mfRetryBtn">${icon("refresh",13)} Coba Lagi</button>
    </div>`;
    c.innerHTML = errHtml;
    document.getElementById("mfRetryBtn")?.addEventListener("click", () => openMasterFormInline(form, training, profile, onDone));
    return;
  }

  const allItems = allFieldDefs.map((fld, idx) => ({
    questionId: liveEntryIdByLabel[fld.label] || profileEntries[fld.label] || _hexToDec(fld.entryId) || `local_${idx}`,
    title:      fld.label,
    type:       fld.type       || "text",
    required:   !!fld.required,
    description: fld.description || "",
    options:    fld.options    || [],
    ratingLow:       fld.ratingLow,
    ratingHigh:      fld.ratingHigh,
    ratingLowLabel:  fld.ratingLowLabel,
    ratingHighLabel: fld.ratingHighLabel,
  }));

  if (!allItems.length) {
    c.innerHTML = `<div class="card card-pad" style="text-align:center;padding:48px">
      <div style="color:var(--bad);margin-bottom:12px">${icon("x-circle",32)}</div>
      <p style="font-weight:700;font-size:16px">Formulir belum dikonfigurasi</p>
      <p style="font-size:13px;color:var(--ink-500);margin-top:6px">Admin belum menambahkan pertanyaan pada formulir ini.</p>
      <button class="btn btn-ghost btn-sm" id="mfBackBtn2" style="margin-top:16px">${icon("arrow-left",14)} Kembali</button>
    </div>`;
    document.getElementById("mfBackBtn2").addEventListener("click", goBack);
    return;
  }

  // DEBUG — remove after fix
  console.log("[MF] allFieldDefs:", JSON.stringify(allFieldDefs.map(f => f.label)));
  console.log("[MF] allItems:", JSON.stringify(allItems.map(i => ({ title: i.title, qid: i.questionId }))));

  // Build prefill map and locked set for profile fields
  const prefill = {};
  const lockedIds = new Set();
  allItems.forEach((item) => {
    const pval = profileFieldMap[item.title];
    if (pval !== undefined) {
      prefill[item.questionId] = pval;
      lockedIds.add(item.questionId);
    }
  });

  // Separate visible questions (to fill) from locked profile fields (hidden inputs only)
  const visibleItems = allItems.filter(item => !lockedIds.has(item.questionId));
  const hiddenItems  = allItems.filter(item =>  lockedIds.has(item.questionId));

  const visibleSchema = { items: visibleItems };
  const { rows } = _renderInlineForm(visibleSchema, prefill, new Set());

  // Hidden inputs carry locked profile values into the FormData for submission
  const hiddenInputs = hiddenItems.map(item =>
    `<input type="hidden" name="q_${item.questionId}" value="${escapeHTML(String(prefill[item.questionId] || ""))}">`
  ).join("");

  const profileValues = {
    "Nama Lengkap":  profile.full_name   || "—",
    "ID Peserta":    profile.id          || "—",
    "Email":         profile.email       || "—",
    "Institusi":     profile.institution || "—",
    "Sesi Training": trainingLabel,
    ...(trainingCode ? { "ID Training": trainingCode } : {}),
  };

  const _formOpenedAt = Date.now();
  c.innerHTML = `
    <div style="display:grid;grid-template-columns:300px 1fr;gap:0;height:calc(100% - 10px);margin-bottom:10px;border-radius:16px;border:1px solid #E2E8F0;box-shadow:0 4px 24px rgba(30,64,175,.08);overflow:hidden">

      <!-- LEFT PANEL -->
      <div style="background:linear-gradient(160deg,#122D55 0%,#1A437B 55%,#1E5094 100%);padding:24px 22px;display:flex;flex-direction:column;overflow:hidden;position:relative;height:100%">
        <div style="position:absolute;right:-40px;bottom:-40px;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,.06);pointer-events:none"></div>

        <button id="mfBackBtn" style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;margin-bottom:20px;width:fit-content">${icon("arrow-left",13)} Kembali</button>

        <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:rgba(255,255,255,.6);text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;gap:5px">${icon(cat.icon,11)} ${escapeHTML(cat.label)}</div>

        <div style="background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:12px 14px;margin-bottom:16px">
          <div style="font-size:10px;color:rgba(255,255,255,.55);font-weight:600;letter-spacing:.4px;margin-bottom:4px">${wn ? escapeHTML(wn) : "TRAINING"}</div>
          <h2 style="font-size:14px;font-weight:800;color:#fff;line-height:1.4;margin:0">${escapeHTML(training.title)}</h2>
          ${training.speaker ? `<p style="font-size:11.5px;color:rgba(255,255,255,.65);margin:5px 0 0">${icon("user",11)} ${escapeHTML(training.speaker)}</p>` : ""}
          ${training.training_date ? `<p style="font-size:11.5px;color:rgba(255,255,255,.65);margin:4px 0 0">${icon("calendar",11)} ${fmtDate(training.training_date)}</p>` : ""}
        </div>

        <!-- Auto-fill profile info -->
        <div style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:14px 16px">
          <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.7);letter-spacing:.5px;margin-bottom:12px;display:flex;align-items:center;gap:5px">${icon("lock",11)} DATA TERISI OTOMATIS</div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${Object.entries(profileValues).map(([label, val]) => `<div>
              <div style="font-size:10px;color:rgba(255,255,255,.45);font-weight:600;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">${label}</div>
              <div style="font-size:12.5px;color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.4" title="${escapeHTML(val)}">${escapeHTML(val)}</div>
            </div>`).join("")}
          </div>
        </div>
      </div>

      <!-- RIGHT PANEL: form questions only (profile data sent as hidden inputs) -->
      <div style="background:#F8FAFC;display:flex;flex-direction:column;overflow-y:auto;height:100%">
        <div style="padding:20px 28px 16px;border-bottom:1px solid #E2E8F0;flex-shrink:0;background:#fff">
          <div style="display:inline-flex;align-items:center;gap:6px;background:${cat.bg};color:${cat.color};font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;margin-bottom:10px">${icon(cat.icon,12)} ${escapeHTML(cat.label)}</div>
          <h3 style="font-size:17px;font-weight:800;color:#1E293B;margin:0 0 4px">${escapeHTML(form.title || cat.label)}</h3>
          ${form.description ? `<p style="font-size:13px;color:#64748B;margin:0">${escapeHTML(form.description)}</p>` : ""}
        </div>
        <form id="mfFormEl" class="gf-page" style="padding:24px 28px;gap:14px;max-width:100%;margin:0">
          ${hiddenInputs}
          ${rows || `<div class="empty" style="padding:48px;text-align:center;color:var(--ink-400)">${icon("clipboard",32)}<p style="margin-top:12px">Tidak ada pertanyaan yang perlu diisi.</p></div>`}
          <div class="gf-submit-area" style="margin-top:4px">
            <span id="mfErrMsg" style="flex:1;color:var(--bad);font-size:13px"></span>
            <button type="button" class="gf-cancel-btn" id="mfCancelBtn">Batal</button>
            <button type="submit" class="gf-submit-btn" id="mfSubmitBtn">${icon("send",15)} Kirim Jawaban</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById("mfBackBtn").addEventListener("click", goBack);
  document.getElementById("mfCancelBtn").addEventListener("click", goBack);

  document.getElementById("mfFormEl").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("mfSubmitBtn");
    const errEl = document.getElementById("mfErrMsg");
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner" style="width:16px;height:16px;border-width:2px;margin:0 auto"></div>`;
    errEl.textContent = "";

    const fd = new FormData(e.target);
    const answers = {};
    // Collect all items — visible (user input) + hidden (profile auto-fill)
    allItems.forEach((item) => {
      const val = item.type === "checkbox"
        ? fd.getAll(`q_${item.questionId}`)
        : (fd.get(`q_${item.questionId}`) || "");
      answers[item.questionId] = val;
    });

    // Validate required visible fields only
    const missing = visibleItems.filter((item) =>
      item.required &&
      (Array.isArray(answers[item.questionId]) ? !answers[item.questionId].length : !answers[item.questionId])
    );
    if (missing.length) {
      errEl.textContent = `Wajib diisi: ${missing.map((m) => m.title).join(", ")}`;
      btn.disabled = false;
      btn.innerHTML = `${icon("send",15)} Kirim Jawaban`;
      return;
    }

    try {
      // 1. Submit to Google Forms (saves to Spreadsheet) — only fields with real entry IDs
      const googleAnswers = {};
      allItems.forEach((item) => {
        if (!/^local_/.test(item.questionId)) {
          googleAnswers[item.questionId] = answers[item.questionId];
        }
      });
      if (form.gsheet_id && Object.keys(googleAnswers).length) {
        await _submitFormResponse(form.gsheet_id, googleAnswers);
      }

      // 2. Save only prefill (profile) fields to Supabase for status pill tracking
      const labelledAnswers = {};
      allItems.forEach((item) => {
        if (lockedIds.has(item.questionId)) labelledAnswers[item.title] = answers[item.questionId];
      });
      labelledAnswers["ID Training"]   = trainingCode || training.id;
      labelledAnswers["Sesi Training"] = labelledAnswers["Sesi Training"] || trainingLabel;
      labelledAnswers["Training UUID"] = training.id;
      const { error: insErr } = await _supabase.from("form_responses").insert({
        form_id:       form.id,
        respondent_id: profile.id,
        response_data: labelledAnswers,
        submitted_at:  new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).replace(" ", "T") + "+07:00",
      });
      if (insErr) console.error("[form_responses insert]", insErr.message, insErr);

      const elapsed = Math.round((Date.now() - _formOpenedAt) / 1000);
      const elapsedStr = elapsed < 60 ? `${elapsed} detik` : `${Math.floor(elapsed/60)} menit ${elapsed%60} detik`;
      c.innerHTML = `<div class="gf-page"><div class="gf-success">
        <div class="gf-success-icon">🎉</div>
        <h3>Respons Terkirim!</h3>
        <p>Terima kasih telah mengisi <strong>${escapeHTML(cat.label)}</strong>.</p>
        <p>Jawaban Anda telah tersimpan.</p>
        <div class="gf-time-badge">${icon("clock",14)} Waktu pengisian: ${elapsedStr}</div>
        <div style="margin-top:24px"><button class="gf-cancel-btn" id="mfDoneBtn" style="padding:11px 28px">${icon("arrow-left",15)} Kembali ke Training</button></div>
      </div></div>`;
      document.getElementById("mfDoneBtn").addEventListener("click", goBack);
    } catch (err) {
      errEl.textContent = "Gagal mengirim: " + ((err && err.message) || String(err));
      btn.disabled = false;
      btn.innerHTML = `${icon("send",15)} Kirim`;
    }
  });
}

/* =====================================================================
   PARTICIPANT — TRAINING
   ===================================================================== */
PAGES.training = async function () {
  const profile = await requireAuth("participant");
  if (!profile) return;
  renderShell(profile, PARTICIPANT_NAV, profile.institution || "Peserta");
  const c = document.getElementById("content");

  const [{ data }, { data: attData }, masterForms, { data: mfResponses }, { data: subData }, { data: asgData }] = await Promise.all([
    qc("trainings:p", () => _supabase.from("trainings").select("*").or(`visible_from.is.null,visible_from.lte.${new Date().toISOString()}`)),
    qc("att:" + profile.id, () => _supabase.from("attendances").select("training_id").eq("participant_id", profile.id).eq("attendance_status", "present")),
    _fetchMasterForms(),
    _supabase.from("form_responses").select("form_id, response_data").eq("respondent_id", profile.id),
    qc("sub:" + profile.id, () => _supabase.from("submissions").select("assignment_id").eq("participant_id", profile.id)),
    qc("assignments:p", () => _supabase.from("assignments").select("id, training_id").or(`visible_from.is.null,visible_from.lte.${new Date().toISOString()}`)),
  ]);

  const attended = new Set((attData || []).map((a) => a.training_id));
  const today = new Date().toISOString().slice(0, 10);

  // Order ascending by week then date for stable session numbers
  const asc = [...(data || [])].sort((a, b) => {
    if (a.week_number && b.week_number) return a.week_number - b.week_number;
    if (a.week_number) return -1; if (b.week_number) return 1;
    return (a.training_date || "").localeCompare(b.training_date || "");
  });
  const weekNum = (t) => t.week_number || (asc.findIndex((x) => x.id === t.id) + 1);

  // Build label→id map for fallback matching (responses submitted before Training UUID was added)
  const trainingLabelToId = {};
  (data || []).forEach((t) => {
    const wn = t.week_number || (asc.findIndex((x) => x.id === t.id) + 1);
    const label = `Sesi ${wn} — ${t.title}`;
    trainingLabelToId[label] = t.id;
    trainingLabelToId[t.title] = t.id; // fallback tanpa prefix sesi
  });

  // Build set of submitted forms: key = "{form_id}:{training_uuid}"
  // Primary: match by "Training UUID" field; fallback: match by "Sesi Training" label
  const submittedKeys = new Set();
  (mfResponses || []).forEach((r) => {
    const rd = r.response_data || {};
    const tid = rd["Training UUID"] || trainingLabelToId[rd["Sesi Training"]] || null;
    if (tid) submittedKeys.add(`${r.form_id}:${tid}`);
  });

  // Build set of training IDs where tugas has been submitted (via submissions table)
  const submittedAsgIds = new Set((subData || []).map(s => s.assignment_id));
  const submittedTugasTrainings = new Set(
    (asgData || []).filter(a => submittedAsgIds.has(a.id) && a.training_id).map(a => a.training_id)
  );

  // Display order: upcoming/live first (date asc), then past (date desc)
  const upcoming = asc.filter((t) => !t.training_date || t.training_date >= today);
  const past = [...asc.filter((t) => t.training_date && t.training_date < today)].reverse();
  const ordered = [...upcoming, ...past];

  const cardFor = (t) => {
    const isPastT = t.training_date && t.training_date < today;
    const ctx = isPastT ? "past" : (t.training_date === today || _zoomState(t) === "live") ? "now" : "upcoming";
    const cat = isPastT ? "done" : "upcoming";
    return `<div data-cat="${cat}">${buildSessionCard(t, weekNum(t), { ctx, attended: attended.has(t.id), today, masterForms, profile, submittedKeys })}</div>`;
  };

  const counts = { all: ordered.length, upcoming: upcoming.length, done: past.length };
  const mode = _viewMode("training", "card");

  const rowFor = (t) => {
    const isPastT = t.training_date && t.training_date < today;
    const cat = isPastT ? "done" : "upcoming";
    const zs = _zoomState(t);
    const statusBadge = (isPastT || t.training_date === today || zs === "live")
      ? (attended.has(t.id) ? `<span class="sx-badge sx-ok">${icon("check", 11)} Hadir</span>` : `<span class="sx-badge sx-muted">${icon("clock", 11)} ${isPastT ? "Tidak hadir" : "Belum"}</span>`)
      : `<span class="sx-badge sx-soon">${icon("clock", 11)} Mendatang</span>`;
    const zoomBtn = t.zoom_link && zs ? `<button class="btn btn-primary btn-sm" data-zoom="${escapeHTML(t.zoom_link)}" data-tid="${t.id}" data-date="${t.training_date}" data-start="${t.start_time || ""}" data-end="${t.end_time || ""}">${icon("video", 14)} Zoom</button>` : "";
    return `<tr data-cat="${cat}">
      <td style="white-space:nowrap;font-weight:600">Sesi ${weekNum(t)}</td>
      <td><div class="td-main">${escapeHTML(t.title)}</div></td>
      <td>${t.speaker ? escapeHTML(t.speaker) : "—"}</td>
      <td style="white-space:nowrap">${t.training_date ? fmtDateShort(t.training_date) : "—"}</td>
      <td style="white-space:nowrap">${_lmsTimeStr(t) || "—"}</td>
      <td>${statusBadge}</td>
      <td style="text-align:right">${zoomBtn || "—"}</td>
    </tr>`;
  };
  const trTable = `<div class="table-wrap"><table class="data-table"><thead><tr>
      <th>Sesi</th><th>Judul</th><th>Narasumber</th><th>Tanggal</th><th>Waktu</th><th>Status</th><th style="text-align:right">Aksi</th>
    </tr></thead><tbody id="trTbody">${ordered.map(rowFor).join("")}</tbody></table></div>`;

  c.innerHTML = pageHead("Jadwal Training", "Klik Gabung Zoom saat jam training berlangsung untuk mencatat kehadiran otomatis.", ordered.length ? viewToggleHTML("training", mode) : "") +
    (!ordered.length
      ? `<div class="card card-pad empty" style="padding:48px 24px">${icon("calendar", 30)}<p style="margin-top:10px;font-weight:600;color:var(--ink-700)">Belum ada training.</p><p style="font-size:13px;color:var(--ink-500)">Jadwal akan muncul di sini setelah dipublikasikan.</p></div>`
      : `<div class="home-tabs" style="margin-bottom:16px"><div class="ht-bar" id="trBar">
            <button type="button" class="ht-tab active" data-cat="all">Semua <span class="ht-count">${counts.all}</span></button>
            <button type="button" class="ht-tab" data-cat="upcoming">${icon("calendar", 15)} Mendatang${counts.upcoming ? ` <span class="ht-count">${counts.upcoming}</span>` : ""}</button>
            <button type="button" class="ht-tab" data-cat="done">${icon("check", 15)} Selesai${counts.done ? ` <span class="ht-count">${counts.done}</span>` : ""}</button>
          </div></div>
          <div class="view-card" ${mode === "table" ? "hidden" : ""}><div class="grid grid-2" id="trGrid">${ordered.map(cardFor).join("")}</div></div>
          <div class="view-table" ${mode === "card" ? "hidden" : ""}>${trTable}</div>
          <div class="empty" id="trNone" style="display:none">Tidak ada training pada kategori ini.</div>`);

  wireViewToggle(c, "training");

  // Filter tabs (applies to both card + table items)
  c.querySelectorAll("#trBar .ht-tab").forEach((tab) => tab.addEventListener("click", () => {
    const cat = tab.dataset.cat;
    c.querySelectorAll("#trBar .ht-tab").forEach((x) => x.classList.toggle("active", x === tab));
    let shown = 0;
    c.querySelectorAll("#trGrid > [data-cat], #trTbody > [data-cat]").forEach((w) => {
      const ok = cat === "all" || w.dataset.cat === cat;
      w.style.display = ok ? "" : "none";
      if (ok) shown++;
    });
    const none = document.getElementById("trNone");
    if (none) none.style.display = shown ? "none" : "block";
  }));

  // Join Zoom → record attendance
  c.querySelectorAll("[data-zoom]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const { zoom: zoomUrl, tid: trainingId, date, start, end } = btn.dataset;
      window.open(zoomUrl, "_blank");
      if (!isTrainingNow({ training_date: date, start_time: start || null, end_time: end || null })) {
        toast("Kehadiran hanya dicatat saat jam training berlangsung.", "error");
        return;
      }
      if (attended.has(trainingId)) return;
      const { error } = await _supabase.from("attendances").upsert(
        { training_id: trainingId, participant_id: profile.id, attendance_status: "present" },
        { onConflict: "training_id,participant_id" }
      );
      if (error) { toast("Gagal mencatat kehadiran.", "error"); return; }
      qcInvalidate("att:", "att:all");
      attended.add(trainingId);
      toast("Kehadiran Anda telah dicatat!");
      const scope = btn.closest(".sx-card") || btn.closest("tr");
      const muted = scope && scope.querySelector(".sx-badge.sx-muted");
      if (muted) muted.outerHTML = `<span class="sx-badge sx-ok">${icon("check", 11)} Hadir</span>`;
    });
  });

  // Kumpulkan Tugas → inline form upload
  c.querySelectorAll("[data-open-tugas]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openTugasUploadModal(btn.dataset.openTugas, btn.dataset.deadline || null, profile, () => {
        qcInvalidate("sub:", "sub:all");
      });
    });
  });

  // Master form buttons (Presensi / Pretest / Post Test / Kumpulkan Tugas) → inline form
  const mfByCat = {};
  masterForms.forEach(mf => { mfByCat[mf.master_category] = mf; });
  c.querySelectorAll("[data-masterform]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const catKey = btn.dataset.masterform;
      const tid = btn.dataset.tid;
      const mf = mfByCat[catKey];
      const training = (data || []).find(t => t.id === tid);
      if (!mf || !training) return;
      openMasterFormInline(mf, training, profile, () => PAGES.training());
    });
  });
};

/* Cek apakah sekarang dalam rentang waktu training (Ã‚Â±30 menit) */
function isTrainingNow(t) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (t.training_date !== today) return false;

  const nowMin = now.getHours() * 60 + now.getMinutes();

  if (!t.start_time && !t.end_time) return true; // tidak ada jam → aktif sepanjang hari

  const [sh, sm] = (t.start_time || "00:00").split(":").map(Number);
  const endRaw    = t.end_time || t.start_time; // pakai start + 4 jam jika tidak ada end
  const [eh, em] = endRaw.split(":").map(Number);
  const endMin   = t.end_time ? eh * 60 + em : sh * 60 + sm + 240;

  return nowMin >= sh * 60 + sm - 30 && nowMin <= endMin + 30;
}

/* =====================================================================
   PARTICIPANT — MATERI
   ===================================================================== */
function _matFileType(url) {
  if (!url) return { label: "—", icon: "file", cls: "mt-none" };
  const ext = (url.toLowerCase().split("?")[0].split(".").pop() || "").trim();
  if (ext === "pdf") return { label: "PDF", icon: "file-text", cls: "mt-pdf" };
  if (["doc", "docx"].includes(ext)) return { label: "DOC", icon: "file-text", cls: "mt-doc" };
  if (["ppt", "pptx"].includes(ext)) return { label: "PPT", icon: "file-text", cls: "mt-ppt" };
  if (["xls", "xlsx", "csv"].includes(ext)) return { label: "Sheet", icon: "file-text", cls: "mt-xls" };
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext)) return { label: "Gambar", icon: "file", cls: "mt-img" };
  return { label: "Tautan", icon: "book", cls: "mt-link" };
}

PAGES.materi = async function () {
  const profile = await requireAuth("participant");
  if (!profile) return;
  renderShell(profile, PARTICIPANT_NAV, profile.institution || "Peserta");
  const c = document.getElementById("content");
  const [{ data }, { data: trainings }] = await Promise.all([
    qc("materials:p", () => _supabase.from("materials").select("*").order("created_at", { ascending: false }).or(`visible_from.is.null,visible_from.lte.${new Date().toISOString()}`)),
    qc("trainings:p", () => _supabase.from("trainings").select("id,title,week_number").or(`visible_from.is.null,visible_from.lte.${new Date().toISOString()}`)),
  ]);
  const tName = {}; (trainings || []).forEach((t) => (tName[t.id] = t));
  const mats = data || [];
  const mode = _viewMode("materi", "card");

  const searchHTML = mats.length > 4
    ? `<div class="mat-search"><span class="mat-search-ico">${icon("search", 16)}</span><input id="matSearch" class="input" placeholder="Cari materi..."></div>`
    : "";
  const headActions = mats.length
    ? `<div class="head-actions">${searchHTML}${viewToggleHTML("materi", mode)}</div>`
    : "";

  const openAttr = (m) => m.file_url ? `data-view-mat="${escapeHTML(m.file_url)}" data-view-title="${escapeHTML(m.title)}"` : "";

  const cardHTML = mats.map((m) => {
    const ft = _matFileType(m.file_url);
    const t = tName[m.training_id];
    const hay = `${m.title} ${m.description || ""}`.toLowerCase();
    return `<div class="sx-card sx-card-mat${m.file_url ? "" : " is-disabled"}" data-search="${escapeHTML(hay)}">
      <div class="sx-head">
        <div class="sx-badges">
          ${t ? `<span class="sx-week">Sesi ${t.week_number || ""}</span>` : ""}
          <span class="mat-ext ${ft.cls}">${ft.label}</span>
        </div>
        <div class="sx-when"><span>${icon("calendar", 13)} ${fmtDate(m.publish_date || m.created_at)}</span></div>
      </div>
      <h3 class="sx-title">${escapeHTML(m.title)}</h3>
      ${m.description ? `<p class="sx-desc">${escapeHTML(m.description)}</p>` : ""}
      <div class="sx-card-footer">
        ${m.file_url
          ? `<button class="sx-btn sx-btn-teal" ${openAttr(m)}>${icon("book", 15)} Buka Materi</button>`
          : `<span class="sx-badge sx-muted">${icon("clock",11)} Belum tersedia</span>`}
      </div>
    </div>`;
  }).join("");

  const tableHTML = `<div class="table-wrap"><table class="data-table"><thead><tr>
      <th>Materi</th><th>Tipe</th><th>Sesi</th><th>Tanggal</th><th style="text-align:right">Aksi</th>
    </tr></thead><tbody id="matTbody">${mats.map((m) => {
      const ft = _matFileType(m.file_url);
      const t = tName[m.training_id];
      const hay = `${m.title} ${m.description || ""}`.toLowerCase();
      return `<tr data-search="${escapeHTML(hay)}">
        <td><div class="td-main">${escapeHTML(m.title)}</div>${m.description ? `<div class="td-sub">${escapeHTML(m.description)}</div>` : ""}</td>
        <td><span class="mat-ext ${ft.cls}">${ft.label}</span></td>
        <td>${t ? "Sesi " + (t.week_number || "") : "—"}</td>
        <td style="white-space:nowrap">${fmtDate(m.publish_date || m.created_at)}</td>
        <td style="text-align:right">${m.file_url ? `<button class="btn-view-file" ${openAttr(m)}>${icon("file", 14)} Lihat File</button>` : `<span class="td-sub">Belum tersedia</span>`}</td>
      </tr>`;
    }).join("")}</tbody></table></div>`;

  c.innerHTML = pageHead("Materi Pembelajaran", "Pelajari materi yang dipublikasikan oleh admin. Materi terbuka langsung di dalam aplikasi.", headActions) +
    (!mats.length
      ? `<div class="card card-pad empty" style="padding:48px 24px">${icon("book", 30)}<p style="margin-top:10px;font-weight:600;color:var(--ink-700)">Belum ada materi.</p><p style="font-size:13px;color:var(--ink-500)">Materi akan muncul di sini setelah dipublikasikan oleh admin.</p></div>`
      : `<div class="view-card" ${mode === "table" ? "hidden" : ""}><div class="grid grid-2" id="matGrid">${cardHTML}</div></div>
         <div class="view-table" ${mode === "card" ? "hidden" : ""}>${tableHTML}</div>
         <div class="empty" id="matNone" style="display:none">Tidak ada materi yang cocok dengan pencarian.</div>`);

  wireViewToggle(c, "materi");
  bindMaterialViewers(c);

  const search = document.getElementById("matSearch");
  if (search) {
    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      c.querySelectorAll("#matGrid .sx-card, #matTbody tr").forEach((el) => {
        const match = !q || (el.dataset.search || "").includes(q);
        el.style.display = match ? "" : "none";
        if (match && el.classList.contains("sx-card")) shown++;
      });
      const none = document.getElementById("matNone");
      if (none) none.style.display = shown ? "none" : "block";
    });
  }
};

/* =====================================================================
   PARTICIPANT — TUGAS (dengan upload submission)
   ===================================================================== */
const ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png";
const MAX_BYTES = 50 * 1024 * 1024;

PAGES.tugas = async function () {
  const profile = await requireAuth("participant");
  if (!profile) return;
  renderShell(profile, PARTICIPANT_NAV, profile.institution || "Peserta");
  await renderTugas(profile);
};

async function renderTugas(profile) {
  const c = document.getElementById("content");
  const [{ data: aData }, { data: sData }, { data: trainings }, masterForms, { data: mfResponses }] = await Promise.all([
    qc("assignments:p", () => _supabase.from("assignments").select("*").order("deadline", { ascending: true }).or(`visible_from.is.null,visible_from.lte.${new Date().toISOString()}`)),
    qc("sub:" + profile.id, () => _supabase.from("submissions").select("*").eq("participant_id", profile.id)),
    qc("trainings:p", () => _supabase.from("trainings").select("id,week_number,title").or(`visible_from.is.null,visible_from.lte.${new Date().toISOString()}`)),
    _fetchMasterForms(),
    _supabase.from("form_responses").select("form_id, response_data").eq("respondent_id", profile.id),
  ]);
  const byA = {};
  (sData || []).forEach((s) => (byA[s.assignment_id] = s));
  const wkOf = {}; (trainings || []).forEach((t) => (wkOf[t.id] = t.week_number));

  // Build submittedKeys from gform responses (same logic as training page)
  const tugasMasterForm = (masterForms || []).find(mf => mf.master_category === "tugas");
  const trainingLabelToId = {};
  (trainings || []).forEach((t) => {
    const wn = t.week_number || 0;
    trainingLabelToId[`Sesi ${wn} — ${t.title}`] = t.id;
    trainingLabelToId[t.title] = t.id;
  });
  const tugasSubmittedTids = new Set();
  if (tugasMasterForm) {
    (mfResponses || []).forEach((r) => {
      if (r.form_id !== tugasMasterForm.id) return;
      const rd = r.response_data || {};
      const tid = rd["Training UUID"] || trainingLabelToId[rd["Sesi Training"]] || null;
      if (tid) tugasSubmittedTids.add(tid);
    });
  }

  const subIds = (sData || []).map((s) => s.id);
  let fbBySub = {};
  if (subIds.length) {
    const { data: fbData } = await qc("fb:" + subIds.join(","), () => _supabase.from("feedbacks").select("*").in("submission_id", subIds).order("created_at", { ascending: true }));
    (fbData || []).forEach((f) => { (fbBySub[f.submission_id] = fbBySub[f.submission_id] || []).push(f); });
  }

  // isSubmitted: true jika ada di form_responses (gform) ATAU submissions table
  const isSubmittedByAsg = (a) => !!(byA[a.id] || (a.training_id && tugasSubmittedTids.has(a.training_id)));

  const list = aData || [];
  const doneCount = list.filter((a) => isSubmittedByAsg(a)).length;
  const todoCount = list.length - doneCount;

  // Participant tugas timeline helper
  function _tugasTimeline(a, sub, submitted) {
    const now = Date.now();
    const past = a.deadline && new Date(a.deadline).getTime() < now;
    const isReviewed = sub?.status === "reviewed";
    const isSubmitted = !!(sub || submitted);
    const isLate = sub?.status === "late";

    const steps = [
      { key: "assigned", label: "Diberikan",   done: true,        active: !isSubmitted },
      { key: "submit",   label: isLate ? "Terlambat" : "Dikumpulkan", done: isSubmitted, active: isSubmitted && !isReviewed, warn: isLate },
      { key: "review",   label: "Direview",    done: isReviewed,  active: isReviewed },
      { key: "done",     label: "Selesai",     done: isReviewed && sub?.grade != null, active: false },
    ];

    const dots = steps.map((s, i) => {
      const color = s.done ? (s.warn ? "#F59E0B" : "#10B981") : s.active ? "#3B82F6" : "#CBD5E1";
      const bg    = s.done ? (s.warn ? "#FEF3C7" : "#ECFDF5") : s.active ? "#EFF6FF" : "#F8FAFC";
      const line  = i < steps.length - 1 ? `<div style="flex:1;height:2px;background:${steps[i+1].done || steps[i+1].active ? (s.done ? "#10B981" : "#CBD5E1") : "#E2E8F0"};margin:0 2px;align-self:center;margin-top:-14px"></div>` : "";
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0">
        <div style="width:28px;height:28px;border-radius:50%;background:${bg};border:2px solid ${color};display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${s.done ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3"><polyline points="20,6 9,17 4,12"/></svg>`
            : s.active ? `<div style="width:8px;height:8px;border-radius:50%;background:${color}"></div>`
            : `<div style="width:6px;height:6px;border-radius:50%;background:#CBD5E1"></div>`}
        </div>
        <span style="font-size:10px;font-weight:${s.active||s.done?"600":"400"};color:${color};white-space:nowrap;text-align:center;line-height:1.2">${s.label}</span>
      </div>${line}`;
    }).join("");

    return `<div style="display:flex;align-items:flex-start;gap:0;padding:12px 0 4px;overflow:hidden">${dots}</div>`;
  }

  // Participant action buttons for a tugas card — placed inline at timeline end
  function _tugasActions(a, sub, feedbacks, submitted) {
    const acts = [];
    acts.push(`<button class="sx-btn sx-btn-soft" data-detail-tugas="${a.id}" style="font-size:12px;padding:6px 12px;font-weight:600">${icon("eye",13)} Detail Tugas</button>`);
    if (a.attachment_url) acts.push(`<a class="sx-btn sx-btn-soft" href="${escapeHTML(a.attachment_url)}" target="_blank" style="font-size:12px;padding:6px 12px">${icon("file",13)} Lampiran</a>`);
    if (!sub && !submitted) {
      acts.push(`<button class="sx-btn sx-btn-primary" data-submit="${a.id}" data-deadline="${a.deadline||""}" style="font-size:13px;padding:8px 18px;font-weight:700;border-radius:10px">${icon("upload",14)} Kumpulkan Tugas</button>`);
    } else {
      if (sub) acts.push(`<button class="sx-btn sx-btn-soft" data-view-sub="${a.id}" style="font-size:12px;padding:6px 12px;font-weight:600">${icon("check-circle",13)} Lihat Pengumpulan</button>`);
      if (sub?.file_url) acts.push(`<button class="sx-btn sx-btn-soft" data-view-mat="${escapeHTML(sub.file_url)}" data-view-title="File Tugas" style="font-size:12px;padding:6px 12px">${icon("file",13)} File</button>`);
    }
    return `<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;padding-left:12px;flex-wrap:wrap">${acts.join("")}</div>`;
  }

  const cardFor = (a) => {
    const sub = byA[a.id];
    const gformDone = a.training_id && tugasSubmittedTids.has(a.training_id);
    const submitted = !!(sub || gformDone);
    const feedbacks = sub ? (fbBySub[sub.id] || []) : [];
    const cat = submitted ? "done" : "todo";
    const wn = wkOf[a.training_id];
    const past = a.deadline && new Date(a.deadline).getTime() < Date.now();
    const isReviewed = sub?.status === "reviewed";
    const isLate = sub?.status === "late";

    const statusBadge = !submitted
      ? (past ? `<span class="sx-badge sx-warn">${icon("clock",11)} Lewat deadline</span>` : `<span class="sx-badge sx-muted">${icon("task",11)} Belum dikumpulkan</span>`)
      : isReviewed ? `<span class="sx-badge sx-soon">${icon("star",11)} Sudah dinilai</span>`
      : isLate ? `<span class="sx-badge sx-warn">${icon("clock",11)} Terlambat</span>`
      : `<span class="sx-badge sx-ok">${icon("check",11)} Terkumpul</span>`;

    const gradeBox = (isReviewed && sub?.grade != null)
      ? `<div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:6px 12px;display:flex;align-items:center;gap:6px;margin-top:4px">
          ${icon("star",13)}<span style="font-size:12.5px;font-weight:700;color:#059669">Nilai: ${sub.grade}/100</span>
          ${feedbacks.length ? `<span style="font-size:11.5px;color:#6B7280;margin-left:4px">· ${feedbacks.length} feedback</span>` : ""}
         </div>` : "";

    const deadlineInfo = !submitted && a.deadline
      ? `<div style="margin-top:4px;font-size:12px;color:${past?"#EF4444":"#64748B"};display:flex;align-items:center;gap:5px">${icon("clock",12)} Deadline: ${fmtDateTime(a.deadline)} WIB${past?" · <strong>Telah lewat</strong>":""}</div>` : "";

    return `<div class="sx-card" data-cat="${cat}" style="padding:14px 16px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${wn ? `<span class="sx-week">Sesi ${wn}</span>` : ""}
          ${statusBadge}
        </div>
        ${sub ? `<span style="font-size:11px;color:#94A3B8;white-space:nowrap">${icon("check",11)} ${fmtDateShort(sub.submitted_at)}</span>` : ""}
      </div>
      <h3 class="sx-title" style="margin-bottom:2px">${escapeHTML(a.title)}</h3>
      ${a.description ? `<p class="tg-desc" style="margin-bottom:2px">${escapeHTML(a.description)}</p>` : ""}
      ${deadlineInfo}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div style="flex:1;min-width:0">${_tugasTimeline(a, sub, gformDone)}</div>
        ${_tugasActions(a, sub, feedbacks, gformDone)}
      </div>
      ${gradeBox}
      ${feedbacks.length ? `<div class="tg-fb" id="fb-${sub?.id}" hidden style="margin-top:6px">${feedbacks.map((f) => `<div class="tg-fb-item" style="background:#F8FAFC;border-radius:8px;padding:8px 12px;margin-bottom:4px"><p style="font-size:12.5px;color:#334155;margin:0 0 3px">${escapeHTML(f.comment)}</p>${f.score != null ? `<span style="font-size:11px;font-weight:600;color:#059669">Nilai: ${f.score}/100 · </span>` : ""}<span style="font-size:11px;color:#94A3B8">${fmtDateTime(f.created_at)}</span></div>`).join("")}</div>` : ""}
    </div>`;
  };

  const mode = _viewMode("tugas", "card");
  const rowFor = (a) => {
    const sub = byA[a.id];
    const feedbacks = sub ? (fbBySub[sub.id] || []) : [];
    const cat = sub ? "done" : "todo";
    const wn = wkOf[a.training_id];
    const statusBadge = !sub
      ? `<span class="sx-badge sx-warn">${icon("task", 11)} Belum</span>`
      : sub.status === "reviewed" ? `<span class="sx-badge sx-soon">${icon("star", 11)} Dinilai</span>`
      : sub.status === "late" ? `<span class="sx-badge sx-warn">${icon("clock", 11)} Terlambat</span>`
      : `<span class="sx-badge sx-ok">${icon("check", 11)} Terkumpul</span>`;
    const acts = [];
    if (!sub) acts.push(`<button class="btn btn-primary btn-sm" data-submit="${a.id}" data-deadline="${a.deadline || ""}">${icon("upload", 14)} Kumpulkan</button>`);
    else {
      if (sub.file_url) acts.push(`<button class="btn-view-file" data-view-mat="${escapeHTML(sub.file_url)}" data-view-title="File Tugas">${icon("file", 14)} Lihat File</button>`);
      if (feedbacks.length) acts.push(`<button class="btn btn-ghost btn-sm" data-fb-modal="${sub.id}">${icon("chat", 14)} Feedback</button>`);
    }
    const gradeCell = (sub && sub.status === "reviewed" && sub.grade != null) ? `${sub.grade}/100` : "—";
    return `<tr data-cat="${cat}">
      <td style="white-space:nowrap;font-weight:600">${wn ? "Sesi " + wn : "—"}</td>
      <td><div class="td-main">${escapeHTML(a.title)}</div></td>
      <td style="white-space:nowrap">${a.deadline ? fmtDateShort(a.deadline) : "—"}</td>
      <td>${statusBadge}</td>
      <td style="white-space:nowrap;font-weight:600;color:var(--primary)">${gradeCell}</td>
      <td style="text-align:right"><div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">${acts.join("") || "—"}</div></td>
    </tr>`;
  };
  const tgTable = `<div class="table-wrap"><table class="data-table"><thead><tr>
      <th>Sesi</th><th>Judul</th><th>Tenggat</th><th>Status</th><th>Nilai</th><th style="text-align:right">Aksi</th>
    </tr></thead><tbody id="tgTbody">${list.map(rowFor).join("")}</tbody></table></div>`;

  c.innerHTML = pageHead("Tugas", "Pastikan tugas sudah benar sebelum dikumpulkan. Pengumpulan tidak dapat diubah setelah dikirim.", list.length ? viewToggleHTML("tugas", mode) : "") +
    (!list.length
      ? `<div class="card card-pad empty" style="padding:48px 24px">${icon("task", 30)}<p style="margin-top:10px;font-weight:600;color:var(--ink-700)">Belum ada tugas.</p><p style="font-size:13px;color:var(--ink-500)">Tugas akan muncul di sini setelah dipublikasikan.</p></div>`
      : kpiStrip([
            { icon:"task",         bg:"var(--primary-tint)", color:"var(--primary)", value:list.length,  label:"Total Tugas",   sub: "" },
            { icon:"check-square", bg:"var(--ok-bg)",        color:"var(--ok)",      value:doneCount,    label:"Dikumpulkan",  sub: "" },
            { icon:"clock",        bg:"var(--warn-bg)",       color:"var(--warn)",    value:todoCount,    label:"Belum Dikumpulkan", sub: "" },
          ]) +
          `<div class="home-tabs" style="margin-bottom:16px"><div class="ht-bar" id="tgBar">
            <button type="button" class="ht-tab active" data-cat="all">Semua <span class="ht-count">${list.length}</span></button>
            <button type="button" class="ht-tab" data-cat="todo">${icon("clock", 15)} Belum${todoCount ? ` <span class="ht-count">${todoCount}</span>` : ""}</button>
            <button type="button" class="ht-tab" data-cat="done">${icon("check", 15)} Selesai${doneCount ? ` <span class="ht-count">${doneCount}</span>` : ""}</button>
          </div></div>
          <div class="view-card" ${mode === "table" ? "hidden" : ""}><div id="tgGrid">${list.map(cardFor).join("")}</div></div>
          <div class="view-table" ${mode === "card" ? "hidden" : ""}>${tgTable}</div>
          <div class="empty" id="tgNone" style="display:none">Tidak ada tugas pada kategori ini.</div>`);

  wireViewToggle(c, "tugas");
  bindMaterialViewers(c);

  // filter tabs (both card + table)
  c.querySelectorAll("#tgBar .ht-tab").forEach((tab) => tab.addEventListener("click", () => {
    const cat = tab.dataset.cat;
    c.querySelectorAll("#tgBar .ht-tab").forEach((x) => x.classList.toggle("active", x === tab));
    let shown = 0;
    c.querySelectorAll("#tgGrid > .sx-card, #tgTbody > [data-cat]").forEach((el) => {
      const ok = cat === "all" || el.dataset.cat === cat;
      el.style.display = ok ? "" : "none";
      if (ok) shown++;
    });
    const none = document.getElementById("tgNone");
    if (none) none.style.display = shown ? "none" : "block";
  }));

  // detail tugas modal
  c.querySelectorAll("[data-detail-tugas]").forEach((b) => b.addEventListener("click", () => {
    const a = list.find(x => x.id === b.dataset.detailTugas);
    if (!a) return;
    const past = a.deadline && new Date(a.deadline).getTime() < Date.now();
    openModal(`Detail Tugas`, `
      <div style="display:flex;flex-direction:column;gap:14px">
        <div>
          <div style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Judul</div>
          <div style="font-size:16px;font-weight:800;color:#1E293B">${escapeHTML(a.title)}</div>
        </div>
        ${a.description ? `<div>
          <div style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Deskripsi</div>
          <div style="font-size:13.5px;color:#374151;line-height:1.6;white-space:pre-wrap">${escapeHTML(a.description)}</div>
        </div>` : ""}
        ${a.deadline ? `<div style="background:${past?"#FEF2F2":"#F0FDF4"};border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:8px">
          ${icon("clock",14)}
          <div>
            <div style="font-size:11px;font-weight:700;color:${past?"#EF4444":"#059669"};text-transform:uppercase;letter-spacing:.4px">Deadline</div>
            <div style="font-size:13.5px;font-weight:700;color:${past?"#EF4444":"#059669"}">${fmtDateTime(a.deadline)} WIB ${past?"· <strong>Telah lewat</strong>":""}</div>
          </div>
        </div>` : ""}
        ${a.attachment_url ? `<div><a class="btn btn-secondary btn-sm" href="${escapeHTML(a.attachment_url)}" target="_blank">${icon("file",13)} Unduh Lampiran</a></div>` : ""}
      </div>
    `);
  }));

  // view detail modal
  c.querySelectorAll("[data-view-sub]").forEach((b) => b.addEventListener("click", () => {
    const asgId = b.dataset.viewSub;
    const a = list.find(x => x.id === asgId);
    const sub = byA[asgId];
    const fbs = sub ? (fbBySub[sub.id] || []) : [];
    if (!a || !sub) return;
    const statusLabel = sub.status === "reviewed" ? "Direview" : sub.status === "late" ? "Terlambat" : "Terkumpul";
    const statusColor = sub.status === "reviewed" ? "#059669" : sub.status === "late" ? "#D97706" : "#2563EB";
    const fbHtml = fbs.length
      ? fbs.map(f => `<div style="background:#F8FAFC;border-left:3px solid #3B82F6;border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:6px">
          <p style="font-size:13px;color:#334155;margin:0 0 4px">${escapeHTML(f.comment)}</p>
          ${f.score != null ? `<span style="font-size:11.5px;font-weight:600;color:#059669">Nilai: ${f.score}/100 · </span>` : ""}
          <span style="font-size:11px;color:#94A3B8">${fmtDateTime(f.created_at)}</span>
        </div>`).join("")
      : `<p style="font-size:13px;color:#94A3B8;text-align:center;padding:12px 0">Belum ada feedback dari instruktur.</p>`;
    const answerHtml = sub.answers
      ? Object.entries(sub.answers).map(([k,v]) => `<div style="margin-bottom:10px"><div style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">${escapeHTML(k)}</div><div style="font-size:13.5px;color:#1E293B;word-break:break-word">${escapeHTML(String(v))}</div></div>`).join("")
      : "";
    openModal(`Detail Tugas — ${escapeHTML(a.title)}`, `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <span style="background:${statusColor}1A;color:${statusColor};border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700">${statusLabel}</span>
        <span style="font-size:12px;color:#94A3B8">${icon("clock",11)} Dikumpulkan: ${fmtDateTime(sub.submitted_at)} WIB</span>
        ${sub.grade != null ? `<span style="background:#ECFDF5;color:#059669;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700;margin-left:auto">${icon("star",11)} Nilai: ${sub.grade}/100</span>` : ""}
      </div>
      ${answerHtml}
      ${sub.file_url ? `<div style="margin-bottom:12px"><button class="btn btn-secondary btn-sm" data-view-mat="${escapeHTML(sub.file_url)}" data-view-title="File Tugas">${icon("file",13)} Lihat File yang Dikumpulkan</button></div>` : ""}
      <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">${icon("chat",12)} Feedback Instruktur</div>
      ${fbHtml}
    `);
  }));

  // feedback toggle (card view)
  c.querySelectorAll("[data-fb-toggle]").forEach((b) => b.addEventListener("click", () => {
    const el = document.getElementById("fb-" + b.dataset.fbToggle);
    if (el) el.hidden = !el.hidden;
  }));

  // feedback modal (table view)
  c.querySelectorAll("[data-fb-modal]").forEach((b) => b.addEventListener("click", () => {
    const fbs = fbBySub[b.dataset.fbModal] || [];
    const body = fbs.length
      ? fbs.map((f) => `<div class="tg-fb-item" style="margin-bottom:8px"><p>${escapeHTML(f.comment)}</p><span>${fmtDateTime(f.created_at)} WIB</span></div>`).join("")
      : `<div class="empty">Belum ada feedback.</div>`;
    openModal("Feedback Tugas", body);
  }));

  // submit
  c.querySelectorAll("[data-submit]").forEach((btn) => btn.addEventListener("click", () => handleSubmitTugas(btn, profile)));
}

async function handleSubmitTugas(btn, profile) {
  const assignmentId = btn.dataset.submit;
  const deadline = btn.dataset.deadline || null;
  await openTugasUploadModal(assignmentId, deadline, profile, () => renderTugas(profile));
}

// Shared file for upload in tugas form
let _tugasUploadFile = null;

/* =====================================================================
   PARTICIPANT — FEEDBACK & riwayat
   ===================================================================== */
PAGES.feedback = async function () {
  const profile = await requireAuth("participant");
  if (!profile) return;
  renderShell(profile, PARTICIPANT_NAV, profile.institution || "Peserta");
  const c = document.getElementById("content");

  const { data: subs } = await qc("sub:" + profile.id, () => _supabase.from("submissions").select("*").eq("participant_id", profile.id).order("submitted_at", { ascending: false }));

  const subList = subs || [];
  const aIds = [...new Set(subList.map((s) => s.assignment_id))];
  const sIds = subList.map((s) => s.id);

  const [{ data: aData }, { data: fData }] = await Promise.all([
    aIds.length ? qc("assignments:ids:" + aIds.sort().join(","), () => _supabase.from("assignments").select("id,title").in("id", aIds)) : Promise.resolve({ data: [] }),
    sIds.length ? qc("fb:" + sIds.sort().join(","), () => _supabase.from("feedbacks").select("*").in("submission_id", sIds)) : Promise.resolve({ data: [] }),
  ]);
  const titleMap = {};
  (aData || []).forEach((a) => (titleMap[a.id] = a.title));
  const fbMap = {};
  (fData || []).forEach((f) => {
    (fbMap[f.submission_id] = fbMap[f.submission_id] || []).push(f);
  });

  c.innerHTML = pageHead("Feedback & Riwayat Pengumpulan", "Umpan balik fasilitator dan riwayat tugas yang telah Anda kumpulkan.") +
    (!subList.length
      ? `<div class="empty">Belum ada pengumpulan tugas.</div>`
      : subList.map((s) => {
          const fbs = fbMap[s.id] || [];
          return `<div class="card card-pad" style="margin-bottom:20px">
            <div class="flex justify-between items-center" style="flex-wrap:wrap;gap:8px">
              <h2 class="font-display" style="font-size:18px;font-weight:700">${escapeHTML(titleMap[s.assignment_id] || "Tugas")}</h2>
              <div class="flex items-center gap-2" style="flex-wrap:wrap">
                ${s.grade != null ? `<span style="font-size:15px;font-weight:800;color:var(--primary)">${s.grade}<span style="font-size:12px;color:var(--ink-300);font-weight:600">/100</span></span>
                <span style="color:#f5b301;display:inline-flex">${Array.from({length:5}).map((_,i)=>icon(i < Math.round(s.grade/20) ? "star-fill" : "star",13)).join("")}</span>` : ""}
                <span class="badge ${s.status === "reviewed" ? "badge-info" : s.status === "late" ? "badge-warning" : "badge-success"}">${
                  s.status === "reviewed" ? "Sudah Direview" : s.status === "late" ? "Terlambat" : "Terkumpul"}</span>
              </div>
            </div>
            <div class="stat-label mt-1">Dikumpulkan ${fmtDateTime(s.submitted_at)}</div>
            ${s.file_url ? `<button class="btn-view-file mt-2" data-view-mat="${escapeHTML(s.file_url)}" data-view-title="File Pengumpulan">${icon("file",14)} File Pengumpulan</button>` : ""}
            <div style="margin-top:16px">
              ${fbs.length
                ? fbs.map((f) => `<div class="flex gap-3" style="background:rgba(234,241,250,.6);border-radius:12px;padding:14px;margin-top:8px">
                    <span class="icon-box solid" style="width:32px;height:32px">${icon("chat",16)}</span>
                    <div><div style="font-size:14px;color:#334155">${escapeHTML(f.comment)}</div>
                      <div class="stat-label" style="margin-top:4px;font-size:12px">${fmtDateTime(f.created_at)}</div></div>
                  </div>`).join("")
                : `<div class="stat-label">Belum ada feedback untuk pengumpulan ini.</div>`}
            </div>
          </div>`;
        }).join(""));
};

/* =====================================================================
   PARTICIPANT — FORMULIR (inline Google Form renderer)
   ===================================================================== */
PAGES.forms = async function () {
  const profile = await requireAuth("participant");
  if (!profile) return;
  renderShell(profile, PARTICIPANT_NAV, profile.institution || "Peserta");
  const c = document.getElementById("content");

  // Fetch active forms
  const { data: forms } = await _supabase.from("forms").select("*").eq("is_active", true).order("created_at", { ascending: false });
  const list = forms || [];

  // Track completed forms in session
  const doneSet = new Set(JSON.parse(sessionStorage.getItem("ilp_done_forms") || "[]"));

  function markDone(formId) {
    doneSet.add(formId);
    sessionStorage.setItem("ilp_done_forms", JSON.stringify([...doneSet]));
  }

  /* ---- FORM FILL VIEW ---- */
  async function showFillForm(form) {
    const _formOpenedAt = Date.now();
    c.innerHTML = `<div class="loader" style="min-height:220px"><div class="spinner"></div>Memuat formulir…</div>`;
    if (!form.gsheet_id) { showFormList(); return; }

    let schema;
    try {
      schema = await _getFormSchema(form.gsheet_id);
    } catch (e) {
      c.innerHTML = `<button class="btn btn-ghost btn-sm" id="backBtn" style="margin-bottom:16px;gap:6px">${icon("arrow-left",15)} Kembali</button>` +
        `<div class="card card-pad" style="text-align:center;padding:48px">
          <div style="color:var(--bad);margin-bottom:12px">${icon("x-circle",32)}</div>
          <p style="font-weight:700;font-size:16px">Gagal memuat formulir</p>
          <p style="font-size:13px;color:var(--ink-500);margin-top:6px">${escapeHTML((e && e.message) || String(e))}</p>
        </div>`;
      document.getElementById("backBtn").addEventListener("click", showFormList);
      return;
    }

    const { rows, items } = _renderInlineForm(schema, {});
    const typeLabel = { pretest:"Pretest", posttest:"Posttest", survey:"Survei", attendance:"Presensi", custom:"Formulir" }[form.type] || "Formulir";

    c.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px">
        <button class="btn btn-ghost btn-sm" id="backBtn" style="gap:6px">${icon("arrow-left",15)} Kembali</button>
        <span style="color:var(--ink-300)">›</span>
        <span style="font-size:13px;color:var(--ink-500)">Formulir</span>
        <span style="color:var(--ink-300)">›</span>
        <span style="font-size:13px;font-weight:600;color:var(--ink-800)">${escapeHTML(form.title)}</span>
      </div>
      <form id="gFormInline" class="gf-page">
        <div class="gf-header-card">
          <div class="gf-htype">${icon("clipboard",13)} ${typeLabel}</div>
          <h2>${escapeHTML(schema.title || form.title)}</h2>
          ${schema.description ? `<p>${escapeHTML(schema.description)}</p>` : ""}
        </div>
        ${rows}
        <div class="gf-submit-area">
          <span id="formErrMsg" style="flex:1;color:var(--bad);font-size:13px"></span>
          <button type="button" class="gf-cancel-btn" id="cancelFillBtn">Batal</button>
          <button type="submit" class="gf-submit-btn" id="submitFormBtn">${icon("send",15)} Kirim Respons</button>
        </div>
      </form>`;

    document.getElementById("backBtn").addEventListener("click", showFormList);
    document.getElementById("cancelFillBtn").addEventListener("click", showFormList);

    document.getElementById("gFormInline").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("submitFormBtn");
      const errEl = document.getElementById("formErrMsg");
      btn.disabled = true;
      btn.innerHTML = `<div class="spinner" style="width:18px;height:18px;border-width:2px;margin:0 auto"></div>`;
      errEl.textContent = "";
      const fd = new FormData(e.target);
      const answers = {};
      items.forEach((item) => {
        answers[item.questionId] = item.type === "checkbox" ? fd.getAll(`q_${item.questionId}`) : (fd.get(`q_${item.questionId}`) || "");
      });
      try {
        // 1. Submit to Google Forms (saves to Spreadsheet)
        const googleAnswers = {};
        items.forEach((item) => {
          if (!/^local_/.test(item.questionId)) googleAnswers[item.questionId] = answers[item.questionId];
        });
        if (form.gsheet_id && Object.keys(googleAnswers).length) {
          await _submitFormResponse(form.gsheet_id, googleAnswers);
        }

        // 2. Save to Supabase form_responses for status tracking
        const labelledAnswers = {};
        items.forEach((item) => { labelledAnswers[item.title] = answers[item.questionId]; });
        const { error: insErr } = await _supabase.from("form_responses").insert({
          form_id:       form.id,
          respondent_id: profile.id,
          response_data: labelledAnswers,
          submitted_at:  new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).replace(" ", "T") + "+07:00",
        });
        if (insErr) console.error("[form_responses insert]", insErr.message, insErr);

        markDone(form.id);
        const elapsedSec = Math.round((Date.now() - _formOpenedAt) / 1000);
        const elapsedStr = elapsedSec < 60 ? `${elapsedSec} detik` : `${Math.floor(elapsedSec/60)} menit ${elapsedSec%60} detik`;
        c.innerHTML = `<div class="gf-page"><div class="gf-success">
          <div class="gf-success-icon">🎉</div>
          <h3>Respons Terkirim!</h3>
          <p>Terima kasih telah mengisi formulir <strong>${escapeHTML(form.title)}</strong>.</p>
          <p>Jawaban Anda telah tersimpan.</p>
          <div class="gf-time-badge">${icon("clock",14)} Waktu pengisian: ${elapsedStr}</div>
          <div style="margin-top:24px"><button class="gf-cancel-btn" id="doneBtn" style="padding:11px 28px">${icon("arrow-left",15)} Kembali ke Formulir</button></div>
        </div></div>`;
        document.getElementById("doneBtn").addEventListener("click", showFormList);
      } catch (err) {
        errEl.textContent = "Gagal mengirim: " + ((err && err.message) || String(err));
        btn.disabled = false;
        btn.innerHTML = `${icon("send",15)} Kirim Respons`;
      }
    });
  }

  /* ---- FORM LIST VIEW ---- */
  function showFormList() {
    c.innerHTML = pageHead("Formulir", "Isi formulir pretest, posttest, survei, dan presensi yang tersedia.");

    if (!list.length) {
      c.innerHTML += `<div class="card card-pad empty" style="padding:48px 24px">
        ${icon("clipboard",32)}<p style="margin-top:12px;font-weight:600;color:var(--ink-700)">Belum ada formulir aktif.</p>
        <p style="font-size:13px;color:var(--ink-500);margin-top:4px">Formulir akan muncul di sini ketika tersedia.</p>
      </div>`;
      return;
    }

    c.innerHTML += `<div class="grid grid-2" style="gap:10px">
      ${list.map((f) => {
        const done = doneSet.has(f.id);
        const typeLabel = { pretest:"Pretest", posttest:"Posttest", survey:"Survei", attendance:"Presensi", custom:"Formulir" }[f.type] || "Formulir";
        const fieldsN = Array.isArray(f.fields) ? f.fields.length : 0;
        return `<div class="card card-pad" style="display:flex;flex-direction:column;gap:10px;${done ? "opacity:.75" : ""}">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="width:42px;height:42px;border-radius:12px;background:${done ? "var(--ok-bg)" : "var(--primary-tint)"};color:${done ? "var(--ok)" : "var(--primary)"};display:grid;place-items:center;flex-shrink:0">${icon(done ? "check-circle" : "clipboard", 20)}</span>
            <div style="min-width:0">
              <h3 style="font-size:15px;font-weight:700;color:var(--ink-900);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(f.title)}</h3>
              <div style="display:flex;gap:6px;margin-top:3px;flex-wrap:wrap">
                <span class="badge badge-primary">${typeLabel}</span>
                ${fieldsN ? `<span class="badge">${fieldsN} pertanyaan</span>` : ""}
                ${done ? `<span class="badge badge-success">Sudah Diisi</span>` : ""}
              </div>
            </div>
          </div>
          ${f.description ? `<p style="font-size:12.5px;color:var(--ink-500);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHTML(f.description)}</p>` : ""}
          <div style="margin-top:auto;display:flex;gap:8px">
            ${f.gsheet_id
              ? `<button class="btn btn-primary btn-sm" data-fill="${f.id}" ${done ? "style='opacity:.6'" : ""}>${icon(done ? "refresh" : "edit", 14)} ${done ? "Isi Ulang" : "Isi Sekarang"}</button>`
              : `<span style="font-size:12px;color:var(--ink-400)">Form belum terhubung</span>`}
          </div>
        </div>`;
      }).join("")}
    </div>`;

    c.querySelectorAll("[data-fill]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const f = list.find((x) => x.id === btn.dataset.fill);
        if (f) showFillForm(f);
      });
    });
  }

  showFormList();
};

/* =====================================================================
   ADMIN — DASHBOARD
   ===================================================================== */
PAGES.admin = async function () {
  const profile = await requireAuth("admin");
  if (!profile) return;
  renderShell(profile, ADMIN_NAV, "Administrator");
  const c = document.getElementById("content");
  _destroyCharts();

  // Ensure Drive folders exist then organize existing files (both run silently)
  _driveSetup().then(() => _driveOrganizeAll()).catch(() => {});

  const [profilesRes, trainings, attendances, assignments, submissions] = await Promise.all([
    qc("profiles:p", () => _supabase.from("profiles").select("*").eq("role", "participant").order("created_at", { ascending: false })),
    qc("trainings:a", () => _supabase.from("trainings").select("*").order("training_date", { ascending: true })),
    qc("att:all", () => _supabase.from("attendances").select("training_id,participant_id,created_at").eq("attendance_status", "present")),
    qc("assignments:a", () => _supabase.from("assignments").select("*")),
    qc("sub:all", () => _supabase.from("submissions").select("id,assignment_id,participant_id,status,submitted_at,grade")),
  ]);

  const participants = profilesRes.data || [];
  const totalParticipants = participants.length;
  const att = attendances.data || [];
  const asgs = assignments.data || [];
  const subs = submissions.data || [];

  const tList = [...(trainings.data || [])].sort((a, b) => {
    if (a.week_number && b.week_number) return a.week_number - b.week_number;
    if (a.week_number) return -1; if (b.week_number) return 1;
    return (a.training_date || "").localeCompare(b.training_date || "");
  });

  const attCount = {};
  att.forEach((a) => { attCount[a.training_id] = (attCount[a.training_id] || 0) + 1; });
  const asgTid = {}, asgTitle = {};
  asgs.forEach((a) => { asgTid[a.id] = a.training_id; asgTitle[a.id] = a.title; });
  const subCount = {};
  subs.forEach((s) => { const tid = asgTid[s.assignment_id]; if (tid) subCount[tid] = (subCount[tid] || 0) + 1; });
  const pName = {}; participants.forEach((p) => (pName[p.id] = p));

  const totalWeeks = tList.length;
  const totalAtt = att.length;
  const totalSub = subs.length;
  const ungraded = subs.filter((s) => s.status !== "reviewed");
  const activeSet = new Set([...att.map((a) => a.participant_id), ...subs.map((s) => s.participant_id)]);
  const activeCount = participants.filter((p) => activeSet.has(p.id)).length;
  const inactiveCount = totalParticipants - activeCount;

  const weekAgo = Date.now() - 7 * 86400000;
  const newThisWeek = participants.filter((p) => new Date(p.created_at).getTime() > weekAgo).length;

  // average attendance % across past trainings
  const todayISO = new Date().toISOString().slice(0, 10);
  const pastT = tList.filter((t) => t.training_date <= todayISO);
  const avgHadir = (pastT.length && totalParticipants)
    ? Math.round(pastT.reduce((sum, t) => sum + (attCount[t.id] || 0) / totalParticipants, 0) / pastT.length * 100)
    : 0;

  const kpis = [
    { label: "Total Peserta", value: totalParticipants, sub: `${activeCount} aktif`, icon: "users", bg: "#EAF1FA", color: "#215AA9",
      trend: newThisWeek > 0 ? { dir: "up", txt: `+${newThisWeek} minggu ini` } : null },
    { label: "Training", value: totalWeeks, sub: `${pastT.length} telah berjalan`, icon: "calendar", bg: "#E0FAF1", color: "#059669", trend: null },
    { label: "Rata-rata Kehadiran", value: avgHadir + "%", sub: `${totalAtt} total hadir`, icon: "check-square", bg: "#FEF3C7", color: "#D97706", trend: null },
    { label: "Submission", value: totalSub, sub: `${ungraded.length} belum dinilai`, icon: "upload", bg: "#FFE4E6", color: "#E11D48",
      trend: ungraded.length > 0 ? { dir: "down", txt: `${ungraded.length} pending` } : null },
  ];

  // recent activity feed (submissions + attendances)
  const feed = [];
  subs.forEach((s) => feed.push({ ts: s.submitted_at, type: "sub", who: pName[s.participant_id], what: asgTitle[s.assignment_id] }));
  att.forEach((a) => feed.push({ ts: a.created_at, type: "att", who: pName[a.participant_id], what: (tList.find((t) => t.id === a.training_id) || {}).title }));
  feed.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const feedTop = feed.slice(0, 6);

  c.innerHTML = `
    ${kpiStrip(kpis.map((k) => ({ ...k, bg: k.bg, color: k.color })))}

    <div class="grid grid-2" style="margin-bottom:10px;gap:10px">
      <div class="chart-card">
        <h3>Kehadiran per Training</h3>
        <p class="sub">Jumlah peserta hadir di tiap sesi</p>
        <div class="chart-holder"><canvas id="chAttendance"></canvas></div>
      </div>
      <div class="chart-card">
        <h3>Status Peserta</h3>
        <p class="sub">Sudah beraktivitas vs belum</p>
        <div class="chart-holder"><canvas id="chStatus"></canvas></div>
      </div>
    </div>

    <div class="grid grid-2" style="margin-bottom:10px;gap:10px">
      <div class="chart-card">
        <div class="section-title-row" style="margin:0 0 14px">
          <h3 style="margin:0">Peserta Terbaru</h3>
          <a class="link-more" href="#adminPeserta" style="font-size:12px;font-weight:600;color:var(--primary)">Lihat semua</a>
        </div>
        ${participants.slice(0, 5).map((p) => `
          <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--surface-3)">
            <span class="avatar-init" style="width:34px;height:34px;font-size:12px;background:${avatarColor(p.full_name)}">${escapeHTML(initials(p.full_name))}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:13.5px;font-weight:600;color:var(--ink-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(p.full_name || "-")}</div>
              <div style="font-size:12px;color:var(--ink-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(p.institution || p.email || "")}</div>
            </div>
            <span class="badge ${activeSet.has(p.id) ? "badge-success" : "badge-warning"}">${activeSet.has(p.id) ? "Aktif" : "Baru"}</span>
          </div>`).join("") || `<div class="empty">Belum ada peserta.</div>`}
      </div>
      <div class="chart-card">
        <div class="section-title-row" style="margin:0 0 14px">
          <h3 style="margin:0">Tugas Belum Dinilai</h3>
          <a class="link-more" href="#adminSubmission" style="font-size:12px;font-weight:600;color:var(--primary)">Tinjau</a>
        </div>
        ${ungraded.slice(0, 5).map((s) => `
          <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--surface-3)">
            <span class="kpi-ico" style="width:34px;height:34px;border-radius:10px;background:var(--warn-bg);color:var(--warn)">${icon("clock", 16)}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:var(--ink-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML((pName[s.participant_id] || {}).full_name || "-")}</div>
              <div style="font-size:12px;color:var(--ink-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(asgTitle[s.assignment_id] || "Tugas")}</div>
            </div>
            <span style="font-size:11.5px;color:var(--ink-300);white-space:nowrap">${escapeHTML(timeAgo(s.submitted_at))}</span>
          </div>`).join("") || `<div class="empty" style="padding:24px">${icon("check-circle", 22)}<p style="margin-top:8px">Semua tugas sudah dinilai.</p></div>`}
      </div>
    </div>

    <div class="section-title-row"><h2>Aktivitas Terbaru</h2></div>
    <div class="feed" style="margin-bottom:10px">
      ${feedTop.length ? feedTop.map((f) => {
        const ic = f.type === "sub" ? "upload" : "check-square";
        const bg = f.type === "sub" ? "var(--info-c-bg)" : "var(--ok-bg)";
        const col = f.type === "sub" ? "var(--info-c)" : "var(--ok)";
        const verb = f.type === "sub" ? "mengumpulkan tugas" : "hadir di sesi";
        return `<div class="feed-item">
          <span class="feed-ico" style="background:${bg};color:${col}">${icon(ic, 17)}</span>
          <div style="flex:1;min-width:0">
            <div class="feed-title"><strong>${escapeHTML((f.who || {}).full_name || "Peserta")}</strong> ${verb} <strong>${escapeHTML(f.what || "-")}</strong></div>
            <div class="feed-meta">${escapeHTML(timeAgo(f.ts))}</div>
          </div>
        </div>`;
      }).join("") : `<div class="empty" style="border:0">Belum ada aktivitas.</div>`}
    </div>

    <div class="section-title-row"><h2>Monitoring per Training</h2></div>
    <div class="card table-wrap">
      <table>
        <thead><tr><th>Training</th><th>Judul Training</th><th>Tanggal</th><th>Kehadiran</th><th>Submission</th><th>% Hadir</th></tr></thead>
        <tbody>
          ${tList.length === 0
            ? `<tr><td colspan="6" style="text-align:center;color:#94A3B8;padding:32px">Belum ada data training.</td></tr>`
            : tList.map((t, i) => {
                const wn = t.week_number || (i + 1);
                const a = attCount[t.id] || 0, sb = subCount[t.id] || 0;
                const pct = totalParticipants ? Math.round((a / totalParticipants) * 100) : 0;
                return `<tr>
                  <td><span class="badge badge-info">Sesi ${wn}</span></td>
                  <td style="font-weight:600;max-width:280px">${escapeHTML(t.title)}</td>
                  <td style="color:var(--ink-500);font-size:13px">${fmtDate(t.training_date)}</td>
                  <td><b style="color:var(--ink-900)">${a}</b><span style="color:var(--ink-300);font-size:12px"> / ${totalParticipants}</span></td>
                  <td><b style="color:var(--ink-900)">${sb}</b><span style="color:var(--ink-300);font-size:12px"> / ${totalParticipants}</span></td>
                  <td><div style="display:flex;align-items:center;gap:10px"><div class="pbar" style="width:90px"><span style="width:${pct}%"></span></div><span style="font-size:12px;font-weight:600;color:var(--ink-900);min-width:32px">${pct}%</span></div></td>
                </tr>`;
              }).join("")}
        </tbody>
      </table>
    </div>`;

  // ---- Charts ----
  whenChart(() => {
    const labels = tList.map((t, i) => "Sesi " + (t.week_number || i + 1));
    _mkChart("chAttendance", {
      type: "bar",
      data: { labels, datasets: [{ label: "Hadir", data: tList.map((t) => attCount[t.id] || 0), backgroundColor: "#3b7ad1", borderRadius: 6, maxBarThickness: 38 }] },
      options: _barOpts(totalParticipants),
    });
    _mkChart("chStatus", {
      type: "doughnut",
      data: { labels: ["Sudah Beraktivitas", "Belum Aktif"], datasets: [{ data: [activeCount, inactiveCount || (totalParticipants ? 0 : 1)], backgroundColor: ["#215AA9", "#E4ECF7"], borderWidth: 0 }] },
      options: _donutOpts(),
    });
  });
};

/* =====================================================================
   GLOBAL MULTI-SELECT HELPERS (used by all admin + participant pages)
   ===================================================================== */
function _msChecked(listId) {
  return [...document.querySelectorAll(`#${listId} input[type=checkbox]:checked`)].map(c => c.value);
}
function _msUpdateLabel(labelId, countId, selections, singular, icon_) {
  const lbl = document.getElementById(labelId);
  const cnt = document.getElementById(countId);
  if (!lbl) return;
  if (selections.size === 0) {
    lbl.innerHTML = `${icon_} ${singular}`;
    if (cnt) cnt.textContent = "";
  } else {
    lbl.innerHTML = `${icon_} ${[...selections][0]}${selections.size > 1 ? ` +${selections.size-1}` : ""}`;
    if (cnt) cnt.textContent = `${selections.size} dipilih`;
  }
}
function _wireMultiSelect(triggerId, dropId, listId, searchId, clearId, selSet, labelId, countId, singularLabel, iconStr, applyFilter) {
  const trigger = document.getElementById(triggerId);
  const drop    = document.getElementById(dropId);
  const search  = document.getElementById(searchId);
  const clearBtn= document.getElementById(clearId);
  if (!trigger || !drop) return;

  const toggleDrop = (e) => {
    e.stopPropagation();
    const isOpen = drop.style.display !== "none";
    document.querySelectorAll(".ms-drop").forEach(d => { d.style.display = "none"; });
    document.querySelectorAll(".ms-trigger").forEach(t => t.classList.remove("open"));
    if (!isOpen) { drop.style.display = "block"; trigger.classList.add("open"); if (search) search.focus(); }
  };
  trigger.addEventListener("click", toggleDrop);

  if (search) {
    search.addEventListener("input", () => {
      const q = search.value.toLowerCase();
      document.querySelectorAll(`#${listId} .ms-item`).forEach(item => {
        item.style.display = item.querySelector("span").textContent.toLowerCase().includes(q) ? "" : "none";
      });
    });
  }

  document.querySelectorAll(`#${listId} input[type=checkbox]`).forEach(cb => {
    cb.addEventListener("change", () => {
      selSet.clear();
      _msChecked(listId).forEach(v => selSet.add(v));
      _msUpdateLabel(labelId, countId, selSet, singularLabel, iconStr);
      trigger.classList.toggle("has-selection", selSet.size > 0);
      if (applyFilter) applyFilter();
    });
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      selSet.clear();
      document.querySelectorAll(`#${listId} input[type=checkbox]`).forEach(cb => cb.checked = false);
      _msUpdateLabel(labelId, countId, selSet, singularLabel, iconStr);
      trigger.classList.remove("has-selection");
      if (applyFilter) applyFilter();
    });
  }

  document.addEventListener("click", (e) => {
    if (!trigger.contains(e.target) && !drop.contains(e.target)) {
      drop.style.display = "none"; trigger.classList.remove("open");
    }
  }, { capture: false });
}

/* =====================================================================
   ADMIN — PESERTA (invite + monitoring)
   ===================================================================== */
PAGES.adminPeserta = async function () {
  const profile = await requireAuth("admin");
  if (!profile) return;
  renderShell(profile, ADMIN_NAV, "Administrator");
  await renderPeserta();
};

async function renderPeserta() {
  const c = document.getElementById("content");
  _contentLoading(c, "Memuat data peserta…");

  // Bulk fetch — satu query per tabel, tidak N+1
  const [
    { data: participants },
    { data: allAtt },
    { data: allSub },
    { data: allTrainings },
    { data: allAssignments },
  ] = await Promise.all([
    qc("profiles:p", () => _supabase.from("profiles").select("*").eq("role", "participant").order("full_name", { ascending: true })),
    qc("att:all", () => _supabase.from("attendances").select("*").eq("attendance_status", "present")),
    qc("sub:all", () => _supabase.from("submissions").select("*")),
    qc("trainings:a", () => _supabase.from("trainings").select("*").order("training_date", { ascending: true })),
    qc("assignments:a", () => _supabase.from("assignments").select("*")),
  ]);

  const totalT = (allTrainings || []).length;
  const totalA = (allAssignments || []).length;

  const attByPid = {};
  (allAtt || []).forEach(a => { (attByPid[a.participant_id] = attByPid[a.participant_id] || []).push(a); });
  const subByPid = {};
  (allSub || []).forEach(s => { (subByPid[s.participant_id] = subByPid[s.participant_id] || []).push(s); });

  const rows = (participants || []).map(p => {
    const attended  = (attByPid[p.id] || []).length;
    const completed = (subByPid[p.id] || []).length;
    const denom = (totalT || 0) + (totalA || 0);
    const percent = denom ? Math.round((attended + completed) / denom * 100) : 0;
    const aktif = attended > 0 || completed > 0;
    return { p, attended, completed, percent, aktif, totalT: totalT || 0, totalA: totalA || 0 };
  });

  // Unique institutions for filter
  const institutions = [...new Set(rows.map(r => r.p.institution).filter(Boolean))].sort();

  // Stats
  const totalPeserta = rows.length;
  const totalAktif   = rows.filter(r => r.aktif).length;
  const totalBelum   = totalPeserta - totalAktif;

  // Pagination state
  let currentPage = 1;
  const PER_PAGE = 20;
  let filtered = [...rows];

  function initUI() {
    c.innerHTML =
      pageHead("Kelola Peserta", `Total ${totalPeserta} peserta terdaftar.`,
        `<div class="flex gap-2">
          <button class="btn btn-ghost" id="genLinkBtn">${icon("download",16)}Generate Links</button>
          <button class="btn btn-primary" id="addPesertaBtn">${icon("plus",16)}Tambah Peserta</button>
        </div>`) +

      // Stats cards
      `<div class="grid grid-4" style="margin-bottom:20px">
        <div class="card card-pad" style="display:flex;align-items:center;gap:14px;padding:18px 20px">
          <span class="icon-box" style="background:#EAF1FA;color:#215AA9;width:44px;height:44px;border-radius:12px;flex-shrink:0">${icon("users",20)}</span>
          <div><div class="stat-num" style="font-size:26px;margin-top:0">${totalPeserta}</div><div class="stat-label">Total Peserta</div></div>
        </div>
        <div class="card card-pad" style="display:flex;align-items:center;gap:14px;padding:18px 20px">
          <span class="icon-box" style="background:#D1FAE5;color:#059669;width:44px;height:44px;border-radius:12px;flex-shrink:0">${icon("check",20)}</span>
          <div><div class="stat-num" style="font-size:26px;margin-top:0;color:#059669">${totalAktif}</div><div class="stat-label">Sudah Beraktivitas</div></div>
        </div>
        <div class="card card-pad" style="display:flex;align-items:center;gap:14px;padding:18px 20px">
          <span class="icon-box" style="background:#FEF3C7;color:#D97706;width:44px;height:44px;border-radius:12px;flex-shrink:0">${icon("clock",20)}</span>
          <div><div class="stat-num" style="font-size:26px;margin-top:0;color:#D97706">${totalBelum}</div><div class="stat-label">Belum Ada Aktivitas</div></div>
        </div>
        <div class="card card-pad" style="display:flex;align-items:center;gap:14px;padding:18px 20px">
          <span class="icon-box" style="background:#F0F4FB;color:#64748B;width:44px;height:44px;border-radius:12px;flex-shrink:0">${icon("trend",20)}</span>
          <div><div class="stat-num" style="font-size:26px;margin-top:0">${totalPeserta > 0 ? Math.round(totalAktif/totalPeserta*100) : 0}%</div><div class="stat-label">Tingkat Partisipasi</div></div>
        </div>
      </div>` +

      // Filter bar
      `<div class="card card-pad" style="margin-bottom:16px;padding:16px 20px">
        <div class="flex items-center gap-10px" style="flex-wrap:wrap;gap:12px">

          <!-- Search -->
          <div style="flex:1;min-width:200px;position:relative">
            <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94A3B8;pointer-events:none">${icon("search",16)}</span>
            <input class="input" id="searchInput" placeholder="Cari nama, email, atau institusi..." style="padding-left:38px;height:42px;font-size:13px">
          </div>

          <!-- Status multi-select -->
          <div class="ms-wrap" id="msStatusWrap">
            <button type="button" class="ms-trigger" id="msStatusTrigger">
              <span id="msStatusLabel">${icon("filter",14)} Semua Status</span>
              ${icon("chevron",14)}
            </button>
            <div class="ms-drop" id="msStatusDrop" style="display:none">
              <div class="ms-search-row"><span>${icon("search",13)}</span><input class="ms-search" id="msStatusSearch" placeholder="Cari status..."></div>
              <div class="ms-list" id="msStatusList">
                ${["aktif:Sudah Beraktivitas","belum:Belum Ada Aktivitas"].map(s => {
                    const [v,l] = s.split(":");
                    return `<label class="ms-item"><input type="checkbox" value="${v}"><span>${l}</span></label>`;
                  }).join("")}
              </div>
              <div class="ms-foot"><button class="ms-clear" id="msStatusClear">Reset</button><span id="msStatusCount" class="ms-count"></span></div>
            </div>
          </div>

          <!-- Institusi multi-select -->
          <div class="ms-wrap" id="msInstWrap">
            <button type="button" class="ms-trigger" id="msInstTrigger">
              <span id="msInstLabel">${icon("graduation",14)} Semua Institusi</span>
              ${icon("chevron",14)}
            </button>
            <div class="ms-drop" id="msInstDrop" style="display:none">
              <div class="ms-search-row"><span>${icon("search",13)}</span><input class="ms-search" id="msInstSearch" placeholder="Cari institusi..."></div>
              <div class="ms-list" id="msInstList">
                ${institutions.map(i => `<label class="ms-item"><input type="checkbox" value="${escapeHTML(i)}"><span>${escapeHTML(i)}</span></label>`).join("")}
              </div>
              <div class="ms-foot"><button class="ms-clear" id="msInstClear">Reset</button><span id="msInstCount" class="ms-count"></span></div>
            </div>
          </div>

          <button class="btn btn-ghost btn-sm" id="resetFilter" style="height:40px;white-space:nowrap">${icon("close",13)} Reset Semua</button>
        </div>
      </div>` +

      // Table + pagination placeholder
      `<div id="pesertaTableWrap"></div>
       <div id="pesertaPagination" style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px"></div>`;

    bindPesertaEvents();
    renderTable();
  }

  function renderTable() {
    const start = (currentPage - 1) * PER_PAGE;
    const pageRows = filtered.slice(start, start + PER_PAGE);
    const total = filtered.length;
    const totalPages = Math.ceil(total / PER_PAGE);

    const tbody = pageRows.map(({ p, attended, completed, percent, aktif, totalT, totalA }, i) => {
      const initials = (p.full_name || "?").split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase();
      const colors = ["#215AA9","#059669","#D97706","#7C3AED","#DC2626","#0891B2"];
      const bg = colors[(p.full_name || "").charCodeAt(0) % colors.length];
      return `<tr style="cursor:pointer" data-view-peserta="${p.id}">
        <td style="color:#94A3B8;font-size:13px">${start + i + 1}</td>
        <td>
          <div class="flex items-center gap-3">
            <div style="width:36px;height:36px;border-radius:50%;background:${bg};color:#fff;display:grid;place-items:center;font-size:12px;font-weight:700;flex-shrink:0">${escapeHTML(initials)}</div>
            <div>
              <div style="font-weight:600;font-size:13.5px;color:#0F1B2D">${escapeHTML(p.full_name || "-")}</div>
              <div style="font-size:12px;color:#94A3B8">${escapeHTML(p.email || "")}</div>
            </div>
          </div>
        </td>
        <td style="color:#64748B;font-size:13px">${escapeHTML(p.institution || "-")}</td>
        <td><span style="font-weight:600">${attended}</span><span style="color:#94A3B8;font-size:12px">/${totalT}</span></td>
        <td><span style="font-weight:600">${completed}</span><span style="color:#94A3B8;font-size:12px">/${totalA}</span></td>
        <td>
          <div class="flex items-center gap-2">
            <div style="width:72px;height:7px;border-radius:999px;background:#EEF2F7;overflow:hidden">
              <div style="height:100%;background:#215AA9;width:${percent}%"></div>
            </div>
            <span style="font-size:12px;font-weight:600;color:#0F1B2D">${percent}%</span>
          </div>
        </td>
        <td><span class="badge ${aktif ? "badge-success" : "badge-warning"}">${aktif ? "Aktif" : "Belum Aktif"}</span></td>
        <td style="font-size:12px;color:#64748B">${fmtDate(p.created_at)}</td>
        <td style="display:flex;gap:6px;align-items:center">
          <button class="btn-icon" data-view-btn="${p.id}" title="Lihat detail">${icon("user",15)}</button>
          <button class="btn-icon danger" data-del-peserta="${p.id}" title="Hapus peserta">${icon("trash",15)}</button>
        </td>
      </tr>`;
    }).join("");

    document.getElementById("pesertaTableWrap").innerHTML = total === 0
      ? `<div class="empty">Tidak ada peserta yang sesuai filter.</div>`
      : `<div class="card table-wrap">
          <table>
            <thead><tr><th>#</th><th>Nama</th><th>Institusi</th><th>Hadir</th><th>Tugas</th><th>Progress</th><th>Status</th><th>Terdaftar</th><th></th></tr></thead>
            <tbody>${tbody}</tbody>
          </table>
        </div>`;

    // View detail — klik baris atau tombol user
    const openDetail = (pid) => {
      const row = rows.find(r => r.p.id === pid);
      if (row) openPesertaDetailModal(row, allTrainings || [], allAssignments || [], allAtt || [], allSub || []);
    };
    document.querySelectorAll("[data-view-peserta]").forEach(tr => {
      tr.addEventListener("click", () => openDetail(tr.dataset.viewPeserta));
    });
    document.querySelectorAll("[data-view-btn]").forEach(btn => {
      btn.addEventListener("click", e => { e.stopPropagation(); openDetail(btn.dataset.viewBtn); });
    });

    // Delete buttons
    document.querySelectorAll("[data-del-peserta]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const pesertaId = btn.dataset.delPeserta;
        const row = btn.closest("tr");
        const nama = row?.querySelector("td:nth-child(2) strong, td:nth-child(2) b")?.textContent?.trim()
          || row?.querySelector("td:nth-child(2)")?.childNodes[0]?.textContent?.trim()
          || "peserta ini";

        const ok = await confirmDialog({
          title: `Hapus ${nama}?`,
          message: "Seluruh data kehadiran dan pengumpulan tugas peserta ini akan ikut terhapus.",
          confirmText: "Ya, Hapus Peserta",
          danger: true,
        });
        if (!ok) return;

        const restore = _btnLoad(btn, " Menghapus…");
        _progress.start();
        const { error } = await _supabase.from("profiles").delete().eq("id", pesertaId);
        _progress.done(); restore();
        if (error) { toast("Gagal menghapus peserta. " + error.message, "error"); return; }
        qcInvalidate("profiles");
        toast("Peserta berhasil dihapus.");
        renderPeserta();
      });
    });

    // Pagination
    const paginEl = document.getElementById("pesertaPagination");
    if (totalPages <= 1) { paginEl.innerHTML = ""; return; }
    const showing = `<span class="stat-label">Menampilkan ${start+1}–${Math.min(start+PER_PAGE, total)} dari ${total} peserta</span>`;
    const pages = [];
    for (let pg = 1; pg <= totalPages; pg++) {
      if (pg === 1 || pg === totalPages || Math.abs(pg - currentPage) <= 1) {
        pages.push(`<button class="btn btn-sm ${pg === currentPage ? "btn-primary" : "btn-ghost"}" data-page="${pg}">${pg}</button>`);
      } else if (Math.abs(pg - currentPage) === 2) {
        pages.push(`<span style="color:#94A3B8;padding:0 4px">…</span>`);
      }
    }
    paginEl.innerHTML = showing + `<div class="flex gap-2 items-center" style="flex-wrap:wrap">${pages.join("")}</div>`;
    paginEl.querySelectorAll("[data-page]").forEach(btn => {
      btn.addEventListener("click", () => { currentPage = +btn.dataset.page; renderTable(); });
    });
  }

  // Multi-select state
  let selStatus = new Set(), selInst = new Set();

  function applyFilter() {
    const q = (document.getElementById("searchInput")?.value || "").toLowerCase();
    filtered = rows.filter(({ p, aktif }) => {
      if (q && !`${p.full_name} ${p.email} ${p.institution}`.toLowerCase().includes(q)) return false;
      if (selStatus.size > 0) {
        if (selStatus.has("aktif") && !aktif) return false;
        if (selStatus.has("belum") && aktif) return false;
        if (selStatus.has("aktif") && selStatus.has("belum")) {} // both = no filter
      }
      if (selInst.size > 0 && !selInst.has(p.institution)) return false;
      return true;
    });
    currentPage = 1;
    renderTable();
  }


  function bindPesertaEvents() {
    document.getElementById("addPesertaBtn").addEventListener("click", openAddPesertaModal);
    document.getElementById("genLinkBtn").addEventListener("click", openGenerateLinksModal);
    document.getElementById("searchInput").addEventListener("input", applyFilter);

    _wireMultiSelect("msStatusTrigger","msStatusDrop","msStatusList","msStatusSearch","msStatusClear",
      selStatus, "msStatusLabel","msStatusCount","Semua Status", icon("filter",14), applyFilter);
    _wireMultiSelect("msInstTrigger","msInstDrop","msInstList","msInstSearch","msInstClear",
      selInst, "msInstLabel","msInstCount","Semua Institusi", icon("graduation",14), applyFilter);

    document.getElementById("resetFilter").addEventListener("click", () => {
      document.getElementById("searchInput").value = "";
      selStatus.clear(); selInst.clear();
      document.querySelectorAll(".ms-list input[type=checkbox]").forEach(cb => cb.checked = false);
      document.querySelectorAll(".ms-trigger").forEach(t => t.classList.remove("has-selection"));
      _msUpdateLabel("msStatusLabel","msStatusCount", selStatus, "Semua Status", icon("filter",14));
      _msUpdateLabel("msInstLabel","msInstCount", selInst, "Semua Institusi", icon("graduation",14));
      applyFilter();
    });
  }

  initUI();
}

function openPesertaDetailModal({ p, attended, completed, percent, aktif, totalT, totalA }, trainings, assignments, allAtt, allSub) {
  const inits = (p.full_name || "?").split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase();
  const colors = ["#215AA9","#059669","#D97706","#7C3AED","#DC2626","#0891B2"];
  const bg = colors[(p.full_name || "").charCodeAt(0) % colors.length];

  const attSet = new Set((allAtt || []).filter(a => a.participant_id === p.id).map(a => a.training_id));
  const subMap = {};
  (allSub || []).filter(s => s.participant_id === p.id).forEach(s => { subMap[s.assignment_id] = s; });
  const asgByTid = {};
  (assignments || []).forEach(a => { if (a.training_id) asgByTid[a.training_id] = a; });

  const trainingRows = (trainings || []).map(t => {
    const hadir = attSet.has(t.id);
    const asg   = asgByTid[t.id];
    const sub   = asg ? subMap[asg.id] : null;
    const today = new Date().toISOString().slice(0,10);
    return { t, hadir, asg, sub, isPastT: t.training_date <= today };
  }).filter(r => r.isPastT);

  const detailHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px">
      <div style="background:#F8FAFC;border-radius:12px;padding:14px;text-align:center">
        <p style="font-size:22px;font-weight:800;color:#215AA9">${attended}</p>
        <p style="font-size:11px;color:#94A3B8;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Kehadiran</p>
        <p style="font-size:11px;color:#CBD5E1">dari ${totalT} sesi</p>
      </div>
      <div style="background:#F8FAFC;border-radius:12px;padding:14px;text-align:center">
        <p style="font-size:22px;font-weight:800;color:#059669">${completed}</p>
        <p style="font-size:11px;color:#94A3B8;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Tugas</p>
        <p style="font-size:11px;color:#CBD5E1">dari ${totalA} tugas</p>
      </div>
      <div style="background:#F8FAFC;border-radius:12px;padding:14px;text-align:center">
        <p style="font-size:22px;font-weight:800;color:#0F1B2D">${percent}%</p>
        <p style="font-size:11px;color:#94A3B8;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Progress</p>
        <div style="height:5px;background:#E2E8F0;border-radius:999px;margin-top:6px;overflow:hidden"><div style="height:100%;background:#215AA9;width:${percent}%"></div></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:18px">
      ${[
        ["Email", p.email || "—"],
        ["Institusi", p.institution || "—"],
        ["Terdaftar", fmtDate(p.created_at)],
      ].map(([lbl, val]) => `
        <div style="background:#F8FAFC;border-radius:10px;padding:10px 12px">
          <p style="font-size:10px;color:#94A3B8;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">${lbl}</p>
          <p style="font-size:13px;font-weight:500;color:#334155;word-break:break-all">${escapeHTML(String(val))}</p>
        </div>`).join("")}
    </div>
    ${trainingRows.length > 0 ? `
    <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94A3B8;margin-bottom:8px">Riwayat Training</p>
    <div style="display:flex;flex-direction:column;gap:7px">
      ${trainingRows.map(({ t, hadir, asg, sub }) => `
        <div style="display:flex;align-items:center;justify-content:space-between;background:#F8FAFC;border-radius:10px;padding:10px 14px;gap:10px">
          <div style="min-width:0">
            <p style="font-size:13px;font-weight:600;color:#0F1B2D;margin-bottom:2px">${escapeHTML(t.title)}</p>
            <p style="font-size:11.5px;color:#94A3B8">${fmtDateShort(t.training_date)}${t.start_time ? " · "+fmtTime(t.start_time).replace(":",".")+(t.end_time?"–"+fmtTime(t.end_time).replace(":",".")+" WIB":""):"" }</p>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <span class="badge ${hadir ? "badge-success" : ""}" style="font-size:10.5px">${hadir ? icon("check",10)+" Hadir" : icon("close",10)+" Absen"}</span>
            ${asg ? `<span class="badge ${sub ? "badge-info" : ""}" style="font-size:10.5px">${sub ? (sub.status==="reviewed"?icon("star",10)+" Direview":icon("check",10)+" Terkumpul"):icon("circle",10)+" Belum"}</span>` : ""}
          </div>
        </div>`).join("")}
    </div>` : `<p style="font-size:13px;color:#94A3B8;text-align:center;padding:10px">Belum ada sesi yang berlangsung.</p>`}`;

  const editHTML = `
    <form id="editPesertaForm">
      <div class="field">
        <label class="label">Email <span style="color:#94A3B8;font-weight:400;font-size:11px">(tidak dapat diubah)</span></label>
        <input class="input" value="${escapeHTML(p.email||"")}" disabled style="opacity:.55;cursor:not-allowed">
      </div>
      <div class="field">
        <label class="label">Nama Lengkap <span style="color:red">*</span></label>
        <input class="input" name="full_name" value="${escapeHTML(p.full_name||"")}" placeholder="Nama lengkap" required>
      </div>
      <div class="field">
        <label class="label">Institusi</label>
        <input class="input" name="institution" value="${escapeHTML(p.institution||"")}" placeholder="Universitas ...">
      </div>
      <div id="editPesertaMsg" style="margin-bottom:8px"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="submit" class="btn btn-primary">${icon("check",15)} Simpan Perubahan</button>
      </div>
    </form>`;

  const dangerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:16px">
        <p style="font-size:13px;font-weight:700;color:#92400E;margin-bottom:6px">${icon("key",15)} Reset Password</p>
        <p style="font-size:12.5px;color:#78350F;margin-bottom:12px">Password peserta akan direset ke <code style="background:#FEF3C7;padding:1px 5px;border-radius:4px">ILP@2026</code> dan peserta diwajibkan ganti saat login berikutnya.</p>
        <button class="btn" id="resetPassBtn" style="background:#D97706;color:#fff;font-size:13px">${icon("key",14)} Reset Password ke Default</button>
      </div>
      <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:16px">
        <p style="font-size:13px;font-weight:700;color:#991B1B;margin-bottom:6px">${icon("trash",15)} Hapus Peserta</p>
        <p style="font-size:12.5px;color:#7F1D1D;margin-bottom:12px">Seluruh data kehadiran, pengumpulan tugas, dan riwayat peserta akan ikut terhapus secara permanen.</p>
        <button class="btn" id="delPesertaModalBtn" style="background:#DC2626;color:#fff;font-size:13px">${icon("trash",14)} Hapus Peserta Ini</button>
      </div>
    </div>`;

  openModal(p.full_name || "Detail Peserta", `
    <!-- Profil header -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid #F0F4FB">
      <div style="width:52px;height:52px;border-radius:50%;background:${bg};color:#fff;display:grid;place-items:center;font-size:17px;font-weight:700;flex-shrink:0">${escapeHTML(inits)}</div>
      <div style="flex:1;min-width:0">
        <h3 style="font-size:15px;font-weight:700;color:#0F1B2D">${escapeHTML(p.full_name||"-")}</h3>
        <p style="font-size:12.5px;color:#64748B">${escapeHTML(p.email||"")}</p>
        <span class="badge ${aktif?"badge-success":"badge-warning"}" style="margin-top:4px">${aktif?"Aktif":"Belum Ada Aktivitas"}</span>
      </div>
    </div>
    <!-- Tabs -->
    <div class="ap-tabs" id="pdTabs">
      <button class="ap-tab active" data-pd="detail">${icon("user",13)} Detail</button>
      <button class="ap-tab" data-pd="edit">${icon("edit",13)} Edit Profil</button>
      <button class="ap-tab" data-pd="danger" style="color:#DC2626">${icon("shield",13)} Kelola Akun</button>
    </div>
    <div id="pdDetail">${detailHTML}</div>
    <div id="pdEdit" style="display:none">${editHTML}</div>
    <div id="pdDanger" style="display:none">${dangerHTML}</div>
  `, { wide: true });

  // Tab switching
  document.querySelectorAll("[data-pd]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-pd]").forEach(b => b.classList.remove("active"));
      ["Detail","Edit","Danger"].forEach(n => { const el = document.getElementById("pd"+n); if(el) el.style.display="none"; });
      btn.classList.add("active");
      const key = btn.dataset.pd.charAt(0).toUpperCase() + btn.dataset.pd.slice(1);
      const el = document.getElementById("pd"+key);
      if (el) el.style.display = "block";
    });
  });

  // Edit form submit
  document.getElementById("editPesertaForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const msgEl = document.getElementById("editPesertaMsg");
    const submitBtn = f.querySelector("button[type=submit]");
    submitBtn.disabled = true; submitBtn.textContent = "Menyimpan...";
    const updates = {
      full_name:   f.full_name.value.trim(),
      institution: f.institution.value.trim(),
    };
    const { error } = await _supabase.from("profiles").update(updates).eq("id", p.id);
    if (error) {
      msgEl.innerHTML = `<div class="alert alert-error">${escapeHTML(error.message)}</div>`;
      submitBtn.disabled = false; submitBtn.innerHTML = icon("check",15)+" Simpan Perubahan";
      return;
    }
    msgEl.innerHTML = `<div class="alert alert-success">Profil berhasil diperbarui!</div>`;
    qcInvalidate("profiles");
    setTimeout(() => { closeModal(); renderPeserta(); }, 900);
  });

  // Reset password — kirim email reset via Supabase Auth
  document.getElementById("resetPassBtn").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Kirim Reset Password?",
      message: `Email reset password akan dikirim ke <strong>${escapeHTML(p.email)}</strong>. Peserta dapat membuat password baru melalui tautan di email tersebut.`,
      confirmText: "Ya, Kirim Email Reset",
      danger: false,
    });
    if (!ok) return;
    const { error } = await _supabase.auth.resetPasswordForEmail(p.email, {
      redirectTo: window.location.origin + "/set-password.html"
    });
    if (error) { toast("Gagal mengirim email reset: " + error.message, "error"); return; }
    toast("Email reset password berhasil dikirim ke " + p.email, "success");
  });

  // Delete
  document.getElementById("delPesertaModalBtn").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: `Hapus ${p.full_name || "peserta ini"}?`,
      message: "Seluruh data kehadiran dan pengumpulan tugas peserta ini akan ikut terhapus.",
      confirmText: "Ya, Hapus Peserta",
      danger: true,
    });
    if (!ok) return;
    const { error } = await _supabase.from("profiles").delete().eq("id", p.id);
    if (error) { toast("Gagal menghapus: " + error.message, "error"); return; }
    qcInvalidate("profiles");
    toast("Peserta berhasil dihapus.");
    closeModal();
    renderPeserta();
  });
}

/* ─── Tambah Peserta — 3 tab modal ─── */
function openAddPesertaModal() {
  const DEFAULT_PASS = "ILP@2026";
  openModal("Tambah Peserta", `
    <div class="ap-tabs">
      <button class="ap-tab active" data-tab="manual">${icon("user",14)} Manual</button>
      <button class="ap-tab" data-tab="excel">${icon("upload",14)} Import Excel</button>
      <button class="ap-tab" data-tab="invite">${icon("mail",14)} Kirim Undangan</button>
    </div>

    <!-- TAB: MANUAL -->
    <div class="ap-panel" id="apManual">
      <form id="manualForm">
        <div class="field"><label class="label">Email <span style="color:red">*</span></label>
          <input class="input" name="email" type="email" required placeholder="nama@institusi.ac.id"></div>
        <div class="field"><label class="label">Nama Lengkap</label>
          <input class="input" name="full_name" placeholder="Dr. Nama Dosen"></div>
        <div class="field"><label class="label">Institusi</label>
          <input class="input" name="institution" placeholder="Universitas ..."></div>
        <div class="field"><label class="label">Password</label>
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
              <input type="radio" name="passType" value="default" checked> Default (<code style="font-size:12px">${DEFAULT_PASS}</code>)
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
              <input type="radio" name="passType" value="custom"> Custom
            </label>
          </div>
          <input class="input" id="customPassInput" name="password" type="password" placeholder="Min. 8 karakter" style="display:none">
        </div>
        <div style="display:flex;align-items:flex-start;gap:12px;background:linear-gradient(135deg,#FFFBEB,#FEF3C7);border:1.5px solid #FDE68A;border-radius:14px;padding:14px 16px;margin-bottom:14px">
          <span style="width:34px;height:34px;border-radius:10px;background:#FEF08A;display:grid;place-items:center;flex-shrink:0;color:#92400E">${icon("lock",16)}</span>
          <div>
            <p style="font-size:12.5px;font-weight:700;color:#78350F;margin-bottom:3px">Ganti Password Wajib</p>
            <p style="font-size:12px;color:#92400E;line-height:1.5">Peserta akan diminta mengganti password saat login pertama kali sebelum dapat menggunakan aplikasi.</p>
          </div>
        </div>
        <label id="manualEmailToggle" style="display:flex;align-items:center;gap:12px;cursor:pointer;margin-bottom:14px;padding:14px 16px;background:linear-gradient(135deg,#F8FAFF,#EFF4FF);border:1.5px solid #C7D7F5;border-radius:14px;transition:border-color .15s,background .15s">
          <input type="checkbox" name="sendEmail" id="manualSendEmail" style="display:none">
          <div id="manualEmailSw" style="width:40px;height:22px;border-radius:99px;background:#CBD5E1;flex-shrink:0;position:relative;transition:background .2s">
            <div style="position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.2);transition:transform .2s" id="manualEmailKnob"></div>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:#1E293B;display:flex;align-items:center;gap:6px">${icon("mail",14)} Kirim email notifikasi ke peserta</div>
            <div style="font-size:11.5px;color:#64748B;margin-top:2px">Peserta akan menerima email pemberitahuan akun telah dibuat</div>
          </div>
          <span id="manualEmailBadge" style="font-size:11px;font-weight:600;color:#94A3B8;background:#E2E8F0;padding:3px 9px;border-radius:20px;flex-shrink:0;white-space:nowrap">Tidak aktif</span>
        </label>
        <div id="manualMsg"></div>
        <button class="btn btn-primary" style="width:100%" type="submit">${icon("user",15)} Tambah Peserta</button>
      </form>
    </div>

    <!-- TAB: EXCEL -->
    <div class="ap-panel" id="apExcel" style="display:none">
      <div style="background:#F8FAFC;border:1px solid #E8EEF6;border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:12px">
        <strong>Format kolom Excel:</strong> <code>email</code>, <code>full_name</code>, <code>institution</code><br>
        <span style="color:#94A3B8">Baris pertama = header. Email wajib ada.</span><br>
        <a id="dlTemplateXls" href="#" style="color:#215AA9;font-weight:600;display:inline-flex;align-items:center;gap:4px;margin-top:6px">${icon("download",12)} Unduh Template Excel</a>
      </div>
      <div class="field"><label class="label">Pilih File Excel (.xlsx)</label>
        <input type="file" id="xlsFileInput" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
      </div>
      <div id="xlsPreview" style="display:none;margin-bottom:14px">
        <p style="font-size:13px;font-weight:600;color:#0F1B2D;margin-bottom:8px" id="xlsCount"></p>
        <div style="max-height:180px;overflow-y:auto;border:1px solid #E8EEF6;border-radius:10px">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead style="background:#F8FAFC;position:sticky;top:0">
              <tr><th style="padding:7px 12px;text-align:left;color:#94A3B8">EMAIL</th><th style="padding:7px 12px;text-align:left;color:#94A3B8">NAMA</th><th style="padding:7px 12px;text-align:left;color:#94A3B8">INSTITUSI</th></tr>
            </thead>
            <tbody id="xlsTableBody"></tbody>
          </table>
        </div>
      </div>
      <div class="imp-prog" id="xlsProgress">
        <div class="imp-prog-head">
          <span class="imp-prog-label"><span class="spin-sm" id="xlsSpinner"></span><span id="xlsProgLabel">Memproses...</span></span>
          <span class="imp-prog-pct" id="xlsProgCount">0%</span>
        </div>
        <div class="imp-prog-bar"><div class="imp-prog-fill" id="xlsProgBar"></div></div>
      </div>
      <div id="xlsResult" style="display:none"></div>
      <div id="xlsMsg"></div>
      <div style="display:flex;align-items:flex-start;gap:12px;background:linear-gradient(135deg,#FFFBEB,#FEF3C7);border:1.5px solid #FDE68A;border-radius:14px;padding:14px 16px;margin-bottom:10px">
        <span style="width:34px;height:34px;border-radius:10px;background:#FEF08A;display:grid;place-items:center;flex-shrink:0;color:#92400E">${icon("lock",16)}</span>
        <div>
          <p style="font-size:12.5px;font-weight:700;color:#78350F;margin-bottom:3px">Password Default: <code style="background:#FEF08A;padding:1px 6px;border-radius:6px;font-size:12px;font-weight:700">${DEFAULT_PASS}</code></p>
          <p style="font-size:12px;color:#92400E;line-height:1.5">Semua akun dibuat dengan password ini. Peserta wajib menggantinya saat login pertama kali.</p>
        </div>
      </div>
      <label id="xlsEmailToggle" style="display:flex;align-items:center;gap:12px;cursor:pointer;margin-bottom:14px;padding:14px 16px;background:linear-gradient(135deg,#F8FAFF,#EFF4FF);border:1.5px solid #C7D7F5;border-radius:14px;transition:border-color .15s,background .15s">
        <input type="checkbox" id="xlsSendEmail" style="display:none">
        <div id="xlsEmailSw" style="width:40px;height:22px;border-radius:99px;background:#CBD5E1;flex-shrink:0;position:relative;transition:background .2s">
          <div style="position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.2);transition:transform .2s" id="xlsEmailKnob"></div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:#1E293B;display:flex;align-items:center;gap:6px">${icon("mail",14)} Kirim email notifikasi ke setiap peserta</div>
          <div style="font-size:11.5px;color:#64748B;margin-top:2px">Setiap peserta akan menerima email pemberitahuan akun telah dibuat</div>
        </div>
        <span id="xlsEmailBadge" style="font-size:11px;font-weight:600;color:#94A3B8;background:#E2E8F0;padding:3px 9px;border-radius:20px;flex-shrink:0;white-space:nowrap">Tidak aktif</span>
      </label>
      <button class="btn btn-primary" style="width:100%" id="xlsImportBtn" disabled>${icon("upload",15)} Import & Buat Akun</button>
    </div>

    <!-- TAB: INVITE -->
    <div class="ap-panel" id="apInvite" style="display:none">
      <p style="font-size:13px;color:#475569;margin-bottom:14px">Peserta akan menerima email berisi link untuk mengatur password mereka sendiri.</p>
      <form id="inviteForm">
        <div class="field"><label class="label">Email <span style="color:red">*</span></label>
          <input class="input" name="email" type="email" required placeholder="nama@institusi.ac.id"></div>
        <div class="field"><label class="label">Nama Lengkap</label>
          <input class="input" name="full_name" placeholder="Dr. Nama Dosen"></div>
        <div class="field"><label class="label">Institusi</label>
          <input class="input" name="institution" placeholder="Universitas ..."></div>
        <div id="inviteMsg"></div>
        <button class="btn btn-primary" style="width:100%" type="submit">${icon("mail",15)} Kirim Undangan Email</button>
      </form>
    </div>
  `, { wide: true });

  // Tab switching
  document.querySelectorAll(".ap-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".ap-tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".ap-panel").forEach(p => p.style.display = "none");
      btn.classList.add("active");
      document.getElementById("ap" + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1)).style.display = "block";
    });
  });

  // Toggle switch visual for email notification (Manual)
  function _wireToggle(toggleId, swId, knobId, badgeId, cbId) {
    const lbl = document.getElementById(toggleId);
    const sw  = document.getElementById(swId);
    const knob= document.getElementById(knobId);
    const badge = document.getElementById(badgeId);
    const cb  = document.getElementById(cbId);
    if (!lbl || !cb) return;
    lbl.addEventListener("click", () => {
      cb.checked = !cb.checked;
      const on = cb.checked;
      sw.style.background = on ? "#1A437B" : "#CBD5E1";
      knob.style.transform = on ? "translateX(18px)" : "translateX(0)";
      badge.textContent = on ? "Aktif" : "Tidak aktif";
      badge.style.background = on ? "#DBEAFE" : "#E2E8F0";
      badge.style.color = on ? "#1D4ED8" : "#94A3B8";
      lbl.style.borderColor = on ? "#93B4F0" : "#C7D7F5";
      lbl.style.background = on ? "linear-gradient(135deg,#EFF6FF,#DBEAFE)" : "linear-gradient(135deg,#F8FAFF,#EFF4FF)";
    });
  }
  _wireToggle("manualEmailToggle", "manualEmailSw", "manualEmailKnob", "manualEmailBadge", "manualSendEmail");
  _wireToggle("xlsEmailToggle", "xlsEmailSw", "xlsEmailKnob", "xlsEmailBadge", "xlsSendEmail");

  // Password type toggle
  document.querySelectorAll("input[name='passType']").forEach(r => {
    r.addEventListener("change", () => {
      document.getElementById("customPassInput").style.display = r.value === "custom" ? "block" : "none";
    });
  });

  // ── MANUAL submit ──
  document.getElementById("manualForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const msg = document.getElementById("manualMsg");
    const btn = f.querySelector("button[type=submit]");
    const passType = f.passType.value;
    const password = passType === "custom" ? f.password.value.trim() : DEFAULT_PASS;
    if (passType === "custom" && password.length < 8) {
      msg.innerHTML = `<div class="alert alert-error">Password minimal 8 karakter.</div>`; return;
    }
    btn.disabled = true; btn.textContent = "Menyimpan...";
    const email = f.email.value.trim();
    const full_name = f.full_name.value.trim();
    const institution = f.institution.value.trim();
    const sendEmail = document.getElementById("manualSendEmail")?.checked === true;

    const { data, error } = await _supabase.auth.signUp({
      email, password,
      options: { data: { full_name, institution, role: "participant" }, emailRedirectTo: sendEmail ? undefined : null },
    });
    if (error) {
      msg.innerHTML = `<div class="alert alert-error">${escapeHTML(error.message)}</div>`;
      btn.disabled = false; btn.innerHTML = icon("user",15) + " Tambah Peserta"; return;
    }
    if (data.user) {
      await _supabase.from("profiles").upsert({
        id: data.user.id, email, full_name, institution, role: "participant",
      }, { onConflict: "id" });
    }
    // Send OTP magic-link notification if admin opted in
    if (sendEmail) {
      await _supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    }
    msg.innerHTML = `<div class="alert alert-success">Peserta berhasil ditambahkan!${sendEmail ? " Email notifikasi terkirim." : ""}</div>`;
    qcInvalidate("profiles");
    setTimeout(() => { closeModal(); renderPeserta(); }, 1000);
  });

  // ── EXCEL template download ──
  document.getElementById("dlTemplateXls").addEventListener("click", e => {
    e.preventDefault();
    if (!window.XLSX) { toast("Library Excel belum siap.", "error"); return; }
    const ws = XLSX.utils.aoa_to_sheet([["email","full_name","institution"],["contoh@universitas.ac.id","Dr. Nama Dosen","Universitas Contoh"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Peserta");
    XLSX.writeFile(wb, "template-peserta-ilp.xlsx");
  });

  // ── EXCEL file parse ──
  let xlsParsed = [];
  document.getElementById("xlsFileInput").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!window.XLSX) { document.getElementById("xlsMsg").innerHTML = `<div class="alert alert-error">Library Excel belum siap, refresh halaman.</div>`; return; }
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: "" });
        xlsParsed = data.map(row => ({
          email: (row["email"] || row["Email"] || row["EMAIL"] || "").toString().trim(),
          full_name: (row["full_name"] || row["Nama"] || row["nama"] || row["NAMA"] || "").toString().trim(),
          institution: (row["institution"] || row["Institusi"] || row["institusi"] || "").toString().trim(),
        })).filter(r => r.email && r.email.includes("@"));
        if (!xlsParsed.length) {
          document.getElementById("xlsMsg").innerHTML = `<div class="alert alert-error">Tidak ada data valid. Pastikan kolom "email" ada.</div>`; return;
        }
        document.getElementById("xlsMsg").innerHTML = "";
        document.getElementById("xlsCount").textContent = `${xlsParsed.length} peserta siap diimport`;
        document.getElementById("xlsTableBody").innerHTML = xlsParsed.slice(0,15).map(r =>
          `<tr style="border-top:1px solid #F0F4FB">
            <td style="padding:6px 12px;color:#334155">${escapeHTML(r.email)}</td>
            <td style="padding:6px 12px;color:#475569">${escapeHTML(r.full_name)}</td>
            <td style="padding:6px 12px;color:#475569">${escapeHTML(r.institution)}</td>
          </tr>`).join("") + (xlsParsed.length > 15 ? `<tr><td colspan="3" style="padding:7px 12px;color:#94A3B8;font-style:italic">...dan ${xlsParsed.length-15} lainnya</td></tr>` : "");
        document.getElementById("xlsPreview").style.display = "block";
        document.getElementById("xlsImportBtn").disabled = false;
      } catch(err) {
        document.getElementById("xlsMsg").innerHTML = `<div class="alert alert-error">Gagal membaca file: ${escapeHTML(err.message)}</div>`;
      }
    };
    reader.readAsArrayBuffer(file);
  });

  // ── EXCEL import ──
  document.getElementById("xlsImportBtn").addEventListener("click", async () => {
    if (!xlsParsed.length) return;
    const btn = document.getElementById("xlsImportBtn");
    const sendEmail = document.getElementById("xlsSendEmail")?.checked === true;
    btn.disabled = true;
    document.getElementById("xlsPreview").style.display = "none";
    document.getElementById("xlsProgress").style.display = "block";
    let ok = 0, fail = 0, failList = [], okList = [];
    for (let i = 0; i < xlsParsed.length; i++) {
      const r = xlsParsed[i];
      document.getElementById("xlsProgLabel").textContent = `Membuat akun ${i+1} dari ${xlsParsed.length}...`;
      document.getElementById("xlsProgCount").textContent = `${Math.round((i+1)/xlsParsed.length*100)}%`;
      document.getElementById("xlsProgBar").style.width = `${(i+1)/xlsParsed.length*100}%`;
      const { data, error } = await _supabase.auth.signUp({
        email: r.email, password: DEFAULT_PASS,
        options: { data: { full_name: r.full_name, institution: r.institution, role: "participant" } },
      });
      if (error) { fail++; failList.push({ email: r.email, reason: error.message }); }
      else {
        if (data.user) await _supabase.from("profiles").upsert({ id: data.user.id, email: r.email, full_name: r.full_name, institution: r.institution, role: "participant" }, { onConflict: "id" });
        if (sendEmail) await _supabase.auth.signInWithOtp({ email: r.email, options: { shouldCreateUser: false } });
        ok++; okList.push(r);
      }
      if (i % 3 === 2) await new Promise(res => setTimeout(res, 1000));
    }
    // Hide spinner, show done
    document.getElementById("xlsSpinner").style.display = "none";
    document.getElementById("xlsProgLabel").textContent = "Selesai!";
    document.getElementById("xlsProgBar").style.width = "100%";

    // Review summary
    document.getElementById("xlsResult").style.display = "block";
    document.getElementById("xlsResult").innerHTML = `
      <div style="background:#D1FAE5;color:#065F46;border-radius:10px;padding:12px 16px;margin-bottom:8px">
        <div style="font-size:13px;font-weight:700;margin-bottom:6px">${icon("check",14)} ${ok} akun berhasil dibuat</div>
        ${ok > 0 ? `<div style="max-height:130px;overflow-y:auto;margin-top:6px">
          <table style="width:100%;font-size:11.5px;border-collapse:collapse">
            <thead><tr style="opacity:.7"><th style="text-align:left;padding:3px 8px">Email</th><th style="text-align:left;padding:3px 8px">Nama</th><th style="text-align:left;padding:3px 8px">Institusi</th></tr></thead>
            <tbody>${okList.map(r => `<tr style="border-top:1px solid rgba(0,0,0,0.06)">
              <td style="padding:3px 8px">${escapeHTML(r.email)}</td>
              <td style="padding:3px 8px">${escapeHTML(r.full_name||"-")}</td>
              <td style="padding:3px 8px">${escapeHTML(r.institution||"-")}</td>
            </tr>`).join("")}</tbody>
          </table>
        </div>` : ""}
      </div>
      ${fail ? `<div style="background:#FEE2E2;color:#991B1B;border-radius:10px;padding:12px 16px">
        <div style="font-size:13px;font-weight:700;margin-bottom:6px">${icon("close",14)} ${fail} gagal</div>
        <div style="max-height:100px;overflow-y:auto;font-size:11.5px">
          ${failList.map(f => `<div style="padding:2px 0">${escapeHTML(f.email)} — <span style="opacity:.8">${escapeHTML(f.reason)}</span></div>`).join("")}
        </div>
      </div>` : ""}
      <div style="background:#EFF6FF;color:#1D4ED8;border-radius:10px;padding:10px 14px;font-size:12px;margin-top:8px">
        ${icon("shield",13)} Password default: <strong>ILP@2026</strong> — peserta wajib ganti saat login pertama.
      </div>`;
    toast(`${ok} akun dibuat${fail?`, ${fail} gagal`:""}`, fail?"error":"success");
    qcInvalidate("profiles");
    renderPeserta();
  });

  // ── INVITE submit ──
  document.getElementById("inviteForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const msg = document.getElementById("inviteMsg");
    const btn = f.querySelector("button");
    btn.disabled = true; btn.textContent = "Mengirim...";
    const { error } = await _supabase.auth.signInWithOtp({
      email: f.email.value.trim(),
      options: { emailRedirectTo: SITE_URL + "/set-password.html", data: { full_name: f.full_name.value.trim(), institution: f.institution.value.trim(), role: "participant" } },
    });
    if (error) {
      msg.innerHTML = `<div class="alert alert-error">${escapeHTML(error.message)}</div>`;
      btn.disabled = false; btn.textContent = "Kirim Undangan Email"; return;
    }
    msg.innerHTML = `<div class="alert alert-success">Undangan terkirim ke ${escapeHTML(f.email.value.trim())}.</div>`;
    qcInvalidate("profiles");
    setTimeout(() => { closeModal(); renderPeserta(); }, 1200);
  });
}

/* =====================================================================
   ADMIN — GENERATE INVITE LINKS
   ===================================================================== */
function openGenerateLinksModal() {
  openModal("Generate Link Set Password", `
    <div style="margin-bottom:16px;background:#F8FAFC;border:1px solid #E8EEF6;border-radius:12px;padding:14px">
      <p style="font-size:12px;font-weight:700;color:#475569;margin-bottom:6px">Cara kerja:</p>
      <p style="font-size:12px;color:#64748B;margin-bottom:4px">1. Upload CSV berisi daftar peserta</p>
      <p style="font-size:12px;color:#64748B;margin-bottom:4px">2. Klik "Generate Links" — akun dibuat otomatis, link set-password digenerate</p>
      <p style="font-size:12px;color:#64748B">3. Export Excel → serahkan ke tim email untuk dikirimkan ke peserta</p>
    </div>

    <div class="field">
      <label class="label">Format CSV: <code style="font-size:11px;color:#215AA9">email,full_name,institution</code></label>
      <input type="file" id="glCsvInput" accept=".csv,text/csv">
    </div>

    <div id="glPreview" style="display:none;margin-bottom:16px">
      <p style="font-size:13px;font-weight:600;color:#0F1B2D;margin-bottom:8px" id="glCount"></p>
    </div>

    <div id="glProgress" style="display:none;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:13px;font-weight:600;color:#0F1B2D" id="glProgressLabel">Memproses...</span>
        <span style="font-size:12px;color:#64748B" id="glProgressPct"></span>
      </div>
      <div style="height:8px;background:#EEF2F7;border-radius:999px;overflow:hidden">
        <div id="glProgressBar" style="height:100%;background:linear-gradient(90deg,#215AA9,#3B82F6);border-radius:999px;transition:width 0.3s;width:0%"></div>
      </div>
    </div>

    <div id="glResult" style="display:none"></div>
    <div id="glMsg"></div>
    <button class="btn btn-primary" style="width:100%" id="glGenerateBtn" disabled>${icon("download",15)} Generate Links</button>
  `);

  let parsedRows = [];

  document.getElementById("glCsvInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.trim().split(/\r?\n/);
      const header = lines[0].toLowerCase().split(",").map(h => h.trim().replace(/"/g, ""));
      const emailIdx = header.indexOf("email");
      const nameIdx  = header.indexOf("full_name");
      const instIdx  = header.indexOf("institution");
      if (emailIdx === -1) {
        document.getElementById("glMsg").innerHTML = `<div class="alert alert-error">Kolom "email" tidak ditemukan.</div>`;
        return;
      }
      parsedRows = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map(c => c.trim().replace(/"/g, ""));
        const email = cols[emailIdx] || "";
        if (!email || !email.includes("@")) continue;
        parsedRows.push({
          email,
          full_name: nameIdx >= 0 ? cols[nameIdx] || "" : "",
          institution: instIdx >= 0 ? cols[instIdx] || "" : "",
        });
      }
      if (!parsedRows.length) {
        document.getElementById("glMsg").innerHTML = `<div class="alert alert-error">Tidak ada baris valid.</div>`;
        return;
      }
      document.getElementById("glMsg").innerHTML = "";
      document.getElementById("glCount").textContent = `${parsedRows.length} peserta siap digenerate linknya`;
      document.getElementById("glPreview").style.display = "block";
      document.getElementById("glGenerateBtn").disabled = false;
    };
    reader.readAsText(file);
  });

  document.getElementById("glGenerateBtn").addEventListener("click", async () => {
    if (!parsedRows.length) return;
    const btn = document.getElementById("glGenerateBtn");
    btn.disabled = true;
    document.getElementById("glPreview").style.display = "none";
    document.getElementById("glProgress").style.display = "block";
    document.getElementById("glProgressLabel").textContent = "Menghubungi server...";
    document.getElementById("glProgressBar").style.width = "30%";

    const { data: { session } } = await _supabase.auth.getSession();

    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/generate-invite-links`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "apikey": SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ participants: parsedRows, siteUrl: SITE_URL }),
      }
    );

    document.getElementById("glProgressBar").style.width = "100%";
    document.getElementById("glProgressLabel").textContent = "Selesai!";
    document.getElementById("glProgressPct").textContent = "100%";

    const json = await res.json();

    if (!res.ok || json.error) {
      document.getElementById("glMsg").innerHTML = `<div class="alert alert-error">Gagal: ${escapeHTML(json.error || "Unknown error")}</div>`;
      btn.disabled = false;
      return;
    }

    const results = json.results || [];
    const success = results.filter(r => r.link);
    const failed  = results.filter(r => !r.link);

    document.getElementById("glResult").style.display = "block";
    document.getElementById("glResult").innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <span style="font-size:13px;font-weight:600;color:#065F46">${icon("check",14)} ${success.length} link berhasil digenerate${failed.length ? ` · <span style="color:#991B1B">${failed.length} gagal</span>` : ""}</span>
        <button class="btn btn-ghost btn-sm" id="glExportBtn">${icon("download",14)} Export Excel</button>
      </div>
      <div style="max-height:240px;overflow-y:auto;border:1px solid #E8EEF6;border-radius:10px">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead style="background:#F8FAFC;position:sticky;top:0">
            <tr>
              <th style="padding:8px 12px;text-align:left;color:#94A3B8;font-weight:600">EMAIL</th>
              <th style="padding:8px 12px;text-align:left;color:#94A3B8;font-weight:600">NAMA</th>
              <th style="padding:8px 12px;text-align:left;color:#94A3B8;font-weight:600">LINK SET PASSWORD</th>
            </tr>
          </thead>
          <tbody>
            ${results.map(r => `
              <tr style="border-top:1px solid #F0F4FB">
                <td style="padding:7px 12px;color:#334155">${escapeHTML(r.email)}</td>
                <td style="padding:7px 12px;color:#475569">${escapeHTML(r.full_name || "-")}</td>
                <td style="padding:7px 12px">
                  ${r.link
                    ? `<a href="${escapeHTML(r.link)}" target="_blank" style="font-size:11px;color:#215AA9;word-break:break-all">${escapeHTML(r.link.slice(0, 60))}…</a>`
                    : `<span style="color:#EF4444;font-size:11px">Gagal: ${escapeHTML(r.error || "")}</span>`}
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById("glExportBtn").addEventListener("click", () => {
      const header = "email,full_name,institution,link_set_password";
      const rows = results.map(r =>
        `"${r.email}","${(r.full_name||"").replace(/"/g,'""')}","${(r.institution||"").replace(/"/g,'""')}","${(r.link||"").replace(/"/g,'""')}"`
      );
      const csv = [header, ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const a = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(blob),
        download: `invite-links-${new Date().toISOString().slice(0,10)}.csv`,
      });
      a.click();
    });
  });
}

/* =====================================================================
   ADMIN — TRAINING CRUD
   ===================================================================== */
PAGES.adminTraining = async function () {
  const profile = await requireAuth("admin");
  if (!profile) return;
  renderShell(profile, ADMIN_NAV, "Administrator");
  await renderAdminTraining();
};

async function renderAdminTraining() {
  const c = document.getElementById("content");
  _contentLoading(c, "Memuat data training…");
  const [{ data }, mfList] = await Promise.all([
    qc("trainings:a", () => _supabase.from("trainings").select("*").order("training_date", { ascending: false })),
    _fetchMasterForms(),
  ]);
  const all = data || [];
  const speakers = [...new Set(all.map(t => t.speaker).filter(Boolean))].sort();
  const masterByCategory = {};
  mfList.forEach(f => { masterByCategory[f.master_category] = f; });

  function renderCards(items) {
    const wrap = document.getElementById("trainingListWrap");
    if (!items.length) {
      wrap.innerHTML = `<div class="card card-pad empty" style="padding:48px 24px">${icon("calendar",30)}<p style="margin-top:10px;font-weight:600;color:var(--ink-700)">Tidak ada training yang sesuai filter.</p></div>`;
      return;
    }
    wrap.innerHTML = `<div class="grid grid-3" style="gap:10px">${items.map((t) => {
      const past = isPast(t.training_date);
      const iconBg = past ? "#F1F5F9" : "var(--primary-tint)";
      const iconColor = past ? "#64748B" : "var(--primary)";
      const timeStr = t.start_time ? fmtTime(t.start_time) + (t.end_time ? " – " + fmtTime(t.end_time) : "") + " WIB" : "";
      const formBtns = MASTER_FORM_CATS.map((cat) => {
        const mf = masterByCategory[cat.key];
        if (!mf) return `<span class="btn btn-ghost btn-sm" style="opacity:.35;cursor:not-allowed" title="Form master ${cat.label} belum dibuat">${icon(cat.icon,13)} ${cat.label}</span>`;
        return `<button class="btn btn-ghost btn-sm" data-admin-form-edit="${mf.id}" style="color:${cat.color}">${icon(cat.icon,13)} ${cat.label}</button>`;
      }).join("");
      return `<div class="card card-pad" style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <span class="kpi-ico" style="width:42px;height:42px;border-radius:11px;background:${iconBg};color:${iconColor}">${icon("presentation",20)}</span>
          <span class="badge ${past ? "" : "badge-success"}" style="font-size:11.5px;margin-top:2px">${past ? "Selesai" : "Mendatang"}</span>
        </div>
        <div>
          ${t.week_number ? `<div style="font-size:11.5px;font-weight:600;color:var(--primary);margin-bottom:4px;letter-spacing:.3px">SESI ${t.week_number}</div>` : ""}
          <h3 style="font-size:15px;font-weight:700;color:var(--ink-900);line-height:1.35">${escapeHTML(t.title)}</h3>
          ${t.description ? `<p style="font-size:12.5px;color:var(--ink-500);margin-top:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHTML(t.description)}</p>` : ""}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${t.speaker ? `<span class="badge">${icon("user",11)} ${escapeHTML(t.speaker)}</span>` : ""}
          ${t.zoom_link ? `<span class="badge" style="background:#E0F2FE;color:#0284C7">${icon("video",11)} Link</span>` : ""}
          ${t.visible_from ? `<span class="badge badge-warning" style="font-size:11px">${icon("clock",11)} Tampil ${fmtDate(t.visible_from)}</span>` : ""}
        </div>
        <div style="font-size:12px;color:var(--ink-500);display:flex;align-items:center;gap:6px">
          ${icon("calendar",13)} ${t.training_date ? fmtDateShort(t.training_date) : `<span style="color:#F59E0B;font-weight:600">Tanggal belum diset</span>`}
          ${timeStr ? `${icon("clock",12)} ${timeStr}` : (t.training_date ? `<span style="color:#F59E0B;font-weight:600">· Jam belum diset</span>` : "")}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;padding:8px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border)">${formBtns}</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" data-edit='${encodeData(t)}'>${icon("edit",14)} Edit</button>
          <button class="btn btn-ghost btn-sm" data-del="${t.id}" style="color:var(--bad)">${icon("trash",14)}</button>
        </div>
      </div>`;
    }).join("")}</div>`;
    bindEditDelete(wrap, "trainings", trainingModal, renderAdminTraining);
    wrap.querySelectorAll("[data-admin-form-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        sessionStorage.setItem("openFormEditor", btn.dataset.adminFormEdit);
        navigate("adminForms");
      });
    });
  }

  c.innerHTML =
    pageHead("Kelola Training", `${all.length} sesi training terdaftar.`,
      `<button class="btn btn-primary" id="addBtn">${icon("plus",16)} Tambah Training</button>`) +
    `<div class="card card-pad" style="margin-bottom:16px;padding:16px 20px">
      <div class="flex items-center gap-10px" style="flex-wrap:wrap;gap:12px">
        <div style="flex:1;min-width:180px;position:relative">
          <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94A3B8;pointer-events:none">${icon("search",16)}</span>
          <input class="input" id="trSearch" placeholder="Cari judul atau pembicara..." style="padding-left:38px;height:42px;font-size:13px">
        </div>
        <div class="ms-wrap" id="msTrStatusWrap">
          <button type="button" class="ms-trigger" id="msTrStatusTrigger">
            <span id="msTrStatusLabel">${icon("filter",14)} Semua Status</span>${icon("chevron",14)}
          </button>
          <div class="ms-drop" id="msTrStatusDrop" style="display:none">
            <div class="ms-search-row"><span>${icon("search",13)}</span><input class="ms-search" id="msTrStatusSearch" placeholder="Cari..."></div>
            <div class="ms-list" id="msTrStatusList">
              <label class="ms-item"><input type="checkbox" value="upcoming"><span>Mendatang</span></label>
              <label class="ms-item"><input type="checkbox" value="past"><span>Selesai</span></label>
            </div>
            <div class="ms-foot"><button class="ms-clear" id="msTrStatusClear">Reset</button><span id="msTrStatusCount" class="ms-count"></span></div>
          </div>
        </div>
        ${speakers.length ? `<div class="ms-wrap" id="msTrSpkWrap">
          <button type="button" class="ms-trigger" id="msTrSpkTrigger">
            <span id="msTrSpkLabel">${icon("user",14)} Semua Pembicara</span>${icon("chevron",14)}
          </button>
          <div class="ms-drop" id="msTrSpkDrop" style="display:none">
            <div class="ms-search-row"><span>${icon("search",13)}</span><input class="ms-search" id="msTrSpkSearch" placeholder="Cari pembicara..."></div>
            <div class="ms-list" id="msTrSpkList">
              ${speakers.map(s => `<label class="ms-item"><input type="checkbox" value="${escapeHTML(s)}"><span>${escapeHTML(s)}</span></label>`).join("")}
            </div>
            <div class="ms-foot"><button class="ms-clear" id="msTrSpkClear">Reset</button><span id="msTrSpkCount" class="ms-count"></span></div>
          </div>
        </div>` : ""}
        <button class="btn btn-ghost btn-sm" id="trResetFilter" style="height:42px;padding:0 16px">${icon("close",13)} Reset</button>
      </div>
    </div>
    <div id="trainingListWrap"></div>`;

  document.getElementById("addBtn").addEventListener("click", () => trainingModal());

  const selTrStatus = new Set(), selTrSpk = new Set();
  function applyTrFilter() {
    const q = (document.getElementById("trSearch")?.value || "").toLowerCase();
    const filtered = all.filter(t => {
      if (q && !`${t.title} ${t.speaker || ""}`.toLowerCase().includes(q)) return false;
      if (selTrStatus.size > 0) {
        const past = isPast(t.training_date);
        if (selTrStatus.has("upcoming") && past) return false;
        if (selTrStatus.has("past") && !past) return false;
        if (selTrStatus.has("upcoming") && selTrStatus.has("past")) return true;
      }
      if (selTrSpk.size > 0 && !selTrSpk.has(t.speaker)) return false;
      return true;
    });
    renderCards(filtered);
  }

  document.getElementById("trSearch").addEventListener("input", applyTrFilter);
  _wireMultiSelect("msTrStatusTrigger","msTrStatusDrop","msTrStatusList","msTrStatusSearch","msTrStatusClear", selTrStatus,"msTrStatusLabel","msTrStatusCount","Semua Status",icon("filter",14), applyTrFilter);
  if (speakers.length) {
    _wireMultiSelect("msTrSpkTrigger","msTrSpkDrop","msTrSpkList","msTrSpkSearch","msTrSpkClear", selTrSpk,"msTrSpkLabel","msTrSpkCount","Semua Pembicara",icon("user",14), applyTrFilter);
  }
  document.getElementById("trResetFilter").addEventListener("click", () => {
    document.getElementById("trSearch").value = "";
    selTrStatus.clear(); selTrSpk.clear();
    document.querySelectorAll("#msTrStatusList input,#msTrSpkList input").forEach(cb => cb.checked = false);
    document.querySelectorAll("#msTrStatusTrigger,#msTrSpkTrigger").forEach(t => { t.classList.remove("has-selection","open"); });
    _msUpdateLabel("msTrStatusLabel","msTrStatusCount",selTrStatus,"Semua Status",icon("filter",14));
    _msUpdateLabel("msTrSpkLabel","msTrSpkCount",selTrSpk,"Semua Pembicara",icon("user",14));
    applyTrFilter();
  });

  renderCards(all);
}

function trainingModal(t) {
  t = t || {};
  const editing = !!t.id;
  openModal(editing ? "Ubah Training" : "Tambah Training", `
    <form id="f">
      ${t.id ? `<input type="hidden" name="id" value="${t.id}">` : ""}

      <div class="tr-modal-grid">
        <!-- Kolom kiri -->
        <div class="tr-modal-col">
          <div class="tr-section-label">${icon("calendar",13)} Jadwal</div>
          <div style="display:grid;grid-template-columns:80px 1fr;gap:10px">
            <div class="tr-field">
              <label class="tr-label">Sesi ke-</label>
              <input class="input tr-input" name="week_number" type="number" min="1" value="${t.week_number || ""}" placeholder="1">
            </div>
            <div class="tr-field">
              <label class="tr-label">Tanggal <span style="color:#EF4444">*</span></label>
              <input class="input tr-input" name="training_date" type="date" required value="${t.training_date || ""}">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
            <div class="tr-field">
              <label class="tr-label">Jam Mulai</label>
              <input class="input tr-input" name="start_time" type="time" value="${t.start_time || ""}">
            </div>
            <div class="tr-field">
              <label class="tr-label">Jam Selesai</label>
              <input class="input tr-input" name="end_time" type="time" value="${t.end_time || ""}">
            </div>
          </div>

          <div class="tr-divider"></div>
          <div class="tr-section-label">${icon("user",13)} Pembicara & Zoom</div>
          <div class="tr-field">
            <label class="tr-label">Nama Pembicara</label>
            <input class="input tr-input" name="speaker" value="${escapeHTML(t.speaker || "")}" placeholder="Prof. Dr. ...">
          </div>
          <div class="tr-field" style="margin-top:10px">
            <label class="tr-label">Zoom / YouTube Link</label>
            <input class="input tr-input" name="zoom_link" type="url" value="${escapeHTML(t.zoom_link || "")}" placeholder="https://zoom.us/j/...">
            <p style="font-size:11px;color:#94A3B8;margin-top:4px">Tombol aktif otomatis 15 mnt sebelum sesi</p>
          </div>
        </div>

        <!-- Kolom kanan -->
        <div class="tr-modal-col">
          <div class="tr-section-label">${icon("presentation",13)} Info Training</div>
          <div class="tr-field">
            <label class="tr-label">Judul Training <span style="color:#EF4444">*</span></label>
            <input class="input tr-input" name="title" required value="${escapeHTML(t.title || "")}" placeholder="Judul sesi training...">
          </div>
          <div class="tr-field" style="margin-top:10px">
            <label class="tr-label">Deskripsi</label>
            <textarea class="input tr-input" name="description" rows="4" placeholder="Ringkasan singkat materi yang akan dibahas...">${escapeHTML(t.description || "")}</textarea>
          </div>

          <div class="tr-divider"></div>
          <div class="tr-section-label">${icon("tag",13)} ID Training</div>
          <div class="tr-field">
            <input type="hidden" name="training_code" value="${escapeHTML(t.training_code || "")}">
            <div style="background:#F1F5F9;border:1.5px solid #E2E8F0;border-radius:10px;padding:8px 12px;display:flex;align-items:center;gap:8px">
              ${icon("tag",14)}
              <span style="font-size:13px;font-weight:700;color:${t.training_code ? "#0F172A" : "#94A3B8"};font-family:monospace;letter-spacing:.03em">
                ${t.training_code ? escapeHTML(t.training_code) : "Otomatis saat disimpan"}
              </span>
              ${t.training_code ? `<span style="margin-left:auto;font-size:10.5px;font-weight:600;color:#10B981;background:#F0FDF4;padding:2px 7px;border-radius:99px">${icon("check",9)} Aktif</span>` : ""}
            </div>
            <p style="font-size:11px;color:#94A3B8;margin-top:4px">Generate otomatis dari nomor sesi · tidak dapat diubah manual</p>
          </div>
        </div>
      </div>

      <div id="msg" style="margin-top:4px"></div>
      <button class="btn btn-primary tr-submit" type="submit">${editing ? icon("check",15)+" Simpan Perubahan" : icon("plus",15)+" Tambah Training"}</button>
    </form>`, { wide: true });
  bindCrudForm("trainings", renderAdminTraining, (fd) => {
    if (fd.week_number) fd.week_number = parseInt(fd.week_number);
    delete fd.visible_from;
    // Auto-generate training_code if empty
    if (!fd.training_code && fd.week_number) {
      fd.training_code = "ILP-S" + String(fd.week_number).padStart(2, "0");
    } else if (!fd.training_code) {
      fd.training_code = "ILP-" + new Date().toISOString().slice(0,10).replace(/-/g,"");
    }
    return fd;
  });
}

/* =====================================================================
   ADMIN — MATERI CRUD
   ===================================================================== */
PAGES.adminMateri = async function () {
  const profile = await requireAuth("admin");
  if (!profile) return;
  renderShell(profile, ADMIN_NAV, "Administrator");
  _driveSetup().then(() => _driveOrganizeAll()).catch(() => {});
  await renderAdminMateri();
};

async function renderAdminMateri() {
  const c = document.getElementById("content");
  _contentLoading(c, "Memuat materi…");
  const [{ data }, { data: trainings }] = await Promise.all([
    qc("materials:a", () => _supabase.from("materials").select("*").order("publish_date", { ascending: false, nullsFirst: false })),
    qc("trainings:a", () => _supabase.from("trainings").select("*").order("training_date", { ascending: false })),
  ]);
  window.__trainings = trainings || [];

  // Buat map training title
  const trainingTitle = {};
  (trainings || []).forEach(t => { trainingTitle[t.id] = t.title; });

  const mats = data || [];
  const mode = _viewMode("adminMateri", "card");

  const cardHTML = mats.map((m) => `
    <div class="card card-pad flex justify-between view-card-item" style="gap:10px;margin-bottom:16px">
      <div class="flex gap-3" style="min-width:0">
        <span class="icon-box" style="flex-shrink:0">${icon("book",22)}</span>
        <div style="min-width:0">
          <h2 class="font-display" style="font-size:17px;font-weight:700">${escapeHTML(m.title)}</h2>
          ${m.description ? `<p class="stat-label" style="margin-top:4px">${escapeHTML(m.description)}</p>` : ""}
          <div class="stat-label flex items-center gap-2 mt-2" style="flex-wrap:wrap">
            ${icon("calendar",14)}${fmtDate(m.publish_date || m.created_at)}
            ${m.training_id && trainingTitle[m.training_id] ? `&nbsp;·&nbsp;${icon("video",13)}${escapeHTML(trainingTitle[m.training_id])}` : ""}
            ${m.file_url ? `&nbsp;·&nbsp;<button class="btn-view-file" data-view-mat="${escapeHTML(m.file_url)}" data-view-title="${escapeHTML(m.title)}">${icon("file",13)} Lihat File</button>` : ""}
            ${m.visible_from ? `&nbsp;·&nbsp;<span class="badge badge-warning" style="font-size:11px">${icon("calendar",11)} Tampil mulai ${fmtDate(m.visible_from)}</span>` : ""}
          </div>
        </div>
      </div>
      <div class="flex gap-2" style="flex-shrink:0;align-items:flex-start">
        <button class="btn-icon" data-edit='${encodeData(m)}'>${icon("edit",16)}</button>
        <button class="btn-icon danger" data-del="${m.id}">${icon("trash",16)}</button>
      </div>
    </div>`).join("");

  const tableHTML = `<div class="table-wrap view-table-wrap"><table class="data-table"><thead><tr>
    <th>Judul</th><th>Sesi</th><th>Tanggal</th><th>File</th><th style="text-align:right">Aksi</th>
  </tr></thead><tbody>${mats.map((m) => `
    <tr>
      <td><div class="td-main">${escapeHTML(m.title)}</div>${m.description ? `<div class="td-sub">${escapeHTML(m.description)}</div>` : ""}</td>
      <td>${m.training_id && trainingTitle[m.training_id] ? escapeHTML(trainingTitle[m.training_id]) : "—"}</td>
      <td style="white-space:nowrap">${fmtDate(m.publish_date || m.created_at)}</td>
      <td>${m.file_url ? `<button class="btn-view-file" data-view-mat="${escapeHTML(m.file_url)}" data-view-title="${escapeHTML(m.title)}">${icon("file",13)} Lihat File</button>` : "—"}</td>
      <td style="text-align:right"><div style="display:flex;gap:6px;justify-content:flex-end">
        <button class="btn-icon" data-edit='${encodeData(m)}'>${icon("edit",16)}</button>
        <button class="btn-icon danger" data-del="${m.id}">${icon("trash",16)}</button>
      </div></td>
    </tr>`).join("")}</tbody></table></div>`;

  let filteredMats = [...mats];
  function renderMatView() {
    const el = c.querySelector(".view-card");
    const elT = c.querySelector(".view-table");
    const curMode = _viewMode("adminMateri", "card");
    const filtered = filteredMats;
    const cH = filtered.map((m) => `
      <div class="card card-pad flex justify-between view-card-item" style="gap:10px;margin-bottom:16px">
        <div class="flex gap-3" style="min-width:0">
          <span class="icon-box" style="flex-shrink:0">${icon("book",22)}</span>
          <div style="min-width:0">
            <h2 class="font-display" style="font-size:17px;font-weight:700">${escapeHTML(m.title)}</h2>
            ${m.description ? `<p class="stat-label" style="margin-top:4px">${escapeHTML(m.description)}</p>` : ""}
            <div class="stat-label flex items-center gap-2 mt-2" style="flex-wrap:wrap">
              ${icon("calendar",14)}${fmtDate(m.publish_date || m.created_at)}
              ${m.training_id && trainingTitle[m.training_id] ? `&nbsp;·&nbsp;${icon("video",13)}${escapeHTML(trainingTitle[m.training_id])}` : ""}
              ${m.file_url ? `&nbsp;·&nbsp;<button class="btn-view-file" data-view-mat="${escapeHTML(m.file_url)}" data-view-title="${escapeHTML(m.title)}">${icon("file",13)} Lihat File</button>` : ""}
              ${m.visible_from ? `&nbsp;·&nbsp;<span class="badge badge-warning" style="font-size:11px">${icon("calendar",11)} Tampil mulai ${fmtDate(m.visible_from)}</span>` : ""}
            </div>
          </div>
        </div>
        <div class="flex gap-2" style="flex-shrink:0;align-items:flex-start">
          <button class="btn-icon" data-edit='${encodeData(m)}'>${icon("edit",16)}</button>
          <button class="btn-icon danger" data-del="${m.id}">${icon("trash",16)}</button>
        </div>
      </div>`).join("") || `<div class="empty">Tidak ada materi yang sesuai filter.</div>`;
    const tH = `<div class="table-wrap view-table-wrap"><table class="data-table"><thead><tr>
      <th>Judul</th><th>Sesi</th><th>Tanggal</th><th>File</th><th style="text-align:right">Aksi</th>
    </tr></thead><tbody>${filtered.map((m) => `
      <tr>
        <td><div class="td-main">${escapeHTML(m.title)}</div>${m.description ? `<div class="td-sub">${escapeHTML(m.description)}</div>` : ""}</td>
        <td>${m.training_id && trainingTitle[m.training_id] ? escapeHTML(trainingTitle[m.training_id]) : "—"}</td>
        <td style="white-space:nowrap">${fmtDate(m.publish_date || m.created_at)}</td>
        <td>${m.file_url ? `<button class="btn-view-file" data-view-mat="${escapeHTML(m.file_url)}" data-view-title="${escapeHTML(m.title)}">${icon("file",13)} Lihat File</button>` : "—"}</td>
        <td style="text-align:right"><div style="display:flex;gap:6px;justify-content:flex-end">
          <button class="btn-icon" data-edit='${encodeData(m)}'>${icon("edit",16)}</button>
          <button class="btn-icon danger" data-del="${m.id}">${icon("trash",16)}</button>
        </div></td>
      </tr>`).join("")}</tbody></table></div>`;
    if (el) el.innerHTML = cH;
    if (elT) elT.innerHTML = tH;
    bindEditDelete(c, "materials", materiModal, renderAdminMateri);
    bindMaterialViewers(c);
  }

  c.innerHTML =
    pageHead("Kelola Materi", `${mats.length} materi terdaftar.`,
      `<div class="head-actions">${mats.length ? viewToggleHTML("adminMateri", mode) : ""}<button class="btn btn-primary" id="addBtn">${icon("plus",16)}Tambah Materi</button></div>`) +
    `<div class="card card-pad" style="margin-bottom:16px;padding:16px 20px">
      <div class="flex items-center gap-10px" style="flex-wrap:wrap;gap:12px">
        <div style="flex:1;min-width:180px;position:relative">
          <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94A3B8;pointer-events:none">${icon("search",16)}</span>
          <input class="input" id="matSearch" placeholder="Cari judul materi..." style="padding-left:38px;height:42px;font-size:13px">
        </div>
        <div class="ms-wrap">
          <button type="button" class="ms-trigger" id="msMatTrTrigger">
            <span id="msMatTrLabel">${icon("calendar-check",14)} Semua Sesi</span>${icon("chevron",14)}
          </button>
          <div class="ms-drop" id="msMatTrDrop" style="display:none;min-width:280px">
            <div class="ms-search-row"><span>${icon("search",13)}</span><input class="ms-search" id="msMatTrSearch" placeholder="Cari sesi..."></div>
            <div class="ms-list" id="msMatTrList">
              ${(trainings||[]).map(t=>`<label class="ms-item"><input type="checkbox" value="${t.id}"><span>${escapeHTML(t.title)}</span></label>`).join("")}
            </div>
            <div class="ms-foot"><button class="ms-clear" id="msMatTrClear">Reset</button><span id="msMatTrCount" class="ms-count"></span></div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" id="matResetFilter" style="height:42px;padding:0 16px">${icon("close",13)} Reset</button>
      </div>
    </div>` +
    (!mats.length
      ? `<div class="empty">Belum ada materi.</div>`
      : `<div class="view-card" ${mode === "table" ? "hidden" : ""}></div>
         <div class="view-table" ${mode !== "table" ? "hidden" : ""}></div>`);

  document.getElementById("addBtn")?.addEventListener("click", () => materiModal());
  wireViewToggle(c, "adminMateri");

  const selMatTr = new Set();
  function applyMatFilter() {
    const q = (document.getElementById("matSearch")?.value || "").toLowerCase();
    filteredMats = mats.filter(m => {
      if (q && !m.title.toLowerCase().includes(q)) return false;
      if (selMatTr.size > 0 && !selMatTr.has(m.training_id)) return false;
      return true;
    });
    renderMatView();
  }
  document.getElementById("matSearch")?.addEventListener("input", applyMatFilter);
  _wireMultiSelect("msMatTrTrigger","msMatTrDrop","msMatTrList","msMatTrSearch","msMatTrClear", selMatTr,"msMatTrLabel","msMatTrCount","Semua Sesi",icon("calendar-check",14), applyMatFilter);
  document.getElementById("matResetFilter")?.addEventListener("click", () => {
    document.getElementById("matSearch").value = ""; selMatTr.clear();
    document.querySelectorAll("#msMatTrList input").forEach(cb => cb.checked = false);
    document.getElementById("msMatTrTrigger")?.classList.remove("has-selection","open");
    _msUpdateLabel("msMatTrLabel","msMatTrCount",selMatTr,"Semua Sesi",icon("calendar-check",14));
    applyMatFilter();
  });

  renderMatView();
}

function materiModal(m) {
  m = m || {};
  const opts = (window.__trainings || []).map((t) =>
    `<option value="${t.id}" ${m.training_id === t.id ? "selected" : ""}>${escapeHTML(t.title)}</option>`).join("");
  const editing = !!m.id;
  openModal(editing ? "Ubah Materi" : "Tambah Materi", `
    <form id="f">
      ${m.id ? `<input type="hidden" name="id" value="${m.id}">` : ""}

      <div class="tr-modal-grid">
        <!-- Kolom kiri: info materi -->
        <div class="tr-modal-col">
          <div class="tr-section-label">${icon("book",13)} Info Materi</div>
          <div class="tr-field">
            <label class="tr-label">Judul Materi <span style="color:#EF4444">*</span></label>
            <input class="input tr-input" name="title" required value="${escapeHTML(m.title || "")}" placeholder="Judul materi...">
          </div>
          <div class="tr-field" style="margin-top:10px">
            <label class="tr-label">Deskripsi</label>
            <textarea class="input tr-input" name="description" rows="4" placeholder="Ringkasan isi materi...">${escapeHTML(m.description || "")}</textarea>
          </div>

          <div class="tr-divider"></div>
          <div class="tr-section-label">${icon("calendar",13)} Training Terkait</div>
          <div class="tr-field">
            <select class="input tr-input" name="training_id">
              <option value="">— Tidak terkait —</option>
              ${opts}
            </select>
          </div>

          <div class="tr-divider"></div>
          <div class="tr-section-label">${icon("clock",13)} Jadwal Tampil</div>
          <div class="tr-field">
            <label class="tr-label">Mulai ditampilkan ke peserta</label>
            <input class="input tr-input" name="visible_from" type="datetime-local" value="${toLocalDatetimeInput(m.visible_from)}">
            <p style="font-size:11px;color:#94A3B8;margin-top:4px">Kosongkan agar langsung tersedia</p>
          </div>
        </div>

        <!-- Kolom kanan: file -->
        <div class="tr-modal-col">
          <div class="tr-section-label">${icon("upload",13)} File Materi</div>

          <label class="mat-upload-zone" for="matFileInput">
            <div class="mat-upload-icon">${icon("upload",22)}</div>
            <div class="mat-upload-text">Klik atau seret file ke sini</div>
            <div class="mat-upload-sub">.pdf · .pptx · .docx · .mp4 · .zip</div>
            <input type="file" id="matFileInput" style="display:none" accept=".pdf,.pptx,.ppt,.docx,.doc,.mp4,.zip,.xlsx">
          </label>
          <div id="matUploadStatus" style="display:none;margin-top:8px;padding:8px 12px;background:#F0FDF4;border:1.5px solid #A7F3D0;border-radius:10px;font-size:12.5px;font-weight:600;color:#059669;display:flex;align-items:center;gap:6px"></div>

          <div style="display:flex;align-items:center;gap:10px;margin:12px 0">
            <div style="flex:1;height:1px;background:var(--border)"></div>
            <span style="font-size:11px;color:#94A3B8;font-weight:600">ATAU</span>
            <div style="flex:1;height:1px;background:var(--border)"></div>
          </div>

          <div class="tr-field">
            <label class="tr-label">Tempel URL Google Drive / YouTube</label>
            <input class="input tr-input" name="file_url" id="matFileUrl" type="url" value="${escapeHTML(m.file_url || "")}" placeholder="https://drive.google.com/file/d/...">
            <p style="font-size:11px;color:#94A3B8;margin-top:4px">File yang diunggah otomatis masuk ke <strong>ILP Academy 2026 › Materi</strong></p>
          </div>

          ${m.file_url ? `
          <div style="margin-top:12px;padding:10px 12px;background:#EFF6FF;border:1.5px solid #BFDBFE;border-radius:10px;display:flex;align-items:center;gap:8px">
            ${icon("file",14)}
            <a href="${escapeHTML(m.file_url)}" target="_blank" style="font-size:12px;font-weight:600;color:var(--primary);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">File terlampir — klik untuk preview</a>
          </div>` : ""}
        </div>
      </div>

      <div id="msg" style="margin-top:4px"></div>
      <button class="btn btn-primary tr-submit" type="submit">${editing ? icon("check",15)+" Simpan Perubahan" : icon("plus",15)+" Tambah Materi"}</button>
    </form>`, { wide: true });
  bindCrudForm("materials", renderAdminMateri, (fd) => {
    if (fd.visible_from) fd.visible_from = new Date(fd.visible_from).toISOString();
    return fd;
  });
  // Auto-upload to Drive folder
  const matFileInput = document.getElementById("matFileInput");
  if (matFileInput) {
    matFileInput.addEventListener("change", async () => {
      const file = matFileInput.files[0];
      if (!file) return;
      const statusEl = document.getElementById("matUploadStatus");
      const urlInput = document.getElementById("matFileUrl");
      statusEl.style.display = "flex";
      statusEl.innerHTML = `<span class="spinner" style="width:13px;height:13px;border-width:2px"></span> Mengunggah ${escapeHTML(file.name)}…`;
      statusEl.style.background = "#EFF6FF"; statusEl.style.borderColor = "#BFDBFE"; statusEl.style.color = "var(--primary)";
      try {
        const folders = await _driveSetup();
        const folderId = folders?.materi?.id || null;
        const result = await _driveUpload(file, file.name, null, folderId);
        urlInput.value = result.webViewLink;
        statusEl.innerHTML = `${icon("check",13)} ${escapeHTML(result.fileName)} — terunggah`;
        statusEl.style.background = "#F0FDF4"; statusEl.style.borderColor = "#A7F3D0"; statusEl.style.color = "#059669";
        toast("File terunggah ke Drive › ILP Academy 2026 › Materi");
      } catch (e) {
        statusEl.innerHTML = `${icon("x",13)} Gagal: ${escapeHTML(e.message)}`;
        statusEl.style.background = "#FEF2F2"; statusEl.style.borderColor = "#FECACA"; statusEl.style.color = "#DC2626";
        toast("Gagal: " + e.message, "error");
      }
    });
  }
}

/* =====================================================================
   ADMIN — TUGAS CRUD
   ===================================================================== */
PAGES.adminTugas = async function () {
  const profile = await requireAuth("admin");
  if (!profile) return;
  renderShell(profile, ADMIN_NAV, "Administrator");
  await renderAdminTugas();
};

let _tugasEditorActive = false;

async function renderAdminTugas() {
  const c = document.getElementById("content");
  _contentLoading(c, "Memuat data tugas…");
  const [{ data }, { data: trainings }] = await Promise.all([
    qc("assignments:a", () => _supabase.from("assignments").select("*").order("deadline", { ascending: false })),
    qc("trainings:a", () => _supabase.from("trainings").select("*").order("training_date", { ascending: false })),
  ]);
  window.__trainings = trainings || [];

  const asgs = data || [];
  function tugasItem(a) {
    const past = a.deadline && new Date(a.deadline) < new Date();
    return `<div class="card card-pad flex justify-between" style="gap:10px;margin-bottom:12px">
      <div class="flex gap-3"><span class="icon-box">${icon("task",22)}</span>
        <div><h2 class="font-display" style="font-size:18px;font-weight:700">${escapeHTML(a.title)}</h2>
          ${a.description ? `<p class="stat-label" style="margin-top:4px">${escapeHTML(a.description)}</p>` : ""}
          <div class="stat-label flex items-center gap-2 mt-2">
            ${icon("clock",14)}<span class="${past?"":""}">Deadline ${fmtDateTime(a.deadline)} WIB</span>
            &nbsp;·&nbsp;<span class="badge ${past?"":"badge-success"}" style="font-size:11px">${past?"Lewat Deadline":"Aktif"}</span>
            ${a.gsheet_id ? `&nbsp;·&nbsp;<button class="link-more" style="background:none;border:none;padding:0;cursor:pointer;display:inline-flex;align-items:center;gap:4px;font-size:inherit;color:var(--primary)" data-preview-form="${escapeHTML(a.gsheet_id)}" data-preview-title="${escapeHTML(a.title)}">${icon("task",13)} Google Form</button>${a.entry_nama ? `&nbsp;<span class="badge badge-success" style="font-size:10px">Prefill ${icon("check",9)}</span>` : `&nbsp;<span class="badge badge-warning" style="font-size:10px">Prefill –</span>`}` : ""}
            ${a.visible_from ? `&nbsp;·&nbsp;<span class="badge badge-warning" style="font-size:11px">${icon("calendar",11)} Tampil mulai ${fmtDateTime(a.visible_from)}</span>` : ""}
          </div>
        </div>
      </div>
      <div class="flex gap-2" style="flex-shrink:0"><button class="btn-icon" data-edit='${encodeData(a)}'>${icon("edit",16)}</button><button class="btn-icon danger" data-del="${a.id}">${icon("trash",16)}</button></div>
    </div>`;
  }

  c.innerHTML =
    pageHead("Kelola Tugas", `${asgs.length} tugas terdaftar.`,
      `<button class="btn btn-primary" id="addBtn">${icon("plus",16)}Tambah Tugas</button>`) +
    `<div class="card card-pad" style="margin-bottom:16px;padding:16px 20px">
      <div class="flex items-center gap-10px" style="flex-wrap:wrap;gap:12px">
        <div style="flex:1;min-width:180px;position:relative">
          <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94A3B8;pointer-events:none">${icon("search",16)}</span>
          <input class="input" id="asgSearch" placeholder="Cari judul tugas..." style="padding-left:38px;height:42px;font-size:13px">
        </div>
        <div class="ms-wrap">
          <button type="button" class="ms-trigger" id="msAsgStatusTrigger">
            <span id="msAsgStatusLabel">${icon("filter",14)} Semua Status</span>${icon("chevron",14)}
          </button>
          <div class="ms-drop" id="msAsgStatusDrop" style="display:none">
            <div class="ms-search-row"><span>${icon("search",13)}</span><input class="ms-search" id="msAsgStatusSearch" placeholder="Cari..."></div>
            <div class="ms-list" id="msAsgStatusList">
              <label class="ms-item"><input type="checkbox" value="active"><span>Aktif</span></label>
              <label class="ms-item"><input type="checkbox" value="past"><span>Lewat Deadline</span></label>
            </div>
            <div class="ms-foot"><button class="ms-clear" id="msAsgStatusClear">Reset</button><span id="msAsgStatusCount" class="ms-count"></span></div>
          </div>
        </div>
        <div class="ms-wrap">
          <button type="button" class="ms-trigger" id="msAsgTrTrigger">
            <span id="msAsgTrLabel">${icon("calendar-check",14)} Semua Sesi</span>${icon("chevron",14)}
          </button>
          <div class="ms-drop" id="msAsgTrDrop" style="display:none;min-width:260px">
            <div class="ms-search-row"><span>${icon("search",13)}</span><input class="ms-search" id="msAsgTrSearch" placeholder="Cari sesi..."></div>
            <div class="ms-list" id="msAsgTrList">
              ${(trainings||[]).map(t=>`<label class="ms-item"><input type="checkbox" value="${t.id}"><span>${escapeHTML(t.title)}</span></label>`).join("")}
            </div>
            <div class="ms-foot"><button class="ms-clear" id="msAsgTrClear">Reset</button><span id="msAsgTrCount" class="ms-count"></span></div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" id="asgResetFilter" style="height:42px;padding:0 16px">${icon("close",13)} Reset</button>
      </div>
    </div>
    <div id="asgListWrap"></div>`;

  document.getElementById("addBtn").addEventListener("click", () => showTugasEditor());

  const selAsgStatus = new Set(), selAsgTr = new Set();
  function applyAsgFilter() {
    const q = (document.getElementById("asgSearch")?.value || "").toLowerCase();
    const now = new Date();
    const filtered = asgs.filter(a => {
      if (q && !a.title.toLowerCase().includes(q)) return false;
      if (selAsgStatus.size > 0) {
        const past = a.deadline && new Date(a.deadline) < now;
        if (selAsgStatus.has("active") && past) return false;
        if (selAsgStatus.has("past") && !past) return false;
        if (selAsgStatus.has("active") && selAsgStatus.has("past")) return true;
      }
      if (selAsgTr.size > 0 && !selAsgTr.has(a.training_id)) return false;
      return true;
    });
    document.getElementById("asgListWrap").innerHTML = filtered.length
      ? filtered.map(tugasItem).join("") : `<div class="empty">Tidak ada tugas yang sesuai filter.</div>`;
    const wrap = document.getElementById("asgListWrap");
    bindEditDelete(wrap, "assignments", tugasModal, renderAdminTugas);
    wrap.querySelectorAll("[data-preview-form]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const formId = btn.dataset.previewForm;
        const title = btn.dataset.previewTitle || "Preview Form";
        openModal(title, `<div class="loader" style="min-height:180px"><div class="spinner"></div>Memuat pratinjau form…</div>`, { wide: true });
        try {
          const schema = await _getFormSchema(formId);
          const { rows } = _renderInlineForm(schema, {});
          openModal(title, `<form class="gf-page" style="gap:12px">
            <div class="gf-header-card" style="padding:20px 24px">
              <div class="gf-htype">${icon("upload",13)} Pengumpulan Tugas</div>
              <h2 style="font-size:17px">${escapeHTML(schema.title || title)}</h2>
              ${schema.description ? `<p style="font-size:13px">${escapeHTML(schema.description)}</p>` : ""}
            </div>
            ${rows}
            <div class="gf-submit-area" style="padding:14px 18px">
              <span style="font-size:12.5px;color:var(--ink-400);font-style:italic;flex:1">Mode pratinjau — respons tidak dikirim</span>
              <button type="button" class="gf-cancel-btn" data-close>Tutup</button>
            </div>
          </form>`, { wide: true });
        } catch (e) {
          openModal(title, `<div style="text-align:center;padding:40px 24px;color:var(--bad)">${icon("x-circle",32)}<p style="margin-top:10px;font-weight:600">Gagal memuat form</p><p style="font-size:13px;color:var(--ink-500);margin-top:4px">${escapeHTML((e&&e.message)||String(e))}</p></div>`, { wide: true });
        }
      });
    });
  }

  document.getElementById("asgSearch").addEventListener("input", applyAsgFilter);
  _wireMultiSelect("msAsgStatusTrigger","msAsgStatusDrop","msAsgStatusList","msAsgStatusSearch","msAsgStatusClear",selAsgStatus,"msAsgStatusLabel","msAsgStatusCount","Semua Status",icon("filter",14), applyAsgFilter);
  _wireMultiSelect("msAsgTrTrigger","msAsgTrDrop","msAsgTrList","msAsgTrSearch","msAsgTrClear",selAsgTr,"msAsgTrLabel","msAsgTrCount","Semua Sesi",icon("calendar-check",14), applyAsgFilter);
  document.getElementById("asgResetFilter").addEventListener("click", () => {
    document.getElementById("asgSearch").value = ""; selAsgStatus.clear(); selAsgTr.clear();
    document.querySelectorAll("#msAsgStatusList input,#msAsgTrList input").forEach(cb => cb.checked = false);
    document.querySelectorAll("#msAsgStatusTrigger,#msAsgTrTrigger").forEach(t => t.classList.remove("has-selection","open"));
    _msUpdateLabel("msAsgStatusLabel","msAsgStatusCount",selAsgStatus,"Semua Status",icon("filter",14));
    _msUpdateLabel("msAsgTrLabel","msAsgTrCount",selAsgTr,"Semua Sesi",icon("calendar-check",14));
    applyAsgFilter();
  });

  applyAsgFilter();
}

// Get or create the ONE master submission form (shared across all assignments)
let _masterFormCache = null;
async function _getMasterForm() {
  if (_masterFormCache) return _masterFormCache;
  const { data } = await _supabase.from("forms").select("*").eq("type", "pengumpulan_master").maybeSingle();
  if (data) { _masterFormCache = data; return data; }
  // Create default master form
  const defaultFields = [
    { type: "text",     label: "Email",                   prefill: "email",       required: true, locked: true },
    { type: "text",     label: "Nama Lengkap",            prefill: "full_name",   required: true, locked: true },
    { type: "text",     label: "Institusi / Universitas", prefill: "institution", required: true, locked: true },
    { type: "textarea", label: "Link / Jawaban Tugas",    required: true },
  ];
  const { data: created } = await _supabase.from("forms").insert({ title: "Form Pengumpulan Tugas", type: "pengumpulan_master", is_active: true, fields: defaultFields }).select().single();
  _masterFormCache = created;
  return created;
}

async function showTugasEditor(a) {
  a = a || {};
  const isEdit = !!a.id;
  const c = document.getElementById("content");
  _tugasEditorActive = true;

  const [{ data: trainings }, { data: allMasterForms }] = await Promise.all([
    qc("trainings:a", () => _supabase.from("trainings").select("*").order("training_date", { ascending: false })),
    _supabase.from("forms").select("*").eq("is_master", true).eq("master_category", "tugas").maybeSingle(),
  ]);
  const masterForm = allMasterForms;
  const opts = (trainings || []).map((t) =>
    `<option value="${t.id}" ${a.training_id === t.id ? "selected" : ""}>${escapeHTML(t.title)}</option>`).join("");

  c.innerHTML = `
    <div class="tugas-editor-wrap">
      <div class="tugas-editor-head">
        <button class="btn btn-ghost btn-sm" id="tugasBackBtn" style="gap:6px">${icon("arrow-left",15)} Kembali</button>
        <div class="tugas-editor-head-title">
          <div class="tugas-editor-icon">${icon("task",22)}</div>
          <div>
            <h2 style="font-size:18px;font-weight:800;color:var(--ink-900);margin:0">${isEdit ? "Ubah Tugas" : "Tambah Tugas"}</h2>
            <p style="font-size:12.5px;color:var(--ink-500);margin:2px 0 0">${isEdit ? "Perbarui detail tugas yang sudah ada" : "Isi detail tugas baru untuk peserta"}</p>
          </div>
        </div>
      </div>

      <form id="tugasEditorForm" class="tugas-editor-body">
        ${isEdit ? `<input type="hidden" name="id" value="${a.id}">` : ""}

        <div class="tugas-editor-grid">
          <div class="tugas-editor-col">
            <div class="tr-section-label">${icon("presentation",13)} Informasi Tugas</div>
            <div class="tr-field">
              <label class="tr-label">Judul Tugas <span style="color:#EF4444">*</span></label>
              <input class="input tr-input" name="title" required value="${escapeHTML(a.title || "")}" placeholder="Contoh: Tugas 1 — Studi Kasus">
            </div>
            <div class="tr-field" style="margin-top:10px">
              <label class="tr-label">Deskripsi / Instruksi</label>
              <textarea class="input tr-input" name="description" rows="5" placeholder="Tuliskan instruksi pengerjaan tugas di sini...">${escapeHTML(a.description || "")}</textarea>
            </div>
          </div>

          <div class="tugas-editor-col">
            <div class="tr-section-label">${icon("calendar",13)} Pengaturan</div>
            <div class="tr-field">
              <label class="tr-label">Training Terkait</label>
              <select class="input tr-input" name="training_id">
                <option value="">— Tidak terkait —</option>
                ${opts}
              </select>
            </div>
            <div class="tr-field" style="margin-top:10px">
              <label class="tr-label">Deadline Pengumpulan</label>
              <input class="input tr-input" name="deadline" type="datetime-local" value="${toLocalDatetimeInput(a.deadline)}">
            </div>
            <div class="tr-field" style="margin-top:10px">
              <label class="tr-label">Mulai Ditampilkan ke Peserta</label>
              <input class="input tr-input" name="visible_from" type="datetime-local" value="${toLocalDatetimeInput(a.visible_from)}">
              <p style="font-size:11px;color:#94A3B8;margin-top:4px">Kosongkan agar langsung tersedia</p>
            </div>

            ${a.attachment_url ? `
            <div class="tr-divider"></div>
            <div class="tr-field">
              <label class="tr-label">Lampiran</label>
              <a href="${escapeHTML(a.attachment_url)}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--primary);text-decoration:none;padding:7px 12px;background:#EFF6FF;border-radius:8px;border:1px solid #BFDBFE">
                ${icon("file",13)} Lihat Lampiran
              </a>
            </div>` : ""}
          </div>
        </div>

        <div id="tugasEditorMsg" style="margin-top:4px"></div>
        <div style="display:flex;gap:10px;margin-top:4px">
          <button class="btn btn-ghost" type="button" id="tugasCancelBtn" style="min-width:100px">Batal</button>
          <button class="btn btn-primary tr-submit" style="flex:1" type="submit" id="tugasSaveBtn">
            ${isEdit ? icon("check",15)+" Simpan Perubahan" : icon("plus",15)+" Tambah Tugas"}
          </button>
        </div>
      </form>
    </div>`;

  document.getElementById("tugasBackBtn").addEventListener("click", () => { _tugasEditorActive = false; renderAdminTugas(); });
  document.getElementById("tugasCancelBtn").addEventListener("click", () => { _tugasEditorActive = false; renderAdminTugas(); });

  document.getElementById("tugasEditorForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("tugasSaveBtn");
    const msg = document.getElementById("tugasEditorMsg");
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner" style="width:16px;height:16px;border-width:2px;margin:0 auto"></div>`;
    msg.innerHTML = "";

    let fd = {};
    new FormData(e.target).forEach((v, k) => (fd[k] = v === "" ? null : v));
    const id = fd.id; delete fd.id;
    if (fd.deadline) fd.deadline = new Date(fd.deadline).toISOString();
    if (fd.visible_from) fd.visible_from = new Date(fd.visible_from).toISOString();

    try {
      if (id) {
        const { error } = await _supabase.from("assignments").update(fd).eq("id", id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await _supabase.from("assignments").insert(fd);
        if (error) throw new Error(error.message);
      }
      qcInvalidate("assignments:", "sub:");
      toast(id ? "Tugas diperbarui." : "Tugas berhasil ditambahkan!");
      _tugasEditorActive = false;
      renderAdminTugas();
    } catch (err) {
      msg.innerHTML = `<div class="alert alert-error">${escapeHTML((err && err.message) || String(err))}</div>`;
      btn.disabled = false;
      btn.innerHTML = isEdit ? `${icon("check",15)} Simpan Perubahan` : `${icon("check",15)} Simpan Tugas`;
    }
  });
}

function tugasModal(a) { showTugasEditor(a); }

/* =====================================================================
   ADMIN — SUBMISSION review + feedback
   ===================================================================== */
PAGES.adminSubmission = async function () {
  const profile = await requireAuth("admin");
  if (!profile) return;
  renderShell(profile, ADMIN_NAV, "Administrator");
  await renderAdminSubmission();
};

async function renderAdminSubmission(filterAsgId = "") {
  const c = document.getElementById("content");
  _contentLoading(c, "Memuat submission…");

  // Ambil semua tugas untuk dropdown filter
  const { data: allAsgs } = await qc("assignments:a", () => _supabase.from("assignments").select("id,title").order("created_at", { ascending: true }));

  // Ambil submissions — filter by assignment jika dipilih
  const subKey = "sub:all" + (filterAsgId ? ":" + filterAsgId : "");
  const { data: subs } = await qc(subKey, () => {
    let q = _supabase.from("submissions").select("*").order("submitted_at", { ascending: false });
    if (filterAsgId) q = q.eq("assignment_id", filterAsgId);
    return q;
  });

  const subList = subs || [];
  const pIds = [...new Set(subList.map((s) => s.participant_id))];
  const sIds = subList.map((s) => s.id);
  const aIds = [...new Set(subList.map((s) => s.assignment_id))];

  const [{ data: aData }, { data: pData }, { data: fData }] = await Promise.all([
    aIds.length ? qc("assignments:ids:" + aIds.sort().join(","), () => _supabase.from("assignments").select("id,title").in("id", aIds)) : Promise.resolve({ data: [] }),
    pIds.length ? qc("profiles:ids:" + pIds.sort().join(","), () => _supabase.from("profiles").select("id,full_name,email").in("id", pIds)) : Promise.resolve({ data: [] }),
    sIds.length ? qc("fb:" + sIds.sort().join(","), () => _supabase.from("feedbacks").select("*").in("submission_id", sIds)) : Promise.resolve({ data: [] }),
  ]);

  const titleMap = {}; (aData || []).forEach((a) => (titleMap[a.id] = a.title));
  const pMap    = {}; (pData || []).forEach((p) => (pMap[p.id] = p));
  const fbMap   = {}; (fData || []).forEach((f) => ((fbMap[f.submission_id] = fbMap[f.submission_id] || []).push(f)));
  window.__fbMap = fbMap;
  window.__pMap = pMap;
  window.__titleMap = titleMap;

  const _statusTabs = [
    { key: "all",      label: "Semua",     color: "#1A437B", bg: "#EFF6FF" },
    { key: "submitted",label: "Terkumpul", color: "#2563EB", bg: "#EFF6FF" },
    { key: "late",     label: "Terlambat", color: "#D97706", bg: "#FEF3C7" },
    { key: "reviewed", label: "Direview",  color: "#059669", bg: "#ECFDF5" },
    { key: "graded",   label: "Dinilai",   color: "#7C3AED", bg: "#F5F3FF" },
  ];
  const countByStatus = (k) => {
    if (k === "all") return subList.length;
    if (k === "graded") return subList.filter(s => s.grade != null).length;
    return subList.filter(s => s.status === k).length;
  };

  const filterBar = `
    <div class="card card-pad" style="margin-bottom:16px;padding:14px 20px">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:180px;position:relative">
          <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94A3B8;pointer-events:none">${icon("search",16)}</span>
          <input class="input" id="subSearchInput" placeholder="Cari nama atau email peserta..." style="padding-left:38px;height:42px;font-size:13px">
        </div>
        <div class="ms-wrap" id="msAsgWrap">
          <button type="button" class="ms-trigger" id="msAsgTrigger">
            <span id="msAsgLabel">${icon("task",14)} Semua Tugas</span>
            ${icon("chevron",14)}
          </button>
          <div class="ms-drop" id="msAsgDrop" style="display:none;min-width:300px">
            <div class="ms-search-row"><span>${icon("search",13)}</span><input class="ms-search" id="msAsgSearch" placeholder="Cari tugas..."></div>
            <div class="ms-list" id="msAsgList">
              ${(allAsgs || []).map(a => `<label class="ms-item"><input type="checkbox" value="${a.id}"${a.id === filterAsgId ? " checked" : ""}><span>${escapeHTML(a.title)}</span></label>`).join("")}
            </div>
            <div class="ms-foot"><button class="ms-clear" id="msAsgClear">Reset</button><span id="msAsgCount" class="ms-count"></span></div>
          </div>
        </div>
        <div style="display:inline-flex;background:#F1F5F9;border-radius:9px;padding:3px;gap:2px">
          <button id="subViewCard" style="padding:5px 13px;border-radius:7px;border:none;cursor:pointer;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:5px;background:#fff;color:#1A437B;box-shadow:0 1px 4px rgba(0,0,0,.1)">${icon("grid",13)} Card</button>
          <button id="subViewTable" style="padding:5px 13px;border-radius:7px;border:none;cursor:pointer;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:5px;background:transparent;color:#64748B">${icon("list",13)} Tabel</button>
        </div>
        <button class="btn btn-ghost btn-sm" id="subResetFilter" style="height:42px;padding:0 16px">${icon("close",13)} Reset</button>
      </div>
    </div>
    <!-- Status pill tabs (image-2 style) -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px">
      ${_statusTabs.map(t => {
        const icons = { all: icon("task",16), submitted: icon("check",16), late: icon("clock",16), reviewed: icon("check-circle",16), graded: icon("star",16) };
        return `<button class="sub-status-tab" data-tab="${t.key}"
          style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;border-radius:14px;border:2px solid #E2E8F0;background:#fff;cursor:pointer;transition:all .18s;font-size:13.5px;font-weight:600;color:#64748B">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="opacity:.5">${icons[t.key]}</span>
            ${t.label}
          </div>
          <span style="background:#F1F5F9;color:#64748B;border-radius:99px;padding:2px 10px;font-size:12px;font-weight:700;min-width:28px;text-align:center">${countByStatus(t.key)}</span>
        </button>`;
      }).join("")}
    </div>
    <div id="subTableWrap"></div>`;

  c.innerHTML = pageHead("Submission & Review", `${subList.length} submission masuk.`) + filterBar;

  function _subTimeline(s) {
    const steps = [
      { label: "Dikumpulkan", done: true, warn: s.status === "late" },
      { label: "Direview",    done: s.status === "reviewed", active: s.status !== "reviewed" },
      { label: "Dinilai",     done: s.status === "reviewed" && s.grade != null },
    ];
    return `<div style="display:flex;align-items:center;gap:0;margin:10px 0 8px">
      ${steps.map((st, i) => {
        const c = st.done ? (st.warn ? "#F59E0B" : "#10B981") : st.active ? "#3B82F6" : "#CBD5E1";
        const line = i < steps.length-1 ? `<div style="flex:1;height:2px;background:${steps[i+1].done?"#10B981":"#E2E8F0"};margin:0 4px;margin-top:-14px"></div>` : "";
        return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px">
          <div style="width:24px;height:24px;border-radius:50%;border:2px solid ${c};background:${st.done?(st.warn?"#FEF3C7":"#ECFDF5"):"#F8FAFC"};display:flex;align-items:center;justify-content:center">
            ${st.done?`<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="3"><polyline points="20,6 9,17 4,12"/></svg>`:`<div style="width:6px;height:6px;border-radius:50%;background:${c}"></div>`}
          </div>
          <span style="font-size:10px;font-weight:600;color:${c};white-space:nowrap">${st.label}</span>
        </div>${line}`;
      }).join("")}
    </div>`;
  }

  let _subViewMode = "card"; // "card" | "table"

  function subCard(s) {
    const p = pMap[s.participant_id] || {};
    const fbs = fbMap[s.id] || [];
    const statusColor = s.status === "reviewed" ? "#059669" : s.status === "late" ? "#D97706" : "#2563EB";
    const statusBg    = s.status === "reviewed" ? "#ECFDF5" : s.status === "late" ? "#FEF3C7" : "#EFF6FF";
    const statusLabel = s.status === "reviewed" ? "Direview" : s.status === "late" ? "Terlambat" : "Terkumpul";
    const initials = (p.full_name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();

    return `<div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;overflow:hidden;display:flex;flex-direction:column">
      <!-- Top row: identity + meta + status -->
      <div style="padding:14px 20px;display:flex;align-items:center;gap:14px;border-bottom:1px solid #F1F5F9">
        <div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#1A437B,#2563EB);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px;font-weight:800;color:#fff">${initials}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;color:#1E293B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(p.full_name||"—")}</div>
          <div style="font-size:12px;color:#94A3B8">${escapeHTML(p.email||"")} ${p.institution ? `· ${escapeHTML(p.institution)}` : ""}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
          <div style="text-align:right">
            <div style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">Tugas</div>
            <div style="font-size:13px;font-weight:700;color:#1E293B;max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(titleMap[s.assignment_id]||"—")}</div>
          </div>
          <span style="background:${statusBg};color:${statusColor};font-size:11.5px;font-weight:700;border-radius:8px;padding:5px 11px;white-space:nowrap;border:1px solid ${statusColor}33">${statusLabel}</span>
        </div>
      </div>
      <!-- Bottom row: timeline + actions -->
      <div style="padding:10px 20px 12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="font-size:11.5px;color:#94A3B8;display:flex;align-items:center;gap:5px;flex-shrink:0">${icon("clock",11)} ${fmtDateTime(s.submitted_at)} WIB</div>
        <div style="flex:1;min-width:180px">${_subTimeline(s)}</div>
        ${s.grade != null ? `<div style="background:#ECFDF5;border-radius:7px;padding:4px 10px;font-size:12px;font-weight:700;color:#059669;display:flex;align-items:center;gap:5px;flex-shrink:0">${icon("star",12)} ${s.grade}/100</div>` : ""}
        <!-- Action buttons at timeline end -->
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap">
          ${s.file_url ? `<button class="btn btn-secondary btn-sm" data-view-mat="${escapeHTML(s.file_url)}" data-view-title="File Tugas" style="height:32px;font-size:12px">${icon("file",13)} Lihat File</button>` : ""}
          <button class="btn btn-ghost btn-sm" data-fb='${encodeData(s)}' style="height:32px;font-size:12px">${icon("chat",13)} ${fbs.length ? `Feedback (${fbs.length})` : "Beri Feedback"}</button>
          ${s.status !== "reviewed" ? `<button class="btn btn-sm" data-mark-reviewed="${s.id}" style="height:32px;font-size:12px;background:#ECFDF5;color:#059669;border:1px solid #A7F3D0;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:5px">${icon("check-circle",13)} Tandai Reviewed</button>` : `<span style="font-size:12px;color:#059669;display:flex;align-items:center;gap:4px">${icon("check-circle",13)} Sudah Reviewed</span>`}
          <button class="btn btn-sm" data-mark-graded="${s.id}" style="height:32px;font-size:12px;background:#EFF6FF;color:#2563EB;border:1px solid #BFDBFE;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:5px">${icon("star",13)} Beri Nilai</button>
          <button class="btn btn-sm" data-del-sub="${s.id}" style="height:32px;font-size:12px;background:#FEF2F2;color:#EF4444;border:1px solid #FECACA;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:5px">${icon("trash",13)} Hapus</button>
        </div>
      </div>
    </div>`;
  }

  function subRow(s) {
    const p = pMap[s.participant_id] || {};
    const fbs = fbMap[s.id] || [];
    const statusColor = s.status === "reviewed" ? "#059669" : s.status === "late" ? "#D97706" : "#2563EB";
    const statusLabel = s.status === "reviewed" ? "Direview" : s.status === "late" ? "Terlambat" : "Terkumpul";
    return `<tr>
      <td><div style="font-weight:600;color:#1E293B;font-size:13px">${escapeHTML(p.full_name||"—")}</div><div style="font-size:11.5px;color:#94A3B8">${escapeHTML(p.email||"")}</div></td>
      <td style="font-size:13px;font-weight:600;color:#1E293B;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(titleMap[s.assignment_id]||"—")}</td>
      <td style="font-size:12px;color:#64748B;white-space:nowrap">${fmtDateTime(s.submitted_at)}</td>
      <td><span style="background:${statusColor}1A;color:${statusColor};border-radius:6px;padding:3px 9px;font-size:11.5px;font-weight:700">${statusLabel}</span></td>
      <td style="font-weight:700;color:#059669;font-size:13px">${s.grade != null ? s.grade+"/100" : "—"}</td>
      <td><div style="display:flex;gap:5px;justify-content:flex-end;flex-wrap:wrap">
        ${s.file_url ? `<button class="btn btn-secondary btn-sm" data-view-mat="${escapeHTML(s.file_url)}" data-view-title="File Tugas" style="height:28px;font-size:11px">${icon("file",11)} File</button>` : ""}
        <button class="btn btn-ghost btn-sm" data-fb='${encodeData(s)}' style="height:28px;font-size:11px">${icon("chat",11)} ${fbs.length ? `(${fbs.length})` : "Feedback"}</button>
        ${s.status !== "reviewed" ? `<button class="btn btn-sm" data-mark-reviewed="${s.id}" style="height:28px;font-size:11px;background:#ECFDF5;color:#059669;border:1px solid #A7F3D0;border-radius:7px;cursor:pointer">${icon("check-circle",11)} Reviewed</button>` : ""}
        <button class="btn btn-sm" data-mark-graded="${s.id}" style="height:28px;font-size:11px;background:#EFF6FF;color:#2563EB;border:1px solid #BFDBFE;border-radius:7px;cursor:pointer">${icon("star",11)} Nilai</button>
        <button class="btn btn-sm" data-del-sub="${s.id}" style="height:28px;font-size:11px;background:#FEF2F2;color:#EF4444;border:1px solid #FECACA;border-radius:7px;cursor:pointer">${icon("trash",11)} Hapus</button>
      </div></td>
    </tr>`;
  }

  let _activeStatusTab = "all";
  const _selAsg = new Set(filterAsgId ? [filterAsgId] : []);

  function _setTab(key) {
    _activeStatusTab = key;
    document.querySelectorAll(".sub-status-tab").forEach(btn => {
      const t = _statusTabs.find(x => x.key === btn.dataset.tab);
      const active = btn.dataset.tab === key;
      btn.style.background = active ? t.color : "#fff";
      btn.style.color = active ? "#fff" : "#64748B";
      btn.style.borderColor = active ? t.color : "#E2E8F0";
      btn.style.boxShadow = active ? `0 4px 12px ${t.color}44` : "none";
      const badge = btn.querySelector("span");
      if (badge) {
        badge.style.background = active ? "rgba(255,255,255,0.25)" : "#F1F5F9";
        badge.style.color = active ? "#fff" : "#64748B";
      }
      const iconEl = btn.querySelector("span:first-child");
      if (iconEl) iconEl.style.opacity = active ? "1" : "0.5";
    });
  }

  function renderSubTable(items) {
    const wrap = document.getElementById("subTableWrap");
    if (!wrap) return;

    const contentHtml = !items.length
      ? `<div class="empty">Tidak ada submission yang sesuai filter.</div>`
      : _subViewMode === "table"
        ? `<div class="table-wrap"><table class="data-table"><thead><tr>
            <th>Peserta</th><th>Tugas</th><th>Dikumpulkan</th><th>Status</th><th>Nilai</th><th style="text-align:right">Aksi</th>
          </tr></thead><tbody>${items.map(subRow).join("")}</tbody></table></div>`
        : `<div style="display:flex;flex-direction:column;gap:10px">${items.map(subCard).join("")}</div>`;

    wrap.innerHTML = contentHtml;

    // sync toggle button styles
    const _syncToggle = () => {
      const bc = document.getElementById("subViewCard"), bt = document.getElementById("subViewTable");
      if (bc) { bc.style.background = _subViewMode==="card"?"#fff":"transparent"; bc.style.color = _subViewMode==="card"?"#1A437B":"#64748B"; bc.style.boxShadow = _subViewMode==="card"?"0 1px 4px rgba(0,0,0,.1)":"none"; }
      if (bt) { bt.style.background = _subViewMode==="table"?"#fff":"transparent"; bt.style.color = _subViewMode==="table"?"#1A437B":"#64748B"; bt.style.boxShadow = _subViewMode==="table"?"0 1px 4px rgba(0,0,0,.1)":"none"; }
    };
    _syncToggle();

    bindMaterialViewers(wrap);
    wrap.querySelectorAll("[data-fb]").forEach(btn => btn.addEventListener("click", () => feedbackModal(JSON.parse(decodeURIComponent(btn.dataset.fb)))));
    wrap.querySelectorAll("[data-mark-reviewed]").forEach(btn => btn.addEventListener("click", async () => {
      const ok = await confirmDialog({ title: "Tandai Sudah Direview?", message: "Status submission akan diubah menjadi <strong>Direview</strong>. Peserta akan dapat melihat status ini.", confirmText: "Ya, Tandai Reviewed", icon: "check-circle" });
      if (!ok) return;
      const restore = _btnLoad(btn, " Menyimpan…");
      _progress.start();
      const { error } = await _supabase.from("submissions").update({ status: "reviewed" }).eq("id", btn.dataset.markReviewed);
      _progress.done(); restore();
      if (error) { toast("Gagal.", "error"); return; }
      qcInvalidate("sub:all"); toast("Ditandai reviewed."); renderAdminSubmission(filterAsgId);
    }));
    wrap.querySelectorAll("[data-mark-graded]").forEach(btn => btn.addEventListener("click", () => {
      const s = subList.find(x => x.id === btn.dataset.markGraded);
      if (s) feedbackModal(s);
    }));
    wrap.querySelectorAll("[data-del-sub]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const ok = await confirmDialog({ title: "Hapus Submission?", message: "Submission ini akan dihapus permanen. Peserta akan dapat mengumpulkan ulang tugasnya.", confirmText: "Ya, Hapus", danger: true });
        if (!ok) return;
        const restore = _btnLoad(btn, " Menghapus…");
        _progress.start();
        const { error } = await _supabase.from("submissions").delete().eq("id", btn.dataset.delSub);
        _progress.done(); restore();
        if (error) { toast("Gagal menghapus.", "error"); return; }
        qcInvalidate("sub:all"); toast("Submission dihapus."); renderAdminSubmission(filterAsgId);
      });
    });
  }

  function applySubFilter() {
    const q = (document.getElementById("subSearchInput")?.value || "").toLowerCase();
    const selAsgIds = [..._selAsg];
    const filtered = subList.filter(s => {
      const p = pMap[s.participant_id] || {};
      if (q && !`${p.full_name} ${p.email}`.toLowerCase().includes(q)) return false;
      if (selAsgIds.length > 0 && !selAsgIds.includes(s.assignment_id)) return false;
      if (_activeStatusTab === "graded" && s.grade == null) return false;
      if (_activeStatusTab !== "all" && _activeStatusTab !== "graded" && s.status !== _activeStatusTab) return false;
      return true;
    });
    renderSubTable(filtered);
  }

  renderSubTable(subList);
  _setTab("all");

  document.getElementById("subViewCard")?.addEventListener("click", () => { _subViewMode = "card"; applySubFilter(); });
  document.getElementById("subViewTable")?.addEventListener("click", () => { _subViewMode = "table"; applySubFilter(); });
  document.getElementById("subSearchInput")?.addEventListener("input", applySubFilter);
  document.querySelectorAll(".sub-status-tab").forEach(btn => btn.addEventListener("click", () => { _setTab(btn.dataset.tab); applySubFilter(); }));

  if (filterAsgId) {
    const cb = document.querySelector(`#msAsgList input[value="${filterAsgId}"]`);
    if (cb) cb.checked = true;
  }
  _wireMultiSelect("msAsgTrigger","msAsgDrop","msAsgList","msAsgSearch","msAsgClear", _selAsg,"msAsgLabel","msAsgCount","Semua Tugas",icon("task",14), applySubFilter);
  document.getElementById("subResetFilter")?.addEventListener("click", () => {
    document.getElementById("subSearchInput").value = "";
    _selAsg.clear();
    document.querySelectorAll("#msAsgList input").forEach(cb => cb.checked = false);
    document.getElementById("msAsgTrigger")?.classList.remove("has-selection","open");
    _msUpdateLabel("msAsgLabel","msAsgCount",_selAsg,"Semua Tugas",icon("task",14));
    _setTab("all"); applySubFilter();
  });

}

function feedbackModal(s) {
  const fbs = (window.__fbMap || {})[s.id] || [];
  const pMap = window.__pMap || {};
  const p = pMap[s.participant_id] || {};
  const initials = (p.full_name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
  const titleMap = window.__titleMap || {};
  const tugasTitle = titleMap[s.assignment_id] || "Tugas";

  openModal("Beri Feedback & Nilai", `
    <!-- Participant info strip -->
    <div style="display:flex;align-items:center;gap:12px;background:linear-gradient(135deg,#F0F6FF,#EFF6FF);border-radius:12px;padding:12px 16px;margin-bottom:20px;border:1px solid #BFDBFE">
      <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#1A437B,#2563EB);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff;flex-shrink:0">${initials}</div>
      <div style="min-width:0">
        <div style="font-size:14px;font-weight:700;color:#1E293B">${escapeHTML(p.full_name||"—")}</div>
        <div style="font-size:11.5px;color:#64748B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(tugasTitle)}</div>
      </div>
      ${s.grade != null ? `<div style="margin-left:auto;background:#1A437B;color:#fff;border-radius:8px;padding:4px 12px;font-size:13px;font-weight:700;flex-shrink:0">${s.grade}/100</div>` : ""}
    </div>

    <!-- Previous feedbacks -->
    ${fbs.length ? `<div style="margin-bottom:18px">
      <div style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">Feedback Sebelumnya</div>
      ${fbs.map(f => `<div style="background:#F8FAFC;border-left:3px solid #3B82F6;border-radius:0 10px 10px 0;padding:10px 14px;margin-bottom:6px">
        <p style="font-size:13px;color:#334155;margin:0 0 4px;line-height:1.5">${escapeHTML(f.comment)}</p>
        ${f.score != null ? `<span style="font-size:11px;font-weight:700;color:#059669">${icon("star",11)} Nilai: ${f.score}/100 · </span>` : ""}
        <span style="font-size:11px;color:#94A3B8">${fmtDateTime(f.created_at)}</span>
      </div>`).join("")}
    </div>` : ""}

    <form id="fbForm">
      <input type="hidden" name="submission_id" value="${s.id}">

      <!-- Grade input with visual indicator -->
      <div style="margin-bottom:16px">
        <label style="font-size:12.5px;font-weight:700;color:#374151;display:flex;align-items:center;gap:6px;margin-bottom:8px">${icon("star",14)} Nilai (0–100) <span style="font-size:11px;font-weight:400;color:#94A3B8">— opsional</span></label>
        <div style="position:relative">
          <input class="input" name="grade" type="number" min="0" max="100" value="${s.grade != null ? s.grade : ""}" placeholder="Contoh: 85" style="padding-right:56px;font-size:15px;font-weight:700;color:#1A437B;height:48px">
          <span style="position:absolute;right:14px;top:50%;transform:translateY(-50%);font-size:13px;color:#94A3B8;font-weight:600">/100</span>
        </div>
        <p style="font-size:11.5px;color:#94A3B8;margin-top:5px">Digunakan untuk leaderboard & analytics.</p>
      </div>

      <!-- Comment -->
      <div style="margin-bottom:16px">
        <label style="font-size:12.5px;font-weight:700;color:#374151;display:flex;align-items:center;gap:6px;margin-bottom:8px">${icon("chat",14)} Komentar Feedback</label>
        <textarea class="input" name="comment" rows="4" required placeholder="Tulis feedback yang membangun untuk peserta..." style="resize:vertical;font-size:13.5px;line-height:1.6"></textarea>
      </div>

      <div id="msg" style="margin-bottom:8px"></div>
      <div style="display:flex;gap:10px">
        <button type="button" class="btn btn-ghost" data-close style="height:44px;flex:0 0 auto;padding:0 20px">Batal</button>
        <button class="btn btn-primary" type="submit" style="flex:1;height:44px;font-size:14px;font-weight:700;background:linear-gradient(135deg,#122D55,#1A437B);border:none;border-radius:10px;display:flex;align-items:center;justify-content:center;gap:8px">
          ${icon("check",16)} Publikasikan Nilai & Feedback
        </button>
      </div>
    </form>`);

  document.getElementById("fbForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector("button[type=submit]");
    const restore = _btnLoad(btn, " Mengirim…");
    _progress.start();
    const { error } = await _supabase.from("feedbacks").insert({
      submission_id: f.submission_id.value, comment: f.comment.value.trim(),
    });
    if (error) {
      _progress.done(); restore();
      document.getElementById("msg").innerHTML = `<div style="background:#FEF2F2;border-radius:8px;padding:10px 14px;color:#EF4444;font-size:13px">${icon("alert-triangle",13)} ${escapeHTML(error.message)}</div>`;
      return;
    }
    const gradeVal = f.grade.value === "" ? null : Math.max(0, Math.min(100, parseInt(f.grade.value)));
    await _supabase.from("submissions").update({ status: "reviewed", grade: gradeVal }).eq("id", f.submission_id.value);
    _progress.done();
    qcInvalidate("fb:", "sub:");
    toast("Nilai & feedback berhasil dikirim.");
    closeModal();
    renderAdminSubmission();
  });
}

/* =====================================================================
   ADMIN — KEHADIRAN import
   ===================================================================== */
PAGES.adminKehadiran = async function () {
  const profile = await requireAuth("admin");
  if (!profile) return;
  renderShell(profile, ADMIN_NAV, "Administrator");
  const c = document.getElementById("content");

  const { data: trainings } = await qc("trainings:a", () => _supabase.from("trainings").select("id,title,training_date").order("training_date", { ascending: false }));

  c.innerHTML = pageHead("Monitoring Kehadiran",
    "Kehadiran dicatat otomatis saat peserta klik Join Zoom. Admin dapat menambah atau menghapus kehadiran secara manual.") +
    `<div class="card card-pad" style="margin-bottom:16px;padding:16px 20px">
      <div class="flex items-center gap-10px" style="flex-wrap:wrap;gap:12px">
        <div class="ms-wrap" id="msTrWrap">
          <button type="button" class="ms-trigger" id="msTrTrigger" style="min-width:280px">
            <span id="msTrLabel">${icon("calendar-check",14)} Pilih Training</span>
            ${icon("chevron",14)}
          </button>
          <div class="ms-drop" id="msTrDrop" style="display:none;min-width:360px">
            <div class="ms-search-row"><span>${icon("search",13)}</span><input class="ms-search" id="msTrSearch" placeholder="Cari training..."></div>
            <div class="ms-list" id="msTrList">
              ${(trainings || []).map(t => `<label class="ms-item"><input type="checkbox" value="${t.id}"><span>${escapeHTML(t.title)} <span style="color:#94A3B8;font-size:11px">— ${fmtDate(t.training_date)}</span></span></label>`).join("")}
            </div>
            <div class="ms-foot"><button class="ms-clear" id="msTrClear">Reset</button><span id="msTrCount" class="ms-count"></span></div>
          </div>
        </div>
      </div>
    </div>
    <div id="attendancePanel"><div class="empty">Pilih training di atas untuk melihat rekap kehadiran.</div></div>`;

  const _selTr = new Set();
  _wireMultiSelect("msTrTrigger","msTrDrop","msTrList","msTrSearch","msTrClear",
    _selTr, "msTrLabel","msTrCount","Pilih Training", icon("calendar-check",14), null);
  document.querySelectorAll("#msTrList input[type=checkbox]").forEach(cb => {
    cb.addEventListener("change", async () => {
      const selected = [...document.querySelectorAll("#msTrList input:checked")].map(c => c.value);
      if (!selected.length) {
        document.getElementById("attendancePanel").innerHTML = `<div class="empty">Pilih training di atas untuk melihat rekap kehadiran.</div>`;
        return;
      }
      await renderAttendanceTable(selected[0]);
    });
  });
};

async function renderAttendanceTable(trainingId) {
  const panel = document.getElementById("attendancePanel");
  panel.innerHTML = `<div class="loader" style="min-height:120px"><div class="spinner"></div>Memuat...</div>`;

  const [{ data: participants }, { data: attendances }] = await Promise.all([
    qc("profiles:p", () => _supabase.from("profiles").select("id,full_name,email,institution").eq("role", "participant").order("full_name")),
    qc("att:t:" + trainingId, () => _supabase.from("attendances").select("*").eq("training_id", trainingId)),
  ]);

  const attMap = {};
  (attendances || []).forEach((a) => (attMap[a.participant_id] = a));
  const rows = participants || [];
  const hadirCount = rows.filter((p) => attMap[p.id]).length;

  panel.innerHTML = `
    <div class="flex items-center justify-between" style="margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div class="flex gap-2">
        <span class="badge badge-success" style="font-size:13px;padding:5px 14px">${icon("check",13)} ${hadirCount} Hadir</span>
        <span class="badge" style="font-size:13px;padding:5px 14px">${icon("close",13)} ${rows.length - hadirCount} Tidak Hadir</span>
        <span class="badge badge-info" style="font-size:13px;padding:5px 14px">${icon("users",13)} ${rows.length} Total Peserta</span>
      </div>
    </div>
    <div class="card table-wrap">
      <table>
        <thead><tr><th>Nama</th><th>Email</th><th>Institusi</th><th>Status</th><th>Waktu Tercatat</th><th>Aksi</th></tr></thead>
        <tbody>
          ${rows.map((p) => {
            const att = attMap[p.id];
            return `<tr>
              <td style="font-weight:500">${escapeHTML(p.full_name || "-")}</td>
              <td style="color:#64748b;font-size:13px">${escapeHTML(p.email || "")}</td>
              <td style="color:#64748b;font-size:13px">${escapeHTML(p.institution || "-")}</td>
              <td>${att
                ? `<span class="badge badge-success">${icon("check",12)} Hadir</span>`
                : `<span class="badge">Tidak Hadir</span>`}</td>
              <td style="font-size:13px;color:#64748b">${att ? fmtDateTime(att.created_at) : "-"}</td>
              <td>${att
                ? `<button class="btn btn-danger btn-sm" data-del-att="${att.id}">${icon("trash",14)}Hapus</button>`
                : `<button class="btn btn-ghost btn-sm" data-add-att data-pid="${p.id}" data-tid="${trainingId}">${icon("check",14)}Tandai Hadir</button>`}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;

  panel.querySelectorAll("[data-add-att]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const { error } = await _supabase.from("attendances").insert({
        training_id: btn.dataset.tid,
        participant_id: btn.dataset.pid,
        attendance_status: "present",
      });
      if (error) { toast("Gagal mencatat kehadiran.", "error"); btn.disabled = false; return; }
      qcInvalidate("att:");
      toast("Kehadiran berhasil dicatat.");
      renderAttendanceTable(trainingId);
    });
  });

  panel.querySelectorAll("[data-del-att]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await confirmDialog({ title: "Hapus Kehadiran?", message: "Catatan kehadiran peserta ini akan dihapus.", confirmText: "Ya, Hapus", danger: true });
      if (!ok) return;
      btn.disabled = true;
      await _supabase.from("attendances").delete().eq("id", btn.dataset.delAtt);
      qcInvalidate("att:");
      toast("Kehadiran dihapus.");
      renderAttendanceTable(trainingId);
    });
  });
}

/* =====================================================================
   SHARED admin helpers
   ===================================================================== */
function pageHead(title, sub, action) {
  return `<div class="page-head"><div><h1>${escapeHTML(title)}</h1>${sub ? `<p>${escapeHTML(sub)}</p>` : ""}</div>${action || ""}</div>`;
}

/**
 * Render standard KPI strip.
 * items: [{ icon, bg, color, value, label, sub }]
 */
function kpiStrip(items) {
  return `<div class="kpi-strip">${items.map((k) => `
    <div class="kpi-seg">
      <span class="kpi-ic" style="background:${k.bg};color:${k.color}">${icon(k.icon, 20)}</span>
      <div>
        <div class="kpi-val">${k.value}</div>
        <div class="kpi-lbl">${k.label}</div>
        ${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ""}
      </div>
    </div>`).join("")}</div>`;
}
function encodeData(obj) {
  return encodeURIComponent(JSON.stringify(obj));
}
function bindEditDelete(container, table, modalFn, rerender) {
  container.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => modalFn(JSON.parse(decodeURIComponent(b.dataset.edit)))));
  container.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      const ok = await confirmDialog({ title: "Hapus Item?", message: "Item ini akan dihapus permanen dari sistem.", confirmText: "Ya, Hapus", danger: true });
      if (!ok) return;
      await _supabase.from(table).delete().eq("id", b.dataset.del);
      qcInvalidate(table);
      toast("Item dihapus.");
      rerender();
    }));
}
function bindFileUpload(inputId, hiddenName, _bucket) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const hidden = input.parentElement.querySelector(`[name="${hiddenName}"]`);
    const label = input.parentElement.querySelector(".upload-label") || input.previousElementSibling;
    if (label) label.textContent = "Mengunggah ke Drive…";
    try {
      const result = await _driveUpload(file, file.name);
      hidden.value = result.webViewLink;
      if (label) label.textContent = result.fileName;
      toast("File terunggah ke Google Drive.");
    } catch (e) {
      toast("Gagal unggah: " + e.message, "error");
      if (label) label.textContent = "Pilih file...";
    }
  });
}
function bindCrudForm(table, rerender, transform) {
  const form = document.getElementById("f");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "Menyimpan...";
    let fd = {};
    new FormData(form).forEach((v, k) => (fd[k] = v === "" ? null : v));
    if (transform) fd = transform(fd);
    const id = fd.id; delete fd.id;
    let res = id
      ? await _supabase.from(table).update(fd).eq("id", id)
      : await _supabase.from(table).insert(fd);
    // If schema cache doesn't know a column yet, retry without that column
    if (res.error && res.error.message && res.error.message.includes("schema cache")) {
      const badCol = (res.error.message.match(/'([^']+)' column/) || [])[1];
      if (badCol && fd[badCol] !== undefined) {
        delete fd[badCol];
        res = id
          ? await _supabase.from(table).update(fd).eq("id", id)
          : await _supabase.from(table).insert(fd);
      }
    }
    if (res.error) {
      document.getElementById("msg").innerHTML = `<div class="alert alert-error">${escapeHTML(res.error.message)}</div>`;
      btn.disabled = false; btn.textContent = "Simpan";
      return;
    }
    qcInvalidate(table);
    toast("Tersimpan.");
    closeModal();
    rerender();
  });
}

/* =====================================================================
   CHART HELPERS (Chart.js) — shared by Dashboard & Analytics
   ===================================================================== */
let _chartRegistry = [];
function _destroyCharts() {
  _chartRegistry.forEach((c) => { try { c.destroy(); } catch (_) {} });
  _chartRegistry = [];
}
function whenChart(cb, tries = 0) {
  if (window.Chart) { try { cb(); } catch (e) { console.error(e); } return; }
  if (tries > 80) return; // ~4s give-up
  setTimeout(() => whenChart(cb, tries + 1), 50);
}
let _chartPluginsRegistered = false;
function _mkChart(id, cfg) {
  const el = document.getElementById(id);
  if (!el || !window.Chart) return null;
  if (!_chartPluginsRegistered) {
    window.Chart.defaults.font.family = "Plus Jakarta Sans, system-ui, sans-serif";
    if (window.ChartDataLabels) window.Chart.register(window.ChartDataLabels);
    _chartPluginsRegistered = true;
  }
  const ch = new window.Chart(el.getContext("2d"), cfg);
  _chartRegistry.push(ch);
  return ch;
}
function _barOpts(maxHint) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      datalabels: {
        anchor: "end", align: "top", color: "#334155",
        font: { size: 11, weight: "700" },
        formatter: (v) => v > 0 ? v : "",
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#8FA8C8", font: { size: 11 } } },
      y: { beginAtZero: true, suggestedMax: Math.max(maxHint || 0, 1), ticks: { precision: 0, color: "#8FA8C8", font: { size: 11 } }, grid: { color: "#EEF3FA" } },
    },
  };
}
function _donutOpts() {
  return {
    responsive: true, maintainAspectRatio: false, cutout: "66%",
    plugins: {
      legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8, padding: 16, color: "#4A6580", font: { size: 12 } } },
      datalabels: {
        color: (ctx) => {
          const bg = ctx.dataset.backgroundColor;
          const c = Array.isArray(bg) ? bg[ctx.dataIndex] : bg;
          return (c === "#E4ECF7" || c === "#e4ecf7") ? "#4A7DB5" : "#fff";
        },
        font: { size: 12, weight: "700" },
        formatter: (v, ctx) => {
          const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
          return total > 0 && v > 0 ? Math.round(v / total * 100) + "%" : "";
        },
      },
    },
  };
}
function _lineOpts() {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      datalabels: {
        anchor: "top", align: "top", color: "#334155",
        font: { size: 11, weight: "700" },
        formatter: (v) => v > 0 ? v + "%" : "",
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#8FA8C8", font: { size: 11 } } },
      y: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + "%", color: "#8FA8C8", font: { size: 11 } }, grid: { color: "#EEF3FA" } },
    },
  };
}
function gradeBucket(g) {
  if (g == null) return null;
  if (g >= 85) return "A"; if (g >= 70) return "B"; if (g >= 55) return "C"; if (g >= 40) return "D"; return "E";
}

/* =====================================================================
   GLOBAL SEARCH PROVIDER (consumed by the topbar search in auth.js)
   ===================================================================== */
window.__ilpSearch = async function (q, profile) {
  const isAdmin = profile && profile.role === "admin";
  const like = `%${q}%`;
  const orSafe = q.replace(/[,()*]/g, " ").trim();
  const vis = `visible_from.is.null,visible_from.lte.${new Date().toISOString()}`;
  const groups = { menu: [], training: [], materi: [], tugas: [], peserta: [] };

  const nav = isAdmin ? ADMIN_NAV : PARTICIPANT_NAV;
  const ql = q.toLowerCase();
  nav.forEach((n) => {
    if (n.label.toLowerCase().includes(ql)) {
      groups.menu.push({ title: n.label, desc: "Buka halaman " + n.label, hash: n.href.slice(1), icon: n.icon });
    }
  });

  const tasks = [];
  let tq = _supabase.from("trainings").select("id,title,speaker,week_number").ilike("title", like).limit(6);
  if (!isAdmin) tq = tq.or(vis);
  tasks.push(tq.then((r) => (r.data || []).forEach((t) =>
    groups.training.push({ title: t.title, desc: t.speaker || ("Sesi " + (t.week_number || "")), hash: isAdmin ? "adminTraining" : "training", icon: "calendar" }))));

  let mq = _supabase.from("materials").select("id,title,description").ilike("title", like).limit(6);
  if (!isAdmin) mq = mq.or(vis);
  tasks.push(mq.then((r) => (r.data || []).forEach((m) =>
    groups.materi.push({ title: m.title, desc: (m.description || "Materi pembelajaran").slice(0, 64), hash: isAdmin ? "adminMateri" : "materi", icon: "book" }))));

  let aq = _supabase.from("assignments").select("id,title,deadline").ilike("title", like).limit(6);
  if (!isAdmin) aq = aq.or(vis);
  tasks.push(aq.then((r) => (r.data || []).forEach((a) =>
    groups.tugas.push({ title: a.title, desc: a.deadline ? "Deadline " + fmtDate(a.deadline) : "Tugas", hash: isAdmin ? "adminTugas" : "tugas", icon: "task" }))));

  if (isAdmin && orSafe) {
    tasks.push(_supabase.from("profiles").select("id,full_name,email,institution").eq("role", "participant")
      .or(`full_name.ilike.*${orSafe}*,email.ilike.*${orSafe}*,institution.ilike.*${orSafe}*`).limit(6)
      .then((r) => (r.data || []).forEach((p) =>
        groups.peserta.push({ title: p.full_name || p.email, desc: p.institution || p.email, hash: "adminPeserta", icon: "user" }))));
  }
  await Promise.all(tasks);
  return groups;
};

/* =====================================================================
   NOTIFICATIONS PROVIDER (client-derived; read-state in localStorage)
   ===================================================================== */
const NOTIF_READ_KEY = "ilp_notif_read";
function _readSet() { try { return new Set(JSON.parse(localStorage.getItem(NOTIF_READ_KEY) || "[]")); } catch (_) { return new Set(); } }
function _saveSet(set) { try { localStorage.setItem(NOTIF_READ_KEY, JSON.stringify([...set])); } catch (_) {} }
window.__ilpReadNotif = function (id) { const s = _readSet(); s.add(id); _saveSet(s); };
window.__ilpMarkAllNotifs = function (list) { const s = _readSet(); (list || []).forEach((n) => s.add(n.id)); _saveSet(s); };

window.__ilpNotifs = async function (profile) {
  const read = _readSet();
  const out = [];
  const now = Date.now();

  if (profile.role === "admin") {
    const [{ data: subs }, { data: asgs }, { data: profs }] = await Promise.all([
      qc("sub:all", () => _supabase.from("submissions").select("id,assignment_id,participant_id,status,submitted_at")),
      qc("assignments:a", () => _supabase.from("assignments").select("id,title,deadline")),
      qc("profiles:p", () => _supabase.from("profiles").select("id,full_name").eq("role", "participant")),
    ]);
    const aT = {}; (asgs || []).forEach((a) => (aT[a.id] = a.title));
    const pN = {}; (profs || []).forEach((p) => (pN[p.id] = p.full_name));
    const ungraded = (subs || []).filter((s) => s.status !== "reviewed");
    if (ungraded.length)
      out.push({ id: "adm-ungraded", title: `${ungraded.length} tugas belum dinilai`, body: "Tinjau & beri nilai pengumpulan peserta.", time: "Perlu tindakan", icon: "clock", bg: "var(--warn-bg)", color: "var(--warn)", link: "adminSubmission" });
    [...(subs || [])].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at)).slice(0, 6).forEach((s) =>
      out.push({ id: "sub-" + s.id, title: `${pN[s.participant_id] || "Peserta"} mengumpulkan tugas`, body: aT[s.assignment_id] || "", time: timeAgo(s.submitted_at), icon: "upload", bg: "var(--info-c-bg)", color: "var(--info-c)", link: "adminSubmission" }));
  } else {
    const isoNow = new Date().toISOString();
    const [{ data: asgs }, { data: subs }, { data: mats }] = await Promise.all([
      qc("assignments:p", () => _supabase.from("assignments").select("id,title,deadline").or(`visible_from.is.null,visible_from.lte.${isoNow}`)),
      qc("sub:" + profile.id, () => _supabase.from("submissions").select("id,assignment_id,status,grade,submitted_at").eq("participant_id", profile.id)),
      qc("materials:p", () => _supabase.from("materials").select("id,title,created_at").or(`visible_from.is.null,visible_from.lte.${isoNow}`)),
    ]);
    const subByA = {}; (subs || []).forEach((s) => (subByA[s.assignment_id] = s));
    const dlAssign = new Set();
    (asgs || []).forEach((a) => {
      if (!a.deadline || subByA[a.id]) return;
      const diff = new Date(a.deadline).getTime() - now;
      if (diff > 0 && diff < 2 * 86400000) {
        dlAssign.add(a.id);
        const hrs = Math.ceil(diff / 3600000);
        out.push({ id: "dl-" + a.id, title: `Deadline mendekat: ${a.title}`, body: hrs <= 24 ? `Sisa ${hrs} jam` : `Sisa ${Math.ceil(hrs / 24)} hari`, time: fmtDateTime(a.deadline), icon: "clock", bg: "var(--bad-bg)", color: "var(--bad)", link: "tugas" });
      }
    });
    (asgs || []).forEach((a) => {
      if (subByA[a.id] || dlAssign.has(a.id)) return;
      out.push({ id: "newtask-" + a.id, title: `Tugas tersedia: ${a.title}`, body: "Kerjakan & kumpulkan sebelum deadline.", time: "", icon: "task", bg: "var(--primary-tint)", color: "var(--primary)", link: "tugas" });
    });
    (subs || []).forEach((s) => {
      if (s.status === "reviewed" && s.grade != null)
        out.push({ id: "grade-" + s.id, title: "Nilai tugas keluar", body: `Anda mendapat nilai ${s.grade}/100`, time: timeAgo(s.submitted_at), icon: "star", bg: "var(--warn-bg)", color: "var(--warn)", link: "feedback" });
    });
    [...(mats || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 3).forEach((m) =>
      out.push({ id: "mat-" + m.id, title: `Materi baru: ${m.title}`, body: "Materi pembelajaran tersedia.", time: timeAgo(m.created_at), icon: "book", bg: "var(--primary-tint)", color: "var(--primary)", link: "materi" }));
  }

  out.forEach((n) => (n.read = read.has(n.id)));
  out.sort((a, b) => (a.read === b.read ? 0 : a.read ? 1 : -1));
  return out.slice(0, 12);
};

/* =====================================================================
   PAGE — PROFILE (admin & participant)
   ===================================================================== */
PAGES.profile = async function () {
  const profile = await requireAuth(null);
  if (!profile) return;
  const isAdmin = profile.role === "admin";
  renderShell(profile, isAdmin ? ADMIN_NAV : PARTICIPANT_NAV, isAdmin ? "Administrator" : (profile.institution || "Peserta"));
  const c = document.getElementById("content");

  const user = await getCurrentUser();
  const avColor = avatarColor(profile.full_name || profile.email);

  c.innerHTML = pageHead("Profil Saya", "Kelola informasi akun, keamanan, dan lihat aktivitas Anda.") + `
    <div class="profile-grid">
      <div class="profile-card">
        <div class="profile-avatar-lg" style="background:${avColor}">${escapeHTML(initials(profile.full_name || profile.email))}</div>
        <h2 style="font-size:18px;font-weight:700;color:var(--ink-900)">${escapeHTML(profile.full_name || "-")}</h2>
        <div style="margin:8px 0 14px">${isAdmin ? `<span class="badge badge-primary">Administrator</span>` : `<span class="badge badge-success">Peserta</span>`}</div>
        <div style="text-align:left;border-top:1px solid var(--border);padding-top:16px;display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--ink-700)">${icon("mail", 16)}<span style="word-break:break-all">${escapeHTML(profile.email || "-")}</span></div>
          <div style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--ink-700)">${icon("graduation", 16)}<span>${escapeHTML(profile.institution || "—")}</span></div>
          <div style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--ink-700)">${icon("calendar-check", 16)}<span>Bergabung ${fmtDate(profile.created_at)}</span></div>
        </div>
      </div>

      <div class="card card-pad">
        <div class="profile-tabs">
          <button class="profile-tab active" data-ptab="info">Informasi</button>
          <button class="profile-tab" data-ptab="security">Keamanan</button>
          <button class="profile-tab" data-ptab="activity">Aktivitas</button>
        </div>
        <div id="ptab-body"></div>
      </div>
    </div>`;

  const body = c.querySelector("#ptab-body");

  function renderInfo() {
    body.innerHTML = `
      <form id="infoForm">
        <div class="grid grid-2">
          <div class="field"><label class="label">Nama Lengkap</label><input class="input" name="full_name" value="${escapeHTML(profile.full_name)}" required></div>
          <div class="field"><label class="label">Institusi</label><input class="input" name="institution" value="${escapeHTML(profile.institution)}"></div>
          <div class="field"><label class="label">Nomor HP / WhatsApp</label><input class="input" name="whatsapp" value="${escapeHTML(profile.whatsapp || profile.phone || "")}" placeholder="08xxxxxxxxxx"></div>
          <div class="field"><label class="label">Jabatan</label><input class="input" name="jabatan" value="${escapeHTML(profile.jabatan || "")}" placeholder="Dosen / Lektor / ..."></div>
        </div>
        <div class="field"><label class="label">Bio Singkat</label><textarea class="input" name="bio" rows="3" placeholder="Ceritakan sedikit tentang Anda...">${escapeHTML(profile.bio || "")}</textarea></div>
        <div id="infoMsg"></div>
        <div class="modal-foot" style="justify-content:flex-start"><button class="btn btn-primary" type="submit">Simpan Perubahan</button></div>
      </form>`;
    body.querySelector("#infoForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target, btn = f.querySelector("button");
      btn.disabled = true; btn.innerHTML = `<span class="spin"></span> Menyimpan...`;
      const upd = {
        full_name: f.full_name.value.trim(),
        institution: f.institution.value.trim() || null,
        whatsapp: f.whatsapp.value.trim() || null,
        jabatan: f.jabatan.value.trim() || null,
        bio: f.bio.value.trim() || null,
      };
      const { error } = await _supabase.from("profiles").update(upd).eq("id", profile.id);
      if (error) { document.getElementById("infoMsg").innerHTML = `<div class="alert alert-error">${escapeHTML(error.message)}</div>`; btn.disabled = false; btn.textContent = "Simpan Perubahan"; return; }
      Object.assign(profile, upd);
      _cachedProfile = profile;
      qcInvalidate("profiles");
      toast("Profil diperbarui.");
      btn.disabled = false; btn.textContent = "Simpan Perubahan";
    });
  }

  function renderSecurity() {
    body.innerHTML = `
      <form id="secForm" style="max-width:440px">
        <div class="field"><label class="label">Password Baru</label><input class="input" name="pw" type="password" required placeholder="Minimal 8 karakter"></div>
        <div class="field"><label class="label">Konfirmasi Password Baru</label><input class="input" name="cpw" type="password" required placeholder="Ulangi password baru"></div>
        <div id="secMsg"></div>
        <div class="modal-foot" style="justify-content:flex-start"><button class="btn btn-primary" type="submit">${icon("key", 15)} Ubah Password</button></div>
      </form>`;
    body.querySelector("#secForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target, msg = document.getElementById("secMsg");
      if (f.pw.value.length < 8) { msg.innerHTML = `<div class="alert alert-error">Password minimal 8 karakter.</div>`; return; }
      if (f.pw.value !== f.cpw.value) { msg.innerHTML = `<div class="alert alert-error">Konfirmasi password tidak cocok.</div>`; return; }
      const btn = f.querySelector("button"); btn.disabled = true; btn.innerHTML = `<span class="spin"></span> Menyimpan...`;
      const { error } = await _supabase.auth.updateUser({ password: f.pw.value });
      if (error) { msg.innerHTML = `<div class="alert alert-error">${escapeHTML(error.message)}</div>`; btn.disabled = false; btn.innerHTML = `${icon("key", 15)} Ubah Password`; return; }
      // Clear must_change_password flag
      const _user = (await _supabase.auth.getUser()).data?.user;
      if (_user?.user_metadata?.must_change_password) {
        await _supabase.auth.updateUser({ data: { must_change_password: false } });
        if (window._cachedProfile) window._cachedProfile.must_change_password = false;
      }
      toast("Password berhasil diubah.");
      f.reset(); btn.disabled = false; btn.innerHTML = `${icon("key", 15)} Ubah Password`;
      if (!isAdmin) setTimeout(() => navigate("dashboard"), 800);
    });
  }

  async function renderActivity() {
    body.innerHTML = `<div class="loader" style="min-height:120px"><div class="spinner"></div>Memuat aktivitas...</div>`;
    const items = [];
    if (user && user.last_sign_in_at) items.push({ icon: "shield", bg: "var(--ok-bg)", col: "var(--ok)", title: "Login terakhir", time: fmtDateTime(user.last_sign_in_at) });
    if (!isAdmin) {
      const { data: subs } = await _supabase.from("submissions").select("id,assignment_id,status,grade,submitted_at").eq("participant_id", profile.id).order("submitted_at", { ascending: false }).limit(8);
      const aIds = [...new Set((subs || []).map((s) => s.assignment_id))];
      let titleMap = {};
      if (aIds.length) { const { data: a } = await _supabase.from("assignments").select("id,title").in("id", aIds); (a || []).forEach((x) => (titleMap[x.id] = x.title)); }
      (subs || []).forEach((s) => items.push({
        icon: s.status === "reviewed" ? "star" : "upload", bg: "var(--info-c-bg)", col: "var(--info-c)",
        title: (s.status === "reviewed" ? "Tugas dinilai" : "Mengumpulkan tugas") + ": " + (titleMap[s.assignment_id] || "-") + (s.grade != null ? ` (${s.grade}/100)` : ""),
        time: fmtDateTime(s.submitted_at),
      }));
    }
    body.innerHTML = items.length
      ? `<div class="feed" style="box-shadow:none;border:1px solid var(--border)">${items.map((i) => `
          <div class="feed-item"><span class="feed-ico" style="background:${i.bg};color:${i.col}">${icon(i.icon, 17)}</span>
            <div style="flex:1;min-width:0"><div class="feed-title">${escapeHTML(i.title)}</div><div class="feed-meta">${escapeHTML(i.time)}</div></div></div>`).join("")}</div>`
      : `<div class="empty">Belum ada aktivitas tercatat.</div>`;
  }

  c.querySelectorAll("[data-ptab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      c.querySelectorAll("[data-ptab]").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const which = tab.dataset.ptab;
      if (which === "info") renderInfo();
      else if (which === "security") renderSecurity();
      else renderActivity();
    });
  });
  renderInfo();
};

/* =====================================================================
   PAGE — ANALYTICS (admin)
   ===================================================================== */
function _xlsxDownload(filename, rows) {
  const xlsxName = filename.replace(/\.csv$/i, "").replace(/\.xlsx$/i, "") + ".xlsx";
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Auto column width
  const colWidths = rows[0]?.map((_, ci) => ({
    wch: Math.min(40, Math.max(10, ...rows.map((r) => String(r[ci] ?? "").length)))
  })) || [];
  ws["!cols"] = colWidths;
  // Bold header row
  if (rows.length > 0) {
    rows[0].forEach((_, ci) => {
      const addr = XLSX.utils.encode_cell({ r: 0, c: ci });
      if (ws[addr]) ws[addr].s = { font: { bold: true } };
    });
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, xlsxName);
}
// Keep alias for any legacy calls
function _csvDownload(filename, rows) { _xlsxDownload(filename, rows); }

PAGES.adminAnalytics = async function () {
  const profile = await requireAuth("admin");
  if (!profile) return;
  renderShell(profile, ADMIN_NAV, "Administrator");
  const c = document.getElementById("content");
  _destroyCharts();
  c.innerHTML = pageHead("Analytics", "Analisis mendalam performa program, kehadiran, dan penilaian peserta.") +
    `<div class="loader" style="min-height:240px"><div class="spinner"></div>Menghitung analitik...</div>`;

  const [profilesRes, trainingsRes, attRes, asgRes, subRes] = await Promise.all([
    qc("profiles:p", () => _supabase.from("profiles").select("*").eq("role", "participant")),
    qc("trainings:a", () => _supabase.from("trainings").select("*")),
    qc("att:all", () => _supabase.from("attendances").select("training_id,participant_id,created_at").eq("attendance_status", "present")),
    qc("assignments:a", () => _supabase.from("assignments").select("*")),
    qc("sub:all", () => _supabase.from("submissions").select("id,assignment_id,participant_id,status,grade,submitted_at")),
  ]);

  const participants = profilesRes.data || [];
  const total = participants.length;
  const att = attRes.data || [];
  const asgs = asgRes.data || [];
  const subs = subRes.data || [];

  const tList = [...(trainingsRes.data || [])].sort((a, b) => {
    if (a.week_number && b.week_number) return a.week_number - b.week_number;
    if (a.week_number) return -1; if (b.week_number) return 1;
    return (a.training_date || "").localeCompare(b.training_date || "");
  });

  const attCount = {}; att.forEach((a) => (attCount[a.training_id] = (attCount[a.training_id] || 0) + 1));
  const asgTid = {}; asgs.forEach((a) => (asgTid[a.id] = a.training_id));

  // per-participant aggregation
  const pStats = {};
  participants.forEach((p) => (pStats[p.id] = { id: p.id, name: p.full_name, email: p.email, hadir: 0, submit: 0, gradeSum: 0, gradeN: 0 }));
  att.forEach((a) => { if (pStats[a.participant_id]) pStats[a.participant_id].hadir++; });
  subs.forEach((s) => { const st = pStats[s.participant_id]; if (!st) return; st.submit++; if (s.grade != null) { st.gradeSum += s.grade; st.gradeN++; } });

  const gradedSubs = subs.filter((s) => s.grade != null);
  const overallAvg = gradedSubs.length ? Math.round(gradedSubs.reduce((a, s) => a + s.grade, 0) / gradedSubs.length) : 0;
  const todayISO = new Date().toISOString().slice(0, 10);
  const pastT = tList.filter((t) => t.training_date <= todayISO);
  const avgHadir = (pastT.length && total) ? Math.round(pastT.reduce((s, t) => s + (attCount[t.id] || 0) / total, 0) / pastT.length * 100) : 0;
  const completion = (total && asgs.length) ? Math.min(100, Math.round(subs.length / (total * asgs.length) * 100)) : 0;

  // funnel
  const hadirSet = new Set(att.map((a) => a.participant_id));
  const submitSet = new Set(subs.map((s) => s.participant_id));
  const gradedSet = new Set(gradedSubs.map((s) => s.participant_id));
  const funnel = [
    { label: "Terdaftar", val: total, color: "#215AA9" },
    { label: "Pernah Hadir", val: participants.filter((p) => hadirSet.has(p.id)).length, color: "#2f6fc4" },
    { label: "Pernah Submit", val: participants.filter((p) => submitSet.has(p.id)).length, color: "#3b88de" },
    { label: "Dapat Nilai", val: participants.filter((p) => gradedSet.has(p.id)).length, color: "#5aa2ee" },
  ];
  const funnelMax = Math.max(funnel[0].val, 1);

  // leaderboards
  const byGrade = Object.values(pStats).filter((s) => s.gradeN > 0)
    .map((s) => ({ ...s, avg: Math.round(s.gradeSum / s.gradeN) })).sort((a, b) => b.avg - a.avg).slice(0, 5);
  const byAtt = Object.values(pStats).filter((s) => s.hadir > 0).sort((a, b) => b.hadir - a.hadir).slice(0, 5);

  // grade distribution
  const dist = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  gradedSubs.forEach((s) => { const b = gradeBucket(s.grade); if (b) dist[b]++; });

  // per-training avg grade
  const trainGrades = {};
  subs.forEach((s) => { if (s.grade == null) return; const tid = asgTid[s.assignment_id]; if (!tid) return; (trainGrades[tid] = trainGrades[tid] || []).push(s.grade); });

  // insights
  const noSubmit = participants.filter((p) => !submitSet.has(p.id)).length;
  const ungradedN = subs.filter((s) => s.status !== "reviewed").length;
  let attTrend = "Belum cukup data kehadiran untuk menentukan tren.";
  if (pastT.length >= 2) {
    const last = attCount[pastT[pastT.length - 1].id] || 0;
    const prev = attCount[pastT[pastT.length - 2].id] || 0;
    attTrend = last > prev ? `Kehadiran meningkat dari ${prev} ke ${last} di sesi terakhir.`
      : last < prev ? `Kehadiran menurun dari ${prev} ke ${last} di sesi terakhir.`
      : `Kehadiran stabil di ${last} peserta pada dua sesi terakhir.`;
  }
  const insights = [
    { icon: "users", color: "var(--primary)", bg: "var(--primary-tint)", text: noSubmit > 0 ? `${noSubmit} dari ${total} peserta belum mengumpulkan tugas apa pun.` : `Seluruh peserta telah mengumpulkan minimal satu tugas.` },
    { icon: "activity", color: "var(--ok)", bg: "var(--ok-bg)", text: attTrend },
    { icon: "clock", color: "var(--warn)", bg: "var(--warn-bg)", text: ungradedN > 0 ? `${ungradedN} pengumpulan masih menunggu penilaian.` : `Semua pengumpulan sudah dinilai.` },
    { icon: "award", color: "var(--info-c)", bg: "var(--info-c-bg)", text: gradedSubs.length ? `Rata-rata nilai keseluruhan adalah ${overallAvg} dari 100.` : `Belum ada tugas yang dinilai.` },
  ];

  const metrics = [
    { label: "Total Peserta", value: total, icon: "users", bg: "#EAF1FA", color: "#215AA9", sub: `${funnel[1].val} pernah hadir` },
    { label: "Rata-rata Nilai", value: overallAvg, icon: "award", bg: "#EDE9FE", color: "#7C3AED", sub: `${gradedSubs.length} tugas dinilai` },
    { label: "Penyelesaian Tugas", value: completion + "%", icon: "task", bg: "#FEF3C7", color: "#D97706", sub: `${subs.length} total submission` },
    { label: "Rata-rata Kehadiran", value: avgHadir + "%", icon: "check-square", bg: "#E0FAF1", color: "#059669", sub: `${pastT.length} sesi berjalan` },
  ];

  const rankColors = ["#F5B301", "#9AA9BC", "#CD7F32", "#CBD5E1", "#CBD5E1"];

  c.innerHTML = `
    <div class="section-title-row" style="margin-top:0">
      <div><h1 style="font-size:23px;font-weight:800;color:var(--ink-900);letter-spacing:-.02em">Analytics</h1>
      <p style="color:var(--ink-500);font-size:14px;margin-top:2px">Analisis performa program, kehadiran, dan penilaian peserta.</p></div>
      <button class="btn btn-secondary" id="exportBtn">${icon("download", 16)} Export Excel</button>
    </div>

    ${kpiStrip(metrics)}

    <div class="grid grid-2" style="gap:10px;margin-bottom:10px">
      <div class="chart-card"><h3>Tren Kehadiran per Sesi</h3><p class="sub">Persentase peserta yang hadir</p><div class="chart-holder"><canvas id="chTrend"></canvas></div></div>
      <div class="chart-card"><h3>Distribusi Nilai</h3><p class="sub">Sebaran grade A–E</p><div class="chart-holder"><canvas id="chDist"></canvas></div></div>
    </div>

    <div class="grid grid-2" style="gap:10px;margin-bottom:10px">
      <div class="chart-card"><h3>Rata-rata Nilai per Training</h3><p class="sub">Nilai rata-rata tiap sesi</p><div class="chart-holder"><canvas id="chTrainGrade"></canvas></div></div>
      <div class="chart-card">
        <h3>Corong Keterlibatan</h3><p class="sub">Perjalanan peserta dari terdaftar hingga dinilai</p>
        <div style="margin-top:18px;display:flex;flex-direction:column;gap:10px">
          ${funnel.map((f) => `
            <div>
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px"><span style="color:var(--ink-700);font-weight:600">${f.label}</span><span style="color:var(--ink-900);font-weight:700">${f.val}<span style="color:var(--ink-300);font-weight:500"> (${total ? Math.round(f.val / total * 100) : 0}%)</span></span></div>
              <div style="height:12px;border-radius:8px;background:var(--surface-3);overflow:hidden"><div style="height:100%;width:${Math.round(f.val / funnelMax * 100)}%;background:${f.color};border-radius:8px;transition:width .5s"></div></div>
            </div>`).join("")}
        </div>
      </div>
    </div>

    <div class="grid grid-2" style="gap:10px;margin-bottom:10px">
      <div class="chart-card">
        <h3>Peringkat Nilai Tertinggi</h3><p class="sub">Berdasarkan rata-rata nilai tugas</p>
        <div style="margin-top:12px">
          ${byGrade.length ? byGrade.map((s, i) => `
            <div class="lb-item">
              <span class="lb-rank" style="background:${rankColors[i]}">${i + 1}</span>
              <span class="avatar-init" style="width:32px;height:32px;font-size:12px;background:${avatarColor(s.name)}">${escapeHTML(initials(s.name))}</span>
              <span style="flex:1;font-size:13.5px;font-weight:600;color:var(--ink-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(s.name || "-")}</span>
              <span style="font-weight:800;color:var(--primary)">${s.avg}</span>
            </div>`).join("") : `<div class="empty">Belum ada nilai.</div>`}
        </div>
      </div>
      <div class="chart-card">
        <h3>Peringkat Kehadiran Terbaik</h3><p class="sub">Berdasarkan jumlah sesi dihadiri</p>
        <div style="margin-top:12px">
          ${byAtt.length ? byAtt.map((s, i) => `
            <div class="lb-item">
              <span class="lb-rank" style="background:${rankColors[i]}">${i + 1}</span>
              <span class="avatar-init" style="width:32px;height:32px;font-size:12px;background:${avatarColor(s.name)}">${escapeHTML(initials(s.name))}</span>
              <span style="flex:1;font-size:13.5px;font-weight:600;color:var(--ink-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(s.name || "-")}</span>
              <span style="font-weight:800;color:var(--ok)">${s.hadir}<span style="font-size:11px;color:var(--ink-300);font-weight:600"> sesi</span></span>
            </div>`).join("") : `<div class="empty">Belum ada kehadiran.</div>`}
        </div>
      </div>
    </div>

    <div class="section-title-row"><h2>Insight Otomatis</h2></div>
    <div class="grid grid-2" style="gap:10px">
      ${insights.map((i) => `
        <div class="insight"><span class="insight-ico" style="background:${i.bg};color:${i.color}">${icon(i.icon, 18)}</span><p>${escapeHTML(i.text)}</p></div>`).join("")}
    </div>`;

  document.getElementById("exportBtn").addEventListener("click", () => {
    const rows = [["Nama", "Email", "Sesi Hadir", "Tugas Dikumpulkan", "Rata-rata Nilai"]];
    Object.values(pStats).sort((a, b) => (b.gradeN ? b.gradeSum / b.gradeN : 0) - (a.gradeN ? a.gradeSum / a.gradeN : 0))
      .forEach((s) => rows.push([s.name || "", s.email || "", s.hadir, s.submit, s.gradeN ? Math.round(s.gradeSum / s.gradeN) : "-"]));
    _xlsxDownload(`ilp-analytics-${todayISO}.xlsx`, rows);
    toast("Data analytics diekspor.");
  });

  whenChart(() => {
    const labels = tList.map((t, i) => "Sesi " + (t.week_number || i + 1));
    _mkChart("chTrend", {
      type: "line",
      data: { labels, datasets: [{ data: tList.map((t) => total ? Math.round((attCount[t.id] || 0) / total * 100) : 0), borderColor: "#215AA9", backgroundColor: "rgba(33,90,169,.12)", fill: true, tension: .35, pointBackgroundColor: "#215AA9", pointRadius: 4, borderWidth: 2.5 }] },
      options: _lineOpts(),
    });
    _mkChart("chDist", {
      type: "doughnut",
      data: { labels: ["A (85+)", "B (70-84)", "C (55-69)", "D (40-54)", "E (<40)"], datasets: [{ data: [dist.A, dist.B, dist.C, dist.D, dist.E], backgroundColor: ["#059669", "#3b88de", "#D97706", "#F97316", "#DC2626"], borderWidth: 0 }] },
      options: _donutOpts(),
    });
    _mkChart("chTrainGrade", {
      type: "bar",
      data: { labels, datasets: [{ data: tList.map((t) => { const g = trainGrades[t.id] || []; return g.length ? Math.round(g.reduce((a, b) => a + b, 0) / g.length) : 0; }), backgroundColor: "#7C3AED", borderRadius: 6, maxBarThickness: 38 }] },
      options: { ..._barOpts(100), scales: { ..._barOpts(100).scales, y: { ..._barOpts(100).scales.y, max: 100 } } },
    });
  });
};

/* =====================================================================
   PAGE — FORM BUILDER (admin)
   ===================================================================== */
const FB_TYPES = [
  { v: "text",     label: "Teks Singkat", icon: "type",         hasOpts: false },
  { v: "textarea", label: "Paragraf",     icon: "file-text",    hasOpts: false },
  { v: "number",   label: "Angka",        icon: "hash",         hasOpts: false },
  { v: "radio",    label: "Pilihan Ganda",icon: "radio-icon",   hasOpts: true  },
  { v: "checkbox", label: "Kotak Centang",icon: "check-square", hasOpts: true  },
  { v: "select",   label: "Dropdown",     icon: "list",         hasOpts: true  },
  { v: "rating",   label: "Skala Linear", icon: "star",         hasOpts: false },
  { v: "date",     label: "Tanggal",      icon: "calendar",     hasOpts: false },
  { v: "time",     label: "Waktu",        icon: "clock",        hasOpts: false },
  { v: "file",     label: "Link File",    icon: "file",         hasOpts: false },
];
function _fbDeriveEmbed(url) {
  if (!url) return "";
  try { const u = new URL(url); u.searchParams.set("embedded", "true"); return u.toString(); }
  catch (_) { return url + (url.includes("?") ? "&" : "?") + "embedded=true"; }
}

/* ---- Google integrations via Supabase Edge Functions ---- */
function _edgeFnUrl(name) {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}
function _edgeFnHeaders() {
  return { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" };
}

async function _createGoogleForm(payload) {
  const res = await fetch(_edgeFnUrl("google-form-create"), {
    method: "POST",
    headers: _edgeFnHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Gagal membuat Google Form.");
  return json; // { formId, publishedUrl, editUrl }
}

async function _getFormResponses(formId) {
  const res = await fetch(`${_edgeFnUrl("google-form-responses")}?formId=${encodeURIComponent(formId)}`, {
    headers: _edgeFnHeaders(),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Gagal mengambil respons.");
  return json; // { formId, totalResponses, headers, rows }
}

// Singleton promise — prevents duplicate calls even if called simultaneously
let _driveSetupPromise = null;
let _driveFolders = null;
function _driveSetup() {
  if (_driveFolders) return Promise.resolve(_driveFolders);
  if (_driveSetupPromise) return _driveSetupPromise;
  _driveSetupPromise = fetch(_edgeFnUrl("google-drive-setup"), {
    method: "POST",
    headers: _edgeFnHeaders(),
  }).then((r) => r.json()).then((json) => {
    if (json.ok && json.folders) { _driveFolders = json.folders; }
    return _driveFolders;
  }).catch(() => null).finally(() => { _driveSetupPromise = null; });
  return _driveSetupPromise;
}

/** Extract Google Drive file ID from a Drive URL */
function _driveFileId(url) {
  if (!url) return null;
  const m = url.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : null;
}

/** Move a list of Drive files into their correct folders based on current DB data */
async function _driveOrganizeAll() {
  const folders = await _driveSetup();
  if (!folders) return;

  // Fetch materials with file_url
  const { data: materials } = await _supabase.from("materials").select("id,title,file_url").not("file_url", "is", null);
  const matFiles = (materials || [])
    .map((m) => ({ fileId: _driveFileId(m.file_url), name: m.title }))
    .filter((f) => f.fileId);

  if (matFiles.length && folders.materi?.id) {
    await fetch(_edgeFnUrl("google-drive-organize"), {
      method: "POST",
      headers: _edgeFnHeaders(),
      body: JSON.stringify({ files: matFiles, folderId: folders.materi.id }),
    });
  }
}

async function _driveUpload(file, filename, folderPath, folderId) {
  const fd = new FormData();
  fd.append("file", file, filename || file.name);
  if (filename) fd.append("filename", filename);
  if (folderId) fd.append("folderId", folderId);
  else if (folderPath) fd.append("folderPath", JSON.stringify(folderPath));
  const res = await fetch(_edgeFnUrl("google-drive-upload"), {
    method: "POST",
    headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${SUPABASE_ANON_KEY}` },
    body: fd,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Gagal upload ke Google Drive.");
  return json; // { fileId, fileName, webViewLink, downloadUrl, previewUrl }
}

async function _getFormSchema(formId) {
  const res = await fetch(`${_edgeFnUrl("google-form-schema")}?formId=${encodeURIComponent(formId)}`, {
    headers: _edgeFnHeaders(),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Gagal mengambil skema form.");
  return json; // { formId, title, description, items: [{questionId, title, type, options, required}] }
}

/* =====================================================================
   MASTER FORMS — constants + helpers
   ===================================================================== */
const MASTER_FORM_CATS = [
  { key: "presensi",       label: "Presensi",  icon: "user-check",      color: "#059669", bg: "#ECFDF5" },
  { key: "pretest",        label: "Pretest",   icon: "clipboard",       color: "#215AA9", bg: "#EFF6FF" },
  { key: "posttest",       label: "Post Test", icon: "clipboard-check", color: "#7C3AED", bg: "#F5F3FF" },
  { key: "tugas",          label: "Tugas",     icon: "upload",          color: "#D97706", bg: "#FEF3C7" },
  { key: "laporan_mandiri", label: "Pengganti", icon: "file-text",      color: "#0891B2", bg: "#ECFEFF" },
];

function _masterFormFields(category) {
  const profile = [
    { type: "text", label: "Nama Lengkap",  required: true },
    { type: "text", label: "ID Peserta",    required: true },
    { type: "text", label: "Email",         required: true },
    { type: "text", label: "Institusi",     required: true },
    { type: "text", label: "Sesi Training", required: true },
  ];
  const extra = {
    presensi:       [{ type: "radio",    label: "Konfirmasi Kehadiran",      required: true, options: ["Hadir", "Tidak Hadir"] }],
    pretest:        [],
    posttest:       [],
    tugas:          [{ type: "textarea", label: "Link / Jawaban Tugas",      required: true }],
    laporan_mandiri: [
      { type: "textarea", label: "Alasan Ketidakhadiran",                    required: true },
      { type: "textarea", label: "Ringkasan Materi yang Dipelajari Mandiri", required: true },
      { type: "textarea", label: "Refleksi & Rencana Penerapan",             required: true },
      { type: "file",     label: "Bukti Belajar Mandiri (Link)",             required: true },
      { type: "rating",   label: "Tingkat Pemahaman Materi",                 required: true, ratingLow: 1, ratingHigh: 5, ratingLowLabel: "Belum Paham", ratingHighLabel: "Sangat Paham" },
    ],
  };
  return [...profile, ...(extra[category] || [])];
}

function _masterFormUrl(form, profile, training) {
  if (!form?.gform_url) return null;
  const parts = ["usp=pp_url"];
  // Google Forms API returns questionId as hex (e.g. "1e644aad"); prefill URLs need decimal.
  // Convert if all hex chars, otherwise pass through (already decimal from HTML parsing).
  const toEntryId = (hex) => {
    if (!hex) return null;
    return /^[0-9a-f]+$/i.test(hex) && !/^\d+$/.test(hex)
      ? parseInt(hex, 16).toString()
      : hex;
  };
  const add = (entry, val) => {
    const eid = toEntryId(entry);
    if (eid && val) parts.push(`entry.${eid}=${encodeURIComponent(String(val))}`);
  };
  add(form.entry_nama,        profile?.full_name   || "");
  add(form.entry_id_peserta,  profile?.id          || "");
  add(form.entry_email,       profile?.email       || "");
  add(form.entry_institusi,   profile?.institution || "");
  if (form.entry_training && training) {
    const label = training.week_number ? `Sesi ${training.week_number} — ${training.title}` : training.title;
    add(form.entry_training, label);
  }
  return form.gform_url + "?" + parts.join("&");
}

async function _initMasterForm(category) {
  const cat = MASTER_FORM_CATS.find((c) => c.key === category);
  if (!cat) throw new Error("Kategori tidak dikenal: " + category);
  const fields = _masterFormFields(category);
  const folders = await _driveSetup();
  const r = await _createGoogleForm({
    title: `[Master] ${cat.label} — ILP Academy 2026`,
    description: `Form master ${cat.label} yang digunakan untuk semua sesi training. Data profil peserta terisi otomatis.`,
    fields,
    folderId: folders?.forms?.id || null,
  });
  // Prefer entryIdMap (numeric HTML entry IDs) over questionIds (API UUIDs) for prefill
  console.log("[MasterForm] create response:", JSON.stringify({ entryIdMap: r.entryIdMap, questionIds: r.questionIds }));
  const eIds = (r.entryIdMap && Object.keys(r.entryIdMap).length) ? r.entryIdMap : (r.questionIds || {});
  // Embed entryId into each field so submission can map label → entry ID later
  const fieldsWithEntryIds = fields.map(f => ({ ...f, entryId: eIds[f.label] || null }));
  const typeMap = { presensi: "attendance", pretest: "pretest", posttest: "posttest", tugas: "custom" };
  const record = {
    title: `[Master] ${cat.label}`,
    description: `Form master ${cat.label} untuk semua sesi training ILP Academy 2026.`,
    type: typeMap[category] || "custom",
    mode: "gform",
    is_active: true,
    is_master: true,
    master_category: category,
    gsheet_id: r.formId,
    gform_url: r.publishedUrl,
    gform_edit_url: r.editUrl,
    fields: fieldsWithEntryIds,
    entry_nama:        eIds["Nama Lengkap"]  || null,
    entry_id_peserta:  eIds["ID Peserta"]    || null,
    entry_email:       eIds["Email"]         || null,
    entry_institusi:   eIds["Institusi"]     || null,
    entry_training:    eIds["Sesi Training"] || null,
  };
  const { data, error } = await _supabase.from("forms").insert(record).select().single();
  if (error) throw new Error(error.message);
  qcInvalidate("masterForms");
  return data;
}

async function _fetchMasterForms() {
  const hit = _qc.get("masterForms");
  if (hit && Date.now() - hit.t < 120_000) return hit.v;
  const { data } = await _supabase.from("forms").select("*").eq("is_master", true);
  const v = data || [];
  _qc.set("masterForms", { v, t: Date.now() });
  return v;
}

async function _submitFormResponse(formId, answers) {
  const res = await fetch(_edgeFnUrl("google-form-submit"), {
    method: "POST",
    headers: _edgeFnHeaders(),
    body: JSON.stringify({ formId, answers }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Gagal mengirim respons.");
  return json;
}

PAGES.adminForms = async function () {
  const profile = await requireAuth("admin");
  if (!profile) return;
  renderShell(profile, ADMIN_NAV, "Administrator");
  const c = document.getElementById("content");

  /* ----------------------------- LIST VIEW ----------------------------- */
  async function showList() {
    c.innerHTML = pageHead("Form Builder", "Buat formulir internal atau Google Form otomatis untuk pretest, posttest, survei, dan presensi.",
      `<button class="btn btn-primary" id="newFormBtn">${icon("plus", 16)} Buat Form</button>`) +
      `<div id="masterFormsSection"></div>
       <div id="formsList"><div class="loader" style="min-height:160px"><div class="spinner"></div>Memuat form...</div></div>`;

    document.getElementById("newFormBtn").addEventListener("click", () => showEditor(null));

    const [{ data: forms }, { data: trainings }, { data: assignments }] = await Promise.all([
      _supabase.from("forms").select("*").order("created_at", { ascending: false }),
      qc("trainings:a", () => _supabase.from("trainings").select("id,title,week_number")),
      _supabase.from("assignments").select("*").order("created_at", { ascending: false }),
    ]);
    const tName = {}; (trainings || []).forEach((t) => (tName[t.id] = t));
    const asgByForm = {}; (assignments || []).forEach((a) => { if (a.gsheet_id) asgByForm[a.gsheet_id] = a.title; });
    const formsGsheetIds = new Set((forms || []).map(f => f.gsheet_id).filter(Boolean));
    const _validFormId = (a) => {
      if (a.gsheet_id) return a.gsheet_id;
      if (!a.form_url) return null;
      const m = a.form_url.match(/\/forms\/d\/([^/e][^/?#]*)/);
      return m ? m[1] : null;
    };
    const orphanForms = (assignments || [])
      .filter(a => (a.gsheet_id || a.form_url) && !formsGsheetIds.has(a.gsheet_id))
      .map(a => {
        const fid = _validFormId(a);
        return { id: `asg:${a.id}`, _asgId: a.id, title: `Pengumpulan: ${a.title}`, description: a.description || "", type: "custom", is_active: true, gsheet_id: fid, fields: [], training_id: a.training_id, created_at: null };
      });

    // Separate master forms from regular forms
    const masterByCategory = {};
    (forms || []).filter(f => f.is_master).forEach(f => { masterByCategory[f.master_category] = f; });
    const regularForms = [...(forms || []).filter(f => !f.is_master), ...orphanForms];

    /* --- Render Master Forms section --- */
    const mfsEl = document.getElementById("masterFormsSection");
    mfsEl.innerHTML = `
      <div style="margin-bottom:8px">
        <h2 style="font-size:14px;font-weight:700;color:var(--ink-500);letter-spacing:.5px;text-transform:uppercase;margin-bottom:4px">Form Master</h2>
        <p style="font-size:12.5px;color:var(--ink-400);margin-bottom:12px">Satu form digunakan untuk semua sesi training. Kolom profil peserta (Nama, ID, Email, Institusi) dan Sesi Training terisi otomatis saat dibuka dari halaman Training.</p>
      </div>
      <div class="grid grid-4" style="gap:10px;margin-bottom:28px">${MASTER_FORM_CATS.map((cat) => {
        const mf = masterByCategory[cat.key];
        const fieldsN = mf && Array.isArray(mf.fields) ? mf.fields.length : 0;
        return `<div class="card card-pad" style="display:flex;flex-direction:column;gap:10px;border:2px solid ${mf ? cat.color + "33" : "#E2E8F0"}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <span class="kpi-ico" style="width:42px;height:42px;border-radius:11px;background:${cat.bg};color:${cat.color}">${icon(cat.icon, 20)}</span>
            ${mf ? `<span class="badge" style="background:${cat.bg};color:${cat.color};font-size:11px">${icon("check",11)} Aktif</span>` : `<span class="badge" style="font-size:11px">Belum dibuat</span>`}
          </div>
          <div>
            <h3 style="font-size:15px;font-weight:700;color:var(--ink-900)">${escapeHTML(cat.label)}</h3>
            <p style="font-size:12px;color:var(--ink-500);margin-top:3px">4 kolom profil + Sesi Training ${fieldsN > 5 ? `+ ${fieldsN - 5} pertanyaan` : ""}</p>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            <span class="badge" style="background:#F1F5F9;color:#475569">${icon("user",11)} Auto-prefill</span>
            ${mf?.gsheet_id ? `<span class="badge" style="background:#E0FAF1;color:#059669">${icon("check",11)} Google Form</span>` : ""}
          </div>
          <div style="display:flex;gap:6px;margin-top:auto;padding-top:10px;border-top:1px solid var(--border);flex-wrap:wrap">
            ${mf ? `
              <button class="btn btn-sm" data-medit="${mf.id}"
                style="background:#EFF6FF;color:#215AA9;border:1.5px solid #BFDBFE;font-weight:600;display:inline-flex;align-items:center;gap:5px;flex:1;justify-content:center">
                ${icon("edit",13)} Edit Form
              </button>
              <button class="btn btn-sm" data-mresp="${mf.id}"
                style="background:#F0FDF4;color:#059669;border:1.5px solid #A7F3D0;font-weight:600;display:inline-flex;align-items:center;gap:5px;flex:1;justify-content:center">
                ${icon("chart",13)} Respons
              </button>
              <button class="btn btn-sm" data-mdel="${mf.id}"
                style="background:#FEF2F2;color:#DC2626;border:1.5px solid #FECACA;font-weight:600;width:34px;padding:0;justify-content:center;display:inline-flex;align-items:center"
                title="Hapus Form Master">
                ${icon("trash",13)}
              </button>
            ` : `<button class="btn btn-primary btn-sm" data-minit="${cat.key}" style="width:100%;justify-content:center">${icon("plus",14)} Buat Form Master</button>`}
          </div>
        </div>`;
      }).join("")}</div>`;

    mfsEl.querySelectorAll("[data-minit]").forEach((b) => b.addEventListener("click", async () => {
      const cat = MASTER_FORM_CATS.find(c => c.key === b.dataset.minit);
      const ok = await confirmDialog({ title: `Buat Form Master ${cat?.label}?`, message: `Akan membuat Google Form master untuk <strong>${cat?.label}</strong> dengan kolom:<br><br>• Nama Lengkap, ID Peserta, Email, Institusi<br>• Sesi Training (auto-prefill)<br>${cat?.key === "tugas" ? "• Link / Jawaban Tugas" : cat?.key === "presensi" ? "• Konfirmasi Kehadiran" : ""}<br><br>Form ini digunakan untuk SEMUA sesi training dan akan terisi otomatis saat peserta membuka dari halaman Training.`, confirmText: "Buat Sekarang" });
      if (!ok) return;
      b.disabled = true; b.innerHTML = `<span class="spinner" style="width:13px;height:13px;border-width:2px"></span> Membuat...`;
      try {
        await _initMasterForm(b.dataset.minit);
        toast(`Form Master ${cat?.label} berhasil dibuat!`);
        showList();
      } catch (e) {
        toast("Gagal: " + (e.message || String(e)), "error");
        b.disabled = false; b.innerHTML = `${icon("plus",14)} Buat Form Master`;
      }
    }));
    mfsEl.querySelectorAll("[data-medit]").forEach((b) => b.addEventListener("click", () => {
      const mf = (forms || []).find(f => f.id === b.dataset.medit);
      if (mf) showEditor(mf);
    }));
    mfsEl.querySelectorAll("[data-mresp]").forEach((b) => b.addEventListener("click", () => {
      const mf = (forms || []).find(f => f.id === b.dataset.mresp);
      if (mf) showResponses(mf);
    }));
    mfsEl.querySelectorAll("[data-mdel]").forEach((b) => b.addEventListener("click", async () => {
      const mf = (forms || []).find(f => f.id === b.dataset.mdel);
      if (!mf) return;
      const ok = await confirmDialog({ title: "Hapus Form Master?", message: `Form master <strong>${escapeHTML(mf.title)}</strong> akan dihapus dari database (Google Form-nya tetap ada di Google Drive). Tombol form di halaman Training tidak akan berfungsi sampai form master baru dibuat.`, confirmText: "Ya, Hapus", danger: true });
      if (!ok) return;
      await _supabase.from("forms").delete().eq("id", mf.id);
      qcInvalidate("masterForms");
      toast("Form master dihapus.");
      showList();
    }));

    // Auto-open form editor if navigated here from admin training card
    const pendingFormId = sessionStorage.getItem("openFormEditor");
    if (pendingFormId) {
      sessionStorage.removeItem("openFormEditor");
      const mf = (forms || []).find(f => f.id === pendingFormId);
      if (mf) { showEditor(mf); return; }
    }

    /* --- Render regular forms --- */
    const list = document.getElementById("formsList");
    if (!regularForms.length) {
      list.innerHTML = `<div style="font-size:13px;color:var(--ink-400);padding:8px 0">Belum ada form tambahan.</div>`;
      return;
    }
    list.innerHTML = `
      <h2 style="font-size:14px;font-weight:700;color:var(--ink-500);letter-spacing:.5px;text-transform:uppercase;margin-bottom:12px">Form Lainnya</h2>
      <div class="grid grid-3" style="gap:10px">${regularForms.map((f) => {
      const t = tName[f.training_id];
      const typeLabel = { pretest: "Pretest", posttest: "Posttest", survey: "Survei", attendance: "Presensi", custom: "Umum" }[f.type] || "Umum";
      const fieldsN = Array.isArray(f.fields) ? f.fields.length : 0;
      const linkedAsg = f.gsheet_id ? asgByForm[f.gsheet_id] : null;
      const isOrphan = !!f._asgId;
      const iconBg = linkedAsg ? "#FEF3C7" : "var(--primary-tint)";
      const iconColor = linkedAsg ? "#D97706" : "var(--primary)";
      const iconName = linkedAsg ? "upload" : "file-text";
      return `<div class="card card-pad" style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <span class="kpi-ico" style="width:42px;height:42px;border-radius:11px;background:${iconBg};color:${iconColor}">${icon(iconName, 20)}</span>
          ${isOrphan ? "" : `<label class="toggle" title="Aktif/Nonaktif"><input type="checkbox" data-toggle="${f.id}" ${f.is_active ? "checked" : ""}><span class="track"></span></label>`}
        </div>
        <div>
          <h3 style="font-size:15px;font-weight:700;color:var(--ink-900);line-height:1.35">${escapeHTML(f.title)}</h3>
          ${f.description ? `<p style="font-size:12.5px;color:var(--ink-500);margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHTML(f.description)}</p>` : ""}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${linkedAsg ? `<span class="badge badge-warning">${icon("upload",11)} Pengumpulan Tugas</span>` : `<span class="badge badge-primary">${typeLabel}</span>`}
          ${f.gsheet_id ? `<span class="badge" style="background:#E0FAF1;color:#059669">${icon("check",11)} Google Form</span>` : ""}
          ${fieldsN ? `<span class="badge">${fieldsN} pertanyaan</span>` : ""}
        </div>
        ${linkedAsg ? `<div style="font-size:12px;color:var(--ink-600);display:flex;align-items:center;gap:6px">${icon("task",13)} Tugas: ${escapeHTML(linkedAsg)}</div>` : ""}
        ${t ? `<div style="font-size:12px;color:var(--ink-500);display:flex;align-items:center;gap:6px">${icon("calendar", 13)} Sesi ${t.week_number || ""} — ${escapeHTML(t.title)}</div>` : ""}
        <div style="display:flex;gap:8px;margin-top:auto;padding-top:8px;flex-wrap:wrap">
          ${f.gsheet_id ? `<button class="btn btn-ghost btn-sm" data-preview="${f.id}">${icon("eye", 14)} Preview</button>` : ""}
          ${isOrphan && !f.gsheet_id ? `<button class="btn btn-secondary btn-sm" data-autoform="${f._asgId}">${icon("zap", 14)} Buat Google Form</button>` : ""}
          ${!isOrphan ? `<button class="btn btn-ghost btn-sm" data-resp="${f.id}">${icon("chart", 14)} Respons</button>` : ""}
          ${!linkedAsg && !isOrphan ? `<button class="btn btn-ghost btn-sm" data-edit="${f.id}">${icon("edit", 14)}</button>` : ""}
          ${!isOrphan ? `<button class="btn btn-ghost btn-sm" data-del="${f.id}" style="color:var(--bad)">${icon("trash", 14)}</button>` : ""}
        </div>
      </div>`;
    }).join("")}</div>`;

    list.querySelectorAll("[data-toggle]").forEach((t) => t.addEventListener("change", async () => {
      await _supabase.from("forms").update({ is_active: t.checked }).eq("id", t.dataset.toggle);
      toast(t.checked ? "Form diaktifkan." : "Form dinonaktifkan.");
    }));
    list.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => showEditor(regularForms.find((f) => f.id === b.dataset.edit))));
    list.querySelectorAll("[data-preview]").forEach((b) => b.addEventListener("click", () => openPreviewModal(regularForms.find((f) => f.id === b.dataset.preview))));
    list.querySelectorAll("[data-resp]").forEach((b) => b.addEventListener("click", () => showResponses(regularForms.find((f) => f.id === b.dataset.resp))));
    list.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      const f = regularForms.find((x) => x.id === b.dataset.del);
      const ok = await confirmDialog({ title: "Hapus Form?", message: `Form "${escapeHTML(f.title)}" beserta seluruh responsnya akan dihapus.`, confirmText: "Ya, Hapus", danger: true });
      if (!ok) return;
      await _supabase.from("forms").delete().eq("id", f.id);
      toast("Form dihapus.");
      showList();
    }));

    list.querySelectorAll("[data-autoform]").forEach((b) => b.addEventListener("click", async () => {
      const asgId = b.dataset.autoform;
      const asg = (assignments || []).find(a => a.id === asgId);
      if (!asg) return;
      b.disabled = true; b.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;margin:0 auto"></div>`;
      try {
        const folders = await _driveSetup();
        const formFields = [
          { type: "text",     label: "Email",                    required: true },
          { type: "text",     label: "Nama Lengkap",             required: true },
          { type: "text",     label: "Institusi / Universitas",  required: true },
          { type: "textarea", label: "Link / Jawaban Tugas",     required: true },
        ];
        const r = await _createGoogleForm({ title: `Pengumpulan: ${asg.title}`, description: asg.description || "", fields: formFields, folderId: folders?.tugas?.id });
        const qIds = r.questionIds || {};
        await _supabase.from("forms").insert({ title: `Pengumpulan: ${asg.title}`, description: asg.description || "", type: "custom", is_active: true, gsheet_id: r.formId, gform_url: r.publishedUrl, gform_edit_url: r.editUrl, fields: formFields, training_id: asg.training_id || null });
        await _supabase.from("assignments").update({ gsheet_id: r.formId, form_url: r.publishedUrl, entry_nama: qIds["Nama Lengkap"] || null, entry_email: qIds["Email"] || null, entry_institusi: qIds["Institusi / Universitas"] || null }).eq("id", asgId);
        toast("Google Form berhasil dibuat!");
        showList();
      } catch (e) {
        toast("Gagal membuat form: " + ((e && e.message) || String(e)), "error");
        b.disabled = false; b.innerHTML = `${icon("zap", 14)} Buat Google Form`;
      }
    }));
  }

  /* ---------------------------- EDITOR VIEW ---------------------------- */
  async function showEditor(form) {
    const editing = !!form;
    const { data: trainings } = await qc("trainings:a", () => _supabase.from("trainings").select("id,title,week_number"));
    let fields = editing && Array.isArray(form.fields) ? JSON.parse(JSON.stringify(form.fields)) : [];

    const tOptions = `<option value="">— Tidak terkait sesi —</option>` + (trainings || []).map((t) =>
      `<option value="${t.id}" ${editing && form.training_id === t.id ? "selected" : ""}>Sesi ${t.week_number || ""} — ${escapeHTML(t.title)}</option>`).join("");

    c.innerHTML = `
      <div class="page-head with-back" style="margin-bottom:10px">
        <button class="btn btn-ghost btn-sm" id="backBtn">${icon("arrow-left", 16)} Kembali</button>
        <div><h1>${editing ? "Edit Form" : "Buat Form Baru"}</h1></div>
      </div>

      <div class="form-editor">
        <div class="form-editor-left">
          <div class="card card-pad editor-card">
            <div class="field"><label class="label">Judul Form</label><input class="input" id="fTitle" value="${editing ? escapeHTML(form.title) : ""}" placeholder="Contoh: Pretest Sesi 1"></div>
            <div class="field"><label class="label">Tipe</label>
              <select class="input" id="fType">
                ${["custom","pretest","posttest","survey","attendance"].map((v) => `<option value="${v}" ${editing && form.type === v ? "selected" : ""}>${{custom:"Umum",pretest:"Pretest",posttest:"Posttest",survey:"Survei",attendance:"Presensi"}[v]}</option>`).join("")}
              </select>
            </div>
            <div class="field"><label class="label">Deskripsi <span class="opt">(opsional)</span></label><textarea class="input" id="fDesc" rows="3" placeholder="Petunjuk pengisian...">${editing ? escapeHTML(form.description || "") : ""}</textarea></div>
            <div class="field" style="margin-bottom:0"><label class="label">Terkait Sesi <span class="opt">(opsional)</span></label><select class="input" id="fTraining">${tOptions}</select></div>
          </div>

          ${editing && form.gsheet_id ? `<div class="card card-pad editor-card">
            <label class="label" style="margin-bottom:8px">Aksi</label>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              <button class="btn btn-secondary btn-sm" id="editorPreviewBtn">${icon("eye", 14)} Preview</button>
              <button class="btn btn-secondary btn-sm" id="editorRespBtn">${icon("chart", 14)} Lihat Respons</button>
            </div>
            <p class="form-hint" style="margin-top:8px;color:var(--ink-400)">Perubahan pertanyaan disimpan di aplikasi. Jika perlu sync ke Google Form, gunakan tombol Preview untuk verifikasi.</p>
          </div>` : ""}
        </div>

        <div class="form-editor-right">
          <div class="card card-pad editor-card" id="questionsCard">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
              <label class="label" style="margin:0;font-size:14px;font-weight:700">Pertanyaan</label>
              <span style="font-size:12px;color:var(--ink-400)">${fields.length} pertanyaan</span>
            </div>
            <div id="fbFields" style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px"></div>
            <div style="display:flex;flex-wrap:wrap;gap:6px" id="fbAddBtns">
              ${FB_TYPES.map((t) => `<button type="button" class="fb-add-btn" data-add="${t.v}">${icon(t.icon, 14)} ${t.label}</button>`).join("")}
            </div>
          </div>
        </div>

        <div class="form-editor-footer">
          <div id="editorMsg" style="flex:1"></div>
          <button type="button" class="btn btn-ghost" id="cancelBtn">Batal</button>
          <button type="button" class="btn btn-primary" id="saveBtn">${editing ? "Simpan Perubahan" : "Buat Google Form"}</button>
        </div>
      </div>`;

    document.getElementById("backBtn").addEventListener("click", showList);
    document.getElementById("cancelBtn").addEventListener("click", showList);
    if (editing && form.gsheet_id) {
      document.getElementById("editorPreviewBtn")?.addEventListener("click", () => openPreviewModal(form));
      document.getElementById("editorRespBtn")?.addEventListener("click", () => showResponses(form));
    }

    const saveBtn = document.getElementById("saveBtn");

    /* --- Field builder --- */
    const fieldsBox = document.getElementById("fbFields");
    const drawFields = () => {
      // Update count badge
      const badge = document.querySelector("#questionsCard label + span");
      if (badge) badge.textContent = `${fields.length} pertanyaan`;

      if (!fields.length) {
        fieldsBox.innerHTML = `<div class="empty" style="border:1.5px dashed var(--border);border-radius:12px;padding:24px;font-size:13px;color:var(--ink-400);text-align:center">${icon("plus",20)}<p style="margin-top:6px">Belum ada pertanyaan. Tambahkan dari tombol di bawah.</p></div>`;
        return;
      }
      fieldsBox.innerHTML = fields.map((fld, i) => {
        const meta = FB_TYPES.find((t) => t.v === fld.type) || FB_TYPES[0];
        const typeSelector = FB_TYPES.map((t) =>
          `<option value="${t.v}" ${fld.type === t.v ? "selected" : ""}>${t.label}</option>`).join("");
        return `<div class="fb-field" data-i="${i}" style="border:1px solid #E2E8F0;border-radius:12px;padding:14px 16px;background:#fff">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <span style="font-size:11px;font-weight:700;color:var(--ink-400);background:var(--bg-2);border-radius:6px;padding:2px 8px">${i + 1}</span>
            <select class="input" data-type="${i}" style="flex:1;max-width:180px;font-size:12px;padding:4px 8px;height:30px">
              ${typeSelector}
            </select>
            <div style="margin-left:auto;display:flex;gap:4px">
              <button type="button" class="btn-icon" data-up="${i}" title="Naik">${icon("chevron-up", 14)}</button>
              <button type="button" class="btn-icon" data-down="${i}" title="Turun">${icon("chevron-down", 14)}</button>
              <button type="button" class="btn-icon" data-rm="${i}" style="color:var(--bad)" title="Hapus">${icon("trash", 14)}</button>
            </div>
          </div>
          <input class="input" data-label="${i}" value="${escapeHTML(fld.label || "")}" placeholder="Tulis pertanyaan…" style="margin-bottom:8px">
          <input class="input" data-desc="${i}" value="${escapeHTML(fld.description || "")}" placeholder="Deskripsi/petunjuk (opsional)" style="font-size:12px;margin-bottom:8px;color:var(--ink-500)">
          ${meta.hasOpts ? `<div class="fb-opts-box" style="margin-bottom:8px">
            <div class="fb-opts-list">
              ${(fld.options || []).map((opt, oi) => `<div class="fb-opt-row">
                <span class="fb-opt-bullet"></span>
                <input class="fb-opt-input" data-optfield="${i}" data-optidx="${oi}" value="${escapeHTML(opt)}" placeholder="Opsi ${oi + 1}">
                <button type="button" class="fb-opt-del" data-optdel="${i}" data-optdelidx="${oi}" title="Hapus">${icon("x", 11)}</button>
              </div>`).join("")}
            </div>
            <button type="button" class="fb-opt-add" data-optadd="${i}">${icon("plus", 12)} Tambah opsi</button>
          </div>` : ""}
          ${fld.type === "rating" ? `<div style="display:flex;gap:8px;margin-bottom:8px">
            <input class="input" data-lo="${i}" value="${escapeHTML(String(fld.ratingLow || 1))}" type="number" min="0" max="5" style="width:70px" placeholder="Min">
            <input class="input" data-hi="${i}" value="${escapeHTML(String(fld.ratingHigh || 5))}" type="number" min="1" max="10" style="width:70px" placeholder="Max">
            <input class="input" data-lolabel="${i}" value="${escapeHTML(fld.ratingLowLabel || "")}" placeholder="Label min (misal: Sangat Buruk)" style="flex:1">
            <input class="input" data-hilabel="${i}" value="${escapeHTML(fld.ratingHighLabel || "")}" placeholder="Label max (misal: Sangat Baik)" style="flex:1">
          </div>` : ""}
          <label class="chk" style="font-size:13px"><input type="checkbox" data-req="${i}" ${fld.required ? "checked" : ""}><span class="box">${icon("check", 12)}</span> Wajib diisi</label>
        </div>`;
      }).join("");

      fieldsBox.querySelectorAll("[data-type]").forEach((el) => el.addEventListener("change", () => {
        const i = +el.dataset.type;
        const newType = el.value;
        const hasOpts = (FB_TYPES.find((t) => t.v === newType) || {}).hasOpts;
        fields[i] = { ...fields[i], type: newType, options: hasOpts ? (fields[i].options?.length ? fields[i].options : ["Opsi 1", "Opsi 2"]) : [] };
        drawFields();
      }));
      fieldsBox.querySelectorAll("[data-label]").forEach((el) => el.addEventListener("input", () => (fields[+el.dataset.label].label = el.value)));
      fieldsBox.querySelectorAll("[data-desc]").forEach((el) => el.addEventListener("input", () => (fields[+el.dataset.desc].description = el.value)));
      fieldsBox.querySelectorAll("[data-optfield]").forEach((el) => el.addEventListener("input", () => {
        fields[+el.dataset.optfield].options[+el.dataset.optidx] = el.value;
      }));
      fieldsBox.querySelectorAll("[data-optdel]").forEach((el) => el.addEventListener("click", () => {
        fields[+el.dataset.optdel].options.splice(+el.dataset.optdelidx, 1);
        drawFields();
      }));
      fieldsBox.querySelectorAll("[data-optadd]").forEach((el) => el.addEventListener("click", () => {
        const fi = +el.dataset.optadd;
        fields[fi].options.push(`Opsi ${fields[fi].options.length + 1}`);
        drawFields();
      }));
      fieldsBox.querySelectorAll("[data-lo]").forEach((el) => el.addEventListener("input", () => (fields[+el.dataset.lo].ratingLow = +el.value)));
      fieldsBox.querySelectorAll("[data-hi]").forEach((el) => el.addEventListener("input", () => (fields[+el.dataset.hi].ratingHigh = +el.value)));
      fieldsBox.querySelectorAll("[data-lolabel]").forEach((el) => el.addEventListener("input", () => (fields[+el.dataset.lolabel].ratingLowLabel = el.value)));
      fieldsBox.querySelectorAll("[data-hilabel]").forEach((el) => el.addEventListener("input", () => (fields[+el.dataset.hilabel].ratingHighLabel = el.value)));
      fieldsBox.querySelectorAll("[data-req]").forEach((el) => el.addEventListener("change", () => (fields[+el.dataset.req].required = el.checked)));
      fieldsBox.querySelectorAll("[data-rm]").forEach((el) => el.addEventListener("click", () => { fields.splice(+el.dataset.rm, 1); drawFields(); }));
      fieldsBox.querySelectorAll("[data-up]").forEach((el) => el.addEventListener("click", () => { const i = +el.dataset.up; if (i > 0) { [fields[i-1], fields[i]] = [fields[i], fields[i-1]]; drawFields(); } }));
      fieldsBox.querySelectorAll("[data-down]").forEach((el) => el.addEventListener("click", () => { const i = +el.dataset.down; if (i < fields.length-1) { [fields[i+1], fields[i]] = [fields[i], fields[i+1]]; drawFields(); } }));
    };
    drawFields();

    document.getElementById("fbAddBtns").querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => {
      const type = b.dataset.add;
      const hasOpts = (FB_TYPES.find((t) => t.v === type) || {}).hasOpts;
      fields.push({ type, label: "", description: "", options: hasOpts ? ["Opsi 1", "Opsi 2"] : [], required: false });
      drawFields();
      // Scroll to new field
      fieldsBox.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
    }));

    /* --- Save --- */
    saveBtn.addEventListener("click", async () => {
      const msg = document.getElementById("editorMsg");
      const title = document.getElementById("fTitle").value.trim();
      const description = document.getElementById("fDesc").value.trim();
      const type = document.getElementById("fType").value;
      const training_id = document.getElementById("fTraining").value || null;
      msg.innerHTML = "";
      if (!title) { msg.innerHTML = `<div class="alert alert-error">Judul form wajib diisi.</div>`; return; }
      if (!fields.length) { msg.innerHTML = `<div class="alert alert-error">Tambahkan minimal satu pertanyaan.</div>`; return; }
      if (fields.some((x) => !x.label.trim())) { msg.innerHTML = `<div class="alert alert-error">Semua pertanyaan harus memiliki teks.</div>`; return; }

      const base = { title, description: description || null, type, training_id, mode: "gform" };
      const setBusy = (txt) => { saveBtn.disabled = true; saveBtn.innerHTML = `<span class="spin"></span> ${txt}`; };
      const unBusy = () => { saveBtn.disabled = false; saveBtn.textContent = editing ? "Simpan Perubahan" : "Buat Google Form"; };

      try {
        if (editing) {
          setBusy("Menyimpan...");
          const { error } = await _supabase.from("forms").update({ ...base, fields }).eq("id", form.id);
          if (error) throw new Error(error.message);
          toast("Form diperbarui.");
          showList();
        } else {
          setBusy("Membuat Google Form…");
          const r = await _createGoogleForm({ title, description, type, fields });
          const payload = {
            ...base, fields,
            gform_url: r.publishedUrl,
            gform_embed_url: _fbDeriveEmbed(r.publishedUrl || ""),
            gform_edit_url: r.editUrl || null,
            gsheet_id: r.formId || null,
          };
          const { error } = await _supabase.from("forms").insert(payload);
          if (error) throw new Error(error.message);
          toast("Google Form berhasil dibuat dan tertaut!");
          showList();
        }
      } catch (e) {
        msg.innerHTML = `<div class="alert alert-error">${escapeHTML(e.message || String(e))}</div>`;
        unBusy();
      }
    });
  }

  /* --------------------- PREVIEW & RESPONSES (modal) -------------------- */
  function fieldInputHTML(fld, i) {
    const name = "f" + i;
    if (fld.type === "textarea") return `<textarea class="input" name="${name}" rows="3" ${fld.required ? "required" : ""}></textarea>`;
    if (fld.type === "select") return `<select class="input" name="${name}" ${fld.required ? "required" : ""}><option value="">— Pilih —</option>${(fld.options || []).map((o) => `<option>${escapeHTML(o)}</option>`).join("")}</select>`;
    if (fld.type === "radio") return `<div style="display:flex;flex-direction:column;gap:8px">${(fld.options || []).map((o) => `<label class="chk radio"><input type="radio" name="${name}" value="${escapeHTML(o)}" ${fld.required ? "required" : ""}><span class="box"></span> ${escapeHTML(o)}</label>`).join("")}</div>`;
    if (fld.type === "checkbox") return `<div style="display:flex;flex-direction:column;gap:8px">${(fld.options || []).map((o) => `<label class="chk"><input type="checkbox" name="${name}" value="${escapeHTML(o)}"><span class="box">${icon("check", 12)}</span> ${escapeHTML(o)}</label>`).join("")}</div>`;
    if (fld.type === "rating") return `<div class="fb-rating" data-rating="${i}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="fb-star" data-val="${n}">${icon("star", 26)}</button>`).join("")}<input type="hidden" name="${name}" value=""></div>`;
    if (fld.type === "file") return `<input class="input" name="${name}" type="url" placeholder="Tempel link file (Drive, dll.)" ${fld.required ? "required" : ""}>`;
    return `<input class="input" name="${name}" ${fld.required ? "required" : ""}>`;
  }

  async function openPreviewModal(form) {
    if (!form.gsheet_id) {
      toast("Form belum memiliki Google Form yang tertaut.", "error");
      return;
    }
    // Show loading modal first
    openModal(form.title, `<div class="loader" style="min-height:180px"><div class="spinner"></div>Memuat pratinjau form…</div>`, { wide: true });

    let schema;
    try {
      schema = await _getFormSchema(form.gsheet_id);
    } catch (e) {
      openModal(form.title, `<div style="text-align:center;padding:40px 24px;color:var(--bad)">${icon("x-circle",32)}<p style="margin-top:10px;font-weight:600">Gagal memuat form</p><p style="font-size:13px;color:var(--ink-500);margin-top:4px">${escapeHTML((e&&e.message)||String(e))}</p></div>`, { wide: true });
      return;
    }

    const typeLabel = { custom:"Formulir", pretest:"Pretest", posttest:"Posttest", survey:"Survei", attendance:"Presensi" }[form.type] || "Formulir";
    const { rows, items } = _renderInlineForm(schema, {});

    openModal(form.title,
      `<form id="adminPreviewForm" class="gf-page" style="gap:12px">
        <div class="gf-header-card" style="padding:20px 24px">
          <div class="gf-htype">${icon("eye",13)} Pratinjau — ${typeLabel}</div>
          <h2 style="font-size:17px">${escapeHTML(schema.title || form.title)}</h2>
          ${schema.description ? `<p style="font-size:13px">${escapeHTML(schema.description)}</p>` : ""}
        </div>
        ${rows}
        <div class="gf-submit-area" style="padding:14px 18px">
          <span style="font-size:12.5px;color:var(--ink-400);font-style:italic;flex:1">Mode pratinjau — respons tidak dikirim</span>
          <button type="button" class="gf-cancel-btn" data-close>Tutup</button>
        </div>
      </form>`,
      { wide: true }
    );
  }

  async function showResponses(form) {
    const formId = form.gsheet_id;
    const cell = (v) => v == null ? "" : String(v);

    // Parse Google Forms timestamp (handles "7/6/2026, 11.12.02" Indonesian locale)
    function parseGFTimestamp(ts) {
      if (!ts) return null;
      const s = String(ts);
      // Try "M/D/YYYY, H.MM.SS" or "M/D/YYYY H.MM.SS"
      const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2})[.:](\d{2})[.:](\d{2})/);
      if (m) return new Date(+m[3], +m[1]-1, +m[2], +m[4], +m[5], +m[6]);
      const d = new Date(s);
      return isNaN(d) ? null : d;
    }

    function fmtGFDate(ts) {
      const d = parseGFTimestamp(ts);
      if (!d) return "—";
      return d.toLocaleDateString("id-ID", { day:"numeric", month:"short", year:"numeric" }) +
             " " + d.toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit" });
    }

    function renderPage(data) {
      const headers = data.headers || [];
      const rows = data.rows || [];
      const total = data.totalResponses || rows.length;
      const typeLabel = { pretest:"Pretest", posttest:"Posttest", survey:"Survei", attendance:"Presensi", custom:"Umum" }[form.type] || "Form";
      const latestTs = rows[0]?.[0];
      const latestD = latestTs ? parseGFTimestamp(latestTs) : null;
      const latestDate = latestD ? latestD.toLocaleDateString("id-ID", { day:"numeric", month:"short", year:"numeric" }) : "—";
      c.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" id="respBack" style="gap:6px">${icon("arrow-left",15)} Kembali</button>
          <span style="color:var(--ink-300)">›</span>
          <span style="font-size:13px;color:var(--ink-500)">Form Builder</span>
          <span style="color:var(--ink-300)">›</span>
          <span style="font-size:13px;font-weight:600;color:var(--ink-800)">${escapeHTML(form.title)}</span>
        </div>

        <div class="card card-pad" style="margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
            <div style="width:46px;height:46px;border-radius:13px;background:var(--primary-tint);color:var(--primary);display:grid;place-items:center;flex-shrink:0">${icon("message-circle",21)}</div>
            <div style="flex:1;min-width:0">
              <h1 style="font-size:19px;font-weight:800;color:var(--ink-900);margin:0;line-height:1.3">${escapeHTML(form.title)}</h1>
              <div style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap">
                <span class="badge badge-primary">${typeLabel}</span>
                <span class="badge">${icon("message-circle",10)} ${total} respons</span>
                ${form.description ? `<span style="font-size:12px;color:var(--ink-400)">${escapeHTML(form.description)}</span>` : ""}
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              ${form.gform_edit_url ? `<a class="btn btn-ghost btn-sm" href="${escapeHTML(form.gform_edit_url)}" target="_blank">${icon("eye",13)} Lihat di Google</a>` : ""}
              <button class="btn btn-ghost btn-sm" id="respRefresh">${icon("refresh",13)} Refresh</button>
              <button class="btn btn-secondary btn-sm" id="respExport">${icon("download",13)} Export Excel</button>
            </div>
          </div>
        </div>`;

      if (!rows.length) {
        c.innerHTML += `<div class="card card-pad" style="text-align:center;padding:56px 32px">
          <div style="width:64px;height:64px;border-radius:50%;background:var(--bg-2,#F1F5F9);display:grid;place-items:center;margin:0 auto 16px;color:var(--ink-400)">${icon("inbox",28)}</div>
          <h3 style="font-size:17px;font-weight:700;color:var(--ink-700);margin-bottom:6px">Belum ada respons</h3>
          <p style="font-size:13.5px;color:var(--ink-500)">Respons akan muncul setelah peserta mengisi form ini.</p>
        </div>`;
      } else {
        // KPI Strip
        c.innerHTML += kpiStrip([
          { icon:"message-circle", bg:"var(--primary-tint)", color:"var(--primary)", value:total,                      label:"Total Respons",   sub:"" },
          { icon:"calendar",       bg:"var(--ok-bg)",        color:"var(--ok)",      value:latestDate,                 label:"Respons Terbaru", sub:"" },
          { icon:"bar-chart",      bg:"var(--warn-bg)",      color:"var(--warn)",    value:headers.length - 1,         label:"Pertanyaan",      sub:"" },
          { icon:"users",          bg:"#F3E8FF",             color:"#7C3AED",        value:`${Math.round((rows.length/Math.max(total,1))*100)}%`, label:"Response Rate",   sub:"dari total entri" },
        ]);

        // Filter bar
        c.innerHTML += `
          <div class="card" style="padding:10px 14px;margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <div style="position:relative;flex:1;min-width:180px;max-width:280px">
                <span style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--ink-400);pointer-events:none;display:flex">${icon("search",14)}</span>
                <input id="respSearch" class="form-control" placeholder="Cari respons…" style="padding-left:34px;height:38px;font-size:13px;border-radius:10px">
              </div>

              <div style="display:flex;align-items:center;gap:0;border:1.5px solid var(--border);border-radius:10px;overflow:hidden;background:#fff;height:38px">
                <span style="padding:0 10px;font-size:12px;font-weight:600;color:var(--ink-500);border-right:1px solid var(--border);white-space:nowrap;height:100%;display:flex;align-items:center;background:var(--bg-2,#F8FAFC)">${icon("calendar",13)} Dari</span>
                <input type="date" id="respDateFrom" style="border:none;outline:none;font-size:13px;padding:0 10px;height:100%;background:transparent;color:var(--ink-800);font-family:inherit">
              </div>

              <div style="display:flex;align-items:center;gap:0;border:1.5px solid var(--border);border-radius:10px;overflow:hidden;background:#fff;height:38px">
                <span style="padding:0 10px;font-size:12px;font-weight:600;color:var(--ink-500);border-right:1px solid var(--border);white-space:nowrap;height:100%;display:flex;align-items:center;background:var(--bg-2,#F8FAFC)">${icon("calendar",13)} Sampai</span>
                <input type="date" id="respDateTo" style="border:none;outline:none;font-size:13px;padding:0 10px;height:100%;background:transparent;color:var(--ink-800);font-family:inherit">
              </div>

              <button class="btn btn-ghost btn-sm" id="respFilterClear" style="height:38px;border-radius:10px;border:1.5px solid var(--border);gap:5px;padding:0 12px;font-size:12.5px">${icon("x",12)} Reset Filter</button>

              <div style="margin-left:auto;display:flex;align-items:center;gap:6px">
                <span style="font-size:12px;color:var(--ink-400)">Menampilkan</span>
                <span class="badge" id="respCount" style="font-size:12px;font-weight:700">${rows.length} baris</span>
              </div>
            </div>
          </div>

          <div class="card" style="overflow:hidden">
            <div style="overflow:auto;max-height:60vh">
              <table class="data-table" id="respTable">
                <thead><tr>
                  <th style="width:32px;color:var(--ink-400)">#</th>
                  <th>Timestamp</th>
                  ${headers.slice(1).map((h) => `<th>${escapeHTML(cell(h))}</th>`).join("")}
                  <th style="width:72px"></th>
                </tr></thead>
                <tbody id="respBody">
                  ${rows.map((row, ri) => {
                    const ts = parseGFTimestamp(cell(row[0]));
                    const tsIso = ts ? ts.toISOString().slice(0,10) : "";
                    return `<tr data-ts="${tsIso}">
                      <td style="color:var(--ink-400);font-size:12px;font-weight:600">${ri + 1}</td>
                      <td style="white-space:nowrap;font-size:12.5px;color:var(--ink-600)">${fmtGFDate(cell(row[0]))}</td>
                      ${headers.slice(1).map((_, ci) => `<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHTML(cell(row[ci+1]))}">${escapeHTML(cell(row[ci+1]))}</td>`).join("")}
                      <td><button class="btn btn-ghost btn-sm" data-detail="${ri}" style="font-size:12px">${icon("eye",13)}</button></td>
                    </tr>`;
                  }).join("")}
                </tbody>
              </table>
            </div>
          </div>`;

        // Filter logic
        function applyFilters() {
          const q = (document.getElementById("respSearch")?.value || "").toLowerCase();
          const from = document.getElementById("respDateFrom")?.value || "";
          const to = document.getElementById("respDateTo")?.value || "";
          let visible = 0;
          document.querySelectorAll("#respBody tr").forEach((tr) => {
            const ts = tr.dataset.ts || "";
            const matchText = !q || tr.textContent.toLowerCase().includes(q);
            const matchFrom = !from || ts >= from;
            const matchTo = !to || ts <= to;
            const show = matchText && matchFrom && matchTo;
            tr.style.display = show ? "" : "none";
            if (show) visible++;
          });
          document.getElementById("respCount").textContent = `${visible} baris`;
        }
        document.getElementById("respSearch").addEventListener("input", applyFilters);
        document.getElementById("respDateFrom").addEventListener("change", applyFilters);
        document.getElementById("respDateTo").addEventListener("change", applyFilters);
        document.getElementById("respFilterClear").addEventListener("click", () => {
          document.getElementById("respSearch").value = "";
          document.getElementById("respDateFrom").value = "";
          document.getElementById("respDateTo").value = "";
          applyFilters();
        });

        // Detail modal
        document.querySelectorAll("[data-detail]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const ri = parseInt(btn.dataset.detail);
            const row = rows[ri];
            const detailHtml = `<div>
              <div style="background:var(--primary-tint);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:var(--primary);font-weight:600">${icon("clock",13)} ${fmtGFDate(cell(row[0]))}</div>
              ${headers.slice(1).map((h, ci) => `
                <div style="padding:11px 0;border-bottom:1px solid var(--border);display:grid;grid-template-columns:2fr 3fr;gap:12px;align-items:start">
                  <div style="font-size:11.5px;font-weight:700;color:var(--ink-500);line-height:1.4">${escapeHTML(cell(h))}</div>
                  <div style="font-size:13.5px;color:var(--ink-900);font-weight:500;word-break:break-word">${escapeHTML(cell(row[ci+1])) || `<span style="color:var(--ink-300)">—</span>`}</div>
                </div>`).join("")}
            </div>`;
            openModal(`Respons #${ri + 1}`, detailHtml);
          });
        });
      }

      document.getElementById("respBack").addEventListener("click", showList);
      document.getElementById("respRefresh")?.addEventListener("click", loadResponses);
      document.getElementById("respExport")?.addEventListener("click", () => {
        const tsHeader = "Timestamp";
        const expHeaders = [tsHeader, ...headers.slice(1).map(cell)];
        const expRows = rows.map((r) => [fmtGFDate(cell(r[0])), ...headers.slice(1).map((_, ci) => cell(r[ci+1]))]);
        _xlsxDownload(`respons-${form.title.replace(/\s+/g, "-").toLowerCase()}.xlsx`, [expHeaders, ...expRows]);
      });
    }

    async function loadResponses() {
      c.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
          <button class="btn btn-ghost btn-sm" id="respBack" style="gap:6px;padding:6px 12px">${icon("arrow-left",15)} Kembali</button>
          <span style="color:var(--ink-300)">›</span>
          <span style="font-size:13px;color:var(--ink-500)">Form Builder › ${escapeHTML(form.title)}</span>
        </div>
        <div class="loader" style="min-height:220px"><div class="spinner"></div>Memuat respons…</div>`;
      document.getElementById("respBack").addEventListener("click", showList);

      try {
        // Primary source: Supabase form_responses (stores ALL fields incl. custom)
        const { data: supRows } = await _supabase
          .from("form_responses")
          .select("id, respondent_id, response_data, submitted_at")
          .eq("form_id", form.id)
          .order("submitted_at", { ascending: false });

        if (supRows && supRows.length) {
          // Build column order: form.fields labels first, then any extra keys from actual data
          const fieldLabels = Array.isArray(form.fields) ? form.fields.map((f) => f.label) : [];
          const extraKeys = new Set();
          supRows.forEach((r) => {
            Object.keys(r.response_data || {}).forEach((k) => {
              if (!fieldLabels.includes(k)) extraKeys.add(k);
            });
          });
          const allCols = [...fieldLabels, ...Array.from(extraKeys)];
          const headers = ["Timestamp", ...allCols];
          const rows = supRows.map((r) => {
            const ans = r.response_data || {};
            return [r.submitted_at || "", ...allCols.map((k) => {
              const v = ans[k];
              return Array.isArray(v) ? v.join(", ") : (v ?? "");
            })];
          });
          renderPage({ headers, rows, totalResponses: rows.length });
          return;
        }

        // Fallback: Google Sheets (for forms without Supabase responses yet)
        if (!formId) {
          renderPage({ headers: [], rows: [], totalResponses: 0 });
          return;
        }
        const data = await _getFormResponses(formId);
        renderPage(data);
      } catch (e) {
        c.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
            <button class="btn btn-ghost btn-sm" id="respBack2" style="gap:6px;padding:6px 12px">${icon("arrow-left",15)} Kembali</button>
          </div>
          <div class="card card-pad" style="text-align:center;padding:48px">
            <div style="color:var(--bad);margin-bottom:12px">${icon("x-circle",32)}</div>
            <p style="font-weight:700;font-size:16px;color:var(--ink-800)">Gagal memuat respons</p>
            <p style="font-size:13px;color:var(--ink-500);margin-top:6px">${escapeHTML((e && e.message) || String(e))}</p>
            <button class="btn btn-primary btn-sm" id="retryBtn" style="margin-top:20px">${icon("refresh",14)} Coba Lagi</button>
          </div>`;
        document.getElementById("respBack2").addEventListener("click", showList);
        document.getElementById("retryBtn").addEventListener("click", loadResponses);
      }
    }
    loadResponses();
  }
  if (typeof window !== "undefined" && window.__ILP_TEST) {
    window.__t_showEditor = showEditor; window.__t_preview = openPreviewModal; window.__t_resp = showResponses;
  }
  showList();
};



