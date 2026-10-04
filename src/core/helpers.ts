/* ═════════ helpers ═════════ */
export const $ = (s, r = document) => r.querySelector(s);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const clean = s => String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF\uE000-\uF8FF]/g, "");
export const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const pad = n => String(n).padStart(2, "0");
export const plural = (n, w, ws?) => `${n} ${n === 1 ? w : ws || w + "s"}`;
export const cssKey = k => (window.CSS && CSS.escape ? CSS.escape(k) : String(k).replace(/["\\]/g, "\\$&"));
export const hueOf = x => { const h = Number(x?.hue); return Number.isFinite(h) ? ((Math.round(h) % 360) + 360) % 360 : 220; };
export const tierOf = d => (d?.tier === "quick" || d?.tier === "complex" ? d.tier : "default");
export const slug = s => String(s || "dot").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "dot";
export const handleOf = d => "@" + slug(d?.name);
export function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export const fmtTime = t => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const fmtDay = t => new Date(t).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
export function dayDiff(t) { const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); return Math.round((day(new Date(t)) - day(new Date())) / 864e5); }
export function fmtWhen(t) { const diff = dayDiff(t), time = fmtTime(t); return diff === 0 ? "today " + time : diff === 1 ? "tomorrow " + time : diff === -1 ? "yesterday " + time : fmtDay(t) + " " + time; }
export function dayLabel(t) { const diff = dayDiff(t); return diff === 0 ? "Today" : diff === -1 ? "Yesterday" : fmtDay(t); }
export function ago(t) { if (!t) return "never"; const s = Math.round((Date.now() - t) / 1000); if (s < 60) return "just now"; if (s < 3600) return Math.round(s / 60) + "m ago"; if (s < 86400) return Math.round(s / 3600) + "h ago"; return Math.round(s / 86400) + "d ago"; }
export function span(ms) { const m = Math.max(1, Math.round(ms / 60000)); if (m < 60) return m + "m"; const h = Math.floor(m / 60), r = m % 60; if (h < 24) return r ? `${h}h ${r}m` : `${h}h`; return Math.round(h / 24) + "d"; }
export const headlineOf = text => { const l = String(text || "").split("\n").find(x => x.trim()); return l ? clean(l.replace(/^#+\s*/, "").replace(/\*\*/g, "")).trim() : ""; };
export function md(src) {
  const inline = t => esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, '<a href="$1" target="_blank" rel="noopener">link</a>');
  let out = "", inList = false;
  for (const raw of clean(src).split("\n")) {
    const line = raw.trimEnd(), li = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
    if (li) { if (!inList) { out += "<ul>"; inList = true; } out += "<li>" + inline(li[1]) + "</li>"; continue; }
    if (inList) { out += "</ul>"; inList = false; }
    const h = line.match(/^#{1,4}\s+(.*)/);
    if (h) out += "<h3>" + inline(h[1]) + "</h3>"; else if (line.trim()) out += "<p>" + inline(line) + "</p>";
  }
  return inList ? out + "</ul>" : out;
}
export function toast(msg, act?) {
  const el = document.createElement("div"); el.className = "toast";
  const t = document.createElement("span"); t.textContent = msg; el.append(t);
  if (act) { const b = document.createElement("button"); b.type = "button"; b.textContent = act.label; b.addEventListener("click", () => { el.remove(); act.fn(); }); el.append(b); }
  $("#toasts").append(el); setTimeout(() => el.remove(), act ? 7000 : 4200);
}
export function autosize(ta) { if (!ta) return; ta.style.height = "auto"; ta.style.height = Math.min(180, ta.scrollHeight) + "px"; }
export function trimBody(s) {
  let t = clean(s).replace(/https?:\/\/\S+/g, "[link]");
  const cut = t.search(/\n(On .{6,120} wrote:|-{2,}\s*Original Message|From: .+\nSent: )/); if (cut > 0) t = t.slice(0, cut);
  t = t.split("\n").filter(l => !/^\s*>/.test(l)).join("\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  return t.length > 1400 ? t.slice(0, 1400) + " …" : t;
}
export function reconcile(box, items) {
  // keyed children: replace only what changed, never yank a field you're typing in
  const typingIn = el => el.contains(document.activeElement) && document.activeElement.matches("input,textarea,select");
  const cur = [...box.children];
  const same = cur.length === items.length && cur.every((el, i) => el.dataset.key === items[i].key);
  if (same) {
    items.forEach((it, i) => { const el = cur[i]; if (el.dataset.sig === it.sig || typingIn(el)) return; const n = frag(it.html); (n as any).dataset.sig = it.sig; el.replaceWith(n); });
    return;
  }
  const byKey = new Map(cur.map(el => [el.dataset.key, el]));
  const next = items.map(it => { const old = byKey.get(it.key); if (old && (old.dataset.sig === it.sig || typingIn(old))) return old; const n = frag(it.html); (n as any).dataset.sig = it.sig; return n; });
  const keep = new Set(next);
  for (const el of cur) if (!keep.has(el)) el.remove();
  next.forEach((el, i) => { if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null); });
}
export function frag(html) { const t = document.createElement("template"); t.innerHTML = String(html).trim(); return t.content.firstElementChild; }
export const byteLen = s => { try { return new TextEncoder().encode(String(s)).length; } catch { return String(s).length * 3; } };
// the room's hand-offs are capped in UTF-8 bytes: shorten the longest text fields until the JSON fits
export function fitBytes(obj, max = 3600) {
  const o = JSON.parse(JSON.stringify(obj));
  for (let i = 0; i < 60 && byteLen(JSON.stringify(o)) > max; i++) {
    let key = null, len = 0;
    for (const [k, v] of Object.entries(o)) if (typeof v === "string" && k !== "label" && v.length > len) { key = k; len = v.length; }
    if (!key || len < 24) break;
    o[key] = o[key].slice(0, Math.floor(len * 0.8)).trimEnd() + "…";
  }
  return o;
}
// keep a local copy in step with a write we just made, so the screen never waits on the next snapshot
export function upsertLocal(list, id, fields) { const i = list.findIndex(x => x.id === id); if (i >= 0) list[i] = { ...list[i], ...clone(fields) }; else list.push({ id, ...clone(fields) }); }
// tool argument names, for people: ids are shown as codes, other keys as words
export const isIdKey = k => /(^id$|Id$|_id$|^calendarId$)/.test(k);
export const humanKey = k => String(k).replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());
