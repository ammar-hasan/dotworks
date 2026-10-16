import { ICON } from "../core/constants";
import { $, ago, esc, fmtWhen, hueOf, md, plural } from "../core/helpers";
import { S, lastAt, pending } from "../core/state";
import { catchQueue, loadCatchNotes } from "../features/catchup";
import { jobTitle } from "../features/jobs";
import { avatarHtml } from "../ui/characters";

/* ─── the Catch up page: one card at a time, like Slack's catch up ─── */
const SHOW = 3;
function noteHtml(r) {
  const job = r.jobId ? S.jobs.find(j => j.id === r.jobId) : null;
  const meta = [job ? jobTitle(job) : r.jobId ? "a job" : "", fmtWhen(r.startedAt), r.source === "cloud" ? "in the cloud" : "here", r.status === "failed" ? "didn't finish" : ""].filter(Boolean).join(" · ");
  return `<section class="cu-note"><p class="cu-meta">${esc(meta)}</p>${r.text ? `<div class="letter cu-letter">${md(r.text)}</div>` : `<p class="fine">It left no note.</p>`}</section>`;
}
function cardHtml(d, total: number) {
  const c = S.cuNotes[d.id], notes = c?.notes || [], asks = pending().filter(a => a.dotId === d.id).length, id = esc(d.id);
  const body = !c || (c.loading && !notes.length) ? `<p class="calm">Opening its notes…</p>`
    : c.err ? `<p class="fine">Couldn't load its notes (${esc(c.err)}). Open its chat to read them.</p>`
    : notes.length ? notes.slice(0, SHOW).map(noteHtml).join("") + (notes.length > SHOW ? `<p class="fine">And ${plural(notes.length - SHOW, "earlier note")} in its chat.</p>` : "")
    : `<p class="fine">It ran ${esc(ago(lastAt(d)))} but left no note.</p>`;
  const n = notes.length || 1;
  return `<article class="cu-card" data-cu="${id}" style="--h:${hueOf(d)}" aria-label="${esc(d.name)}, ${plural(n, "new note")}">
    <span class="cu-tag cu-tag-r" aria-hidden="true">Done</span><span class="cu-tag cu-tag-l" aria-hidden="true">Later</span>
    <header class="cu-h">${avatarHtml(d, { size: 44 })}<div class="cu-who"><strong>${esc(d.name)}</strong><span>${plural(n, "new note")} · ${esc(ago(lastAt(d)))}</span></div><span class="cu-pos">${total} left</span></header>
    <div class="cu-body">${body}</div>
    ${asks ? `<p class="cu-asks">${plural(asks, "ask")} from ${esc(d.name)} ${asks === 1 ? "waits" : "wait"} for you. <button type="button" class="link" data-nav="asks">Review ${asks === 1 ? "it" : "them"}</button></p>` : ""}
    <footer class="cu-f">
      <button type="button" class="btn ghost" data-act="cu-later" data-id="${id}" title="Keep it unread for now (←)">Later</button>
      <button type="button" class="btn ghost" data-act="cu-open" data-id="${id}">Open chat</button>
      <button type="button" class="btn pri" data-act="cu-done" data-id="${id}" title="Mark read (→)">Done</button>
    </footer>
  </article>`;
}
export function paintCatchup() {
  const box = $("#cu"); if (!box) return;
  if (S.cuDrag) return; // never repaint under a finger
  const { now, later } = catchQueue(), d = now[0], total = now.length + later.length;
  if (d) { loadCatchNotes(d); if (now[1]) loadCatchNotes(now[1]); }
  const title = d ? `${plural(total, "atom")} to catch up on` : later.length ? `${plural(later.length, "atom")} kept for later` : "You're all caught up";
  const sig = JSON.stringify([title, d?.id, d && S.cuNotes[d.id], now.length, later.map(x => x.id), d ? pending().filter(a => a.dotId === d.id).length : 0, Math.floor(Date.now() / 60000)]);
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  const T = $("#cuTitle"); if (T) T.textContent = title;
  let html = "";
  if (d) {
    const behind = Math.min(2, now.length - 1);
    html = `<div class="cu-deck" data-behind="${behind}">${cardHtml(d, total)}</div>
      <p class="cu-hint">Swipe right when you're done, or left to keep it for later.<span class="cu-keys"> On a keyboard: → and ←.</span></p>
      <p class="cu-all"><button type="button" class="link" data-act="cu-all">Mark all ${plural(total, "atom")} read</button></p>`;
  } else if (later.length) {
    html = `<div class="cu-end"><div class="cu-faces">${later.slice(0, 6).map(x => avatarHtml(x, { size: 36 })).join("")}</div>
      <p>${later.map(x => esc(x.name)).join(", ")} ${later.length === 1 ? "is" : "are"} still unread.</p>
      <div class="row"><button type="button" class="btn pri" data-act="cu-again">Go through ${later.length === 1 ? "it" : "them"} again</button><button type="button" class="btn ghost" data-act="cu-all">Mark ${later.length === 1 ? "it" : "all"} read</button></div></div>`;
  } else {
    html = `<div class="cu-end"><span class="cu-done-mark" aria-hidden="true">${ICON.check || ""}</span><p>New notes from your atoms land here as they come in.</p>
      <div class="row"><button type="button" class="btn ghost" data-nav="home">Back home</button></div></div>`;
  }
  box.innerHTML = html;
}
