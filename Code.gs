/* =====================================================================
   ILP Academy LMS 2026 — ParagonCorp
   Global stylesheet
   ===================================================================== */
:root {
  --paragon: #215aa9;
  --paragon-dark: #1a437b;
  --paragon-light: #3b7ad1;
  --paragon-tint: #eaf1fa;
  --ink: #0f1b2d;
  --slate-50: #f7f9fc;
  --slate-100: #eef2f7;
  --slate-200: #e2e8f0;
  --slate-300: #cbd5e1;
  --slate-400: #94a3b8;
  --slate-500: #64748b;
  --slate-600: #475569;
  --slate-700: #334155;
  --white: #ffffff;
  --success: #059669;
  --success-bg: #d1fae5;
  --warning: #d97706;
  --warning-bg: #fef3c7;
  --danger: #e11d48;
  --danger-bg: #ffe4e6;
  --radius: 16px;
  --shadow-card: 0 1px 3px rgba(15, 27, 45, 0.08),
    0 8px 24px rgba(15, 27, 45, 0.06);
  /* Plus Jakarta Sans across ALL elements (display font de-serif'd per 2026 spec) */
  --font-body: "Plus Jakarta Sans", system-ui, -apple-system, sans-serif;
  --font-display: "Plus Jakarta Sans", system-ui, -apple-system, sans-serif;
}
/* Display headings keep their tighter, heavier treatment now that the
   typeface is Plus Jakarta Sans (the old Fraunces serif is fully removed). */
.font-display { letter-spacing: -0.02em; }

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
html {
  height: 100%;
  overflow: hidden;
  scrollbar-width: none;
}
html::-webkit-scrollbar { display: none; }
body {
  height: 100%;
  overflow: hidden;
  scrollbar-width: none;
}
body::-webkit-scrollbar { display: none; }
body {
  font-family: var(--font-body);
  background: var(--slate-50);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  line-height: 1.5;
  overflow: hidden;
  max-width: 100vw;
}
a {
  color: inherit;
  text-decoration: none;
}
img {
  max-width: 100%;
  display: block;
}
.font-display {
  font-family: var(--font-display);
}

/* ---------- Layout helpers ---------- */
.container {
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 20px;
}
.hidden {
  display: none !important;
}
.grid {
  display: grid;
  gap: 10px;
  align-items: stretch;
}
/* Cards inside a grid always fill their cell height */
.grid > .card,
.grid > .card-pad {
  height: 100%;
  box-sizing: border-box;
}
.grid-2 {
  grid-template-columns: repeat(2, 1fr);
}
.grid-3 {
  grid-template-columns: repeat(3, 1fr);
}
.grid-4 {
  grid-template-columns: repeat(4, 1fr);
}
.flex {
  display: flex;
}
.items-center {
  align-items: center;
}
.justify-between {
  justify-content: space-between;
}
.gap-2 {
  gap: 8px;
}
.gap-3 {
  gap: 12px;
}
.mt-1 {
  margin-top: 4px;
}
.mt-2 {
  margin-top: 8px;
}
.mt-4 {
  margin-top: 16px;
}

/* ---------- Buttons ---------- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 12px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.btn:disabled {
  opacity: 0.5;
  pointer-events: none;
}
.btn-primary {
  background: var(--paragon);
  color: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
.btn-primary:hover {
  background: var(--paragon-dark);
}
.btn-ghost {
  background: #fff;
  border-color: var(--slate-200);
  color: var(--slate-700);
}
.btn-ghost:hover {
  border-color: var(--paragon);
  color: var(--paragon);
}
.btn-danger {
  background: #fff;
  border-color: var(--danger-bg);
  color: var(--danger);
}
.btn-danger:hover {
  background: var(--danger-bg);
}
.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
  border-radius: 10px;
}
.btn-icon {
  padding: 8px;
  border-radius: 10px;
  border: 1px solid var(--slate-200);
  background: #fff;
  color: var(--slate-400);
  cursor: pointer;
  display: inline-flex;
}
.btn-icon:hover {
  border-color: var(--paragon);
  color: var(--paragon);
}
.btn-icon.danger:hover {
  border-color: var(--danger-bg);
  color: var(--danger);
}

/* ---------- Forms ---------- */
.field {
  margin-bottom: 16px;
}
.label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--slate-700);
}
.input,
select.input,
textarea.input {
  width: 100%;
  border: 1px solid var(--slate-200);
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 14px;
  font-family: inherit;
  color: var(--ink);
  background: #fff;
  outline: none;
  transition: border 0.15s, box-shadow 0.15s;
}
.input:focus,
select.input:focus,
textarea.input:focus {
  border-color: var(--paragon);
  box-shadow: 0 0 0 3px rgba(33, 90, 169, 0.15);
}
textarea.input {
  resize: vertical;
}
input[type="file"] {
  font-size: 14px;
  color: var(--slate-600);
}
input[type="file"]::file-selector-button {
  margin-right: 12px;
  border: 0;
  border-radius: 10px;
  background: var(--paragon);
  color: #fff;
  padding: 8px 16px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}
