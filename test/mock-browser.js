// Browser-side mock of the Claude artifact runtime, for screenshots only. Scenario picked by window.__scene.
(() => {
  const scene = window.__scene || "full";
  const clone = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
  const iso = ms => new Date(Date.now() + ms).toISOString();
  const UID = "u_me";
  function merge(a, b) { const out = { ...(a || {}) }; for (const [k, v] of Object.entries(b)) { if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object") out[k] = merge(out[k], v); else out[k] = clone(v); } return out; }
  const store = new Map(), listeners = new Set();
  const notify = () => { for (const l of [...listeners]) l.fire(); };
  const snap = (p, d) => ({ id: p.split("/").pop(), exists: d !== undefined, data: () => clone(d), metadata: {} });
  const docRef = p => ({ id: p.split("/").pop(), path: p,
    async get() { return snap(p, store.get(p)); }, async set(d) { store.set(p, clone(d)); queueMicrotask(notify); },
    async update(d) { store.set(p, merge(store.get(p), d)); queueMicrotask(notify); }, async delete() { store.delete(p); queueMicrotask(notify); },
    async acquire() { return { acquired: true }; }, onSnapshot(n) { const l = { fire: () => n(snap(p, store.get(p))) }; listeners.add(l); queueMicrotask(l.fire); return () => listeners.delete(l); },
    collection: s => colRef(p + "/" + s) });
  const colRef = (p, q = { w: [], o: null, l: null }) => {
    const run = () => { let ds = [...store.entries()].filter(([k]) => k.slice(0, k.lastIndexOf("/")) === p).map(([k, d]) => ({ k, d }));
      for (const [f, , v] of q.w) ds = ds.filter(x => x.d[f] === v);
      if (q.o) ds.sort((a, b) => ((a.d[q.o[0]] ?? 0) - (b.d[q.o[0]] ?? 0)) * (q.o[1] === "desc" ? -1 : 1));
      if (q.l) ds = ds.slice(0, q.l); const docs = ds.map(x => snap(x.k, x.d)); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} }; };
    return { path: p, where: (f, o, v) => colRef(p, { ...q, w: [...q.w, [f, o, v]] }), orderBy: (f, d = "asc") => colRef(p, { ...q, o: [f, d] }), limit: n => colRef(p, { ...q, l: n }),
      async get() { return run(); }, onSnapshot(n) { const l = { fire: () => n(run()) }; listeners.add(l); queueMicrotask(l.fire); return () => listeners.delete(l); },
      doc: id => docRef(p + "/" + (id || Math.random().toString(36).slice(2))), async add(d) { const r = docRef(p + "/" + Math.random().toString(36).slice(2)); await r.set(d); return r; } };
  };
  const U = `data/users/${UID}`;
  store.set("meta/app", { url: "https://claude.ai/artifact/PreviewDotworks" });
  store.set("library/starter", { starter: true, templates: [
    { id: "meeting-prep", name: "Meeting prep", hue: 214, look: { shape: "squircle", eyes: "round", acc: "glasses" }, sources: ["calendar", "gmail"], cadence: "daily", tier: "default", responsibility: "Look at my meetings for the next two days. Flag invites I haven't answered, meetings with no agenda, and big meetings where I might not be needed.", rules: ["Propose an RSVP for every invite I haven't answered"], createdAt: 1 },
    { id: "inbox-triage", name: "Inbox triage", hue: 28, look: { shape: "orb", eyes: "wide", acc: "headphones" }, sources: ["gmail"], cadence: "hourly", tier: "quick", responsibility: "Scan unread email from the last day. Separate what needs a reply from me from newsletters, and sum up the ones that matter.", rules: ["Draft at most 2 replies"], createdAt: 2 },
    { id: "focus-guard", name: "Focus guard", hue: 268, look: { shape: "blob", eyes: "happy", acc: "shades" }, sources: ["calendar"], cadence: "daily", tier: "quick", responsibility: "Look at tomorrow. If I have less than two free hours in a row, find the best gap and propose a focus block.", rules: ["Never more than 2 hours"], createdAt: 3 },
    { id: "week-ahead", name: "Week ahead", hue: 152, look: { shape: "pebble", eyes: "round", acc: "antenna" }, sources: ["calendar", "gmail"], cadence: "weekly", tier: "complex", responsibility: "Look at the next seven days of meetings alongside recent email. Tell me which days are overloaded and where I could win back time.", rules: [], createdAt: 4 },
  ] });
  store.set("library/u_sara", { templates: [{ id: "tlaunch", name: "Launch watch", hue: 340, sources: ["gmail"], cadence: "daily", tier: "default", responsibility: "Watch launch-related threads and tell me what's blocked.", rules: [], createdAt: Date.now() - 864e5 }] });
  store.set("adopts/u_sara", { keys: ["starter:meeting-prep", "starter:inbox-triage"] });
  store.set("adopts/u_omar", { keys: ["starter:meeting-prep"] });
  if (scene !== "empty") {
    store.set(`${U}/dot_mp`, { type: "dot", name: "Meeting prep", hue: 214, look: { shape: "squircle", eyes: "round", acc: "glasses" }, sources: ["calendar", "gmail"], cadence: "daily", tier: "default", responsibility: "Look at my meetings for the next two days. Flag invites I haven't answered, meetings with no agenda, and big meetings where I might not be needed.", rules: ["Propose an RSVP for every invite I haven't answered", "Draft a short note asking for an agenda when one is missing"], vips: ["u_sara"], createdAt: 1, lastRunAt: Date.now() - 3 * 3600e3, lastStatus: "done", cloud: { triggerId: "trig_mp", cron: "CRON_TZ=Asia/Karachi 51 8 * * 1-5", say: "Every weekday at 08:51", since: Date.now() - 864e5 }, notesAssetId: "a".repeat(32), notesName: "team-roster.csv" });
    store.set(`${U}/dot_it`, { type: "dot", name: "Inbox triage", hue: 28, look: { shape: "orb", eyes: "wide", acc: "headphones" }, sources: ["gmail"], cadence: "hourly", tier: "quick", responsibility: "Scan unread email from the last day.", rules: [], createdAt: 2, lastRunAt: Date.now() - 40 * 60e3, lastStatus: "done" });
    store.set(`${U}/dot_fg`, { type: "dot", name: "Focus guard", hue: 268, look: { shape: "blob", eyes: "happy", acc: "shades" }, sources: ["calendar"], cadence: "daily", tier: "quick", responsibility: "Protect two hours of focus tomorrow.", rules: [], createdAt: 3, lastRunAt: Date.now() - 30 * 3600e3, lastStatus: "done" });
    store.set(`${U}/dot_mp/runs/run_1`, { startedAt: Date.now() - 3 * 3600e3, finishedAt: Date.now() - 3 * 3600e3 + 40000, status: "done", source: "cloud", tierAsked: "default", tierApplied: "default",
      text: "## Two meetings need you before Wednesday\n- **Dashboard review** (Wed 17:00, 11 people) — you haven't replied; I queued an RSVP.\n- **Factory weekly** (Thu 16:00) has no agenda; a short note to Ilian is ready.\n- Sara's deck thread has a question waiting for you since yesterday.\n- Everything else this week already has an agenda.",
      steps: [{ label: "Read 9 events in the next 2 days", state: "ok" }, { label: "Searched Gmail for from:sara newer_than:3d", state: "ok" }, { label: "Read 3 messages in “Q4 deck”", state: "ok" }, { label: "Asking you: Accept Dashboard review", state: "ok" }],
      actionIds: [], thread: [{ role: "you", text: "Can you make the agenda note a bit warmer?", at: Date.now() - 2 * 3600e3 }, { role: "dot", text: "Sure — I softened the opening and thanked Ilian for organising. The updated draft is waiting for your OK.", at: Date.now() - 2 * 3600e3 + 30000, steps: [{ label: "Asking you: Ask Ilian for an agenda", state: "ok" }] }] });
    store.set(`${U}/dot_mp/runs/run_0`, { startedAt: Date.now() - 27 * 3600e3, status: "done", source: "page", text: "## A quiet Monday\n- Nothing new needs you.", steps: [], thread: [] });
    store.set(`${U}/act_1`, { type: "action", source: "cloud", dotId: "dot_mp", kind: "rsvp", state: "pending", createdAt: Date.now() - 3 * 3600e3, title: "Accept Dashboard review with VLs", why: "You haven't answered, and you own two of the dashboards on the agenda.", payload: { eventId: "e1", response: "accepted", eventTitle: "Dashboard review with VLs", when: iso(50 * 3600e3) }, link: "https://calendar.google.com" });
    store.set(`${U}/act_2`, { type: "action", source: "page", dotId: "dot_mp", kind: "reply", state: "pending", createdAt: Date.now() - 2 * 3600e3, title: "Ask Ilian for an agenda", why: "Factory weekly on Thursday has no agenda yet.", draft: "x", payload: { to: ["ilian.hristov@disrupt.com"], subject: "Agenda for Thursday's factory weekly?", body: "Hi Ilian,\n\nThanks for organising Thursday's factory weekly. Could you share a short agenda before then? Happy to add the dashboard numbers if that helps.\n\nAmmar", replyToMessageId: null } });
    store.set(`${U}/act_3`, { type: "action", source: "page", dotId: "dot_fg", kind: "block", state: "pending", createdAt: Date.now() - 25 * 3600e3, title: "Protect 10:00–11:30 tomorrow for the Q4 plan", why: "Tomorrow has 6 hours of meetings and no gap longer than 45 minutes otherwise.", payload: { title: "Focus: Q4 plan", start: iso(20 * 3600e3), end: iso(21.5 * 3600e3) } });
    store.set(`${U}/act_6`, { type: "action", source: "cloud", dotId: "dot_mp", kind: "tool", verb: "Add agenda", state: "pending", createdAt: Date.now() - 20 * 60e3, title: "Add an agenda to \"AI-native next steps\"", why: "You're hosting it and the invite has no agenda yet.", payload: { server: "Google Calendar", tool: "update_event", input: { eventId: "71ndal0d8pd8hf1f7i33pt06t3", description: "Agenda\n1. Where we landed on the cadence (5 min)\n2. Open gaps and owners (10 min)\n3. Next steps (10 min)", notificationLevel: "NONE" } }, context: { title: "AI-native next steps", when: new Date(Date.now() + 22 * 3600e3).toISOString() }, link: "https://calendar.google.com/x" });
    store.set(`${U}/act_7`, { type: "action", source: "page", dotId: "dot_it", kind: "tool", verb: "Post", state: "pending", createdAt: Date.now() - 10 * 60e3, title: "Answer the launch question in #product", why: "Two people asked when launch is; the date is in your calendar.", payload: { server: "Slack", tool: "slack_send_message", input: { channel_id: "C07PRODUCT", message: "Launch is Tuesday at 10:00. I'll post the checklist tomorrow." } } });
    store.set(`${U}/act_4`, { type: "action", source: "page", dotId: "dot_it", kind: "note", state: "pending", createdAt: Date.now() - 30 * 60e3, title: "Resend asked what they should build next", why: "A product survey you might enjoy answering.", draft: "Reply with: more agent-friendly inbox APIs." });
    store.set(`${U}/act_5`, { type: "action", source: "page", dotId: "dot_it", kind: "reply", state: "done", decidedAt: Date.now() - 5 * 3600e3, createdAt: Date.now() - 6 * 3600e3, title: "Thank Omar for the review", result: { label: "Draft saved in Gmail", url: "https://mail.google.com" }, payload: { to: ["omar@x.com"], subject: "Thanks", body: "Thanks!" } });
    store.set(`adopts/${UID}`, { keys: ["starter:meeting-prep"] });
  }
  const h = (x) => { const d = new Date(); d.setMinutes(0, 0, 0); return new Date(d.getTime() + x * 3600e3).toISOString(); };
  const events = [
    { id: "e0", summary: "Standup", start: { dateTime: h(-1) }, end: { dateTime: new Date(Date.parse(h(-1)) + 15 * 60e3).toISOString() }, attendees: [{ email: "me", self: true, responseStatus: "accepted" }] },
    { id: "e1", summary: "Dashboard review with VLs", start: { dateTime: h(2) }, end: { dateTime: h(3) }, attendees: Array.from({ length: 11 }, (_, i) => ({ email: "p" + i, self: i === 0, responseStatus: i === 0 ? "needsAction" : "accepted" })), htmlLink: "https://calendar.google.com" },
    { id: "e2", summary: "Focus: write-up", start: { dateTime: h(4) }, end: { dateTime: h(5.5) }, eventType: "FOCUS_TIME", attendees: [] },
    { id: "e3", summary: "1:1 with Sara", start: { dateTime: h(6) }, end: { dateTime: h(6.5) }, attendees: [{ email: "me", self: true, responseStatus: "accepted" }, { email: "sara" }] },
    { id: "e4", summary: "Factory weekly", start: { dateTime: h(6.25) }, end: { dateTime: h(7) }, attendees: [{ email: "me", self: true, responseStatus: "accepted" }] },
  ];
  const triggers = [{ id: "trig_mp", name: "Dotworks · Meeting prep · d_mp", cron_expression: "CRON_TZ=Asia/Karachi 51 8 * * 1-5", enabled: true, next_run_at: (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 51, 0, 0); return d.toISOString(); })(), last_run: { status: "ROUTINE_RUN_STATUS_SUCCEEDED", finished_at: iso(-3 * 3600e3) } }];
  const perms = { sample: "granted", db: "granted", "mcp:Google Calendar": "granted", "mcp:Gmail": "granted", "mcp:Claude Code Remote": "granted", mcp: "granted", comments: "granted", downloads: "granted" };
  const sample = async (input, o = {}) => { const t = "## Hello\n- one"; o.onText?.({ text: t, delta: t }); return { text: t, truncated: false, modelTierApplied: "default" }; };
  sample.json = async () => ({}); sample.limits = async () => ({ maxPromptBytes: 262144, tools: { maxCount: 8 }, images: { maxCount: 1, mediaTypes: ["image/png", "image/jpeg"] } });
  const avatar = (c, l) => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' fill='${c}'/><text x='20' y='26' font-size='16' text-anchor='middle' fill='white' font-family='sans-serif'>${l}</text></svg>`);
  const ns = {
    user: { async me() { return { id: scene === "signedout" ? null : UID, name: "Ammar Hasan", avatarUrl: avatar("#5b6cff", "A"), color: "#5b6cff", email: null, isOwner: true, canEdit: true }; }, async can() { return true; },
      async profiles(ids) { const o = {}; for (const id of [].concat(ids)) o[id] = { id, name: id === "u_sara" ? "Sara Khan" : id === UID ? "Ammar Hasan" : "Omar", avatarUrl: avatar(id === "u_sara" ? "#d9480f" : "#2b8a3e", id === "u_sara" ? "S" : "O"), email: null, isMe: id === UID, guest: false }; return o; },
      async search() { return []; } },
    db: { doc: docRef, collection: p => colRef(p) },
    sample,
    mcp: { async listTools() { return { servers: [
      { server: "Google Calendar", authStatus: "connected", tools: [{ name: "list_events" },{ name: "search_events" },{ name: "get_event" },{ name: "suggest_time" },{ name: "create_event" },{ name: "update_event" },{ name: "respond_to_event" },{ name: "delete_event" }] },
      { server: "Gmail", authStatus: "connected", tools: [{ name: "search_threads" },{ name: "get_thread" },{ name: "list_labels" },{ name: "create_draft" },{ name: "update_draft" },{ name: "label_thread" },{ name: "send_message" },{ name: "reply" },{ name: "trash_thread" }] },
      { server: "Slack", authStatus: "connected", tools: [{ name: "slack_search_public" },{ name: "slack_read_channel" },{ name: "slack_read_thread" },{ name: "slack_send_message_draft" },{ name: "slack_create_canvas" },{ name: "slack_send_message" }] },
      { server: "Google Drive", authStatus: "connected", tools: [{ name: "search_files" },{ name: "read_file_content" },{ name: "create_file" },{ name: "share_file" },{ name: "trash_file" }] },
      { server: "Claude Code Remote", authStatus: "connected", tools: [] }] }; },
      async describeTool(s, t) { if (s === "Google Calendar" && t === "update_event") return { name: t, description: "Updates an event.", inputSchema: { type: "object", properties: { eventId: { type: "string" }, description: { type: "string", description: "New description." }, notificationLevel: { type: "string", enum: ["NONE", "EXTERNAL_ONLY", "ALL"] } }, required: ["eventId"] } }; if (s === "Slack" && t === "slack_send_message") return { name: t, description: "Send a message.", inputSchema: { type: "object", properties: { channel_id: { type: "string" }, message: { type: "string" } }, required: ["channel_id", "message"] } }; throw { code: "bad_request", message: "no schema" }; },
      async callTool(s, t) { if (t === "list_triggers") return { payload: { data: clone(triggers) } }; if (t === "list_repos") return { payload: { repos: [["disrupt-corpus/factory-kb", "private", 1], ["disrupt-gt/course-materials", "private", 5], ["disrupt-gt/air-engineering", "private", 7], ["ammar-hasan/narova", "public", 30], ["ammar-hasan/personal-kb-disrupt", "private", 80]].map(([n, v, h]) => ({ full_name: n, visibility: v, pushed_at: new Date(Date.now() - h * 3600e3).toISOString(), url: "https://github.com/" + n })) } }; return { payload: {} }; },
      watchTool(s, t, i, h2) { setTimeout(() => h2({ type: "data", result: { payload: { events }, cache: { storedAt: Date.now() - 4 * 60e3 } } }), 10); return () => {}; }, async invalidate() {} },
    room: { async presence() {}, onPeers(f) { setTimeout(() => f({ peers: [{ peer: "a", by: UID, isMe: true, kind: "viewer", presence: {} }, { peer: "b", by: "u_sara", kind: "viewer", presence: { running: true } }] }), 10); return () => {}; },
      on() { return () => {}; }, async emit() {}, async canSendToClaudeSession() { return "available"; }, async sendToClaudeSession() { return { to: "pane" }; } },
    downloads: { async save() { return { status: "saved" }; } },
    assets: { async upload() { return { id: "b".repeat(32), url: "" }; }, async list() { return { assets: [], usage: { files: 1, bytes: 3100, maxFiles: 100, maxBytes: 1e9 } }; }, async delete() { return { deleted: true }; } },
    comments: { async openComposer() { return { opened: true }; } },
    permissions: { async state(n) { return n ? perms[n] : { ...perms }; }, async request() { return { ...perms }; }, async manage() {} },
  };
  window.claude = { use: async n => (scene === "nocap" ? null : ns[n] ?? null) };
})();
