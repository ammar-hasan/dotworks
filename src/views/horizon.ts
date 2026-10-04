import { FIX, SRV, TZ } from "../core/constants";
import { diag } from "../core/diag";
import { $, ago, clamp, clean, esc, fmtTime, pad, plural, span } from "../core/helpers";
import { NS, S, connPerm } from "../core/state";
import { paintHome } from "./home";

/* ─── horizon: your day, live from Calendar (watchTool) ─── */
export function startDay() {
  if (!NS.mcp || !S.uid || !NS.permissions) { renderHorizon(); return; }
  if (connPerm(SRV.cal) === "granted") watchDay(); else renderHorizon();
}
export function watchDay() {
  if (!NS.mcp) return;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const key = start.toDateString();
  if (S.dayUnsub && S.dayKey === key) return;
  if (S.dayUnsub) { S.dayUnsub(); S.dayUnsub = null; }
  S.dayKey = key;
  const end = new Date(start); end.setDate(end.getDate() + 1); end.setHours(8, 0, 0, 0);
  try {
    S.dayUnsub = NS.mcp.watchTool(SRV.cal, "list_events", { startTime: start.toISOString(), endTime: end.toISOString(), orderBy: "startTime", pageSize: 60, timeZone: TZ }, ev => {
      if (ev.type === "data") {
        const evs = ((ev.result?.payload as any)?.events || []).filter(e => e?.start?.dateTime && e.status !== "cancelled" && e.eventType !== "WORKING_LOCATION").map(e => {
          const me = (e.attendees || []).find(a => a.self);
          return { id: e.id, title: clean(e.summary || "(no title)").slice(0, 120), start: Date.parse(e.start.dateTime), end: Date.parse(e.end?.dateTime || e.start.dateTime), mine: me?.responseStatus || "accepted", people: (e.attendees || []).length, link: e.htmlLink || null, type: e.eventType || "DEFAULT" };
        }).filter(e => Number.isFinite(e.start) && Number.isFinite(e.end));
        S.day = { events: evs, storedAt: ev.result?.cache?.storedAt || Date.now() }; S.dayErr = null;
      } else { const c = ev.error?.code; diag("calendar.watch", ev.error); if (FIX[c]) { S.day = null; S.dayErr = c; } }
      renderHorizon(); if (S.view === "home") paintHome();
    }, { refetchInterval: 300000 });
  } catch (e) { diag("calendar.watch", e); }
  renderHorizon();
}
export function nextEvent() {
  const now = Date.now(), evs = S.day?.events || [];
  const cur = evs.find(e => e.start <= now && e.end > now && e.mine !== "declined"); if (cur) return { ev: cur, now: true };
  const nx = evs.find(e => e.start > now && e.mine !== "declined"); return nx ? { ev: nx, now: false } : null;
}
export function renderHorizon() {
  const hz = $("#horizon"); if (!hz) return;
  // the day strip is a Google Calendar feature: hidden for anyone whose copy has no Calendar
  if (!(S.booted && S.uid && NS.mcp) || (S.connLoaded && !S.conn[SRV.cal])) { hz.innerHTML = ""; return; }
  const p = connPerm(SRV.cal);
  let head = "", track = `<div class="hz-line"></div>`;
  if (!S.day) {
    const cap = S.dayErr ? `Calendar can't be read: ${esc(FIX[S.dayErr] || "try again later")}.`
      : p === "denied" ? `Calendar is off for this page. <button class="link" data-act="perms">Manage access</button>`
      : p === "unavailable" ? "Calendar isn't available here."
      : S.dayUnsub ? "Reading your calendar…"
      : `<button class="link" data-act="allow-day">Show my day on the horizon</button> <span class="fine">· reads Google Calendar</span>`;
    head = `<span class="eyebrow">Your day</span><span class="hz-cap">${cap}</span>`;
  } else {
    const now = Date.now(), w0 = now - 1.5 * 3600e3, w1 = now + 10.5 * 3600e3, sp = w1 - w0, pct = t => ((clamp(t, w0, w1) - w0) / sp) * 100;
    const narrow = (hz.clientWidth || 800) < 520, step = narrow ? 3 : 2, ticks = [];
    const t0 = new Date(w0); t0.setMinutes(0, 0, 0); t0.setHours(t0.getHours() + 1);
    for (let t = +t0; t < w1; t += 3600e3) if (new Date(t).getHours() % step === 0) ticks.push(t);
    const evs = S.day.events.filter(e => e.end > w0 && e.start < w1), lanes = [];
    const placed = evs.map(e => { let lane = lanes.findIndex(end => end <= e.start); if (lane < 0) { lane = lanes.length; lanes.push(0); } lanes[lane] = e.end; return { e, lane: Math.min(lane, 2) }; });
    const sel = S.hzSel && S.day.events.find(e => e.id === S.hzSel);
    let cap;
    if (sel) cap = `<b>${esc(sel.title)}</b> · ${fmtTime(sel.start)}–${fmtTime(sel.end)}${sel.people ? ` · ${plural(sel.people, "person", "people")}` : ""}${sel.mine === "needsAction" ? ` · <span style="color:var(--warn)">you haven't replied</span>` : sel.mine === "declined" ? " · declined" : ""}${sel.link ? ` · <a href="${esc(sel.link)}" target="_blank" rel="noopener">open</a>` : ""}`;
    else { const nx = nextEvent(); cap = nx ? (nx.now ? `Now · <b>${esc(nx.ev.title)}</b> until ${fmtTime(nx.ev.end)}` : `Next · <b>${esc(nx.ev.title)}</b> in ${span(nx.ev.start - now)}`) : (S.day.events.length ? "Nothing else on your calendar today." : "A clear day on your calendar."); }
    head = `<span class="eyebrow">Your day</span><span class="hz-cap">${cap}</span><span class="hz-fresh">updated ${ago(S.day.storedAt)}</span>`;
    track += ticks.map(t => `<span class="hz-tick" style="left:${pct(t).toFixed(2)}%"><i></i>${Math.abs(pct(t) - pct(now)) < (narrow ? 11 : 5) ? "" : `<b>${pad(new Date(t).getHours())}:00</b>`}</span>`).join("") +
      placed.map(({ e, lane }) => { const l = pct(e.start), wd = Math.max(.7, pct(e.end) - l); const cls = ["hz-ev", e.mine === "needsAction" ? "needs" : "", e.mine === "declined" ? "declined" : "", e.type === "FOCUS_TIME" ? "focus" : "", e.end < now ? "past" : ""].join(" ");
        return `<button type="button" class="${cls}" style="left:${l.toFixed(2)}%;width:${wd.toFixed(2)}%;--lane:${lane}" data-act="hz-ev" data-id="${esc(e.id)}" aria-pressed="${S.hzSel === e.id}" aria-label="${esc(`${fmtTime(e.start)} to ${fmtTime(e.end)}, ${e.title}`)}"></button>`; }).join("") +
      `<span class="hz-now" style="left:${pct(now).toFixed(2)}%"><b>now</b></span>`;
  }
  const html = `<div class="hz-head">${head}</div><div class="hz-track">${track}</div>`;
  if (hz.innerHTML !== html) hz.innerHTML = html;
}