input[type="file"]::file-selector-button:hover {
  background: var(--paragon-dark);
}

/* ---------- Cards & badges ---------- */
.card {
  background: #fff;
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
}
.card-pad {
  padding: 24px;
}
.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 500;
  background: var(--slate-100);
  color: var(--slate-700);
}
.badge-success {
  background: var(--success-bg);
  color: var(--success);
}
.badge-warning {
  background: var(--warning-bg);
  color: var(--warning);
}
.badge-info {
  background: var(--paragon-tint);
  color: var(--paragon-dark);
}
.empty {
  border: 1px dashed var(--slate-300);
  background: rgba(248, 250, 252, 0.6);
  border-radius: 12px;
  padding: 40px 24px;
  text-align: center;
  font-size: 14px;
  color: var(--slate-500);
}

/* ---------- Icon helpers ---------- */
.icon-box {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--paragon-tint);
  color: var(--paragon);
  flex-shrink: 0;
}
.icon-box.solid {
  background: var(--paragon);
  color: #fff;
}
svg.icon {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ---------- Brand / logo ---------- */
.logo {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-display);
  font-size: 20px;
  letter-spacing: -0.02em;
}
.logo .mark {
  width: 32px;
  height: auto;
  object-fit: contain;
}
.nav-logo {
  height: 64px;
  width: auto;
  object-fit: contain;
}
.logo b {
  font-weight: 700;
  color: var(--ink);
}
.logo span {
  font-weight: 500;
  color: var(--paragon);
}

/* ---------- Toast / alert ---------- */
.alert {
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 14px;
  margin: 12px 0;
}
.alert-error {
  background: var(--danger-bg);
  color: var(--danger);
}
.alert-success {
  background: var(--success-bg);
  color: var(--success);
}

/* ---------- Backgrounds ---------- */
.bg-grid {
  background-image: radial-gradient(
    circle at 1px 1px,
    rgba(33, 90, 169, 0.08) 1px,
    transparent 0
  );
  background-size: 28px 28px;
}

/* =====================================================================
   LANDING PAGE
   ===================================================================== */
.nav {
  position: sticky;
  top: 0;
  z-index: 40;
  border-bottom: 1px solid rgba(226, 232, 240, 0.7);
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
}
.nav .container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  padding-bottom: 14px;
}
.hero {
  position: relative;
  overflow: hidden;
}
.hero .container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
  align-items: center;
  padding: 96px 20px;
}
.hero h1 {
  font-family: var(--font-display);
  font-size: 48px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
  margin: 20px 0;
}
.hero h1 .accent,
.text-paragon {
  color: var(--paragon);
}
.hero p.lead {
  max-width: 440px;
  font-size: 16px;
  color: var(--slate-600);
}
.pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid rgba(33, 90, 169, 0.2);
  background: var(--paragon-tint);
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--paragon-dark);
}
.blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  pointer-events: none;
}
.hero-card {
  background: #fff;
  border: 1px solid var(--slate-200);
  border-radius: 24px;
  padding: 24px;
  box-shadow: var(--shadow-card);
}
.mini-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  background: var(--slate-50);
  border-radius: 12px;
  padding: 14px;
  margin-top: 12px;
}
.section {
  padding: 64px 0;
}
.section h2 {
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 700;
  text-align: center;
}
.feature-card {
  background: #fff;
  border: 1px solid var(--slate-200);
  border-radius: var(--radius);
  padding: 24px;
  box-shadow: var(--shadow-card);
  transition: transform 0.15s, box-shadow 0.15s;
}
.feature-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(15, 27, 45, 0.1);
}
.feature-card h3 {
  font-family: var(--font-display);
  font-size: 18px;
  margin: 16px 0 8px;
}
.journey {
  background: var(--ink);
  color: #fff;
}
.journey-steps {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-top: 48px;
}
.journey-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  flex: 1;
}
.journey-num {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--paragon);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 18px;
}
.accordion {
  max-width: 720px;
  margin: 40px auto 0;
  background: #fff;
  border: 1px solid var(--slate-200);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}
details {
  border-bottom: 1px solid var(--slate-200);
}
details:last-child {
  border-bottom: 0;
}
summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 24px;
  font-weight: 600;
  color: var(--ink);
}
summary::-webkit-details-marker {
  display: none;
}
summary .chev {
  margin-left: auto;
  transition: transform 0.2s;
  color: var(--slate-400);
}
details[open] summary .chev {
  transform: rotate(180deg);
}
.accordion p {
  padding: 0 24px 20px 64px;
  font-size: 14px;
  color: var(--slate-600);
}
.faq {
  max-width: 720px;
  margin: 32px auto 0;
}
.faq details {
  border: 1px solid var(--slate-200);
  border-radius: 12px;
  margin-bottom: 12px;
  background: #fff;
}
.faq summary {
  padding: 16px 20px;
}
.faq p {
  padding: 0 20px 16px;
  font-size: 14px;
  color: var(--slate-600);
}
.footer {
  border-top: 1px solid var(--slate-200);
  background: #fff;
}
.footer .container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 32px 20px;
}

