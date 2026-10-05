// Screenshots + layout checks for Dotworks against the browser-side mock runtime (test/mock-browser.js).
// usage: npm run screens [-- <name filter regex>]   → dist/screens/*.png, plus a list of layout problems
// Playwright isn't a dependency (it's large): point PLAYWRIGHT at an install (or install it globally), and CHROME at a
// Chromium binary if Playwright can't find its own.
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const fs = require("fs"), path = require("path");
const dir = __dirname;
const page = fs.readFileSync(path.join(dir, "..", "dist", "atoms.html"), "utf8");
const mock = fs.readFileSync(path.join(dir, "mock-browser.js"), "utf8");
// mimic the platform's publish skeleton
const wrapped = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui;background:#fafafa}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${page}</body></html>`;
fs.mkdirSync(path.join(dir, "..", "dist"), { recursive: true }); fs.writeFileSync(path.join(dir, "..", "dist", "screens-page.html"), wrapped);
const out = path.join(dir, "..", "dist", "screens");
fs.mkdirSync(out, { recursive: true });

const click = sel => async p => { await p.click(sel); await p.waitForTimeout(450); };
const openDot = name => async p => { await p.click(`#dotList .dl-i:has-text("${name}")`); await p.waitForTimeout(500); };
const openDotM = name => async p => { await p.click(`.field .orb-btn[aria-label^="${name}"]`); await p.waitForTimeout(500); };
const tab = k => async p => { await p.click(`#dvTabs [data-tab="${k}"]`); await p.waitForTimeout(400); };
const nav = v => async p => { await p.click(`#nav [data-nav="${v}"]`); await p.waitForTimeout(500); };
const navM = v => async p => { await p.click(`#tabbar [data-nav="${v}"]`); await p.waitForTimeout(500); };

