// Behaviour tests for Dotworks: runs the built page in jsdom against a STRICT mock of the artifact runtime.
// Strictness emulates the 0.2.67 contract: frozen snapshots and namespaces, path grammar, JSON-only bodies,
// update() requires an existing doc, sample option validation, room byte/key caps, gesture-only hand-offs.
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs"), path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "dist", "dotworks.html"), "utf8");
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const clone = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const deepFreeze = o => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
let failures = 0;
const ok = (cond, msg) => { if (cond) console.log("  ✓ " + msg); else { failures++; console.log("  ✗ " + msg); } };
const UID = "u_me000000000000000000000";
const iso = ms => new Date(Date.now() + ms).toISOString();
const SEG = /^(?!\.\.?$)[A-Za-z0-9_\-.~:@+]{1,200}$/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const BAD_CHARS = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u00AD\\u200B-\\u200F\\u2028-\\u202E\\u2060-\\u2064\\uFEFF\\uE000-\\uF8FF]");
const bytes = s => Buffer.byteLength(s, "utf8");

function jsonOnly(v, where) {
  // reject anything a JSON document store would refuse: undefined, functions, NaN, class instances
  const walk = (x, p) => {
    if (x === null || typeof x === "string" || typeof x === "boolean") return;
    if (typeof x === "number") { if (!Number.isFinite(x)) throw { code: "invalid_argument", message: `${where}: non-finite number at ${p}` }; return; }
    if (Array.isArray(x)) { x.forEach((y, i) => walk(y, p + "[" + i + "]")); return; }
    const proto = x && typeof x === "object" ? Object.getPrototypeOf(x) : undefined;
    if (proto === null || (proto && Object.getPrototypeOf(proto) === null && proto.constructor?.name === "Object")) { for (const [k, y] of Object.entries(x)) walk(y, p + "." + k); return; }
    throw { code: "invalid_argument", message: `${where}: non-JSON value (${typeof x}) at ${p}` };
  };
  walk(v, "$");
}
function merge(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) out[k] = merge(out[k], v);
    else out[k] = clone(v);
  }
  return out;
}

function makeDB(opts) {
  const store = new Map(), listeners = new Set(), log = [];
  let echo = opts.slowEcho || 0;
  const notify = () => { const fire = () => { for (const l of [...listeners]) l.fire(); }; if (echo) setTimeout(fire, echo); else queueMicrotask(fire); };
  const segs = p => { const s = p.split("/"); if (!s.every(x => SEG.test(x))) throw new TypeError("bad path segment in " + p); return s; };
  const snap = (p, d) => deepFreeze({ id: p.split("/").pop(), exists: d !== undefined, data: () => (d === undefined ? undefined : deepFreeze(clone(d))), metadata: { fromCache: false, hasPendingWrites: false } });
  const guard = () => { if (opts.dbDown) throw { code: "unavailable", message: "store down" }; };
  function docRef(p) {
    if (segs(p).length % 2) throw new TypeError("doc path needs even segments: " + p);
    return Object.freeze({
      id: p.split("/").pop(), path: p,
      async get() { guard(); return snap(p, store.get(p)); },
      async set(data) { guard(); jsonOnly(data, "set " + p); if (opts.denyWrites) throw { code: "invalid_argument", message: "write refused" }; store.set(p, clone(data)); log.push(["set", p]); notify(); },
      async update(data) { guard(); jsonOnly(data, "update " + p); if (!store.has(p)) throw { code: "invalid_argument", message: "update on missing " + p }; store.set(p, merge(store.get(p), data)); log.push(["update", p]); notify(); },
      async delete() { guard(); store.delete(p); log.push(["delete", p]); notify(); },
      async acquire(o) { if (!o || typeof o.holder !== "string") throw { code: "invalid_argument", message: "holder required" }; return { acquired: true, holder: o.holder }; },
      onSnapshot(next, err) { const l = { fire: () => next(snap(p, store.get(p))) }; listeners.add(l); queueMicrotask(l.fire); return () => listeners.delete(l); },
      collection(sub) { return colRef(p + "/" + sub); },
    });
  }
  function colRef(p, q = { where: [], order: null, lim: null }) {
    if (segs(p).length % 2 === 0) throw new TypeError("collection path needs odd segments: " + p);
    const run = () => {
      let docs = [...store.entries()].filter(([k]) => k.slice(0, k.lastIndexOf("/")) === p).map(([k, d]) => ({ k, d }));
      for (const [f, op, v] of q.where) docs = docs.filter(x => (op === "==" ? x.d[f] === v : true));
      docs.sort((a, b) => (a.k < b.k ? -1 : 1));
      if (q.order) docs.sort((a, b) => ((a.d[q.order[0]] ?? Infinity) - (b.d[q.order[0]] ?? Infinity)) * (q.order[1] === "desc" ? -1 : 1));
      if (q.lim) docs = docs.slice(0, q.lim);
      const ds = docs.map(x => snap(x.k, x.d));
      return deepFreeze({ docs: ds, size: ds.length, empty: !ds.length, docChanges: () => [], metadata: {} });
    };
    return Object.freeze({
      path: p,
      where: (f, op, v) => colRef(p, { ...q, where: [...q.where, [f, op, v]] }),
      orderBy: (f, dir = "asc") => colRef(p, { ...q, order: [f, dir] }),
      limit: n => { if (!(n >= 1 && n <= 1000)) throw new TypeError("limit 1-1000"); return colRef(p, { ...q, lim: n }); },
      async get() { guard(); return run(); },
      onSnapshot(next, err) { const l = { fire: () => next(run()) }; listeners.add(l); queueMicrotask(l.fire); return () => listeners.delete(l); },
      doc: id => docRef(p + "/" + (id || Math.random().toString(36).slice(2))),
      async add(data) { const r = docRef(p + "/" + Math.random().toString(36).slice(2)); await r.set(data); return r; },
    });
  }
  return { store, log, setEcho: ms => { echo = ms; }, api: Object.freeze({ doc: docRef, collection: p => colRef(p) }) };
}

