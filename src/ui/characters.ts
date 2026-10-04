import { ACCS, ACC_SVG, EYES, SHAPES } from "../core/constants";
import { hashStr, hueOf } from "../core/helpers";
import { S, cloudOn, isDue } from "../core/state";
import { cloudFiringFor } from "../features/cloud";

/* ═════════ characters ═════════ */
export function lookOf(x) {
  const l = (x && typeof x.look === "object" && x.look) || {}, h = hashStr(x?.id || x?.key || x?.name || "dot");
  return { shape: SHAPES.includes(l.shape) ? l.shape : SHAPES[h % 4], eyes: EYES.includes(l.eyes) ? l.eyes : ["round", "wide", "happy", "round"][(h >> 3) % 4], acc: ACCS.includes(l.acc) ? l.acc : ["none", "glasses", "none", "headphones", "none", "antenna"][(h >> 6) % 6] };
}
export function avatarHtml(x, o = {}) {
  const lk = lookOf(x), s = (o as any).size || 40, bd = ((hashStr(x?.id || x?.key || x?.name || "") % 64) / 10).toFixed(1);
  const cls = ["av", (o as any).state || ""].join(" ").trim();
  return `<span class="${cls}" style="--h:${hueOf(x)};--s:${s}px;--bd:-${bd}s" data-shape="${lk.shape}" data-eyes="${lk.eyes}" data-acc="${lk.acc}" aria-hidden="true"><span class="body"></span><span class="ring"></span><i class="sat"></i><span class="eyes"><span class="eye"></span><span class="eye"></span></span><span class="mouth"></span>${lk.acc !== "none" ? `<svg class="acc" viewBox="0 0 100 100">${ACC_SVG[lk.acc]}</svg>` : ""}<span class="zz">z</span>${(o as any).badge ? `<span class="badge">${(o as any).badge}</span>` : ""}</span>`;
}
export function stateOf(d) {
  const c = [], running = S.running?.dotId === d.id, chatting = S.chat?.dotId === d.id;
  if (running || chatting) c.push("live");
  if ((running && S.running.text) || (chatting && S.chat.text)) c.push("talk");
  if (cloudOn(d)) c.push("cloud");
  if (!running && !chatting && !isDue(d) && !cloudFiringFor(d)) c.push("rest");
  return c.join(" ");
}