const D = { w: 1440, h: 900 }, M = { w: 390, h: 844, mobile: true };
const shots = [
  { name: "home-dark", scene: "full", ...D, scheme: "dark" },
  { name: "home-light", scene: "full", ...D, scheme: "light" },
  { name: "dot-chat-dark", scene: "full", ...D, scheme: "dark", steps: [openDot("Meeting prep")] },
  { name: "dot-chat-light", scene: "full", ...D, scheme: "light", steps: [openDot("Meeting prep")] },
  { name: "dot-activity-dark", scene: "full", ...D, scheme: "dark", steps: [openDot("Meeting prep"), tab("activity")] },
  { name: "dot-schedule-dark", scene: "full", ...D, scheme: "dark", steps: [openDot("Meeting prep"), tab("schedule")] },
  { name: "dot-schedule-off-dark", scene: "full", ...D, scheme: "dark", steps: [openDot("Inbox triage"), tab("schedule"), click('[data-act="cloud-open"]')] },
  { name: "dot-settings-dark", scene: "full", ...D, scheme: "dark", steps: [openDot("Meeting prep"), tab("settings")] },
  { name: "dot-empty-chat-dark", scene: "full", ...D, scheme: "dark", steps: [openDot("Focus guard")] },
  { name: "asks-dark", scene: "full", ...D, scheme: "dark", steps: [nav("asks")] },
  { name: "asks-handled-light", scene: "full", ...D, scheme: "light", steps: [nav("asks"), async p => { await p.evaluate(() => { const x = document.querySelector("#handled details"); if (x) x.open = true; }); await p.waitForTimeout(300); await p.evaluate(() => document.querySelector("#handled")?.scrollIntoView()); }] },
  { name: "chat-qa-dark", scene: "full", ...D, scheme: "dark", steps: [openDot("Inbox triage"), async p => { await p.evaluate(() => { const m = document.querySelector("#msgs"); if (m) m.scrollTop = 0; }); await p.waitForTimeout(200); }] },
  { name: "asks-question-light", scene: "full", ...D, scheme: "light", steps: [nav("asks"), async p => { await p.click('#asksFilter [data-id="question"]'); await p.waitForTimeout(400); }] },
  { name: "m-asks-question-dark", scene: "full", ...M, scheme: "dark", steps: [navM("asks"), async p => { await p.click('#asksFilter [data-id="question"]'); await p.waitForTimeout(400); }] },
  { name: "dot-voice-dark", scene: "full", ...D, scheme: "dark", steps: [openDot("Meeting prep"), click('[data-act="voice-toggle"]')] },
  { name: "m-dot-voice-light", scene: "full", ...M, scheme: "light", steps: [openDotM("Meeting prep"), click('[data-act="voice-toggle"]')] },
  { name: "dot-jobs-dark", scene: "full", ...D, scheme: "dark", steps: [openDot("Ketchup"), tab("schedule")] },
  { name: "dot-jobs-light-open", scene: "full", ...D, scheme: "light", steps: [openDot("Ketchup"), tab("schedule"), click('[data-act="cloud-open"][data-job="job_kb"]')] },
  { name: "dot-ketchup-chat-light", scene: "full", ...D, scheme: "light", steps: [openDot("Ketchup")] },
  { name: "asks-decide-light", scene: "full", ...D, scheme: "light", steps: [nav("asks"), click('#asksFilter [data-id="question"]')] },
  { name: "asks-decide-dark", scene: "full", ...D, scheme: "dark", steps: [nav("asks"), click('#asksFilter [data-id="question"]')] },
  { name: "m-asks-decide-dark", scene: "full", ...M, scheme: "dark", steps: [navM("asks"), click('#asksFilter [data-id="question"]')] },
  { name: "m-dot-jobs-light", scene: "full", ...M, scheme: "light", steps: [openDotM("Ketchup"), tab("schedule")] },
  { name: "dot-more-jobs-light", scene: "full", ...D, scheme: "light", steps: [openDot("Meeting prep"), tab("schedule"), async p => { await p.evaluate(() => document.querySelector("#jobs")?.scrollIntoView({ block: "start" })); await p.waitForTimeout(200); }] },
  { name: "dot-job-add-dark", scene: "full", ...D, scheme: "dark", steps: [openDot("Inbox triage"), tab("schedule"), click('[data-act="job-add-open"]'), async p => { await p.evaluate(() => document.querySelector(".job-add")?.scrollIntoView({ block: "center" })); await p.waitForTimeout(200); }] },
  { name: "m-dot-job-add-command-light", scene: "full", ...M, scheme: "light", steps: [openDotM("Inbox triage"), tab("schedule"), click('[data-act="job-add-open"]'), click('[data-act="job-kind"][data-id="command"]'), async p => { await p.evaluate(() => document.querySelector(".job-add")?.scrollIntoView({ block: "start" })); await p.waitForTimeout(200); }] },
  { name: "seeds-ketchup-dark", scene: "full", ...D, scheme: "dark", steps: [nav("seeds"), async p => { await p.evaluate(() => document.querySelector('.seedcard:last-child')?.scrollIntoView({ block: "center" })); await p.waitForTimeout(200); }] },
  { name: "tell-pick-dark", scene: "full", ...D, scheme: "dark", steps: [async p => { await p.fill("#tellIn", "Keep an eye on the launch"); await p.press("#tellIn", "Enter"); await p.waitForTimeout(600); }] },
  { name: "asks-light", scene: "full", ...D, scheme: "light", steps: [nav("asks")] },
  { name: "seeds-dark", scene: "full", ...D, scheme: "dark", steps: [nav("seeds")] },
  { name: "apps-dark", scene: "full", ...D, scheme: "dark", steps: [nav("apps")] },
  { name: "apps-light-tools", scene: "full", ...D, scheme: "light", steps: [nav("apps"), click('#appGrid [data-key="Slack"] [data-act="app-tools"]')] },
  { name: "asks-tools-dark", scene: "full", ...D, scheme: "dark", steps: [nav("asks"), click('#asksFilter [data-id="Slack"]'), click('#asksList [data-act="arm"]')] },
  { name: "asks-cal-light", scene: "full", ...D, scheme: "light", steps: [nav("asks"), click('#asksFilter [data-id="Google Calendar"]')] },
  { name: "m-apps-dark", scene: "full", ...M, scheme: "dark", steps: [navM("apps")] },
  { name: "sheet-repos-dark", scene: "full", ...D, scheme: "dark", steps: [click('#sideNew'), click('#sh-repoField [data-id="some"]'), click('#sh-rlist [data-act="pick-repo"]'), async p => { await p.evaluate(() => document.querySelector("#sh-repoField").scrollIntoView({ block: "center" })); await p.waitForTimeout(200); }] },
  { name: "apps-github-light", scene: "full", ...D, scheme: "light", steps: [nav("apps"), click('#appGrid [data-key="GitHub"] [data-act="repos-toggle"]'), async p => { await p.evaluate(() => document.querySelector('#appGrid [data-key="GitHub"]').scrollIntoView({ block: "center" })); await p.waitForTimeout(200); }] },
  { name: "m-sheet-repos-light", scene: "full", ...M, scheme: "light", steps: [async p => { await p.click('#homeActions [data-act="new"]'); await p.waitForTimeout(500); }, click('#sh-repoField [data-id="some"]'), async p => { await p.evaluate(() => document.querySelector("#sh-repoField").scrollIntoView({ block: "center" })); await p.waitForTimeout(200); }] },
  { name: "sheet-new-dark", scene: "full", ...D, scheme: "dark", steps: [click('#sideNew')] },
  { name: "sheet-plant-light", scene: "empty", ...D, scheme: "light", steps: [async p => { await p.click('.field .orb-btn'); await p.waitForTimeout(500); }] },
  { name: "acct-dark", scene: "full", ...D, scheme: "dark", steps: [click('#meBtn')] },
  { name: "empty-dark", scene: "empty", w: 1280, h: 860, scheme: "dark" },
  { name: "signedout-dark", scene: "signedout", w: 1280, h: 860, scheme: "dark" },
  { name: "nocap-dark", scene: "nocap", w: 1280, h: 860, scheme: "dark" },
  { name: "m-home-dark", scene: "full", ...M, scheme: "dark" },
  { name: "m-home-light-empty", scene: "empty", ...M, scheme: "light" },
  { name: "m-dot-chat-dark", scene: "full", ...M, scheme: "dark", steps: [openDotM("Meeting prep")] },
  { name: "m-dot-settings-light", scene: "full", ...M, scheme: "light", steps: [openDotM("Meeting prep"), tab("settings")] },
  { name: "m-asks-dark", scene: "full", ...M, scheme: "dark", steps: [navM("asks")] },
  { name: "m-seeds-light", scene: "full", ...M, scheme: "light", steps: [navM("seeds")] },
  { name: "m-sheet-dark", scene: "full", ...M, scheme: "dark", steps: [async p => { await p.click('#homeActions [data-act="new"]'); await p.waitForTimeout(500); }] },
  { name: "m-acct-dark", scene: "full", ...M, scheme: "dark", steps: [async p => { await p.click('#tabbar [data-act="acct"]'); await p.waitForTimeout(400); }] },
];
const filter = process.argv[2] ? new RegExp(process.argv[2]) : null;
// the page's Google Fonts, served locally so screenshots match the artifact. Without them the browser falls back to
// system fonts (layout checks still run). To get them: npm i --no-save @fontsource/doto @fontsource/geist-sans @fontsource/geist-mono @fontsource/newsreader
const FONT_DIR = process.env.FONTSOURCE_DIR || path.join(dir, "..", "node_modules", "@fontsource");
const HAVE_FONTS = fs.existsSync(path.join(FONT_DIR, "doto"));
if (!HAVE_FONTS) console.log("fonts: @fontsource not found, using system fonts (set FONTSOURCE_DIR to use real ones)");
const face = (fam, file, w, style = "normal") => `@font-face{font-family:"${fam}";font-style:${style};font-weight:${w};font-display:swap;src:url(https://fonts.gstatic.com/local/${file}) format("woff2")}`;
const FONT_CSS = [
  face("Doto", "doto/files/doto-latin-700-normal.woff2", 700), face("Doto", "doto/files/doto-latin-900-normal.woff2", 900),
  ...[400, 500, 600, 700].map(w => face("Geist", `geist-sans/files/geist-sans-latin-${w}-normal.woff2`, w)),
  ...[400, 500].map(w => face("Geist Mono", `geist-mono/files/geist-mono-latin-${w}-normal.woff2`, w)),
  face("Newsreader", "newsreader/files/newsreader-latin-400-normal.woff2", 400), face("Newsreader", "newsreader/files/newsreader-latin-400-italic.woff2", 400, "italic"),
].join("\n");

