import { appsAvail } from "../core/apps";
import { diag } from "../core/diag";
import { ago, clean, newId, plural } from "../core/helpers";
import { S, jobsOf, pending } from "../core/state";
import { openDot } from "../ui/nav";
import { ensureReads, leadOf } from "./attention";
import { addJob, jobTitle, taskJob } from "./jobs";

/* ─── the super atom ───
   One per person: an atom with role "lead". It looks across your other atoms and your apps, learns how you like to
   work (features/memory.ts), and guards your attention (features/attention.ts): every few hours it may ping you,
   only within the budget you set. It comes with one job, "Learn from what I do", that reads only what you do and say
   in Atoms. Like every atom it never acts on its own: whatever should change is an ask you approve. */

export const LEAD_JOB = "Every few hours, tell me what's new across my atoms and my apps, but only what's worth my time today. Learn how I like to work from what I tell you and what I do with asks, and keep it on your You tab. Suggest better ways to work: a rule for one of my atoms, a new job, or a new atom.";
export const LEAD_RULES = ["Keep each update to five lines", "Say which atom each thing comes from"];
export const LEARN_TASK = "Look at what I did in Atoms since you last learned: what I approved, what I changed before approving, what I set aside or undid, how I answered questions, and what I told my atoms in chat. Suggest at most 3 things about how I like to work, each for me to confirm.";
export const LEARN_TITLE = "Learn from what I do";

// the form for a new super atom (views/builder.ts); with one already, its page instead
export function leadDraft() {
  return { pid: newId("dot_"), role: "lead", voiceName: "", name: "Friday", responsibility: LEAD_JOB, rulesText: LEAD_RULES.join("\n"), sources: appsAvail().slice(), cadence: "daily", tier: "default", hue: 42, look: { shape: "orb", eyes: "wide", acc: "none", orbits: "three" }, vips: [], repoMode: "none", repoList: [], rev: 0 };
}
export function openExistingLead() { const l = leadOf(); if (l) { openDot(l.id, "know"); return true; } return false; }

// made with the super atom: its learning job (it reads only what you do in Atoms)
export const learnJob = (dotId: string) => ({ ...taskJob(dotId, LEARN_TASK, LEARN_TITLE), learn: true });
export async function afterLeadMade(d) {
  ensureReads();
  if (jobsOf(d).some(j => j.learn)) return;
  try { await addJob(d, learnJob(d.id)); } catch (e) { diag("db.lead.learn", e); }
}

/* what the super atom is told about your other atoms, so it can brief you across them */
export function teamLines(lead) {
  const others = S.dots.filter(x => x.id !== lead.id && !S.gone.has(x.id));
  if (!others.length) return "\nYour team: the owner has no other atoms yet.\n";
  return "\nYour team, the owner's other atoms (what each does, its latest note, and what it has waiting for the owner):\n" + others.map(x => {
    const l = S.latest[x.id], w = pending().filter(a => a.dotId === x.id).length, js = jobsOf(x);
    return `- ${clean(x.name)}: ${clean(x.responsibility).replace(/\s+/g, " ").slice(0, 160)}${js.length ? ` Jobs: ${js.map(jobTitle).join(", ")}.` : ""}${l?.headline ? ` Latest note (${ago(l.at)}): ${clean(l.headline).slice(0, 140)}` : ""}${w ? ` ${plural(w, "ask")} waiting.` : ""}`;
  }).join("\n") + "\n";
}
export const LEAD_SELF = "You are the owner's super atom: the one that looks across all their atoms and apps, learns how they like to work, and guards their attention. You tell them only what is worth their time.";
