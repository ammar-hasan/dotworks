import { ACCS, ACC_SVG, EYES, SHAPES } from "../core/constants";
import { hashStr, hueOf } from "../core/helpers";
import { S, cloudOn, isDue } from "../core/state";
import { cloudFiringFor } from "../features/cloud";

/* ═════════ characters ═════════ */
export function lookOf(x) {
  const l = (x && typeof x.look === "object" && x.look) || {}, h = hashStr(x?.id || x?.key || x?.name || "dot");
  return { shape: SHAPES.includes(l.shape) ? l.shape : SHAPES[h % 4], eyes: EYES.includes(l.eyes) ? l.eyes : ["round", "wide", "happy", "round"][(h >> 3) % 4], acc: ACCS.includes(l.acc) ? l.acc : ["none", "glasses", "none", "headphones", "none", "antenna"][(h >> 6) % 6] };
}
/* An atom: a soft round body with a face (catchlit eyes that follow you, blush, a small smile) and one electron
   on a tilted orbit. The electron shows its energy: lazy when it's resting, quick while it's awake, cloud-blue
   when it wakes on its own schedule. Small avatars (under 26px) keep just the face. */
export function avatarHtml(x, o = {}) {
  const lk = lookOf(x), s = (o as any).size || 40, seed = hashStr(x?.id || x?.key || x?.name || ""), bd = ((seed % 64) / 10).toFixed(1);
  const tilt = -26 + (seed >>> 4) % 53, orb = 6 + (seed >>> 9) % 5;
  const cls = ["av", (o as any).state || "", s < 26 ? "tiny" : ""].join(" ").replace(/\s+/g, " ").trim();
  return `<span class="${cls}" style="--h:${hueOf(x)};--s:${s}px;--bd:-${bd}s;--tilt:${tilt}deg;--orb:${orb}s" data-shape="${lk.shape}" data-eyes="${lk.eyes}" data-acc="${lk.acc}" aria-hidden="true"><span class="orbit back"><i><b></b></i></span><span class="body"></span><span class="ring"></span><span class="cheeks"></span><span class="eyes"><span class="eye"></span><span class="eye"></span></span><span class="mouth"></span>${lk.acc !== "none" ? `<svg class="acc" viewBox="0 0 100 100">${ACC_SVG[lk.acc]}</svg>` : ""}<span class="orbit front"><i><b></b></i></span><span class="zz">z</span>${(o as any).badge ? `<span class="badge">${(o as any).badge}</span>` : ""}</span>`;
}
export function stateOf(d) {
  const c = [], running = S.running?.dotId === d.id, chatting = S.chat?.dotId === d.id;
  if (running || chatting) c.push("live");
  if ((running && S.running.text) || (chatting && S.chat.text)) c.push("talk");
  if (cloudOn(d)) c.push("cloud");
  if (!running && !chatting && !isDue(d) && !cloudFiringFor(d)) c.push("rest");
  // a little hop right after you approve or answer something it asked
  if (S.cheer?.[d.id] && Date.now() - S.cheer[d.id] < 1500) c.push("cheer");
  return c.join(" ");
}
