
/* ═════════ constants ═════════ */
declare const __VERSION__: string;
export const VERSION = __VERSION__;
export const TAB = Math.random().toString(36).slice(2, 10);
export const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();
export const REDUCED = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
export const CADENCE = { hourly: 3600e3, daily: 864e5, weekly: 6048e5 };
export const TIERS = { quick: "Fast", default: "Balanced", complex: "Deep" };
export const SRV = { cal: "Google Calendar", mail: "Gmail", cloud: "Claude Code Remote" };
export const CAPS = [
  ["user", "Who you are"], ["db", "Memory"], ["sample", "Claude, on your plan"], ["mcp", "Your apps"],
  ["room", "Who's here"], ["downloads", "Save files"], ["assets", "Attachments"], ["comments", "Comments"], ["permissions", "Access"],
];
export const CONNECTORS = [
  { server: SRV.cal, label: "Google Calendar", does: "your day, RSVPs, focus time", probe: ["list_events", () => ({ pageSize: 1, timeZone: TZ })] },
  { server: SRV.mail, label: "Gmail", does: "reading mail, drafts", probe: ["search_threads", () => ({ query: "in:inbox", pageSize: 1, view: "THREAD_VIEW_METADATA_ONLY" })] },
  { server: SRV.cloud, label: "Scheduled tasks", does: "waking dots in the cloud", probe: ["list_triggers", () => ({ limit: 1 })] },
];
export const FIX = {
  needs_reauth: "reconnect it in Settings → Connectors",
  server_not_connected: "add it in Settings → Connectors",
  selection_required: "pick which account to use when Claude asks",
  not_in_manifest: "it's turned off for this page",
  blocked_by_policy: "your organization blocks it",
  approval_required: "your organization requires approval for it",
  not_granted: "it isn't allowed on this page",
  capability_disabled: "it isn't available in this view",
};
export const KINDS = {
  reply: { label: "Reply", verb: "Create draft", check: "Check your Gmail drafts" },
  rsvp: { label: "RSVP", check: "Check the invite in Calendar" },
  block: { label: "Focus time", verb: "Block it", check: "Check your calendar" },
  agenda: { label: "Agenda", verb: "Add to invite", check: "Check the invite in Calendar" },
  tool: { label: "Action", verb: "Approve", check: "Check it in the app" },
  followup: { label: "Follow up", verb: "Mark handled" },
  note: { label: "Note", verb: "Mark handled" },
};
export const RSVP = { accepted: { verb: "Accept", done: "Accepted the invite" }, declined: { verb: "Decline", done: "Declined the invite" }, tentative: { verb: "Say maybe", done: "Marked the invite as maybe" } };
export const TEXT_TYPES = { txt: "text/plain", text: "text/plain", md: "text/markdown", markdown: "text/markdown", csv: "text/csv", json: "application/json" };
export const LINKS = { events: new Map(), threads: new Map() };
export const SHAPES = ["orb", "squircle", "blob", "pebble"];
export const EYES = ["round", "wide", "happy", "sleepy"];
export const ACCS = ["none", "glasses", "shades", "headphones", "antenna", "beanie"];
export const SV = (p, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${p}</svg>`;
export const ICON = {
  home: SV('<path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>'),
  inbox: SV('<path d="M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 13h4l1.5 2.5h5L16 13h4"/>'),
  plug: SV('<path d="M9 7V3M15 7V3"/><path d="M6 7h12v4a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>'),
  sprout: SV('<path d="M12 20v-8"/><path d="M12 12c0-4 3-6.5 7.5-6.5 0 4.2-3 6.5-7.5 6.5z"/><path d="M12 14c0-3.2-2.6-5.2-6.5-5.2 0 3.2 2.6 5.2 6.5 5.2z"/>'),
  plus: SV('<path d="M12 5v14M5 12h14"/>'),
  more: SV('<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>'),
  back: SV('<path d="M15 5l-7 7 7 7"/>'),
  send: SV('<path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/>'),
  clip: SV('<path d="M20 11.5l-7.8 7.8a5 5 0 01-7-7L13 4.5a3.3 3.3 0 014.7 4.7l-7.8 7.8a1.7 1.7 0 01-2.4-2.4l7.2-7.2"/>'),
  out: SV('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>'),
  bolt: SV('<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>'),
  stop: SV('<rect x="7" y="7" width="10" height="10" rx="2"/>'),
  me: SV('<circle cx="12" cy="8" r="4"/><path d="M4.5 20c1.4-3.8 4.3-5.7 7.5-5.7s6.1 1.9 7.5 5.7"/>'),
  close: SV('<path d="M6 6l12 12M18 6L6 18"/>'),
};
export const ACC_SVG = {
  glasses: '<g fill="none" style="stroke:var(--eye)" stroke-width="3.6"><circle cx="36.5" cy="48" r="11"/><circle cx="63.5" cy="48" r="11"/><path d="M47.5 47h5"/><path d="M25.5 46l-9-3M74.5 46l9-3"/></g>',
  shades: '<g><path d="M22 41h27v8a8 8 0 0 1-8 8H30a8 8 0 0 1-8-8z" style="fill:var(--eye)"/><path d="M51 41h27v8a8 8 0 0 1-8 8H59a8 8 0 0 1-8-8z" style="fill:var(--eye)"/><path d="M48 43h4" style="stroke:var(--eye)" stroke-width="3"/><path d="M26 45h8" stroke="#fff" stroke-opacity=".45" stroke-width="2.4" stroke-linecap="round"/></g>',
  headphones: '<path d="M12 57a38 38 0 0 1 76 0" fill="none" stroke="#2B2E38" stroke-width="6" stroke-linecap="round"/><rect x="2" y="48" width="15" height="25" rx="7" fill="#2B2E38"/><rect x="83" y="48" width="15" height="25" rx="7" fill="#2B2E38"/>',
  antenna: '<path d="M50 7V-7" style="stroke:var(--eye)" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="-10" r="5.5" style="fill:hsl(calc(var(--h) + 160) 90% 66%)"/>',
  beanie: '<path d="M16 33Q50 -11 84 33Z" style="fill:hsl(calc(var(--h) + 150) 62% 50%)"/><rect x="13" y="26" width="74" height="11" rx="5.5" style="fill:hsl(calc(var(--h) + 150) 58% 40%)"/><circle cx="50" cy="1" r="7" style="fill:hsl(calc(var(--h) + 150) 70% 70%)"/>',
};