/* =====================================================================
   AUTH PAGES (login / set-password)
   ===================================================================== */
.auth-wrap {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.auth-brand {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: var(--ink);
  color: #fff;
  padding: 40px;
}
.auth-brand h1 {
  font-family: var(--font-display);
  font-size: 36px;
  font-weight: 700;
  line-height: 1.1;
}
.auth-brand .logo b,
.auth-brand .logo span {
  color: #fff;
}
.auth-form {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 64px 20px;
}
.auth-box {
  width: 100%;
  max-width: 380px;
}
.auth-box h2 {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 700;
  margin-top: 24px;
}
.card-auth {
  width: 100%;
  max-width: 380px;
  background: #fff;
  border: 1px solid var(--slate-200);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
  padding: 32px;
}

/* APP SHELL — see app.css & ui.css */

/* welcome banner */
.welcome {
  position: relative;
  overflow: hidden;
  background: var(--ink);
  color: #fff;
  border-radius: var(--radius);
  padding: 28px;
}
.welcome .sub {
  font-size: 14px;
  color: var(--slate-300);
}
.welcome h1 {
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 700;
}
.progress-track {
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  overflow: hidden;
  margin-top: 8px;
}
.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--paragon-light);
  transition: width 0.4s;
}
.progress-track.light {
  background: var(--slate-100);
}
.progress-track.light .progress-fill {
  background: var(--paragon);
}
.stat-num {
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 700;
  color: var(--ink);
}
.stat-label {
  font-size: 14px;
  color: var(--slate-500);
}

/* tables */
.table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
thead {
  background: var(--slate-50);
  text-align: left;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--slate-500);
}
th,
td {
  padding: 12px 20px;
}
tbody tr {
  border-top: 1px solid var(--slate-100);
}
tbody tr:hover {
  background: rgba(248, 250, 252, 0.6);
}

/* section list rows */
.list-row {
  border: 1px solid var(--slate-200);
  border-radius: 12px;
  padding: 16px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-head .ttl {
  display: flex;
  align-items: center;
  gap: 10px;
}
.section-head h2 {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
}
.link-more {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 500;
  color: var(--paragon);
}
.link-more:hover {
  text-decoration: underline;
}

/* =====================================================================
   MODAL
   ===================================================================== */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
}
.modal {
  width: 100%;
  max-width: 520px;
  background: #fff;
  border-radius: var(--radius);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--slate-200);
}
.modal-head h3 {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
}
.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
}

/* loader */
.loader {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  color: var(--slate-400);
  font-size: 14px;
  gap: 16px;
}
.spinner {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: transparent;
  border: 3.5px solid #E2E8F0;
  border-top-color: #1A437B;
  border-right-color: #2563EB;
  animation: spin 0.75s cubic-bezier(0.4,0,0.2,1) infinite;
  margin-bottom: 4px;
  position: relative;
}
.spinner::after {
  content: "";
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  border: 2px solid transparent;
  border-top-color: #60A5FA;
  animation: spin 1.2s cubic-bezier(0.4,0,0.2,1) infinite reverse;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* #_npbar removed — progress bar disabled */
#_npbar { display: none !important; }

/* Button loading state */
.btn-loading { opacity: 0.75; cursor: not-allowed; pointer-events: none; }
.btn-spin {
  display: inline-block;
  width: 13px; height: 13px;
  border: 2px solid rgba(255,255,255,0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  vertical-align: middle;
  margin-right: 5px;
}
.btn-spin.dark {
  border-color: rgba(30,64,175,0.25);
  border-top-color: #1A437B;
}

/* Page content skeleton pulse */
@keyframes skpulse { 0%,100%{opacity:.4} 50%{opacity:.9} }
.sk-line {
  background: #E2E8F0;
  border-radius: 6px;
  animation: skpulse 1.4s ease-in-out infinite;
}

/* =====================================================================
   RESPONSIVE
   ===================================================================== */
@media (max-width: 860px) {
  .hero .container,
  .auth-wrap {
    grid-template-columns: 1fr;
  }
  .auth-brand {
    display: none;
  }
  .hero h1 {
    font-size: 36px;
  }
  .grid-2,
  .grid-3,
  .grid-4 {
    grid-template-columns: 1fr;
  }
  .journey-steps {
    flex-direction: column;
  }
  .journey-step {
    flex-direction: row;
    text-align: left;
  }
  .content {
    padding: 20px;
  }
}
@media (min-width: 861px) {
  .grid-4 {
    grid-template-columns: repeat(4, 1fr);
  }
}
@media (max-width: 600px) {
  .grid-4 {
    grid-template-columns: repeat(2, 1fr);
  }
}
