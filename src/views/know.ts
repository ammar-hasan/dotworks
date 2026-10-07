import { $, clean, cssKey, esc, fmtDay, plural } from "../core/helpers";
import { S, curDot } from "../core/state";
import { attentionHtml, attentionOf, heldAsks, leadOf, unreadDots, waitingUnits } from "../features/attention";
import { MEM_KINDS, atomName, candidateMem, confirmedMem, memText } from "../features/memory";

/* ─── the super atom's You tab: what it knows about you, and your attention budget ───
   Suggestions wait at the top for your yes; everything kept is grouped below, each with where it came from, and
   Pin (it always reaches your atoms first), Edit and Forget (deleted for good). */
const SOURCE = { "you-said": "you said", "you-did": "learned from what you did", "it-read": "from something it read" };
const scopeLabel = m => (m.scope === "all" ? "for all your atoms" : `for ${atomName(m.scope)}`);

export function paintKnow(force = false) {
  const box = $("#know"), d = curDot(), lead = leadOf(); if (!box || !d || !lead || d.id !== lead.id) return;
  // never wipe what you're typing: wait until you leave the field (choices in a select repaint at once)
  const act = document.activeElement as any;
  if (!force && box.contains(act) && act?.matches?.("input[type=text],input:not([type]),textarea")) return;
  const cands = candidateMem(), conf = confirmedMem(), no = S.memory.filter(m => m.status === "rejected");
  const sig = JSON.stringify([S.memory, Object.keys(S.knowEdit), S.knowOpen, S.memoryLoaded, attentionOf(lead), S.pings, waitingUnits(), heldAsks().length, unreadDots().length, S.dots.map(x => [x.id, x.name]), S.actions.filter(a => a.memoryId).map(a => [a.id, a.state, a.why]), lead.name, Math.floor(Date.now() / 60000)]);
  if (box.dataset.sig === sig) return;
  const addVal = ($("#knowIn") as any)?.value || "";
  const nm = esc(lead.name), groups = Object.entries(MEM_KINDS).map(([k, title]) => [title, conf.filter(m => (m.kind || "preference") === k)] as [string, any[]]).filter(([, l]) => l.length);
  const others = S.dots.filter(x => x.id !== lead.id);
  box.innerHTML = `<div class="know">
    <header class="know-h"><h3>What I know about you</h3><p class="note">Your atoms use this to work the way you like. Only you can see it, and you can change or forget anything, any time.</p></header>
    ${cands.length ? `<section class="card know-sug"><span class="eyebrow">Is this right? · ${cands.length}</span><ul class="mem-list">${cands.map(candRow).join("")}</ul><p class="fine">I noticed these in what you did. Nothing is used until you say yes.</p></section>` : ""}
    <form class="know-add" id="knowAdd" autocomplete="off"><label class="sr" for="knowIn">Something to remember</label><input type="text" id="knowIn" maxlength="200" placeholder="Tell me something to remember…" value="${esc(addVal)}">
      <div class="row"><label class="sr" for="knowKind">Kind</label><select id="knowKind">${Object.entries(MEM_KINDS).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join("")}</select>${others.length ? `<label class="sr" for="knowScope">For</label><select id="knowScope"><option value="all">For all my atoms</option>${others.map(x => `<option value="${esc(x.id)}">Only for ${esc(x.name)}</option>`).join("")}</select>` : ""}<button class="btn pri sm" type="submit">Remember</button></div></form>
    ${groups.map(([title, list]) => `<section class="mem-group"><h4>${esc(title)}</h4><ul class="mem-list">${list.sort((a, b) => (+!!b.pinned - +!!a.pinned) || ((b.confirmedAt || 0) - (a.confirmedAt || 0))).map(row).join("")}</ul></section>`).join("")}
    ${!conf.length && !cands.length ? `<p class="calm">${S.memoryLoaded ? `Nothing yet. Tell me something about how you work, here or in Chat, like “I don't take meetings before 10”. I also notice patterns in what you do with asks, and I always check with you before I keep anything.` : "…"}</p>` : ""}
    ${no.length ? `<p class="fine">You said no to ${plural(no.length, "suggestion")}, so I won't suggest ${no.length === 1 ? "it" : "them"} again. <button type="button" class="link" data-act="mem-clear-no">Clear ${no.length === 1 ? "it" : "them"}</button></p>` : ""}
    <section class="card attn">${attentionHtml(lead)}</section>
  </div>`;
  box.dataset.sig = sig;
  function candRow(m) {
    const q = m.askId ? S.actions.find(a => a.id === m.askId) : null, id = esc(m.id);
    const btns = [["keep", "Yes, keep it"], ...(m.scope !== "all" ? [["all", "Yes, for all atoms"]] : []), ["no", "No"]].map(([c, l], i) => `<button type="button" class="btn sm ${i === 0 ? "choice" : "ghost"}" data-act="mem-answer" data-id="${id}" data-choice="${c}">${esc(l)}</button>`).join("");
    return `<li class="mem cand" data-key="${id}"><div class="mem-t"><b>${esc(memText(m.text))}</b><small>${esc(clean(q?.why || "").slice(0, 200) || "From what you did in Atoms")} · ${esc(scopeLabel(m))}</small></div><div class="mem-b">${btns}</div></li>`;
  }
  function row(m) {
    const id = esc(m.id), k = cssKey(m.id), editing = m.id in S.knowEdit;
    const meta = [SOURCE[m.source] || "", scopeLabel(m), fmtDay(m.confirmedAt || m.createdAt || Date.now()), m.pinned ? "pinned" : "", m.private ? `only ${lead.name} uses it` : ""].filter(Boolean).join(" · ");
    const body = editing ? `<label class="sr" for="me-${k}">Change it</label><textarea id="me-${k}" data-memedit="${id}" maxlength="200">${esc(S.knowEdit[m.id])}</textarea>` : `<span>${esc(memText(m.text))}</span>`;
    const btns = editing
      ? `<label class="check"><input type="checkbox" data-memprivate="${id}" ${m.private ? "checked" : ""}> Only ${nm} uses it</label><button type="button" class="btn sm" data-act="mem-save" data-id="${id}">Save</button><button type="button" class="btn ghost sm" data-act="mem-cancel" data-id="${id}">Cancel</button>`
      : `<button type="button" class="btn ghost sm" data-act="mem-pin" data-id="${id}" aria-pressed="${!!m.pinned}" title="Pinned ones always reach your atoms first">${m.pinned ? "Unpin" : "Pin"}</button><button type="button" class="btn ghost sm" data-act="mem-edit" data-id="${id}">Edit</button><button type="button" class="btn ghost sm danger" data-act="mem-forget" data-id="${id}">Forget</button>`;
    const confirm = S.knowOpen["rm:" + m.id] ? `<div class="confirm" style="margin:6px 0 0"><span>Forget this? It's deleted for good, along with where your asks quoted it.</span><button type="button" class="btn danger sm" data-act="mem-forget-yes" data-id="${id}">Forget</button><button type="button" class="btn ghost sm" data-act="mem-forget-no" data-id="${id}">Keep it</button></div>` : "";
    return `<li class="mem${m.pinned ? " pinned" : ""}" data-key="${id}"><div class="mem-t">${body}<small>${esc(meta)}</small></div><div class="mem-b">${btns}</div>${confirm}</li>`;
  }
}