function makeRuntime(opts = {}) {
  const calls = { sample: [], mcp: [], send: [], saves: [], composer: [], presence: [], emits: [], perms: [], uses: [] };
  const flags = {};
  const db = makeDB(opts);
  db.store.set("library/starter", { starter: true, templates: [
    { id: "meeting-prep", name: "Meeting prep", responsibility: "Look at my meetings.", rules: ["Propose RSVPs"], sources: ["calendar", "gmail"], cadence: "daily", tier: "default", hue: 214, look: { shape: "squircle", eyes: "round", acc: "glasses" }, createdAt: 1 },
    { id: "focus-guard", name: "Focus guard", responsibility: "Protect focus time.", rules: [], sources: ["calendar"], cadence: "daily", tier: "quick", hue: 268, look: { shape: "blob", eyes: "happy", acc: "shades" }, createdAt: 2 },
  ] });
  if (!opts.noAppUrl) db.store.set("meta/app", { url: "https://claude.ai/artifact/TestDotworks01" });
  const triggers = [];
  const perms = { sample: "granted", db: "granted", user: "granted", room: "granted", "mcp:Google Calendar": "granted", "mcp:Gmail": "prompt", "mcp:Claude Code Remote": "granted", mcp: "prompt", ...(opts.perms || {}) };
  const checkOpts = o => {
    if (o === undefined) return;
    const pr = o && typeof o === "object" ? Object.getPrototypeOf(o) : undefined;
    if (!(pr === null || (pr && Object.getPrototypeOf(pr) === null && pr.constructor?.name === "Object"))) throw { code: "invalid_request", message: "options must be a plain object" };
    if (o.tools && "cache" in o && o.cache !== false) throw { code: "invalid_request", message: "cache with tools" };
    if ("cache" in o && !(o.cache === true || o.cache === false || (o.cache && typeof o.cache === "object" && (o.cache.gcTime === undefined || o.cache.gcTime > 0)))) throw { code: "invalid_request", message: "bad cache" };
    if (o.modelTier && !["quick", "default", "complex"].includes(o.modelTier)) throw { code: "invalid_request", message: "bad tier" };
    if (o.signal && typeof o.signal.aborted !== "boolean") throw { code: "invalid_request", message: "signal must be an AbortSignal" };
    for (const t of o.tools || []) { if (!/^[A-Za-z0-9_-]{1,128}$/.test(t.name) || !t.description || typeof t.execute !== "function") throw { code: "invalid_request", message: "bad tool " + t.name }; if (t.inputSchema && t.inputSchema.type !== "object") throw { code: "invalid_request", message: "schema" }; }
  };
  const checkInput = input => {
    if (typeof input === "string") { if (!input.trim()) throw { code: "invalid_request", message: "empty" }; return; }
    if (!Array.isArray(input) || !input.length || input[0].role !== "user" || input[input.length - 1].role !== "user") throw { code: "invalid_request", message: "turns must start and end with user" };
    for (const t of input) if (!["user", "assistant"].includes(t.role) || typeof t.content !== "string" || !t.content.trim()) throw { code: "invalid_request", message: "bad turn" };
  };
  const sample = async (input, o) => {
    await tick(1);
    checkInput(input); checkOpts(o); o = o || {};
    calls.sample.push({ input: clone(input), o: { ...o, tools: o.tools ? o.tools.map(t => t.name) : undefined } });
    if (o.tools && opts.noTools) throw { code: "tools_unavailable", message: "no tools here" };
    if (opts.sampleFail) throw { code: opts.sampleFail, message: "nope" };
    const tools = o.tools || [];
    const by = Object.fromEntries(tools.map(t => [t.name, t]));
    const ctx = { signal: o.signal || new AbortController().signal };
    const isWake = typeof input === "string" && /waking for a check-in/.test(input);
    if (isWake) flags.lastWake = input;
    if (isWake && tools.length && opts.ask) {
      flags.askTools = tools.map(t => t.name);
      flags.q1 = await by.ask_owner.execute({ question: "Which reviews should I chase?", choices: ["Pending only", "All open", "pending ONLY"], allowText: true, why: "You have 6 open pull requests" }, ctx);
      try { await by.ask_owner.execute({ question: "And another?", choices: ["a", "b"] }, ctx); flags.secondAsk = "allowed"; } catch (e) { flags.secondAsk = e.message; }
    } else if (isWake && tools.length && by.slack_slack_search_public) {
      flags.slackDesc = by.propose_action.description; flags.slackTools = tools.map(t => t.name);
      if (by.calendar_events) await by.calendar_events.execute({ days: 2 }, ctx);
      await by.slack_slack_search_public.execute({ query: "launch" }, ctx);
      flags.r1 = await by.propose_action.execute({ kind: "action", app: "Slack", tool: "slack_send_message", input: { channel_id: "C1", message: "Launch is Tuesday 10am.", bogus: 1 }, verb: "Post", title: "Answer the launch question", why: "Two people asked" }, ctx);
      flags.r2 = await by.propose_action.execute({ kind: "action", app: "Google Calendar", tool: "update_event", input: { eventId: "e1", description: "Agenda\n1. Status\n2. Risks", notificationLevel: "NONE" }, verb: "Add agenda", title: "Add an agenda to Dashboard review", why: "It has none" }, ctx);
      flags.r3 = await by.propose_action.execute({ kind: "action", app: "Gmail", tool: "create_draft", input: { to: ["a@x.com"], body: "hi" }, title: "Email Ana", why: "x" }, ctx);
    } else if (isWake && tools.length) {
      if (by.calendar_events) await by.calendar_events.execute({ days: 2 }, ctx);
      if (by.gmail_search) { const th = await by.gmail_search.execute({ query: "in:inbox is:unread" }, ctx); if (th[0]) await by.gmail_read_thread.execute({ threadId: th[0].threadId }, ctx); }
      await by.propose_action.execute({ kind: "reply", title: "Reply to Sara about the deck", why: "She asked twice", to: ["Sara <sara@x.com>"], subject: "Re: deck", body: "Hi Sara,\nLooks good.", replyToMessageId: "m1", threadId: "t1" }, ctx);
      await by.propose_action.execute({ kind: "rsvp", title: "Broken rsvp", why: "no event id", response: "accepted" }, ctx);
      await by.propose_action.execute({ kind: "block", title: "Focus: Q4 plan", why: "Tomorrow is packed", start: iso(864e5), end: iso(864e5 + 5400e3) }, ctx);
      try { await by.propose_action.execute({ kind: "note", title: "Fourth", why: "over the limit" }, ctx); flags.limited = false; } catch { flags.limited = true; }
    } else if (!isWake && Array.isArray(input) && /My answer to your question/.test(input[input.length - 1]?.content || "")) {
      flags.carried = (flags.carried || 0) + 1; flags.carriedWith = input[input.length - 1].content;
    } else if (!isWake && Array.isArray(input) && tools.length && by.propose_action) {
      await by.propose_action.execute({ kind: "rsvp", title: "Accept Dashboard review", why: "Unanswered", eventId: "e1", response: "accepted" }, ctx);
    }
    if (ctx.signal.aborted) throw { code: "cancelled", message: "stopped" };
    const text = isWake ? "## Two things need you today\n- Sara asked about the deck — draft ready\n- Dashboard review at 17:00 — you haven't replied\n- Read https://example.com/x for context"
      : Array.isArray(input) && /My answer to your question/.test(input[input.length - 1]?.content || "") ? "On it. I'll chase the pending ones first."
      : Array.isArray(input) ? "Sure — I'd keep the reply short. I queued the RSVP too." : "Things look calm.";
    for (let i = 8; i < text.length; i += 24) { if (ctx.signal.aborted) throw { code: "cancelled", message: "stopped", text: text.slice(0, i) }; o.onText?.({ text: text.slice(0, i), delta: "x" }); await tick(4); }
    o.onText?.({ text, delta: "x" });
    return { text, truncated: false, modelTierApplied: o.modelTier === "complex" ? "default" : (o.modelTier || "default") };
  };
  sample.json = async (input, o) => { checkInput(input); checkOpts(o); calls.sample.push({ json: true, input }); if (typeof input === "string" && /Pick the dot whose job this message belongs to/.test(input)) { await tick(5); return clone(opts.route || { dot: "none", sure: true }); } return { name: "Agenda guard", responsibility: "Watch this week's meetings and flag any without an agenda.", rules: ["Be polite"], sources: ["calendar"], cadence: "daily", tier: "quick", hue: 40, look: { shape: "pebble", eyes: "wide", acc: "beanie" } }; };
  sample.limits = async () => { if (opts.limitsFail) throw { code: "capability_removed", message: "old" }; return { maxPromptBytes: 262144, ...(opts.noTools ? {} : { tools: { maxCount: 8 } }), images: { maxCount: 1, maxInputBytes: 2e7, mediaTypes: ["image/png", "image/jpeg"] } }; };
  const events = [
    { id: "e1", summary: "Dashboard review", start: { dateTime: iso(2 * 3600e3) }, end: { dateTime: iso(3 * 3600e3) }, attendees: [{ email: "me@x.com", self: true, responseStatus: "needsAction" }, { email: "o@x.com" }], htmlLink: "https://calendar.google.com/e1", organizer: { email: "o@x.com" }, eventType: "DEFAULT" },
    { id: "e2", summary: "Standup", start: { dateTime: iso(-0.5 * 3600e3) }, end: { dateTime: iso(0.25 * 3600e3) }, attendees: [{ email: "me@x.com", self: true, responseStatus: "accepted" }], htmlLink: "https://calendar.google.com/e2" },
  ];
  const mcp = {
    async listTools() { return { servers: [...(opts.noCal ? [] : [{ server: "Google Calendar", authStatus: "connected", tools: [{ name: "list_events", annotations: { readOnlyHint: true } }, { name: "update_event" }, { name: "delete_event", annotations: { destructiveHint: true } }, ...(opts.undo ? [{ name: "get_event", annotations: { readOnlyHint: true } }, { name: "create_event" }] : [])] }]), { server: "Gmail", authStatus: "unknown", tools: [{ name: "search_threads" }, { name: "create_draft" }, ...(opts.undo ? [{ name: "delete_draft" }] : [])] }, { server: "Claude Code Remote", authStatus: "connected", tools: [{ name: "list_triggers" }] },
      ...(opts.slack ? [{ server: "Slack", authStatus: "connected", tools: [{ name: "slack_search_public", annotations: { readOnlyHint: true } }, { name: "slack_send_message" }, { name: "slack_send_message_draft" }] }] : []),
      ...(opts.linear ? [{ server: "Linear", authStatus: "connected", tools: [{ name: "list_issues", annotations: { readOnlyHint: true } }, { name: "create_issue" }, { name: "delete_issue" }] }] : [])] }; },
    async describeTool(server, tool) {
      const defs = {
        "Google Calendar/update_event": { description: "Updates an event on the given calendar.", inputSchema: { type: "object", properties: { eventId: { type: "string", description: "Required. Event ID." }, description: { type: "string", description: "Optional. New description." }, notificationLevel: { type: "string", enum: ["NONE", "EXTERNAL_ONLY", "ALL"] }, summary: { type: "string" } }, required: ["eventId"] } },
        "Slack/slack_send_message": { description: "Send a message to a channel.", inputSchema: { type: "object", properties: { channel_id: { type: "string" }, message: { type: "string" } }, required: ["channel_id", "message"] } },
        "Slack/slack_search_public": { description: "Search public Slack messages.", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
      };
      await tick(1);
      if (defs[server + "/" + tool]) return clone({ name: tool, ...defs[server + "/" + tool] });
      throw { code: "bad_request", message: "no schema available for this tool" };
    },
    async callTool(server, tool, input, o) {
      if (typeof server !== "string" || typeof tool !== "string") throw { code: "bad_request", message: "strings" };
      jsonOnly(input ?? null, "callTool " + tool);
      calls.mcp.push({ server, tool, input: clone(input) });
      await tick(1);
      switch (tool) {
        case "list_events": return { payload: { events: clone(events) } };
        case "search_threads": return { payload: { threads: [{ id: "t1", viewUrl: "https://mail.google.com/t1", messages: [{ id: "m0", subject: "Deck", sender: "sara@x.com", date: "2026-10-03", snippet: "Can you look" + "\ufeff\u200b" + "", labelIds: ["UNREAD"] }, { id: "m1", sender: "sara@x.com", date: "2026-10-04", snippet: "Ping", labelIds: ["UNREAD"] }] }] } };
        case "get_thread": return { payload: { id: "t1", messageCount: 2, viewUrl: "https://mail.google.com/t1", messages: [{ id: "m1", sender: "sara@x.com", toRecipients: ["me@x.com"], date: "2026-10-04", subject: "Deck", plaintextBody: "Hi,\nAny thoughts? https://tracker.example.com/abc?x=1\n\nOn Mon, Oct 3, 2026 Sara wrote:\n> old text" }] } };
        case "create_draft": return { payload: { id: "d1", threadId: "t1", viewUrl: "https://mail.google.com/draft/d1" } };
        case "respond_to_event": return { payload: {} };
        case "create_event": if (input.eventType === "FOCUS_TIME") throw { code: "tool_error", message: "Focus time is not supported" }; return { payload: { id: "ev_new", htmlLink: "https://calendar.google.com/new" } };
        case "get_event": return { payload: { id: input.eventId, summary: input.eventId === "e1" ? "Dashboard review" : "Standup", description: input.eventId === "e1" ? "Old notes" : "", htmlLink: "https://calendar.google.com/" + input.eventId, organizer: { self: true } } };
        case "delete_draft": if (opts.draftGone) throw { code: "tool_error", message: "Draft not found" }; return { payload: {} };
        case "delete_event": return { payload: {} };
        case "list_environments": return { payload: { data: [{ id: "ccpool_x1", name: "Laptop pool", kind: "self_hosted" }, { id: "env_abc123", name: "Default", kind: "anthropic_cloud" }] } };
        case "create_trigger": {
          if (opts.createFail) throw { code: "tool_error", message: "environment_id is required" };
          if (input.notifications && input.create_new_session_on_fire !== true) throw { code: "tool_error", message: "create_trigger: notifications only applies to triggers that start a new session each fire." };
          if ((!input.environment_id && !input.persistent_session_id) || !input.cron_expression || !input.prompt || input.initiation !== "human_request") throw { code: "tool_error", message: "bad create args" };
          if (opts.appsRejected && input.mcp_connections) throw { code: "tool_error", message: "mcp_connections: connector_uuid is required" };
          // like the real scheduler for this organization: no connectors parameter, page-made fresh sessions carry no apps;
          // a task bound to an existing session wakes that session (which keeps its own apps)
          if ("connectors" in input) throw { code: "tool_error", message: "create_trigger: the connectors parameter is not available for this organization. Omit the connectors parameter." };
          if (input.persistent_session_id && input.create_new_session_on_fire) throw { code: "tool_error", message: "mutually exclusive" };
          if (input.persistent_session_id && input.notifications) throw { code: "tool_error", message: "notifications only applies to triggers that start a new session each fire" };
          if (input.persistent_session_id) throw { code: "blocked_by_policy", message: "an artifact can't bind a routine to one of the viewer's existing sessions: leave out persistent_session_id, and when creating a routine set create_new_session_on_fire to true, so that each run starts a new session" };
          const conns = input.persistent_session_id ? [{ connector_uuid: "a", name: "Google_Calendar", url: "" }, { connector_uuid: "b", name: "Gmail", url: "" }] : [];
          calls.created = (calls.created || 0) + 1;
          const t = { id: "trig_" + calls.created, mcp_connections: conns, persistent_session_id: input.persistent_session_id || undefined, name: input.name, cron_expression: input.cron_expression, enabled: true, next_run_at: iso(5 * 3600e3), last_run: { status: "ROUTINE_RUN_STATUS_SUCCEEDED", finished_at: iso(-3600e3) }, derived_state: opts.askMode ? { permission_mode: "default" } : {} };
          triggers.push(t); return { payload: { trigger: clone(t) } };
        }
        case "list_triggers": return { payload: { data: clone(triggers), has_more: false } };
        case "fire_trigger": return { payload: { ok: true } };
        case "list_repos": return { payload: { repos: [
          { full_name: "disrupt-corpus/factory-kb", url: "https://github.com/disrupt-corpus/factory-kb", pushed_at: iso(-3600e3), visibility: "private", can_push: true },
          { full_name: "disrupt-gt/course-materials", url: "https://github.com/disrupt-gt/course-materials", pushed_at: iso(-7200e3), visibility: "private", can_push: true },
          { full_name: "ammar-hasan/narova", url: "https://github.com/ammar-hasan/narova", pushed_at: iso(-864e5), visibility: "public", can_push: true }], has_more: false } };
        case "update_event": return { payload: { id: input.eventId, htmlLink: "https://calendar.google.com/" + input.eventId } };
        case "slack_search_public": return { payload: { messages: [{ channel: "C1", text: "Launch is Tuesday?", ts: "1" }] } };
        case "slack_send_message": return { payload: { ok: true, permalink: "https://slack.com/archives/C1/p1" } };
        case "update_trigger": { const t = triggers.find(x => x.id === input.trigger_id); if (t && "enabled" in input) t.enabled = input.enabled; return { payload: {} }; }
        case "delete_trigger": { const i = triggers.findIndex(x => x.id === input.trigger_id); if (i < 0) throw { code: "tool_error", message: "not found" }; triggers.splice(i, 1); return { payload: {} }; }
      }
      throw { code: "bad_request", message: "unknown tool " + tool };
    },
    watchTool(server, tool, input, handler) {
      if (typeof handler !== "function") throw new TypeError("handler");
      calls.mcp.push({ server, tool, input: clone(input), watch: true });
      setTimeout(() => handler({ type: "data", result: { payload: { events: clone(events) }, cache: { storedAt: Date.now() - 120000, revalidating: false } } }), 5);
      return () => {};
    },
    async invalidate() {},
  };
  let currentWindow = null;
  const checkToClaude = (data, what) => {
    if (!data || typeof data !== "object" || Array.isArray(data)) throw { code: "invalid_argument", message: "not an object" };
    const s = JSON.stringify(data); if (bytes(s) > 4096) throw { code: "invalid_argument", message: `${what} over 4 KiB (${bytes(s)})` };
    const walk = (x, depth) => {
      if (depth > 8) throw { code: "invalid_argument", message: "too deep" };
      if (typeof x === "string") { if (BAD_CHARS.test(x)) throw { code: "invalid_argument", message: "control or invisible character" }; return; }
      if (Array.isArray(x)) { if (x.length > 64) throw { code: "invalid_argument", message: "array > 64" }; x.forEach(y => walk(y, depth + 1)); return; }
      if (x && typeof x === "object") { const ks = Object.keys(x); if (ks.length > 64) throw { code: "invalid_argument", message: "> 64 keys" }; for (const k of ks) { if (!IDENT.test(k) || k.length > 64) throw { code: "invalid_argument", message: "bad key " + k }; walk(x[k], depth + 1); } }
    };
    walk(data, 1);
  };
  const room = {
    async presence(p) { checkToClaude(p, "presence"); calls.presence.push(clone(p)); },
    onPeers(h, e) { setTimeout(() => h(deepFreeze({ peers: [{ peer: "p1", by: UID, isMe: true, sameTab: true, kind: "viewer", guest: false, presence: {}, updatedAt: 1 }, { peer: "p2", by: "u_other", isMe: false, sameTab: false, kind: "viewer", guest: false, presence: { running: true }, updatedAt: 1 }], joined: [], left: [], updated: [] })), 5); return () => {}; },
    on(topic, h, e) { if (typeof h !== "function") throw new TypeError("handler"); room._on = h; return () => {}; },
    async emit(t, d) { if (!/^[a-z][a-z0-9_.-]{0,47}$/.test(t)) throw { code: "invalid_argument", message: "topic" }; calls.emits.push([t, clone(d)]); },
    async canSendToClaudeSession() { return opts.canSend || "available"; },
    sendToClaudeSession(data, o) {
      // the platform proves the gesture from the call itself: only inside a click dispatch
      if (!currentWindow?.__inGesture) return Promise.reject({ code: "claude_unavailable", message: "no provable gesture" });
      try { checkToClaude(data, "sendToClaudeSession"); } catch (e) { return Promise.reject(e); }
      calls.send.push({ data: clone(data), o: clone(o) });
      return Promise.resolve({ to: "pane" });
    },
  };
  const user = {
    async me() { return { id: opts.signedOut ? null : UID, name: opts.signedOut ? "" : "Ammar Hasan", avatarUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", color: "#888", email: null, isOwner: true, canEdit: true }; },
    async id() { return opts.signedOut ? null : UID; }, async isOwner() { return true; }, async canEdit() { return true; }, async can() { return opts.canWrite ?? true; },
    async profiles(ids) { const out = {}; for (const id of [].concat(ids)) out[id] = { id, name: id === UID ? "Ammar Hasan" : id === "u_sara" ? "Sara Khan" : "", avatarUrl: "data:,", color: "#777", email: null, isMe: id === UID, guest: false }; return out; },
    async search(q) { return [{ id: "u_sara", name: "Sara Khan", avatarUrl: "data:,", email: null, isMe: false }, { id: UID, name: "Ammar Hasan", avatarUrl: "data:,", isMe: true }].filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase())); },
  };
  const permissions = {
    async state(n) { return n ? perms[n] || "unavailable" : { ...perms }; },
    async request(names) { calls.perms.push(names ? [...names] : "all"); for (const n of names || Object.keys(perms)) if (perms[n] === "prompt") perms[n] = "granted"; const out = {}; for (const n of names || Object.keys(perms)) out[n] = perms[n] || "unavailable"; return out; },
    async manage() { calls.perms.push("manage"); },
  };
  const assets = {
    async upload(b, o) { const ok = ["text/plain", "text/markdown", "text/csv", "application/json"]; const t = o?.type || b.type; if (!ok.includes(t)) throw { code: "unsupported_type", message: t }; calls.saves.push({ upload: t }); return { id: "a".repeat(32), url: "/_blob/" + "a".repeat(32), sizeBytes: b.size || 10, contentType: t }; },
    async list() { return { assets: [], usage: { files: 1, bytes: 4096, maxFiles: 100, maxBytes: 1e9 } }; }, async delete() { return { deleted: true }; },
  };
  const downloads = { async save(r) { if (!/\.(md|txt|json|csv)$/.test(r.filename)) throw { code: "rejected_extension", message: r.filename }; if (!r.data) throw { code: "bad_request", message: "empty" }; calls.saves.push({ download: r.filename, size: String(r.data).length }); return { status: "saved" }; } };
  const comments = { async openComposer(t) { if (!t?.element?.isConnected) throw { code: "invalid", message: "not connected" }; if (opts.commentsOff) throw { code: "unavailable", message: "off" }; calls.composer.push(true); return { opened: true }; } };
  const ns = { user, db: db.api, sample, mcp, room, downloads, assets, comments, permissions };
  for (const k of Object.keys(ns)) if (k !== "sample" && k !== "db") Object.freeze(ns[k]);
  const delays = { user: 3, db: 5, sample: 40, mcp: 60, room: 20, permissions: 10, downloads: 15, assets: 25, comments: 30, ...(opts.delays || {}) };
  const claude = Object.freeze({ use: n => { calls.uses.push(n); return new Promise(r => setTimeout(() => r(opts.none || (opts.withhold || []).includes(n) ? null : ns[n] ?? null), delays[n] ?? 5)); } });
  return { calls, flags, db, triggers, room, perms, claude, attach: w => { currentWindow = w; } };
}

async function load(rt, extra = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => { if (!/getContext|scrollTo|Not implemented: (navigation|HTMLCanvasElement)/.test(String(e.message))) errors.push("jsdom: " + e.message); });
  vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));
  vc.on("warn", (...a) => { if (!/\[dotworks\]/.test(a[0])) errors.push("console.warn: " + a.join(" ")); else (extra.warns || []).push(a.join(" ")); });
  const dom = new JSDOM(`<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://artifact.example/", virtualConsole: vc,
    beforeParse(w) {
      if (rt) { w.claude = rt.claude; rt.attach(w); }
      if (extra.hot && rt) w.claude = Object.freeze({ ...rt.claude, hot: extra.hot });
      w.Element.prototype.scrollIntoView = function () {};
      w.HTMLElement.prototype.scrollTo = function () {};
      w.fetch = async () => ({ ok: true, text: async () => "Team: Sara (design), Omar (eng)" });
      w.addEventListener("error", e => errors.push("window error: " + (e.error?.stack || e.message)));
      w.addEventListener("unhandledrejection", e => errors.push("unhandled: " + (e.reason?.stack || JSON.stringify(e.reason))));
    },
  });
  await tick(extra.wait ?? 160);
  return { dom, w: dom.window, d: dom.window.document, errors };
}
// a click the platform can prove: the flag is up only while the event is being dispatched
const click = (w, el) => { if (!el) throw new Error("missing element to click"); w.__inGesture = true; try { el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); } finally { w.__inGesture = false; } };
const q = (d, s) => d.querySelector(s);
const qa = (d, s) => [...d.querySelectorAll(s)];
const text = (d, s) => (q(d, s)?.textContent || "").replace(/\s+/g, " ").trim();
const typeIn = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };
const submit = (w, el) => el.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
const actsIn = rt => [...rt.db.store.entries()].filter(([k, v]) => v.type === "action").map(([k, v]) => ({ id: k.split("/").pop(), ...v }));
const dotsIn = rt => [...rt.db.store.entries()].filter(([k, v]) => k.startsWith(`data/users/${UID}/`) && v.type === "dot").map(([k, v]) => ({ id: k.split("/").pop(), ...v }));

(async () => {
  console.log("1. Outside Claude (no runtime at all)");
  {
    const { d, errors } = await load(null);
    ok(text(d, "#greet") === "Open in Claude", "headline asks to open in Claude: " + text(d, "#greet"));
    ok(/can't reach Claude/.test(text(d, "#banner")), "banner explains this copy can't reach Claude");
    ok(!q(d, "#field .orb-btn"), "no orbs");
    ok(errors.length === 0, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  }

  console.log("2. Capabilities all withheld");
  {
    const rt = makeRuntime({ none: true });
    const { d, errors } = await load(rt, { wait: 300 });
    ok(text(d, "#greet") === "Open in Claude", "degrades to open-in-Claude");
    ok(/Not inside Claude/.test(text(d, "#meBtn")), "account button says not inside Claude");
    ok(errors.length === 0, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  }

  console.log("3. Memory (db) withheld, signed in");
  {
    const rt = makeRuntime({ withhold: ["db"] });
    const { w, d, errors } = await load(rt, { wait: 300 });
    ok(/Memory is off/.test(text(d, "#banner")), "banner says memory is off: " + text(d, "#banner"));
    ok(!q(d, "#dotList .skel"), "dot list is not stuck loading");
    ok(!/Gathering/.test(text(d, "#voice")), "home is not stuck gathering");
    ok(!!q(d, '#banner [data-act="perms"]'), "offers Manage access");
    click(w, q(d, '#nav [data-nav="seeds"]')); await tick(30);
    ok(/Open this page inside Claude/.test(text(d, "#seedGrid")) || /No seeds/.test(text(d, "#seedGrid")), "seeds view degrades: " + text(d, "#seedGrid"));
    ok(errors.length === 0, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  }

  console.log("4. Signed out");
  {
    const rt = makeRuntime({ signedOut: true });
    const { d, errors } = await load(rt, { wait: 300 });
    ok(text(d, "#greet") === "Sign in", "asks to sign in");
    ok(/Sign in/.test(text(d, "#dotList")), "sidebar asks to sign in");
    ok(errors.length === 0, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  }

  console.log("5. Main flow — empty field, plant a seed");
  const rt = makeRuntime({ slowEcho: 0 });
  rt.db.store.set("meta/home", { sessionId: "session_01HOME000000000000000000", label: "Dotworks home", url: "https://claude.ai/code/session_01HOME000000000000000000" });
  const warns = [];
  const { w, d, errors } = await load(rt, { wait: 300, warns });
  ok(/Good (morning|afternoon|evening)|Still up/.test(text(d, "#greet")), "greets by time of day: " + text(d, "#greet"));
  ok(qa(d, "#field .orb-btn").length === 2, "two seeds float in the empty field");
  ok(!!q(d, '#field .av.seed[data-shape="squircle"][data-acc="glasses"]'), "seed shows its character (squircle + glasses)");
  ok(/Dashboard review|Standup/.test(text(d, "#horizon")) || /Show my day/.test(text(d, "#horizon")), "horizon present: " + text(d, ".hz-cap"));
  ok(rt.calls.mcp.some(c => c.watch && c.tool === "list_events"), "horizon uses watchTool when Calendar is granted");
  ok(!q(d, "#peers").hidden && /2 here now/.test(text(d, "#peers")), "presence shows 2 here now");
  ok(rt.calls.presence.length > 0 && rt.calls.presence.every(p => "view" in p), "presence published with the view");
  click(w, q(d, '#field [data-act="plant-open"]')); await tick(30);
  ok(!q(d, "#scrim").hidden && text(d, "#sh-title") === "Plant it", "plant sheet opens");
  ok(!q(d, "#sh-ask"), "plant sheet has no AI box");
  ok(q(d, "#sh-name").value === "Meeting prep", "sheet prefilled from the seed");
  click(w, q(d, '#sh-look [data-look="acc"][data-v="headphones"]')); await tick(10);
  ok(!!q(d, '#sh-prev .av[data-acc="headphones"]'), "accessory picker updates the preview");
  click(w, q(d, '#sh-look [data-look="eyes"][data-v="wide"]')); await tick(10);
  ok(!!q(d, '#sh-look [data-look="eyes"][data-v="wide"][aria-pressed="true"]'), "eyes option pressed");
  typeIn(w, q(d, "#sh-name"), "Meeting prep");
  submit(w, q(d, "#sh-form")); await tick(80);
  const dots1 = dotsIn(rt);
  ok(dots1.length === 1, "dot saved in private subtree");
  const dotId = dots1[0]?.id;
  ok(dots1[0]?.look?.acc === "headphones" && dots1[0]?.look?.eyes === "wide" && dots1[0]?.look?.shape === "squircle", "look saved: " + JSON.stringify(dots1[0]?.look));
  ok(clone(rt.db.store.get("adopts/" + UID))?.keys?.includes("starter:meeting-prep"), "adoption recorded under adopts/<me>");
  ok(q(d, "#scrim").hidden, "sheet closes");
  ok(text(d, "#dvName") === "Meeting prep", "dot page opens");
  ok(/Hi, I'm Meeting prep/.test(text(d, "#msgs")), "chat greets with an intro card");
  ok(!!q(d, `#dotList [data-id="${dotId}"][aria-current="true"]`), "sidebar shows it selected");

  console.log("6. Wake it");
  click(w, q(d, '#dvAct [data-act="run"]')); await tick(15);
  ok(!!q(d, '#msgs [data-key="live"]'), "live message appears while awake");
  ok(!!q(d, `#dotList [data-id="${dotId}"] .av.live`), "sidebar character is live");
  await tick(500);
  const runs = [...rt.db.store.entries()].filter(([k]) => k.startsWith(`data/users/${UID}/${dotId}/runs/`));
  ok(runs.length === 1, "one run saved");
  const run = runs[0]?.[1] || {};
  ok(run.status === "done" && run.text.startsWith("## Two things"), "run saved done" + (run.status !== "done" ? " — " + JSON.stringify({ s: run.status, e: run.errorCode }) : ""));
  ok(run.steps.length >= 6 && run.steps.every(s => s.state === "ok"), "steps recorded ok (" + run.steps.length + ")");
  const wakeCall = rt.calls.sample.find(c => typeof c.input === "string" && /waking for a check-in/.test(c.input));
  ok(wakeCall && wakeCall.o.tools?.join(",") === "calendar_events,gmail_search,gmail_read_thread,propose_action,ask_owner" && !("cache" in wakeCall.o), "wake offers its tools, propose and ask, no cache option: " + wakeCall?.o.tools?.join(","));
  ok(/You can reach: Google Calendar and Gmail/.test(wakeCall?.input || ""), "prompt says what it can reach");
  const acts = actsIn(rt);
  ok(acts.length === 3 && rt.flags.limited === true, "3 asks queued, a 4th refused");
  const reply = acts.find(a => a.kind === "reply"), block = acts.find(a => a.kind === "block"), broken = acts.find(a => a.title === "Broken rsvp");
  ok(reply?.payload.to[0] === "sara@x.com" && reply.link === "https://mail.google.com/t1", "reply normalized (email extracted, thread link)");
  ok(broken?.kind === "note", "incomplete rsvp downgraded to a note");
  ok(/Two things need you today/.test(text(d, "#msgs .letter h3")), "note renders as the dot's message");
  ok(qa(d, "#msgs .ask").length === 3, "3 asks inline in chat");
  ok(text(d, '#nav [data-nav="asks"] .count') === "3", "nav badge shows 3");
  ok(text(d, '#dvTabs [data-tab="chat"] .count') === "3", "chat tab badge shows 3");
  ok(rt.calls.emits.some(([t]) => t === "ran"), "room hears the wake");
  ok(q(d, "#msgs .letter a")?.getAttribute("target") === "_blank", "links in notes open in a new tab");

  console.log("7. Asks inbox");
  click(w, q(d, '#nav [data-nav="asks"]')); await tick(30);
  ok(/3 asks waiting/.test(text(d, "#asksTitle")), "asks title: " + text(d, "#asksTitle"));
  ok(qa(d, "#asksList .ask").length === 3, "3 cards");
  click(w, q(d, '#asksFilter [data-id="Gmail"]')); await tick(10);
  ok(qa(d, "#asksList .ask").length === 1, "filter by app: Gmail only");
  click(w, q(d, '#asksFilter [data-id="all"]')); await tick(10);
  const card = id => q(d, `#asksList [data-key="${id}"]`);
  click(w, card(reply.id).querySelector('[data-act="edit-ask"]')); await tick(10);
  const body = q(d, `#ed-body-${reply.id}`);
  ok(!!body, "reply becomes editable");
  typeIn(w, body, "Hi Sara, looks great — ship it.");
  click(w, card(reply.id).querySelector('[data-act="exec"]')); await tick(60);
  const cd = rt.calls.mcp.find(c => c.tool === "create_draft");
  ok(cd && cd.input.body === "Hi Sara, looks great — ship it." && cd.input.replyToMessageId === "m1" && cd.input.to[0] === "sara@x.com", "create_draft uses the edited body and reply id");
  ok(rt.db.store.get(`data/users/${UID}/${reply.id}`).state === "done", "reply marked done");
  click(w, card(block.id).querySelector('[data-act="exec"]')); await tick(50);
  const ce = rt.calls.mcp.filter(c => c.tool === "create_event");
  ok(ce.length === 2 && ce[0].input.eventType === "FOCUS_TIME" && !ce[1].input.eventType, "focus time falls back to a busy event");
  click(w, card(broken.id).querySelector('[data-act="dismiss"]')); await tick(5);
  ok(!card(broken.id), "dismissed card leaves at once");
  await tick(30);
  ok(rt.db.store.get(`data/users/${UID}/${broken.id}`).state === "dismissed", "Not now dismisses");
  const undo = qa(d, ".toast").filter(t => /Moved out of the way/.test(t.textContent)).pop()?.querySelector("button");
  ok(!!undo && undo.textContent === "Undo", "dismiss offers Undo");
  click(w, undo); await tick(40);
  ok(rt.db.store.get(`data/users/${UID}/${broken.id}`).state === "pending", "Undo brings it back");
  click(w, card(broken.id).querySelector('[data-act="dismiss"]')); await tick(40);
  ok(/Handled lately · 3/.test(text(d, "#handled")), "handled list shows 3");
  ok(/All clear/.test(text(d, "#asksTitle")), "inbox says all clear");

  console.log("8. Talk to it");
  click(w, q(d, `#dotList [data-id="${dotId}"]`)); await tick(30);
  ok(text(d, "#dvName") === "Meeting prep" && !q(d, "#tp-chat").hidden, "back in the dot's chat");
  const ta = q(d, "#reply");
  ok(!ta.disabled, "composer enabled");
  typeIn(w, ta, "Make the reply shorter");
  submit(w, q(d, "#composer")); await tick(10);
  ok(/Make the reply shorter/.test(text(d, "#msgs .msg.you .bubble")), "your message shows at once");
  await tick(300);
  const chatCall = rt.calls.sample.find(c => Array.isArray(c.input));
  ok(chatCall && chatCall.input[0].role === "user" && chatCall.input.at(-1).role === "user", "chat turns start and end with user");
  ok(chatCall && Array.isArray(chatCall.o.tools) && !("cache" in chatCall.o), "chat with tools passes no cache option");
  const savedRun = [...rt.db.store.entries()].find(([k]) => k.startsWith(`data/users/${UID}/${dotId}/runs/`))[1];
  ok(savedRun.thread?.length === 2 && savedRun.thread[1].role === "dot", "conversation saved on the latest note");
  ok(qa(d, "#msgs .msg.you").length === 1 && /keep the reply short/.test(text(d, "#msgs")), "conversation renders once");
  const rsvp = actsIn(rt).find(a => a.kind === "rsvp");
  ok(rsvp?.payload.eventTitle === "Dashboard review" && rsvp.link === "https://calendar.google.com/e1", "chat queued an RSVP with title + link");
  const rc = q(d, `#msgs [data-key="${rsvp?.id}"]`);
  ok(rc && /Accept/.test(rc.textContent), "RSVP card inline in chat offers Accept");
  click(w, rc.querySelector('[data-act="exec"]')); await tick(50);
  const re = rt.calls.mcp.find(c => c.tool === "respond_to_event");
  ok(re && re.input.eventId === "e1" && re.input.responseStatus === "accepted", "respond_to_event called");
  ok(/Accepted the invite/.test(text(d, "#msgs")), "chat shows it was handled");
  click(w, q(d, '#cmpChips [data-act="suggest"]')); await tick(300);
  ok(rt.calls.sample.filter(c => Array.isArray(c.input)).length === 2, "suggestion chip sends a message");

  console.log("9. Activity + Schedule (cloud)");
  click(w, q(d, '#dvTabs [data-tab="activity"]')); await tick(20);
  ok(qa(d, "#activity .act-row").length === 1 && /Two things need you today/.test(text(d, "#activity")), "activity lists the check-in");
  click(w, q(d, '#dvTabs [data-tab="schedule"]')); await tick(20);
  click(w, q(d, '#cloud [data-act="cloud-open"]')); await tick(10);
  const when = q(d, "#cl-when"); when.value = "daily"; when.dispatchEvent(new w.Event("change", { bubbles: true })); await tick(5);
  ok(/Every day at 08:\d\d/.test(text(d, "#cloud")), "schedule preview");
  ok(!q(d, '#cloud [data-act="cloud-handoff"]') && !q(d, '#cloud [data-act="cloud-copy"]'), "no copy/paste offered up front");
  click(w, q(d, '#cloud [data-act="cloud-create"]'));
  ok(/Finding where it can run|Creating its schedule/.test(text(d, "#cloud")), "shows progress while it sets up");
  await tick(80);
  const cr = rt.calls.mcp.find(c => c.tool === "create_trigger");
  ok(!!cr && cr.input.create_new_session_on_fire === true && cr.input.environment_id === "env_abc123" && cr.input.notifications?.push === true && !cr.input.persistent_session_id, "creates the dot's own routine: fresh session each wake, phone ping on");
  ok(/^CRON_TZ=\S+ \d+ 8 \* \* \*$/.test(cr?.input.cron_expression || ""), "cron is jittered and zoned: " + cr?.input.cron_expression);
  ok(/runbook/.test(cr?.input.prompt || "") && (cr?.input.prompt || "").includes(dotId) && (cr?.input.prompt || "").includes("https://claude.ai/artifact/TestDotworks01"), "task prompt points at this copy's runbook and the dot");
  ok(!("connectors" in (cr?.input || {})) && !("mcp_connections" in (cr?.input || {})), "never sends an app list the scheduler rejects");
  ok(rt.db.store.get(`data/users/${UID}/${dotId}`).cloud?.triggerId === "trig_1", "dot linked to its routine");
  ok(rt.calls.send.length === 0, "nothing handed to a Claude chat");
  ok(/One step left: give it your Google Calendar and Gmail/.test(text(d, "#cloud")) && q(d, '#cloud a[data-act="apps-open"]')?.getAttribute("href") === "https://claude.ai/code/routines/trig_1" && q(d, '#cloud a[data-act="apps-open"]')?.target === "_blank", "tells you the apps aren't attached, with a button to Routines");
  ok(!/pause to ask/.test(text(d, "#cloud")), "no false 'runs pause to ask' warning");
  ok(/apps not attached/.test(text(d, `#dotList [data-id="${dotId}"]`)) && /apps not attached/.test(text(d, ".dv-meta")) && /!/.test(text(d, '#dvTabs [data-tab="schedule"]')), "flagged in the sidebar, the header and the Schedule tab");
  // the owner ticks the apps in Claude's Routines and comes back to the tab
  rt.triggers.find(x => x.id === "trig_1").mcp_connections = [{ connector_uuid: "a", name: "Google_Calendar", url: "" }, { connector_uuid: "b", name: "Gmail", url: "" }];
  w.dispatchEvent(new w.Event("focus")); await tick(60);
  ok(!/One step left/.test(text(d, "#cloud")), "coming back to the tab rechecks and the notice clears by itself");
  ok(!/apps not attached/.test(text(d, `#dotList [data-id="${dotId}"]`)) && /cloud ·/.test(text(d, `#dotList [data-id="${dotId}"]`)), "sidebar goes back to its normal cloud status");
  if (q(d, '#cloud [data-act="cloud-check"]')) { click(w, q(d, '#cloud [data-act="cloud-check"]')); await tick(60); }
  ok(/is awake in the cloud/.test(text(d, "#cloud")) && /next/.test(text(d, "#cloud")), "awake + next run: " + text(d, "#cloud .cloud-status"));
  ok(!!q(d, `#dotList [data-id="${dotId}"] .av.cloud`), "sidebar character shows its cloud satellite");
  click(w, q(d, '#cloud [data-act="cloud-fire"]')); await tick(60);
  ok(rt.calls.mcp.some(c => c.tool === "fire_trigger" && c.input.trigger_id === "trig_1"), "Wake in the cloud now fires the task");
  click(w, q(d, '#dvTabs [data-tab="chat"]')); await tick(20);
  ok(/waking in the cloud/.test(text(d, "#msgs")), "chat shows the cloud wake is on its way");
  await rt.db.api.collection(`data/users/${UID}/${dotId}/runs`).doc("run_cloud1").set({ startedAt: Date.now() + 1000, finishedAt: Date.now() + 2000, status: "done", source: "cloud", text: "## From the cloud\n- All quiet", steps: [{ label: "Read 2 events", state: "ok" }], actionIds: [], thread: [] });
  await tick(60);
  ok(/From the cloud/.test(text(d, "#msgs")) && /woke in the cloud/.test(text(d, "#msgs")), "cloud note lands live in chat");
  ok(!/waking in the cloud —/.test(text(d, "#msgs")), "firing indicator cleared");
  click(w, q(d, '#dvTabs [data-tab="schedule"]')); await tick(20);
  click(w, q(d, '#cloud [data-act="cloud-pause"]')); await tick(60);
  ok(rt.calls.mcp.some(c => c.tool === "update_trigger" && c.input.enabled === false) && /is paused/.test(text(d, "#cloud")), "Pause disables the task");
  click(w, q(d, '#cloud [data-act="cloud-sleep"]')); await tick(80);
  ok(rt.calls.mcp.some(c => c.tool === "delete_trigger") && rt.db.store.get(`data/users/${UID}/${dotId}`).cloud === null, "Let it sleep deletes the task and unlinks it");

  console.log("10. Settings: look, people, file");
  click(w, q(d, '#dvTabs [data-tab="settings"]')); await tick(20);
  ok(!!q(d, "#st-form") && q(d, "#st-name").value === "Meeting prep", "settings form shows the dot");
  typeIn(w, q(d, "#st-name"), "Meeting prep+");
  ok(text(d, "#st-handle") === "@meeting-prep", "handle follows the name");
  click(w, q(d, '#st-look [data-look="shape"][data-v="blob"]')); await tick(10);
  q(d, "#st-people").dispatchEvent(new w.FocusEvent("focusin", { bubbles: true })); await tick(20);
  ok(!q(d, "#st-plist").hidden && /Sara Khan/.test(text(d, "#st-plist")) && !/Ammar/.test(text(d, "#st-plist")), "people search lists colleagues, not you");
  click(w, q(d, '#st-plist [data-act="pick-person"]')); await tick(20);
  ok(/Sara Khan/.test(text(d, "#st-vips")), "picked person shows as a chip");
  const file = new w.File(["Team: Sara (design)"], "roster.csv", { type: "application/vnd.ms-excel" });
  Object.defineProperty(q(d, "#st-file"), "files", { value: [file] });
  q(d, "#st-file").dispatchEvent(new w.Event("change", { bubbles: true }));
  submit(w, q(d, "#st-form")); await tick(80);
  const saved = rt.db.store.get(`data/users/${UID}/${dotId}`);
  ok(saved.name === "Meeting prep+" && saved.vips[0] === "u_sara" && saved.look.shape === "blob", "edit saved: name, person id, look");
  ok(rt.calls.saves.some(s => s.upload === "text/csv"), "csv uploaded with exact text/csv type");
  ok(saved.notesAssetId === "a".repeat(32) && saved.notesName === "roster.csv", "asset id stored, not its url");
  ok(text(d, "#dvName") === "Meeting prep+" && q(d, "#st-name")?.value === "Meeting prep+", "header and form show the saved name");
  ok(!!q(d, '#dvAv .av[data-shape="blob"]'), "header character takes the new shape");

  console.log("11. Share, seeds, export, comment, ask Claude");
  q(d, "#dvMenu").open = true;
  click(w, q(d, '#dvMenu [data-act="share"]')); await tick(40);
  const lib = rt.db.store.get("library/" + UID);
  ok(lib?.templates?.[0]?.name === "Meeting prep+" && !("vips" in lib.templates[0]) && !("notesAssetId" in lib.templates[0]) && lib.templates[0].look?.shape === "blob", "shared to library/<me> with look, without people or files");
  click(w, q(d, '#nav [data-nav="seeds"]')); await tick(40);
  ok(/shared by you/.test(text(d, "#seedGrid")), "seeds show your shared seed");
  ok(/in your field/.test(text(d, "#seedGrid")), "seeds mark what's in your field");
  click(w, q(d, `#dotList [data-id="${dotId}"]`)); await tick(30);
  const exportBtn = q(d, '#msgs [data-act="export"]');
  click(w, exportBtn); await tick(30);
  ok(rt.calls.saves.some(s => /\.md$/.test(s.download || "")), "note exports as .md");
  click(w, q(d, '#msgs [data-act="comment"]')); await tick(10);
  ok(rt.calls.composer.length === 1, "Comment opens the shell composer");
  click(w, q(d, '#msgs [data-act="ask-claude"]')); await tick(10);
  ok(rt.calls.send.some(s => s.data.note && !(s.o && s.o.deliver)), "Ask Claude stages the note");

  console.log("12. Wake again with context + people, then delete");
  click(w, q(d, '#dvAct [data-act="run"]')); await tick(500);
  const second = rt.calls.sample.filter(c => typeof c.input === "string" && /waking for a check-in/.test(c.input)).at(-1);
  ok(/Team: Sara/.test(second.input) && /Sara Khan/.test(second.input), "second wake includes the context file and people");
  q(d, "#dvMenu").open = true;
  click(w, q(d, '#dvMenu [data-act="delete-dot"]')); await tick(10);
  ok(/Delete Meeting prep\+/.test(text(d, "#dvConfirm")), "asks to confirm delete");
  click(w, q(d, '#dvConfirm [data-act="confirm-del"]')); await tick(5);
  ok(q(d, ".home") && !q(d, `#dotList [data-id="${dotId}"]`), "back home at once, dot gone from the sidebar");
  await tick(200);
  ok(![...rt.db.store.keys()].some(k => k.includes(dotId)), "dot, runs and asks deleted" + ([...rt.db.store.keys()].some(k => k.includes(dotId)) ? ": " + [...rt.db.store.keys()].filter(k => k.includes(dotId)).join(", ") : ""));

  console.log("13. New dot with Claude shaping it");
  click(w, q(d, '#homeActions [data-act="new"]')); await tick(30);
  ok(text(d, "#sh-title") === "Make a dot" && !!q(d, "#sh-ask"), "make sheet with the AI box");
  typeIn(w, q(d, "#sh-ask"), "Warn me about meetings with no agenda");
  click(w, q(d, '#sh-draftBtn')); await tick(60);
  ok(q(d, "#sh-name").value === "Agenda guard" && !!q(d, '#sh-prev .av[data-shape="pebble"][data-acc="beanie"]'), "Claude filled the form and picked a look");
  ok(rt.calls.sample.some(c => c.json), "used sample.json");
  submit(w, q(d, "#sh-form")); await tick(60);
  ok(dotsIn(rt).some(x => x.name === "Agenda guard" && x.look?.acc === "beanie"), "shaped dot saved");
  ok(text(d, "#dvName") === "Agenda guard", "opens the new dot");

  console.log("14. Keyboard");
  const kd = k => d.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true }));
  kd("Escape"); await tick(20);
  ok(!!q(d, ".home"), "Escape goes home");
  kd("n"); await tick(20);
  ok(!q(d, "#scrim").hidden, "N opens a new dot");
  kd("Escape"); await tick(20);
  ok(q(d, "#scrim").hidden, "Escape closes the sheet");
  kd("]"); await tick(20);
  ok(!!q(d, "#dvName"), "] opens a dot");

  console.log("15. Account popover");
  click(w, q(d, "#meBtn")); await tick(30);
  ok(!q(d, "#acctPop").hidden && /Memory/.test(text(d, "#acctPop")) && /Gmail/.test(text(d, "#acctPop")), "signals list capabilities and apps");
  ok(/Gmail.*asks first/.test(text(d, "#acctPop")), "Gmail shows asks first");
  click(w, q(d, '#acctPop [data-act="allow"][data-id="Gmail"]')); await tick(40);
  ok(rt.calls.perms.some(p => Array.isArray(p) && p[0] === "mcp:Gmail"), "Allow asks for that one connector");
  ok(/Gmail.*\bon\b/.test(text(d, "#acctPop")), "Gmail now on");
  click(w, d.body); await tick(10);
  ok(q(d, "#acctPop").hidden, "clicking away closes it");

  ok(errors.length === 0, "no runtime errors in main flow" + (errors.length ? ":\n    " + errors.join("\n    ") : ""));
  ok(!warns.length, "no diagnostics logged in main flow" + (warns.length ? ":\n    " + warns.join("\n    ") : ""));

  console.log("16. Slow store echo: what you make shows at once");
  {
    const rt5 = makeRuntime({ slowEcho: 600 });
    const r5 = await load(rt5, { wait: 300 });
    click(r5.w, r5.d.querySelector('#field [data-act="plant-open"]')); await tick(20);
    submit(r5.w, r5.d.querySelector("#sh-form")); await tick(40);
    ok(text(r5.d, "#dvName") === "Meeting prep", "dot page shows before the store echoes");
    ok(r5.d.querySelectorAll("#dotList .dl-i").length === 1, "sidebar shows it before the echo");
    await tick(800);
    ok(text(r5.d, "#dvName") === "Meeting prep" && r5.d.querySelectorAll("#dotList .dl-i").length === 1, "still one dot after the echo");
    click(r5.w, r5.d.querySelector('#dvTabs [data-tab="settings"]')); await tick(20);
    typeIn(r5.w, r5.d.querySelector("#st-name"), "Prep");
    submit(r5.w, r5.d.querySelector("#st-form")); await tick(40);
    ok(text(r5.d, "#dvName") === "Prep" && r5.d.querySelector("#st-name").value === "Prep", "settings show the saved name before the echo");
    ok(r5.errors.length === 0, "no errors" + (r5.errors.length ? ": " + r5.errors.join(" | ") : ""));
  }

  console.log("17. A view without page tools still wakes");
  {
    const rt6 = makeRuntime({ noTools: true });
    rt6.db.store.set(`data/users/${UID}/dot_z`, { type: "dot", name: "Zed", responsibility: "Z", rules: [], sources: ["calendar"], cadence: "daily", tier: "quick", hue: 10, createdAt: 1, lastRunAt: null, lastStatus: null });
    const r6 = await load(rt6, { wait: 300 });
    click(r6.w, r6.d.querySelector('#dotList [data-id="dot_z"]')); await tick(20);
    click(r6.w, r6.d.querySelector('#dvAct [data-act="run"]')); await tick(400);
    const run6 = [...rt6.db.store.entries()].find(([k]) => k.startsWith(`data/users/${UID}/dot_z/runs/`))?.[1];
    ok(run6?.status === "done", "note saved without tools");
    ok(rt6.calls.sample.every(c => !c.o?.tools), "never asked with tools (limits said no)");
    const call = rt6.calls.sample.find(c => typeof c.input === "string");
    ok(call && call.o.cache === false && /You can reach: nothing right now/.test(call.input), "no-tools wake says it can't reach apps, no cache");
    ok(r6.errors.length === 0, "no errors" + (r6.errors.length ? ": " + r6.errors.join(" | ") : ""));
  }
  {
    const rt7 = makeRuntime({ noTools: true, limitsFail: true });
    rt7.db.store.set(`data/users/${UID}/dot_z`, { type: "dot", name: "Zed", responsibility: "Z", rules: [], sources: ["gmail"], cadence: "daily", tier: "quick", hue: 10, createdAt: 1, lastRunAt: null, lastStatus: null });
    const r7 = await load(rt7, { wait: 300 });
    click(r7.w, r7.d.querySelector('#dotList [data-id="dot_z"]')); await tick(20);
    click(r7.w, r7.d.querySelector('#dvAct [data-act="run"]')); await tick(400);
    const run7 = [...rt7.db.store.entries()].find(([k]) => k.startsWith(`data/users/${UID}/dot_z/runs/`))?.[1];
    ok(run7?.status === "done" && run7.steps.some(s => /can't read your apps/.test(s.label)), "unknown limits: tries tools, falls back once, says so");
    ok(rt7.calls.sample.filter(c => typeof c.input === "string").length === 2, "exactly one retry");
  }

  console.log("18. Hot reload restores your place");
  {
    const rt2 = makeRuntime();
    rt2.db.store.set(`data/users/${UID}/dot_a`, { type: "dot", name: "Alpha", responsibility: "A", rules: [], sources: ["calendar"], cadence: "daily", tier: "default", hue: 10, createdAt: 1, lastRunAt: Date.now() - 1000, lastStatus: "done" });
    rt2.db.store.set(`data/users/${UID}/dot_b`, { type: "dot", name: "Beta", responsibility: "B", rules: [], sources: ["gmail"], cadence: "weekly", tier: "quick", hue: 200, createdAt: 2, lastRunAt: Date.now() - 2000, lastStatus: "done" });
    rt2.db.store.set(`data/users/${UID}/dot_b/runs/run_1`, { startedAt: Date.now() - 2000, status: "done", source: "page", text: "## Beta says hi\n- one", steps: [], thread: [] });
    let snapFn = null;
    const hot = { snapshot(fn) { snapFn = fn; }, ready(start) { setTimeout(() => start({ view: "dot", selected: "dot_b", tab: "chat", reply: "half-typed reply" }), 1); } };
    const r2 = await load(rt2, { hot, wait: 300 });
    ok(text(r2.d, "#dvName") === "Beta", "restores the dot you were on");
    ok(r2.d.querySelector("#reply")?.value === "half-typed reply", "restores your unsent message");
    ok(typeof snapFn === "function" && snapFn().selected === "dot_b", "registers a snapshot of your place");
    ok(r2.errors.length === 0, "no errors on restore" + (r2.errors.length ? ": " + r2.errors.join(" | ") : ""));
  }
  {
    const rt2 = makeRuntime();
    const hot = { snapshot() {}, ready() { /* never calls back */ } };
    const r2 = await load(rt2, { hot, wait: 3200 });
    ok(/Good|Still up/.test(text(r2.d, "#greet")), "boots anyway when hot.ready never answers");
  }

  console.log("18b. Create fails: says why");
  {
    const rt9 = makeRuntime({ createFail: true, canSend: "no_session" });
    rt9.db.store.set(`data/users/${UID}/dot_c`, { type: "dot", name: "Gamma", responsibility: "C", rules: [], sources: [], cadence: "daily", tier: "default", hue: 90, createdAt: 1, lastRunAt: null });
    const r9 = await load(rt9, { wait: 300 });
    click(r9.w, r9.d.querySelector('#dotList [data-id="dot_c"]')); await tick(20);
    click(r9.w, r9.d.querySelector('#dvTabs [data-tab="schedule"]')); await tick(20);
    click(r9.w, r9.d.querySelector('#cloud [data-act="cloud-open"]')); await tick(10);
    click(r9.w, r9.d.querySelector('#cloud [data-act="cloud-create"]')); await tick(80);
    ok(/couldn't create it: environment_id is required/i.test(text(r9.d, "#cloud")), "says why: " + text(r9.d, "#cloud .err"));
    ok(!r9.d.querySelector('#cloud [data-act="cloud-copy"]') && !r9.d.querySelector('#cloud [data-act="cloud-handoff"]'), "no copy-and-paste fallback; the error says what happened");
    ok(!rt9.db.store.get(`data/users/${UID}/dot_c`).cloudPending, "a refused create isn't left pending");
  }
  {
    const rt10 = makeRuntime({ askMode: true });
    rt10.db.store.set(`data/users/${UID}/dot_c`, { type: "dot", name: "Gamma", responsibility: "C", rules: [], sources: [], cadence: "daily", tier: "default", hue: 90, createdAt: 1, lastRunAt: null });
    const r10 = await load(rt10, { wait: 300 });
    click(r10.w, r10.d.querySelector('#dotList [data-id="dot_c"]')); await tick(20);
    click(r10.w, r10.d.querySelector('#dvTabs [data-tab="schedule"]')); await tick(20);
    click(r10.w, r10.d.querySelector('#cloud [data-act="cloud-open"]')); await tick(10);
    click(r10.w, r10.d.querySelector('#cloud [data-act="cloud-create"]')); await tick(100);
    ok(/Automatically approve/.test(text(r10.d, "#cloud")), "tells you when its runs will stop to ask");
  }
  console.log("19. No Claude conversation beside the page");
  {
    const rt4 = makeRuntime({ canSend: "no_session" });
    rt4.db.store.set(`data/users/${UID}/dot_c`, { type: "dot", name: "Gamma", responsibility: "C", rules: [], sources: ["calendar"], cadence: "daily", tier: "default", hue: 90, createdAt: 1, lastRunAt: null });
    const r4 = await load(rt4, { wait: 300 });
    click(r4.w, r4.d.querySelector('#dotList [data-id="dot_c"]')); await tick(20);
    click(r4.w, r4.d.querySelector('#dvTabs [data-tab="schedule"]')); await tick(20);
    click(r4.w, r4.d.querySelector('#cloud [data-act="cloud-open"]')); await tick(10);
    ok(!!r4.d.querySelector('#cloud [data-act="cloud-create"]'), "one-click Keep it awake works without a chat beside the page");
    ok(r4.errors.length === 0, "no errors" + (r4.errors.length ? ": " + r4.errors.join(" | ") : ""));
  }

  console.log("21. Any app: Apps page, a Slack dot, asks built from tools");
  {
    const rt9 = makeRuntime({ slack: true, linear: true, perms: { "mcp:Slack": "prompt" } });
    rt9.db.store.set(`data/users/${UID}/dot_s`, { type: "dot", name: "Launch watch", responsibility: "Watch Slack for launch questions.", rules: [], sources: ["Slack", "calendar"], cadence: "daily", tier: "default", hue: 300, createdAt: 1, lastRunAt: null });
    rt9.db.store.set(`data/users/${UID}/dot_f`, { type: "dot", name: "File keeper", responsibility: "Watch shared files.", rules: [], sources: ["Google Drive"], cadence: "daily", tier: "default", hue: 140, createdAt: 2, lastRunAt: null });
    const r9 = await load(rt9, { wait: 300 });
    const { w: w9, d: d9 } = r9;
    click(w9, d9.querySelector('#nav [data-nav="apps"]')); await tick(30);
    const keys = [...d9.querySelectorAll("#appGrid .appcard")].map(c => c.dataset.key);
    ok(JSON.stringify(keys) === JSON.stringify(["Google Calendar", "Gmail", "Linear", "Slack", "Google Drive", "GitHub"]), "Apps page: this copy's connectors, then apps a dot misses, then GitHub: " + keys.join(", "));
    const linearCard = d9.querySelector('#appGrid [data-key="Linear"]');
    ok(/1 thing it can read · 2 actions it can propose \(1 can't be undone\)/.test(linearCard.textContent) && /--h:\s*\d+/.test(linearCard.getAttribute("style")), "an app Dotworks has never heard of works the same way");
    click(w9, d9.querySelector('#appGrid [data-key="GitHub"] [data-act="repos-toggle"]')); await tick(40);
    ok(/3 repos you can reach/.test(text(d9, '#appGrid [data-key="GitHub"]')) && /disrupt-gt\/course-materials/.test(text(d9, '#appGrid [data-key="GitHub"]')), "GitHub card lists your repos");
    const slackCard = d9.querySelector('#appGrid [data-key="Slack"]'), driveCard = d9.querySelector('#appGrid [data-key="Google Drive"]');
    ok(/asks first/.test(slackCard.textContent) && !!slackCard.querySelector('[data-act="allow"]') && /used by Launch watch/.test(slackCard.textContent), "Slack: asks first, Allow now, used by its dot");
    ok(/not connected in Claude/.test(driveCard.textContent) && /used by File keeper/.test(driveCard.textContent) && /update Dotworks/.test(driveCard.textContent) && !driveCard.querySelector('[data-act="app-toggle"]'), "Drive: a dot needs it, says it isn't here and how to add it");
    click(w9, slackCard.querySelector('[data-act="app-tools"]')); await tick(10);
    ok(/send message ⚠/.test(text(d9, '#appGrid [data-key="Slack"]')) && /search public/.test(text(d9, '#appGrid [data-key="Slack"]')), "See tools: reads and actions, irreversible ones marked");
    click(w9, d9.querySelector('#appGrid [data-key="Gmail"] [data-act="app-toggle"]')); await tick(30);
    ok(JSON.stringify(rt9.db.store.get(`data/users/${UID}/apps_prefs`)?.off) === '["Gmail"]' && /off for Dotworks/.test(text(d9, '#appGrid [data-key="Gmail"]')), "Turn off Gmail: saved, shown");
    click(w9, d9.querySelector('#nav [data-nav="home"]')); await tick(10);
    click(w9, d9.querySelector('#sideNew')); await tick(30);
    const srcText = text(d9, '[id$="-srcs"]');
    ok(/Slack/.test(srcText) && /Calendar/.test(srcText) && !/Gmail/.test(srcText), "new dot offers the apps that are on: " + srcText);
    w9.document.dispatchEvent(new w9.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await tick(20);
    click(w9, d9.querySelector('#dotList [data-id="dot_s"]')); await tick(20);
    click(w9, d9.querySelector('#dvAct [data-act="run"]')); await tick(600);
    ok((rt9.flags.slackTools || []).includes("slack_slack_search_public"), "the dot reads Slack with its own tool");
    ok(/Slack · slack_send_message \[can't be undone\]/.test(rt9.flags.slackDesc || "") && /Google Calendar · update_event/.test(rt9.flags.slackDesc || "") && /eventId\*/.test(rt9.flags.slackDesc || ""), "propose_action lists the dot's app tools with their arguments");
    ok(!/Gmail ·/.test(rt9.flags.slackDesc || ""), "a dot can't propose tools of apps it doesn't read");
    const acts = [...rt9.db.store.entries()].filter(([k, v]) => k.startsWith(`data/users/${UID}/act_`)).map(([, v]) => v);
    const tSlack = acts.find(a => a.kind === "tool" && a.payload.tool === "slack_send_message"), tCal = acts.find(a => a.kind === "tool" && a.payload.tool === "update_event"), note = acts.find(a => a.kind === "note");
    ok(tSlack && !("bogus" in tSlack.payload.input) && tCal && tCal.context?.title === "Dashboard review", "tool asks saved; unknown args dropped; context from the event");
    ok(note && !("whyNote" in note) && /isn't one of this dot's apps/.test(rt9.flags.r3 || ""), "a tool from another app becomes a note, and the dot is told why");
    click(w9, d9.querySelector('#nav [data-nav="asks"]')); await tick(40);
    ok(/Slack/.test(text(d9, "#asksFilter")) && /Calendar/.test(text(d9, "#asksFilter")), "filters by app: " + text(d9, "#asksFilter"));
    const findCard = (id) => [...d9.querySelectorAll("#asksList .ask")].find(c => c.dataset.key === id);
    const actIdOf = a => [...rt9.db.store.entries()].find(([, v]) => v === a)?.[0].split("/").pop();
    const calId = actIdOf(tCal), slackId = actIdOf(tSlack);
    let cc = findCard(calId);
    ok(cc && cc.querySelector("textarea") && cc.querySelector("select") && /Notification Level/.test(cc.textContent) && /Event Id/.test(cc.textContent), "Calendar card built from the tool: description box, notify dropdown, event id");
    const ta = cc.querySelector("textarea"); ta.value = "Agenda\n1. Status\n2. Risks\n3. Decisions"; ta.dispatchEvent(new w9.Event("input", { bubbles: true }));
    const sel = cc.querySelector("select"); sel.value = "ALL"; sel.dispatchEvent(new w9.Event("input", { bubbles: true }));
    click(w9, cc.querySelector('[data-act="exec"]')); await tick(60);
    const up = rt9.calls.mcp.find(c => c.tool === "update_event");
    ok(up && up.input.description.endsWith("3. Decisions") && up.input.notificationLevel === "ALL" && up.input.eventId === "e1", "Approve runs the tool with your edits");
    ok(rt9.db.store.get(`data/users/${UID}/${calId}`)?.state === "done" && rt9.db.store.get(`data/users/${UID}/${calId}`)?.result?.url === "https://calendar.google.com/e1", "marked done with a link back");
    let sc = findCard(slackId);
    ok(sc && sc.querySelector('[data-act="arm"]') && !sc.querySelector('[data-act="exec"]') && /can't be undone/.test(sc.textContent), "Slack send: red button, says it can't be undone");
    click(w9, sc.querySelector('[data-act="arm"]')); await tick(10);
    sc = findCard(slackId);
    ok(!rt9.calls.mcp.some(c => c.tool === "slack_send_message") && sc.querySelector('.btn.risk[data-act="exec"]') && /Yes, post/.test(sc.textContent), "first tap only arms it");
    click(w9, sc.querySelector('[data-act="exec"]')); await tick(60);
    const sent = rt9.calls.mcp.find(c => c.tool === "slack_send_message");
    ok(sent && sent.input.channel_id === "C1" && sent.input.message === "Launch is Tuesday 10am.", "second tap runs it");
  }
  console.log("22. Repos per dot: none, some, all; scheduled wakes read them");
  {
    const rt = makeRuntime();
    rt.db.store.set(`data/users/${UID}/dot_r`, { type: "dot", name: "PR watch", responsibility: "Watch my PRs.", rules: [], sources: ["calendar"], cadence: "daily", tier: "default", hue: 20, createdAt: 1, lastRunAt: null });
    const { w, d } = await load(rt, { wait: 300 });
    click(w, d.querySelector('#sideNew')); await tick(30);
    ok(/GitHub repos/.test(text(d, "#sh-repoField")) && d.querySelector('#sh-repoField [data-id="none"]').getAttribute("aria-pressed") === "true", "new dot: repos field, None by default");
    click(w, d.querySelector('#sh-repoField [data-act="repo-mode"][data-id="some"]')); await tick(60);
    ok(d.querySelectorAll("#sh-rlist .repo-opt").length === 3, "Pick repos lists your real repos");
    const q = d.querySelector("#sh-repoq"); q.value = "course"; q.dispatchEvent(new w.Event("input", { bubbles: true })); await tick(10);
    ok(d.querySelectorAll("#sh-rlist .repo-opt").length === 1 && /course-materials/.test(text(d, "#sh-rlist")), "search narrows the list");
    click(w, d.querySelector('#sh-rlist [data-act="pick-repo"]')); await tick(10);
    ok(/disrupt-gt\/course-materials/.test(text(d, "#sh-repoField .people")) && d.querySelectorAll("#sh-rlist .repo-opt").length === 2, "picked repo shows as a chip and leaves the list");
    const nm = d.querySelector("#sh-name"); nm.value = "Course PRs"; nm.dispatchEvent(new w.Event("input", { bubbles: true }));
    const rs = d.querySelector("#sh-resp"); rs.value = "Tell me which pull requests need me."; rs.dispatchEvent(new w.Event("input", { bubbles: true }));
    submit(w, d.querySelector("#sh-form")); await tick(120);
    const made = [...rt.db.store.entries()].find(([k, v]) => v?.name === "Course PRs")?.[1];
    ok(made && JSON.stringify(made.repos) === JSON.stringify({ mode: "some", list: ["disrupt-gt/course-materials"] }), "saved with its repo: " + JSON.stringify(made?.repos));
    ok(/repos course-materials/.test(text(d, ".dv-meta")), "header shows its repo");
    // settings: switch to all
    click(w, d.querySelector('#dvTabs [data-tab="settings"]')); await tick(30);
    click(w, d.querySelector('#st-repoField [data-act="repo-mode"][data-id="all"]')); await tick(40);
    ok(/All 3 repos you can reach/.test(text(d, "#st-repoField")), "All my repos says how many");
    submit(w, d.querySelector("#st-form")); await tick(120);
    const made2 = [...rt.db.store.entries()].find(([k, v]) => v?.name === "Course PRs")?.[1];
    ok(made2?.repos?.mode === "all" && made2.repos.list.length === 0, "switched to all repos");
    // pick mode with nothing picked is refused
    click(w, d.querySelector('#st-repoField [data-act="repo-mode"][data-id="some"]')); await tick(40);
    submit(w, d.querySelector("#st-form")); await tick(60);
    ok(/Pick at least one repo/.test(text(d, "#st-err")), "Pick repos with none picked is refused");
    click(w, d.querySelector('#st-repoField [data-act="repo-mode"][data-id="all"]')); await tick(20);
    // waking here: sees repos' last push, told the cloud reads them in full
    click(w, d.querySelector('#dvTabs [data-tab="chat"]')); await tick(20);
    click(w, d.querySelector('#dvAct [data-act="run"]')); await tick(500);
    const wake = rt.calls.sample.filter(c => typeof c.input === "string" && /waking for a check-in/.test(c.input)).pop();
    ok(wake?.o.tools?.includes("github_repos") && /Your GitHub repos: all the owner can reach/.test(wake.input) && /cloud wakes read them in full/.test(wake.input), "in-app wake gets github_repos and is told cloud wakes read them in full");
    // a plain dot has no repo tool
    click(w, d.querySelector('#dotList [data-id="dot_r"]')); await tick(30);
    click(w, d.querySelector('#dvAct [data-act="run"]')); await tick(500);
    const wake2 = rt.calls.sample.filter(c => typeof c.input === "string" && /waking for a check-in/.test(c.input)).pop();
    ok(!wake2?.o.tools?.includes("github_repos") && !/GitHub repos/.test(wake2.input), "a dot without repos has no repo tool");
  }
  console.log("23. A copy that doesn't know its own address yet");
  {
    const rt = makeRuntime({ noAppUrl: true });
    rt.db.store.set(`data/users/${UID}/dot_c`, { type: "dot", name: "Gamma", responsibility: "C", rules: [], sources: [], cadence: "daily", tier: "default", hue: 90, createdAt: 1, lastRunAt: null });
    const { w, d } = await load(rt, { wait: 300 });
    click(w, d.querySelector('#dotList [data-id="dot_c"]')); await tick(20);
    click(w, d.querySelector('#dvTabs [data-tab="schedule"]')); await tick(20);
    click(w, d.querySelector('#cloud [data-act="cloud-open"]')); await tick(20);
    ok(d.querySelector('#cloud [data-act="cloud-create"]')?.disabled === true && /finish Dotworks setup/.test(text(d, "#cloud")), "Keep it awake waits for setup and says how to finish it");
    ok(!rt.calls.mcp.some(c => c.tool === "create_trigger"), "creates nothing that couldn't find its way back");
    rt.db.store.set("meta/app", { url: "https://claude.ai/artifact/TestDotworks01" }); await rt.db.api.doc("meta/app").set({ url: "https://claude.ai/artifact/TestDotworks01" }); await tick(30);
    ok(d.querySelector('#cloud [data-act="cloud-create"]')?.disabled === false, "lights up as soon as setup records the address");
  }
  console.log("24. A teammate's copy without Google Calendar");
  {
    const rt = makeRuntime({ noCal: true, slack: true });
    const { w, d, errors } = await load(rt, { wait: 300 });
    ok(d.querySelector("#horizon") && d.querySelector("#horizon").innerHTML === "", "no day strip and no offer to read a calendar it doesn't have");
    click(w, d.querySelector('#nav [data-nav="apps"]')); await tick(30);
    const keys = [...d.querySelectorAll("#appGrid .appcard")].map(c => c.dataset.key);
    ok(JSON.stringify(keys) === JSON.stringify(["Gmail", "Slack", "GitHub"]), "Apps page shows only their apps: " + keys.join(", "));
    click(w, d.querySelector('#nav [data-nav="home"]')); await tick(10);
    click(w, d.querySelector("#sideNew")); await tick(30);
    const srcText = text(d, '[id$="-srcs"]');
    ok(/Gmail/.test(srcText) && /Slack/.test(srcText) && !/Calendar/.test(srcText), "new dot offers their apps: " + srcText);
    ok(errors.length === 0, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  }
  console.log("25. Questions: a dot asks, you answer, it carries on");
  {
    const rt = makeRuntime({ ask: true });
    rt.db.store.set(`data/users/${UID}/dot_q`, { type: "dot", name: "PR chaser", responsibility: "Chase my pull request reviews.", rules: [], sources: ["calendar"], cadence: "daily", tier: "default", hue: 20, createdAt: 1, lastRunAt: null });
    const { w, d, errors } = await load(rt, { wait: 300 });
    click(w, d.querySelector('#dotList [data-id="dot_q"]')); await tick(30);
    click(w, d.querySelector('#dvAct [data-act="run"]')); await tick(500);
    ok(rt.flags.askTools?.includes("ask_owner") && /If the right move depends on something only the owner knows, call ask_owner/.test(rt.flags.lastWake || ""), "a wake can ask, and is told when to");
    const qs = actsIn(rt).filter(a => a.kind === "question");
    ok(qs.length === 1 && qs[0].title === "Which reviews should I chase?" && qs[0].question.choices.map(c => c.label).join("|") === "Pending only|All open" && qs[0].question.allowText === true, "question saved: duplicate choices merged, own words allowed");
    ok(/already asked a question/.test(rt.flags.secondAsk || ""), "one question per wake");
    const qid = qs[0].id;
    click(w, d.querySelector('#nav [data-nav="asks"]')); await tick(40);
    const card = [...d.querySelectorAll("#asksList .ask")].find(c => c.dataset.key === qid);
    ok(card && card.querySelectorAll(".choice").length === 2 && !!card.querySelector('[data-edit="answer"]') && !card.querySelector('[data-act="handoff"]') && /Question/.test(card.textContent), "card: two answers to tap, a box for your own words, nothing to hand off");
    ok(/Questions · 1/.test(text(d, "#asksFilter")), "filter chip for questions");
    click(w, card.querySelector('[data-act="answer"][data-choice="c1"]')); await tick(400);
    const answered = rt.db.store.get(`data/users/${UID}/${qid}`);
    ok(answered?.state === "done" && answered.answer?.text === "Pending only" && answered.answer.choice === "c1", "your answer is saved");
    ok(rt.flags.carried === 1 && /My answer to your question “Which reviews should I chase\?”: Pending only/.test(rt.flags.carriedWith || ""), "the dot carries on with your answer right away");
    const runKey = [...rt.db.store.keys()].find(k => k.startsWith(`data/users/${UID}/dot_q/runs/`));
    const th = rt.db.store.get(runKey)?.thread || [];
    ok(th.some(t => t.kind === "answer" && t.actId === qid) && th.some(t => t.role === "dot" && /chase the pending ones/.test(t.text)), "answer and reply kept on the note's thread");
    ok(!!rt.db.store.get(`data/users/${UID}/${qid}`)?.continuedAt, "marked as acted on");
    click(w, d.querySelector('#dotList [data-id="dot_q"]')); await tick(60);
    ok(/Which reviews should I chase\?/.test(text(d, "#msgs .q-done")) && /Pending only/.test(text(d, "#msgs .q-done .q-ans")) && !qa(d, "#msgs .msg.you .bubble").some(b => /My answer to your question/.test(b.textContent)), "chat shows the question and your answer, not the plumbing");
    ok(/chase the pending ones/.test(text(d, "#msgs")), "and the dot's reply");
    // a question written by a cloud wake, answered in your own words
    rt.db.store.set(`data/users/${UID}/act_cq`, { type: "action", source: "cloud", dotId: "dot_q", runId: "run_cloud1", state: "pending", createdAt: Date.now(), kind: "question", title: "Which repo matters most this week?", why: "Two are busy", question: { choices: [{ id: "a", label: "course-materials" }, { id: "a", label: "ridge" }, { label: "" }], allowText: false } });
    await rt.db.api.doc(`data/users/${UID}/act_cq`).update({ why: "Two are busy" }); await tick(40);
    click(w, d.querySelector('#nav [data-nav="asks"]')); await tick(40);
    const cq = [...d.querySelectorAll("#asksList .ask")].find(c => c.dataset.key === "act_cq");
    ok(cq && cq.querySelectorAll(".choice").length === 2 && new Set([...cq.querySelectorAll(".choice")].map(b => b.dataset.choice)).size === 2 && !cq.querySelector('[data-edit="answer"]'), "cloud question: odd choices cleaned, ids kept unique");
    ok(errors.length === 0, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  }
  {
    const rt = makeRuntime({ ask: true });
    rt.db.store.set(`data/users/${UID}/dot_q`, { type: "dot", name: "PR chaser", responsibility: "Chase my pull request reviews.", rules: [], sources: ["calendar"], cadence: "daily", tier: "default", hue: 20, createdAt: 1, lastRunAt: null });
    rt.db.store.set(`data/users/${UID}/act_free`, { type: "action", source: "page", dotId: "dot_q", runId: "run_x", state: "pending", createdAt: Date.now(), kind: "question", title: "What should I call the weekly digest?", question: { choices: [], allowText: false } });
    rt.db.store.set(`data/users/${UID}/act_old`, { type: "action", source: "page", dotId: "dot_q", runId: "run_y", state: "done", decidedAt: Date.now(), createdAt: Date.now() - 864e5, kind: "question", title: "Should I include drafts?", question: { choices: [{ id: "c1", label: "Yes" }, { id: "c2", label: "No" }] }, answer: { choice: "c2", text: "No", at: Date.now() - 3600e3 } });
    const { w, d, errors } = await load(rt, { wait: 300 });
    click(w, d.querySelector('#nav [data-nav="asks"]')); await tick(40);
    const fc = [...d.querySelectorAll("#asksList .ask")].find(c => c.dataset.key === "act_free");
    ok(fc && !fc.querySelector(".choice") && !!fc.querySelector('[data-edit="answer"]'), "no real choices: answer in your own words");
    const inp = fc.querySelector('[data-edit="answer"]'); typeIn(w, inp, "  The Monday brief ");
    inp.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await tick(300);
    const fa = rt.db.store.get(`data/users/${UID}/act_free`);
    ok(fa?.state === "done" && fa.answer?.text === "The Monday brief" && fa.answer.choice === null, "Enter sends your own words");
    ok(!rt.flags.carried && /use your answer when it next wakes/.test(text(d, ".toast:last-child") + [...d.querySelectorAll(".toast")].map(t => t.textContent).join(" ")), "no note to continue from: it waits for the next wake, and says so");
    click(w, d.querySelector('#dotList [data-id="dot_q"]')); await tick(30);
    click(w, d.querySelector('#dvAct [data-act="run"]')); await tick(500);
    ok(/The owner answered your questions:/.test(rt.flags.lastWake || "") && /“Should I include drafts\?” → No/.test(rt.flags.lastWake) && /“What should I call the weekly digest\?” → The Monday brief/.test(rt.flags.lastWake), "the next wake gets every answer it hasn't acted on");
    await tick(50);
    ok(!!rt.db.store.get(`data/users/${UID}/act_old`)?.continuedAt && !!rt.db.store.get(`data/users/${UID}/act_free`)?.continuedAt, "and marks them acted on");
    ok(errors.length === 0, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  }
  console.log("26. One box on Home: it finds the right dot");
  {
    const two = rt => {
      rt.db.store.set(`data/users/${UID}/dot_a`, { type: "dot", name: "Meeting prep", responsibility: "Look at my meetings and flag invites I haven't answered.", rules: [], sources: ["calendar"], cadence: "daily", tier: "default", hue: 214, createdAt: 1, lastRunAt: null });
      rt.db.store.set(`data/users/${UID}/dot_b`, { type: "dot", name: "Inbox triage", responsibility: "Scan unread email and sum up what needs a reply.", rules: [], sources: ["gmail"], cadence: "daily", tier: "default", hue: 28, createdAt: 2, lastRunAt: null });
    };
    const routeCalls = rt => rt.calls.sample.filter(c => c.json && /Pick the dot whose job this message belongs to/.test(c.input));
    const chatSent = (rt, msg) => rt.calls.sample.some(c => Array.isArray(c.input) && c.input[c.input.length - 1]?.content === msg);
    {
      const rt = makeRuntime({ route: { dot: "dot_b", sure: true } }); two(rt);
      const { w, d, errors } = await load(rt, { wait: 300 });
      ok(d.querySelector("#tell") && !d.querySelector("#tell").hidden && /Tell your dots/.test(d.querySelector("#tellIn").placeholder), "the box is on Home");
      typeIn(w, d.querySelector("#tellIn"), "Did Sara reply about the deck?"); submit(w, d.querySelector("#tell")); await tick(500);
      ok(routeCalls(rt).length === 1 && /dot_a: "Meeting prep"/.test(routeCalls(rt)[0].input) && /dot_b: "Inbox triage"/.test(routeCalls(rt)[0].input), "Claude picks among your dots");
      ok(text(d, "#dvName") === "Inbox triage" && chatSent(rt, "Did Sara reply about the deck?"), "lands in the right dot's chat and it replies");
      ok(d.querySelector("#tellIn") === null || d.querySelector("#tellIn").value === "", "box cleared");
      ok(errors.length === 0, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
    }
    {
      const rt = makeRuntime({ route: { dot: "dot_a", sure: false } }); two(rt);
      const { w, d } = await load(rt, { wait: 300 });
      typeIn(w, d.querySelector("#tellIn"), "Keep an eye on things"); submit(w, d.querySelector("#tell")); await tick(300);
      const chips = qa(d, '#tellNote [data-act="tell-pick"]');
      ok(/Which dot should take this\?/.test(text(d, "#tellNote")) && chips[0]?.dataset.id === "dot_a" && chips.length === 2 && !!d.querySelector('#tellNote [data-act="tell-new"]'), "not sure: asks which, its best guess first");
      click(w, chips[0]); await tick(500);
      ok(text(d, "#dvName") === "Meeting prep" && chatSent(rt, "Keep an eye on things"), "your pick gets it");
    }
    {
      const rt = makeRuntime({ route: { dot: "none" } }); two(rt);
      const { w, d } = await load(rt, { wait: 300 });
      typeIn(w, d.querySelector("#tellIn"), "Watch my Supabase costs"); submit(w, d.querySelector("#tell")); await tick(300);
      ok(/None of your dots does this yet/.test(text(d, "#tellNote")), "no dot does it: says so");
      click(w, d.querySelector('#tellNote [data-act="tell-new"]')); await tick(200);
      ok(!!d.querySelector("#sh-form") && d.querySelector("#sh-ask")?.value === "Watch my Supabase costs" && rt.calls.sample.some(c => c.json && /Turn this request/.test(c.input) && /Watch my Supabase costs/.test(c.input)), "offers a new dot, shaped from what you said");
    }
    {
      const rt = makeRuntime();
      rt.db.store.set(`data/users/${UID}/dot_a`, { type: "dot", name: "Meeting prep", responsibility: "Look at my meetings.", rules: [], sources: ["calendar"], cadence: "daily", tier: "default", hue: 214, createdAt: 1, lastRunAt: null });
      const { w, d } = await load(rt, { wait: 300 });
      typeIn(w, d.querySelector("#tellIn"), "What's first tomorrow?"); submit(w, d.querySelector("#tell")); await tick(500);
      ok(routeCalls(rt).length === 0 && text(d, "#dvName") === "Meeting prep" && chatSent(rt, "What's first tomorrow?"), "one dot: straight to it, no routing call");
    }
    {
      const rt = makeRuntime({ perms: { sample: "denied" } }); two(rt);
      const { d } = await load(rt, { wait: 300 });
      ok(d.querySelector("#tell")?.hidden === true, "no Claude here: no box");
    }
  }
  console.log("27. Receipts and undo");
  {
    const rt = makeRuntime({ undo: true, perms: { "mcp:Gmail": "granted" } });
    rt.db.store.set(`data/users/${UID}/dot_c`, { type: "dot", name: "Gamma", responsibility: "C", rules: [], sources: ["calendar", "gmail"], cadence: "daily", tier: "default", hue: 90, createdAt: 1, lastRunAt: null });
    const now = Date.now();
    rt.db.store.set(`data/users/${UID}/act_r`, { type: "action", source: "page", dotId: "dot_c", state: "pending", createdAt: now - 5000, kind: "reply", title: "Reply to Sara", why: "x", payload: { to: ["sara@x.com"], subject: "Re: deck", body: "Looks good", replyToMessageId: "m1" } });
    rt.db.store.set(`data/users/${UID}/act_u`, { type: "action", source: "page", dotId: "dot_c", state: "pending", createdAt: now - 4000, kind: "tool", title: "Add agenda", why: "x", verb: "Add agenda", payload: { server: "Google Calendar", tool: "update_event", input: { eventId: "e1", description: "Old notes\n\nAgenda: 1. Status", notificationLevel: "NONE" } } });
    rt.db.store.set(`data/users/${UID}/act_u2`, { type: "action", source: "page", dotId: "dot_c", state: "pending", createdAt: now - 3000, kind: "tool", title: "Add agenda to Standup", why: "x", verb: "Add agenda", payload: { server: "Google Calendar", tool: "update_event", input: { eventId: "e2", description: "Agenda: blockers" } } });
    rt.db.store.set(`data/users/${UID}/act_b`, { type: "action", source: "page", dotId: "dot_c", state: "pending", createdAt: now - 2000, kind: "block", title: "Focus", why: "x", payload: { title: "Focus: Q4 plan", start: new Date(now + 864e5).toISOString(), end: new Date(now + 864e5 + 3600e3).toISOString() } });
    const { w, d, errors } = await load(rt, { wait: 300 });
    click(w, d.querySelector('#nav [data-nav="asks"]')); await tick(40);
    const cardOf = id => [...d.querySelectorAll("#asksList .ask")].find(c => c.dataset.key === id);
    click(w, cardOf("act_r").querySelector('[data-act="exec"]')); await tick(80);
    const r = rt.db.store.get(`data/users/${UID}/act_r`)?.result;
    ok(r?.receipt?.app === "Gmail draft" && r.receipt.lines[0] === "To sara@x.com" && /Re: deck/.test(r.receipt.lines[1]) && r.undo?.tool === "delete_draft" && r.undo.input.draftId === "d1", "a draft's receipt, and how to take it back");
    const tb = [...d.querySelectorAll(".toast")].pop();
    ok(/Draft saved in Gmail/.test(tb?.textContent || "") && /Undo/.test(tb?.querySelector("button")?.textContent || ""), "the toast offers Undo");
    click(w, tb.querySelector("button")); await tick(80);
    ok(rt.calls.mcp.some(c => c.tool === "delete_draft" && c.input.draftId === "d1") && !!rt.db.store.get(`data/users/${UID}/act_r`)?.result?.undone, "Undo deletes exactly that draft");
    const before = rt.calls.mcp.length;
    click(w, cardOf("act_u").querySelector('[data-act="exec"]')); await tick(80);
    const gi = rt.calls.mcp.slice(before).map(c => c.tool).join(",");
    const u = rt.db.store.get(`data/users/${UID}/act_u`)?.result;
    ok(gi === "get_event,update_event" && u?.undo?.input?.description === "Old notes" && u.undo.input.notificationLevel === "NONE" && u.undo.input.eventId === "e1", "an update reads the old text first, so it can be put back");
    click(w, cardOf("act_u2").querySelector('[data-act="exec"]')); await tick(80);
    ok(rt.db.store.get(`data/users/${UID}/act_u2`)?.result?.undo === null, "no old text to restore: no undo offered");
    click(w, cardOf("act_b").querySelector('[data-act="exec"]')); await tick(80);
    const b = rt.db.store.get(`data/users/${UID}/act_b`)?.result;
    ok(b?.undo?.tool === "delete_event" && b.undo.input.eventId === "ev_new" && b.undo.input.notificationLevel === "NONE", "a focus block can be removed again");
    d.querySelector("#handled details").open = true;
    const rows = qa(d, "#handled .done-row");
    ok(rows.length === 4 && /Gmail draft · To sara@x.com/.test(rows.map(x => x.textContent).join(" ")) && /undone/.test(rows.map(x => x.textContent).join(" ")) && rows.filter(x => x.querySelector('[data-act="undo"]')).length === 2, "handled list: receipts, Undo where it applies, and what was undone");
    click(w, rows.find(x => x.querySelector('[data-act="undo"]') && /Focus/.test(x.textContent)).querySelector('[data-act="undo"]')); await tick(80);
    ok(rt.calls.mcp.some(c => c.tool === "delete_event" && c.input.eventId === "ev_new"), "Undo from the list works too");
    ok(errors.length === 0, "no errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  }
  {
    const rt = makeRuntime({ undo: true, draftGone: true, perms: { "mcp:Gmail": "granted" } });
    rt.db.store.set(`data/users/${UID}/act_old`, { type: "action", source: "page", dotId: "dot_c", state: "done", createdAt: Date.now() - 3 * 864e5, decidedAt: Date.now() - 2 * 864e5, kind: "reply", title: "Old reply", result: { label: "Draft saved in Gmail", receipt: { app: "Gmail draft", lines: ["To a@x.com"] }, undo: { server: "Gmail", tool: "delete_draft", input: { draftId: "d0" }, label: "Delete the draft" } } });
    rt.db.store.set(`data/users/${UID}/act_new`, { type: "action", source: "page", dotId: "dot_c", state: "done", createdAt: Date.now() - 600e3, decidedAt: Date.now() - 500e3, kind: "reply", title: "New reply", result: { label: "Draft saved in Gmail", receipt: { app: "Gmail draft", lines: ["To b@x.com"] }, undo: { server: "Gmail", tool: "delete_draft", input: { draftId: "d9" }, label: "Delete the draft" } } });
    const { w, d } = await load(rt, { wait: 300 });
    click(w, d.querySelector('#nav [data-nav="asks"]')); await tick(40);
    d.querySelector("#handled details").open = true;
    const rows = qa(d, "#handled .done-row");
    ok(!rows.find(x => /Old reply/.test(x.textContent)).querySelector('[data-act="undo"]'), "after a day, no Undo");
    click(w, rows.find(x => /New reply/.test(x.textContent)).querySelector('[data-act="undo"]')); await tick(80);
    ok(/Couldn't undo it: Draft not found/.test([...d.querySelectorAll(".toast")].map(t => t.textContent).join(" ")) && !rt.db.store.get(`data/users/${UID}/act_new`)?.result?.undone, "if it changed since, it says so and changes nothing");
  }
  console.log("20. Claude declined for this page");
  {
    const rt8 = makeRuntime({ perms: { sample: "denied" } });
    rt8.db.store.set(`data/users/${UID}/dot_c`, { type: "dot", name: "Gamma", responsibility: "C", rules: [], sources: ["calendar"], cadence: "daily", tier: "default", hue: 90, createdAt: 1, lastRunAt: null });
    const r8 = await load(rt8, { wait: 300 });
    click(r8.w, r8.d.querySelector('#dotList [data-id="dot_c"]')); await tick(20);
    ok(/turned off/.test(text(r8.d, "#banner")), "banner says Claude is turned off: " + text(r8.d, "#banner"));
    ok(r8.d.querySelector('#dvAct [data-act="run"]').disabled && r8.d.querySelector("#reply").disabled, "Wake and composer disabled");
  }

  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("HARNESS CRASH", e); process.exit(2); });
