import { ICON, REDUCED } from "../core/constants";
import { $, clamp, cssKey, fmtTime, plural, reconcile, span } from "../core/helpers";
import { NS, S, cloudOn, dueDots, pending } from "../core/state";
import { askHtml, askSig } from "../features/asks";
import { recheckApps } from "../features/cloud";
import { paintTell } from "../features/tell";
import { avatarHtml, stateOf } from "../ui/characters";
import { dotStatus } from "../ui/shell";
import { nextEvent, renderHorizon } from "./horizon";

/* ─── home ─── */
export function greet() { const h = new Date().getHours(); return h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }
export function summaryLine() {
  const awake = S.dots.filter(cloudOn).length, due = dueDots().length;
  let s = `${plural(S.dots.length, "dot")} in your field`;
  if (awake) s += ` · ${awake} awake in the cloud`;
  s += due ? ` · ${due} ready to wake` : " · none due yet";
  const nx = nextEvent();
  if (nx) s += nx.now ? ` · you're in “${nx.ev.title}” until ${fmtTime(nx.ev.end)}` : ` · next meeting in ${span(nx.ev.start - Date.now())}`;
  return s + ".";
}
export function paintHome() {
  const clock = $("#clock"); if (!clock) return;
  clock.textContent = `${new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })} · ${fmtTime(Date.now())}`;
  const first = (S.me?.name || "").split(" ")[0];
  let head = "Dotworks", voice = "Small assistants with one job each. They check in, then wait for your say.", again = false;
  if (!S.booted) voice = "Waking the field…";
  else if (!NS.user) { head = "Open in Claude"; voice = "Dots run on your own Claude plan with your own Calendar and Gmail. Open this page in Claude to plant one."; }
  else if (!S.uid) { head = "Sign in"; voice = "Your dots, notes and asks are private to your account."; }
  else if (!S.dotsLoaded) voice = "Gathering your dots…";
  else if (!S.dots.length) { head = `${greet()}${first ? ", " + first : ""}`; voice = "Your field is empty. Tap a seed below to plant your first dot — each one grows into a small assistant with one job."; }
  else if (S.running) {
    const d = S.dots.find(x => x.id === S.running.dotId); head = `${d?.name || "A dot"} is awake`;
    const st = S.running.steps[S.running.steps.length - 1];
    voice = S.running.text ? "Writing you a note…" : st ? st.label + (st.state === "wait" ? "…" : "") : "Thinking it through…";
  } else { const n = pending().length; head = n ? `${plural(n, "ask")} waiting` : `${greet()}${first ? ", " + first : ""}`; if (S.digest?.text) { voice = S.digest.text; again = true; } else voice = summaryLine(); }
  $("#greet").textContent = head;
  const V = $("#voice"); V.textContent = voice;
  if (again && !S.digestBusy) V.insertAdjacentHTML("beforeend", ` <button class="again" data-act="digest-refresh" title="Read the field again">read again</button>`);
  let acts = "";
  const notes = S.dots.filter(d => S.latest[d.id]?.headline).length, due = dueDots().length;
  if (S.uid && NS.sample && !S.running && notes >= 2 && !S.digest && !S.digestOff) acts += `<button class="btn" data-act="digest" ${S.digestBusy ? "disabled" : ""}>${S.digestBusy ? "Reading…" : "Sum it up"}</button>`;
  if (S.uid && NS.sample && !S.running && due && S.dots.length) acts += `<button class="btn" data-act="run-due">${ICON.bolt}Wake ${due} due</button>`;
  if (S.uid && NS.db) acts += `<button class="btn pri" data-act="new">${ICON.plus}New dot</button>`;
  const A = $("#homeActions"); if (A.innerHTML !== acts) A.innerHTML = acts;
  paintTell(); renderField(); renderHorizon(); paintPeek(); initSky();
}
export function paintPeek() {
  const box = $("#peek"); if (!box) return;
  const p = pending();
  $("#homeFoot").classList.toggle("solo", !p.length);
  if (!p.length) { box.innerHTML = ""; return; }
  const a = p[0];
  reconcile(box, [
    { key: "peek-h", html: `<div class="peek-h" data-key="peek-h"><span class="eyebrow">Waiting on you · ${p.length}</span>${p.length > 1 ? `<button class="link" data-nav="asks">See all</button>` : ""}</div>`, sig: "h" + p.length },
    { key: a.id, html: askHtml(a, { withDot: true }), sig: askSig(a) },
  ]);
}
export let fieldPts = [];
export function fieldItems() {
  if (!S.uid || !S.dotsLoaded) return [];
  if (!S.dots.length) return S.seeds.filter(s => s.starter).slice(0, 4).map(s => ({ kind: "seed", key: "seed:" + s.key, seed: s }));
  return [...S.dots.map(d => ({ kind: "dot", key: d.id, dot: d })), { kind: "ghost", key: "ghost" }];
}
export function renderField() {
  const field = $("#field"); if (!field) return;
  const items = fieldItems(), w = field.clientWidth || 900;
  const small = w < 560, av = small ? 68 : 84;
  const perRow = clamp(Math.floor((w - 24) / (small ? 150 : 176)), 2, 6), rows = Math.max(1, Math.ceil(items.length / perRow));
  const rowH = av + (small ? 78 : 92), need = rows * rowH + 16;
  // the field grows to fit its dots; the page scrolls rather than letting them overlap
  const mh = items.length ? need + "px" : "";
  if (field.style.minHeight !== mh) field.style.minHeight = mh;
  const h = Math.max(field.clientHeight || 0, need), top = (h - rows * rowH) / 2;
  fieldPts = items.map((_, i) => {
    const r = Math.floor(i / perRow), inRow = Math.min(perRow, items.length - r * perRow), c = i % perRow;
    const wob = small ? 0 : Math.sin(i * 2.17 + .7) * 10;
    return { x: 8 + 84 * (c + .5) / inRow, y: ((top + rowH * (r + .5) + wob) / h) * 100 };
  });
  field.dataset.av = av;
  const keep = new Set();
  items.forEach((it, i) => {
    keep.add(it.key);
    let el = field.querySelector(`[data-key="${cssKey(it.key)}"]`);
    if (!el) {
      el = document.createElement("button"); el.type = "button"; el.className = "orb-btn" + (it.kind === "ghost" ? " ghost" : ""); el.dataset.key = it.key;
      const dly = (-(i * 1.7) % 9).toFixed(2) + "s"; el.style.setProperty("--i", i);
      el.innerHTML = it.kind === "ghost" ? `<span class="float" style="--d:${dly}"><span class="ghost-c">${ICON.plus}</span><span class="orb-name">New dot</span><span class="orb-meta">make your own</span></span>`
        : `<span class="float" style="--d:${dly};--dur:${10 + (i % 3) * 1.5}s"><span class="avw"></span><span class="orb-name"></span><span class="orb-meta"></span></span>`;
      field.append(el);
    }
    el.style.left = fieldPts[i].x + "%"; el.style.top = fieldPts[i].y + "%";
    if (it.kind === "ghost") { el.dataset.act = "new"; el.setAttribute("aria-label", "Make a new dot"); return; }
    const avw = el.querySelector(".avw"), nm = el.querySelector(".orb-name"), mt = el.querySelector(".orb-meta");
    let avh, name, meta, mcl = "", label;
    if (it.kind === "seed") {
      const s = it.seed; el.dataset.act = "plant-open"; el.dataset.id = s.key;
      avh = avatarHtml({ ...s, id: s.key }, { size: av, state: "seed" }); name = s.name; meta = "seed · tap to plant"; label = `Seed: ${s.name}. Open to plant it.`;
    } else {
      const d = (it as any).dot, asks = pending().filter(a => a.dotId === d.id).length, [st, cl] = dotStatus(d);
      el.dataset.act = "open-dot"; el.dataset.id = d.id;
      avh = avatarHtml(d, { size: av, state: stateOf(d), badge: asks || "" }); name = d.name; meta = st; mcl = cl;
      label = `${d.name}, ${st}`; el.title = S.latest[d.id]?.headline ? `Latest: ${S.latest[d.id].headline}` : "";
    }
    if (avw.dataset.sig !== avh) { avw.innerHTML = avh; avw.dataset.sig = avh; }
    if (nm.textContent !== name) nm.textContent = name;
    mt.textContent = meta; mt.className = "orb-meta" + (mcl ? " " + mcl : "");
    el.setAttribute("aria-label", label);
  });
  for (const el of [...field.children]) if (!keep.has(el.dataset.key)) el.remove();
}

