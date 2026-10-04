import { $, clean, cssKey, esc } from "../core/helpers";
import { S } from "../core/state";

/* Questions: when the right move depends on something only you know, a dot asks instead of guessing.
   A question is an ask (kind "question") with 2-5 short choices and, optionally, room for your own words.
   Your answer goes straight back to the dot: it carries on at once when Claude is here (ai/flow.ts carryOn),
   otherwise on its next wake, here or in the cloud (config/runbook.md reads answers the same way). */
export type Choice = { id: string; label: string };
export type Question = { choices: Choice[]; allowText: boolean };

// a question as stored (by this page or a cloud wake), cleaned: unique short choices, at most five;
// with fewer than two real choices, your own words are the way to answer
export function questionOf(a): Question {
  const raw = Array.isArray(a?.question?.choices) ? a.question.choices : [];
  const labels = new Set<string>(), ids = new Set<string>(), choices: Choice[] = [];
  raw.forEach((c, i) => {
    if (choices.length >= 5) return;
    const label = clean(typeof c === "string" ? c : c?.label).replace(/\s+/g, " ").trim().slice(0, 80);
    if (!label || labels.has(label.toLowerCase())) return;
    let id = clean(typeof c === "object" && c?.id ? String(c.id) : "").replace(/[^\w-]/g, "").slice(0, 24) || "c" + (i + 1);
    while (ids.has(id)) id += "x";
    labels.add(label.toLowerCase()); ids.add(id); choices.push({ id, label });
  });
  const real = choices.length >= 2 ? choices : [];
  return { choices: real, allowText: !!a?.question?.allowText || !real.length };
}

// what a dot's ask_owner call becomes
export function newQuestion(i, d, runId) {
  const title = clean(i?.question || i?.title).replace(/\s+/g, " ").trim().slice(0, 160);
  const q = questionOf({ question: { choices: i?.choices, allowText: i?.allowText } });
  if (!title) return null;
  return { type: "action", source: "page", dotId: d.id, runId, state: "pending", createdAt: Date.now(), kind: "question", title, why: clean(i?.why).slice(0, 400), question: q };
}

export function questionPlan(a) {
  const q = questionOf(a), id = esc(a.id), busy = !!S.busy[a.id], d = S.dots.find(x => x.id === a.dotId);
  const btns = q.choices.map(c => `<button type="button" class="btn sm choice" data-act="answer" data-id="${id}" data-choice="${esc(c.id)}" ${busy ? "disabled" : ""}>${esc(c.label)}</button>`).join("");
  const own = q.allowText ? `<div class="q-own"><label class="sr" for="qa-${id}">Your answer</label><input type="text" id="qa-${id}" data-edit="answer" data-id="${id}" maxlength="300" value="${esc(S.edits[a.id]?.answer || "")}" placeholder="${q.choices.length ? "Or say it your way…" : "Your answer…"}" ${busy ? "disabled" : ""}><button type="button" class="btn sm" data-act="answer" data-id="${id}" data-choice="own" ${busy ? "disabled" : ""}>Answer</button></div>` : "";
  return `<div class="plan q-plan">${btns ? `<div class="q-choices">${btns}</div>` : ""}${own}<p class="fine">Your answer goes back to ${esc(d?.name || "the dot")}. Nothing else happens.</p></div>`;
}

// the answer you chose or typed, or "" (and the text box gets focus) when there's nothing to send yet
export function answerText(a, choiceId): string {
  const q = questionOf(a);
  if (choiceId === "own") {
    const t = clean(S.edits[a.id]?.answer || "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (!t) $(`#qa-${cssKey(a.id)}`)?.focus();
    return t;
  }
  return q.choices.find(c => c.id === choiceId)?.label || "";
}

// answers a dot hasn't acted on yet, newest first: they go into its next wake
export const openAnswers = d => S.actions
  .filter(a => a.dotId === d.id && a.kind === "question" && a.state === "done" && a.answer?.text && !a.continuedAt)
  .sort((x, y) => (y.answer.at || 0) - (x.answer.at || 0)).slice(0, 5);
