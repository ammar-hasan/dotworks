import { ACCS, ACC_SVG, EYES, SHAPES } from "../core/constants";
import { hashStr, hueOf } from "../core/helpers";
import { S, awake, isDue } from "../core/state";
import { cloudFiringFor } from "../features/cloud";

/* ═════════ characters ═════════ */
export function lookOf(x) {
  const l = (x && typeof x.look === "object" && x.look) || {}, h = hashStr(x?.id || x?.key || x?.name || "dot");
  return { shape: SHAPES.includes(l.shape) ? l.shape : SHAPES[h % 4], eyes: EYES.includes(l.eyes) ? l.eyes : ["round", "wide", "happy", "round"][(h >> 3) % 4], acc: ACCS.includes(l.acc) ? l.acc : ["none", "glasses", "none", "headphones", "none", "antenna"][(h >> 6) % 6], ...(LEAD_ORBITS.includes(l.orbits) ? { orbits: l.orbits } : {}) };
}
/* An atom: a soft round body with a face (catchlit eyes that follow you, blush, a small smile) and one electron
   on a tilted orbit. The electron shows its energy: lazy when it's resting, quick while it's awake, cloud-blue
   when it wakes on its own schedule. Small avatars (under 26px) keep just the face.
   The super atom (role "lead") carries more electrons: three orbits by default ("three"), or three electrons
   chasing round one ring ("ring"), or two crossed orbits ("two"). */
export const LEAD_ORBITS = ["three", "ring", "two"];
export const isLead = x => x?.role === "lead";
export function avatarHtml(x, o = {}) {
  const lk = lookOf(x), s = (o as any).size || 40, seed = hashStr(x?.id || x?.key || x?.name || ""), bd = ((seed % 64) / 10).toFixed(1);
  const tilt = -26 + (seed >>> 4) % 53, orb = 6 + (seed >>> 9) % 5;
  const lead = isLead(x), lo = lead ? (LEAD_ORBITS.includes(x?.look?.orbits) ? x.look.orbits : "three") : "";
  const cls = ["av", lead ? "lead" : "", (o as any).state || "", s < 26 ? "tiny" : ""].join(" ").replace(/\s+/g, " ").trim();
  // one orbit, drawn twice (behind and in front of the body); the super atom has two or three
  const n = lo === "two" ? 2 : lead ? 3 : 1, orbit = side => Array.from({ length: n }, (_, k) => `<span class="orbit ${side}${lead ? " o" + k : ""}"><i><b></b></i></span>`).join("");
  return `<span class="${cls}" style="--h:${hueOf(x)};--s:${s}px;--bd:-${bd}s;--tilt:${tilt}deg;--orb:${orb}s" data-shape="${lk.shape}" data-eyes="${lk.eyes}" data-acc="${lk.acc}"${lead ? ` data-orbits="${lo}"` : ""} aria-hidden="true">${orbit("back")}<span class="body"></span><span class="ring"></span><span class="cheeks"></span><span class="eyes"><span class="eye"></span><span class="eye"></span></span><span class="mouth"></span>${lk.acc !== "none" ? `<svg class="acc" viewBox="0 0 100 100">${ACC_SVG[lk.acc]}</svg>` : ""}${orbit("front")}<span class="zz">z</span>${(o as any).badge ? `<span class="badge">${(o as any).badge}</span>` : ""}</span>`;
}
export function stateOf(d) {
  const c = [], running = S.running?.dotId === d.id, chatting = S.chat?.dotId === d.id;
  if (running || chatting) c.push("live");
  if ((running && S.running.text) || (chatting && S.chat.text)) c.push("talk");
  if (S.speaking === d.id) c.push("live", "talk");
  if (awake(d)) c.push("cloud");
  if (!running && !chatting && !isDue(d) && !cloudFiringFor(d)) c.push("rest");
  // a little hop right after you approve or answer something it asked
  if (S.cheer?.[d.id] && Date.now() - S.cheer[d.id] < 1500) c.push("cheer");
  return c.join(" ");
}