/* sky: drifting dust + a faint dotted constellation through your dots */
export const sky = { canvas: null, ctx: null, parts: [], w: 0, h: 0, dpr: 1, last: 0, rgb: "236 238 244", rgbAt: 0, running: false };
export function initSky() {
  if (!sky.canvas) {
    const cv = $("#sky"); if (!cv) return;
    sky.canvas = cv;
    try { sky.ctx = cv.getContext && cv.getContext("2d"); } catch { sky.ctx = null; }
    if (!sky.ctx) return;
    sky.parts = Array.from({ length: 110 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + .3, v: Math.random() * .00006 + .00002, p: Math.random() * 6.28 }));
    const resize = () => { const r = cv.getBoundingClientRect(); sky.dpr = Math.min(2, window.devicePixelRatio || 1); sky.w = r.width; sky.h = r.height; cv.width = Math.max(1, r.width * sky.dpr); cv.height = Math.max(1, r.height * sky.dpr); drawSky(performance.now()); };
    resize();
    if (window.ResizeObserver) new ResizeObserver(() => { resize(); if (S.view === "home") renderField(); }).observe($("#main"));
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { startSky(); recheckApps(); } });
  }
  if (!sky.ctx) return;
  drawSky(performance.now()); startSky();
}
export function startSky() {
  if (REDUCED || sky.running || !sky.ctx || !window.requestAnimationFrame || S.view !== "home") return;
  sky.running = true;
  const loop = t => {
    if (S.view !== "home" || document.visibilityState === "hidden") { sky.running = false; return; }
    if (t - sky.last > 33) { sky.last = t; drawSky(t); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
export function drawSky(t) {
  const { ctx, w, h, dpr } = sky; if (!ctx || !w) return;
  if (!sky.rgbAt || t - sky.rgbAt > 2000) { sky.rgb = getComputedStyle(document.documentElement).getPropertyValue("--sky").trim() || sky.rgb; sky.rgbAt = t || 1; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  for (const p of sky.parts) { if (!REDUCED) p.x = (p.x + p.v) % 1; ctx.fillStyle = `rgb(${sky.rgb} / ${.14 + .22 * (1 + Math.sin(t / 1400 + p.p)) / 2})`; ctx.beginPath(); ctx.arc(p.x * w, p.y * h, p.r, 0, 6.283); ctx.fill(); }
  const field = $("#field"), n = S.dots.length;
  if (field && n > 1 && fieldPts.length >= n) {
    const fr = field.getBoundingClientRect(), cr = sky.canvas.getBoundingClientRect();
    ctx.strokeStyle = `rgb(${sky.rgb} / .09)`; ctx.lineWidth = 1; ctx.setLineDash([2, 5]); ctx.beginPath();
    for (let i = 0; i < n; i++) { const x = fr.left - cr.left + fieldPts[i].x / 100 * fr.width, y = fr.top - cr.top + fieldPts[i].y / 100 * fr.height - 14; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.setLineDash([]);
  }
}
// eyes follow your pointer
export let lookRaf = 0, lookPt = null;
document.addEventListener("pointermove", ev => {
  if (REDUCED) return; lookPt = [ev.clientX, ev.clientY];
  if (lookRaf) return;
  lookRaf = requestAnimationFrame(() => {
    lookRaf = 0;
    for (const av of document.querySelectorAll(".field .av, #dvAv .av, .b-prev .av")) {
      const r = av.getBoundingClientRect(); if (!r.width) continue;
      const dx = lookPt[0] - (r.left + r.width / 2), dy = lookPt[1] - (r.top + r.height / 2), m = Math.max(1, Math.hypot(dx, dy));
      const k = Math.min(1, m / 260);
      (av as any).style.setProperty("--lx", (dx / m * k).toFixed(2)); (av as any).style.setProperty("--ly", (dy / m * k).toFixed(2));
    }
  });
}, { passive: true });
