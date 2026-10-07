import { FIX, SRV, TZ } from "../core/constants";
import { diag } from "../core/diag";
import { clean, plural } from "../core/helpers";
import { NS, S, connPerm } from "../core/state";
import { jobTitle } from "./jobs";

/* ─── what Claude runs for you ───
   The super atom can say what Claude is doing for you on a schedule: your scheduled tasks (routines), Atoms' own and
   any you made elsewhere. For each it sees whether a run is going now, how the last one ended and when the next one
   starts. It reads them with list_triggers, which Atoms already has for "Keep it awake", so there's nothing new to
   allow. It gets their names and times only, never their instructions. Sessions you open yourself, in Claude Code or
   on claude.ai, aren't visible to a page at all, so it says where to find them instead. */

export const SESSIONS_URL = "https://claude.ai/code";
// the scheduler calls a run's session cse_<id>; the same session opens at claude.ai/code/session_<id>
export const sessionUrl = (id): string | null => { const m = /^(?:cse|session)_([A-Za-z0-9]{8,64})$/.exec(String(id || "")); return m ? `${SESSIONS_URL}/session_${m[1]}` : null; };

// a time the way you'd say it, in your time zone: "today 08:45", "yesterday 20:59", "Mon 5 Oct 09:13"
const ymd = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: TZ });
export function whenSaid(t: number, now = Date.now()) {
  const hm = new Date(t).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }), k = ymd(t);
  if (k === ymd(now)) return `today ${hm}`;
  if (k === ymd(now - 864e5)) return `yesterday ${hm}`;
  if (k === ymd(now + 864e5)) return `tomorrow ${hm}`;
  return `${new Date(t).toLocaleDateString("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" })} ${hm}`;
}

type Run = { running: boolean; result: string; fired: number | null; ended: number | null; link: string | null; why: string | null };
const ENDED: Record<string, string> = { SUCCEEDED: "finished", FAILED: "failed", CANCELLED: "stopped", CANCELED: "stopped", TIMED_OUT: "ran out of time" };
/* a routine's latest run. No end and no final status means it's going now; a run that started over a day ago and never
   reported an end isn't counted as running. */
export function lastRunOf(lr, now = Date.now()): Run | null {
  if (!lr || typeof lr !== "object") return null;
  const st = String(lr.status || "").replace(/^ROUTINE_RUN_STATUS_/, "").toUpperCase();
  // an end time before the start (a zero time, for a run still going) means no end yet
  const fired = Date.parse(lr.fired_at) || null, e = Date.parse(lr.finished_at) || 0, ended = e > 946684800000 && (!fired || e >= fired) ? e : null;
  if (!fired && !ended) return null;
  const unended = !ended && !ENDED[st] && !/FAIL|ERROR/.test(st);
  const running = unended && !!fired && now - fired < 864e5;
  const reason = String(lr.failure_reason || "").replace(/^ROUTINE_RUN_FAILURE_REASON_/, "");
  return {
    running, fired, ended, link: sessionUrl(lr.session_id),
    result: running ? "running now" : unended ? "no end recorded" : ENDED[st] || (st ? st.toLowerCase().replace(/_/g, " ") : "finished"),
    why: reason && reason !== "UNSPECIFIED" ? reason.toLowerCase().replace(/_/g, " ") : null,
  };
}

// an Atoms routine is named after its atom and job, whatever the routine itself is called
function taskName(t) {
  const d = S.dots.find(x => x.cloud?.triggerId === t.id);
  if (d) return `${clean(d.name)}'s main job`;
  const j = S.jobs.find(x => x.cloud?.triggerId === t.id);
  if (j) return `${clean(S.dots.find(x => x.id === j.dotId)?.name || "An atom")}'s job “${jobTitle(j)}”`;
  return clean(t.name).replace(/\s+/g, " ").slice(0, 80) || "A scheduled task";
}

