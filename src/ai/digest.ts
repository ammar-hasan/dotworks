import { diag } from "../core/diag";
import { clean } from "../core/helpers";
import { NS, S, pending } from "../core/state";
import { renderAll } from "../ui/shell";

/* ═════════ digest ═════════ */
export async function digest(refresh) {
  const notes = S.dots.map(d => ({ d, l: S.latest[d.id] })).filter(x => x.l?.headline);
  if (!notes.length || !NS.sample || S.digestBusy) return;
  S.digestBusy = true; renderAll();
  const lines = notes.map(x => `- ${x.d.name} (${x.l.day}): ${x.l.headline}`).join("\n"), asks = pending().map(a => `- ${a.title}`).slice(0, 8).join("\n");
  try {
    const r = await NS.sample(`These are the latest notes from a person's personal assistant "atoms", and what is waiting for their approval.\n\nNotes:\n${lines}\n\nWaiting:\n${asks || "- nothing"}\n\nWrite ONE plain sentence of at most 22 words telling them what matters most right now. No greeting, no preamble, no quotation marks.`, { modelTier: "quick", cache: refresh ? { gcTime: 3600000, refresh: true } : { gcTime: 3600000 } });
    S.digest = { text: clean(r.text).trim().replace(/^["“]|["”]$/g, "").slice(0, 220) };
  } catch (e) { diag("sample.digest", e); if (["not_granted", "sampling_disabled", "not_declared"].includes(e?.code)) S.digestOff = true; }
  S.digestBusy = false; renderAll();
}
export function maybeDigest() {
  if (S.digest || S.digestTried || S.digestOff || (S.perms as any).sample !== "granted") return;
  if (S.dots.filter(d => S.latest[d.id]?.headline).length < 2) return;
  S.digestTried = true; digest(false);
}