(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ["--no-sandbox"] });
  const issues = [];
  for (const s of shots) {
    if (filter && !filter.test(s.name)) continue;
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, colorScheme: s.scheme, deviceScaleFactor: s.mobile ? 2 : 1, isMobile: !!s.mobile, hasTouch: !!s.mobile, reducedMotion: "reduce" });
    const p = await ctx.newPage();
    p.on("pageerror", e => issues.push(`${s.name}: pageerror ${e.message}`));
    p.on("console", m => { if ((m.type() === "error" || m.type() === "warning") && !/fonts\.g|ERR_|net::|Failed to load resource/.test(m.text())) issues.push(`${s.name}: console.${m.type()} ${m.text()}`); });
    await ctx.route("**/*", r => {
      const u = r.request().url();
      if (u.startsWith("file:") || u.startsWith("data:")) return r.continue();
      if (u.includes("fonts.googleapis.com/css2")) return r.fulfill({ status: 200, contentType: "text/css", body: FONT_CSS, headers: { "access-control-allow-origin": "*" } });
      const m = u.match(/fonts\.gstatic\.com\/local\/(.+\.woff2)$/);
      if (m && fs.existsSync(path.join(FONT_DIR, m[1]))) return r.fulfill({ status: 200, contentType: "font/woff2", body: fs.readFileSync(path.join(FONT_DIR, m[1])), headers: { "access-control-allow-origin": "*" } });
      return r.abort();
    });
    await p.addInitScript(`window.__scene=${JSON.stringify(s.scene)};`);
    await p.addInitScript(mock);
    await p.goto("file://" + path.join(dir, "..", "dist", "screens-page.html"));
    await p.waitForTimeout(900);
    try { for (const st of s.steps || []) await st(p); } catch (e) { issues.push(`${s.name}: step failed ${e.message.split("\n")[0]}`); }
    await p.waitForTimeout(300);
    const over = await p.evaluate(() => {
      const out = [], vw = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > vw + 1) out.push("page scrolls sideways: " + document.documentElement.scrollWidth + " > " + vw);
      if (document.body.scrollWidth > vw + 1) out.push("body scrolls sideways: " + document.body.scrollWidth);
      // elements wider than their scroll container / clipped text
      const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
      for (const el of document.querySelectorAll(".btn,.chip,.nav-i,.dl-i,.ask,.seedcard,.card,.letter,.bubble,.composer,.cmp-box,.tabs,.dv-h,.page-h,.home-h,.hz-head,.sheet,.pop,.confirm,.plan,.toast")) {
        if (!vis(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 || r.left < -1) out.push(`off-screen x: ${el.className.split(" ")[0]} ${Math.round(r.left)}..${Math.round(r.right)} "${(el.textContent || "").trim().slice(0, 30)}"`);
      }
      // orbs inside field, not overlapping header text or foot
      const field = document.getElementById("field");
      if (field && vis(field)) {
        const fr = field.getBoundingClientRect(), hh = document.querySelector(".home-h")?.getBoundingClientRect(), ft = document.getElementById("homeFoot")?.getBoundingClientRect();
        for (const el of field.querySelectorAll(".orb-btn")) {
          const r = el.getBoundingClientRect(), t = el.textContent.trim().slice(0, 24);
          if (r.left < fr.left - 4 || r.right > fr.right + 4) out.push("orb outside field x: " + t);
          if (hh && r.top < hh.bottom - 6) out.push(`orb overlaps header: ${t} (${Math.round(r.top)} < ${Math.round(hh.bottom)})`);
          const hz = document.getElementById("horizon");
          if (ft && hz && hz.innerHTML && r.bottom > ft.top + 6 && ft.height > 10) out.push(`orb overlaps foot: ${t} (${Math.round(r.bottom)} > ${Math.round(ft.top)})`);
        }
        const els = [...field.querySelectorAll(".orb-btn")].map(e => [e.textContent.trim().slice(0, 18), e.getBoundingClientRect()]);
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i][1], b = els[j][1]; if (a.left < b.right - 8 && b.left < a.right - 8 && a.top < b.bottom - 8 && b.top < a.bottom - 8) out.push(`orbs overlap: ${els[i][0]} / ${els[j][0]}`); }
      }
      // text that overflows its own box without being an intentional ellipsis
      for (const el of document.querySelectorAll("h1,h2,h3,h4,.orb-name,.dl-t b,.btn,.chip,.title,.greet")) {
        if (!vis(el)) continue;
        const cs = getComputedStyle(el);
        if (el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== "ellipsis" && cs.overflowX !== "auto") out.push(`text overflows: ${el.tagName.toLowerCase()}.${el.className} "${el.textContent.trim().slice(0, 40)}" ${el.scrollWidth}>${el.clientWidth}`);
      }
      return out;
    });
    over.forEach(o => issues.push(`${s.name}: ${o}`));
    await p.screenshot({ path: path.join(out, `${s.name}.png`), fullPage: false });
    await ctx.close();
  }
  await browser.close();
  console.log(issues.length ? issues.join("\n") : "no layout issues detected");
})().catch(e => { console.error(e); process.exit(1); });