export async function claudeRuns(now = Date.now()) {
  const r = await NS.mcp.callTool(SRV.cloud, "list_triggers", { limit: 100 }, { cache: { staleTime: 15000 } });
  const list: any[] = Array.isArray((r?.payload as any)?.data) ? (r.payload as any).data : [];
  const rows = list.filter(t => t && typeof t.id === "string").map(t => ({
    task: taskName(t), on: !!t.enabled && !t.ended_reason, once: !!t.run_once_at, last: lastRunOf(t.last_run, now), next: Date.parse(t.next_run_at) || null,
  }));
  const endOf = (x: Run) => x.ended || x.fired || 0, open = (x: Run) => (x.link ? { open: x.link } : {});
  return {
    checked: whenSaid(now, now), total: rows.length,
    runningNow: rows.filter(x => x.last?.running).map(x => ({ task: x.task, since: whenSaid(x.last.fired, now), ...open(x.last) })),
    // the latest run of each task that's on, and of any that ran in the last 3 days, newest first
    lastRuns: rows.filter(x => x.last && !x.last.running && (x.on || now - endOf(x.last) < 3 * 864e5)).sort((a, b) => endOf(b.last) - endOf(a.last)).slice(0, 12)
      .map(x => ({ task: x.task, result: x.last.result, at: whenSaid(endOf(x.last), now), ...(x.last.why ? { why: x.last.why } : {}), ...open(x.last) })),
    next: rows.filter(x => x.on && x.next && x.next > now - 6e4).sort((a, b) => a.next - b.next).slice(0, 6).map(x => ({ task: x.task, at: whenSaid(x.next, now) })),
    off: rows.filter(x => !x.on && !x.once).map(x => x.task).slice(0, 10),
    cantSee: `Sessions the owner opened themselves, in Claude Code or on claude.ai. They're listed at ${SESSIONS_URL}.`,
  };
}

const canSee = () => !!NS.mcp && connPerm(SRV.cloud) !== "denied";
/* the super atom, in chat */
export function runsTools(live, repaint: () => void) {
  if (!canSee()) return [];
  return [{
    name: "claude_runs",
    description: `See the owner's scheduled tasks in Claude (routines): Atoms' own and any others they made. For each: whether a run is going now, how its last run ended, and when it runs next, with a link to open each run. Use it when the owner asks what Claude is doing or running, or whether a schedule worked. It can't see sessions the owner opens themselves in Claude Code or on claude.ai: say so, and point them to ${SESSIONS_URL}. Returns {checked, total, runningNow:[{task,since,open}], lastRuns:[{task,result,at,why,open}], next:[{task,at}], off:[task], cantSee}.`,
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const s = { label: "Looking at your scheduled tasks in Claude", state: "wait" }; live.steps.push(s); repaint();
      try {
        const r = await claudeRuns();
        s.state = "ok"; s.label = `Saw ${plural(r.total, "scheduled task")}, ${r.runningNow.length ? `${r.runningNow.length} running now` : "none running now"}`; repaint();
        return r;
      } catch (e) {
        diag("runs.list", e); const fix = FIX[e?.code];
        s.state = "bad"; s.label += fix ? ` · ${fix}` : " · didn't work"; repaint();
        throw new Error(fix ? `Couldn't read them: ${fix}.` : "Couldn't read the owner's scheduled tasks this time.");
      }
    },
  }];
}
// what the super atom is told in chat about Claude's runs and sessions
export const runsLine = (withTools: boolean) => withTools && canSee()
  ? `You can also see the owner's scheduled tasks in Claude, Atoms' and their own, with claude_runs: what's running now, how each last run ended, and what runs next. You can't see sessions the owner opens themselves in Claude Code or on claude.ai. For those, send them to ${SESSIONS_URL}.\n`
  : `You can't see the owner's Claude sessions or scheduled tasks from here. They're listed at ${SESSIONS_URL}.\n`;
