// The atoms' character sheet: every shape, face, accessory, state and size, drawn by the app's own code and CSS.
//   node scripts/spritesheet.mjs            → dist/spritesheet.html (live: blinks, orbits, hops)
//   node scripts/spritesheet.mjs --png      → also dist/spritesheet-dark.png and -light.png (needs PLAYWRIGHT)
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
fs.mkdirSync(dist, { recursive: true });

const entry = `
import { avatarHtml } from "./src/ui/characters";
const A = (look, o = {}) => avatarHtml({ id: "sheet-" + JSON.stringify(look) + (o.hue ?? ""), hue: o.hue ?? 214, look, ...(o.lead ? { role: "lead" } : {}) }, o);
const cell = (html, cap) => '<figure class="c">' + html + '<figcaption>' + cap + '</figcaption></figure>';
const row = (title, cells) => '<section><h2>' + title + '</h2><div class="r">' + cells.join("") + '</div></section>';
const base = { shape: "orb", eyes: "round", acc: "none" };
const lead = { shape: "orb", eyes: "wide", acc: "none", orbits: "three" };
document.querySelector("#sheet").innerHTML = [
  row("The super atom · pick its orbits", [
    cell(A(base, { size: 112, hue: 268 }), "an atom, for comparison"),
    cell(A({ ...lead, orbits: "three" }, { size: 112, hue: 268, lead: true }), "three orbits"),
    cell(A({ ...lead, orbits: "ring" }, { size: 112, hue: 268, lead: true }), "one ring, three electrons"),
    cell(A({ ...lead, orbits: "two" }, { size: 112, hue: 268, lead: true }), "two crossed orbits"),
  ]),
  row("The super atom · states", [
    cell(A(lead, { size: 84, hue: 42, lead: true, state: "rest" }), "asleep"),
    cell(A(lead, { size: 84, hue: 42, lead: true }), "ready"),
    cell(A(lead, { size: 84, hue: 42, lead: true, state: "live" }), "awake"),
    cell(A(lead, { size: 84, hue: 42, lead: true, state: "live talk" }), "talking"),
    cell(A(lead, { size: 84, hue: 42, lead: true, badge: 3 }), "asks waiting"),
    cell(A(lead, { size: 84, hue: 42, lead: true, state: "cloud" }), "on a schedule"),
    cell(A(lead, { size: 84, hue: 42, lead: true, state: "cheer" }), "you said yes"),
  ]),
  row("The super atom · sizes and looks", [
    ...[112, 84, 56, 40, 30, 18].map(s => cell(A({ ...lead, shape: "squircle", acc: s >= 40 ? "glasses" : "none" }, { size: s, hue: 196, lead: true }), s + "px")),
    cell(A({ ...lead, shape: "blob", eyes: "happy", acc: "headphones" }, { size: 84, hue: 330, lead: true }), "blob · headphones"),
    cell(A({ ...lead, shape: "pebble", eyes: "round", acc: "antenna" }, { size: 84, hue: 152, lead: true }), "pebble · antenna"),
  ]),
  row("Shapes", ["orb", "squircle", "blob", "pebble"].map((s, i) => cell(A({ ...base, shape: s }, { size: 96, hue: [214, 28, 268, 152][i] }), s))),
  row("Faces", ["round", "wide", "happy", "sleepy"].map((e, i) => cell(A({ ...base, eyes: e }, { size: 96, hue: [196, 340, 48, 120][i] }), e))),
  row("Accessories", ["glasses", "shades", "headphones", "antenna", "beanie"].map((a, i) => cell(A({ ...base, shape: ["squircle", "orb", "orb", "pebble", "blob"][i], acc: a }, { size: 84, hue: [214, 268, 28, 152, 330][i] }), a))),
  row("States", [
    cell(A(base, { size: 84, hue: 214, state: "rest" }), "asleep"),
    cell(A(base, { size: 84, hue: 214 }), "ready"),
    cell(A(base, { size: 84, hue: 214, state: "live" }), "awake"),
    cell(A(base, { size: 84, hue: 214, state: "live talk" }), "talking"),
    cell(A(base, { size: 84, hue: 214, badge: 2 }), "asks waiting"),
    cell(A(base, { size: 84, hue: 214, state: "cloud" }), "on a schedule"),
    cell(A(base, { size: 84, hue: 214, state: "cheer" }), "you said yes"),
    cell(A(base, { size: 84, hue: 214, state: "seed" }), "starter"),
  ]),
  row("Sizes", [112, 84, 56, 40, 30, 18].map(s => cell(A({ ...base, eyes: "wide", acc: s >= 40 ? "glasses" : "none", shape: "squircle" }, { size: s, hue: 196 }), s + "px"))),
  row("Colours", [0, 28, 48, 96, 152, 196, 230, 268, 300, 330].map(h => cell(A({ ...base, shape: ["orb", "squircle", "blob", "pebble"][h % 4] }, { size: 56, hue: h }), String(h)))),
].join("");
`;

const [js, css] = await Promise.all([
  esbuild.build({ stdin: { contents: entry, resolveDir: root, loader: "ts" }, bundle: true, format: "iife", target: "es2022", write: false, logLevel: "error", define: { __VERSION__: '"sheet"' } }),
  esbuild.build({ entryPoints: [path.join(root, "src/styles/index.css")], bundle: true, write: false, logLevel: "error" }),
]);
const head = fs.readFileSync(path.join(root, "src/page/head.html"), "utf8").replace(/<title>[^<]*<\/title>/, "<title>Atoms · character sheet</title>");
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${head}
<style>${css.outputFiles[0].text}</style>
<style>
body{margin:0;background:var(--bg);color:var(--ink);font:400 14px var(--f-ui)}
.cs{max-width:1080px;margin:0 auto;padding:40px 32px 56px}
.cs h1{font:900 34px/1 var(--f-dot);text-transform:uppercase;margin:0 0 6px}
.cs .lede{font:italic 400 17px/1.45 var(--f-letter);color:var(--ink-2);margin:0 0 30px;max-width:62ch}
.cs section{padding:22px 0;border-top:1px solid var(--line)}
.cs h2{font:600 13px var(--f-ui);color:var(--muted);margin:0 0 18px}
.r{display:flex;flex-wrap:wrap;gap:30px 40px;align-items:flex-end}
.c{margin:0;display:flex;flex-direction:column;align-items:center;gap:16px;min-width:80px}
figcaption{font:400 12px var(--f-mono);color:var(--muted)}
</style></head><body><main class="cs"><h1>Atoms</h1><p class="lede">Every shape, face, accessory and state, drawn by the app itself. The electron's speed is an atom's energy: lazy asleep, quick awake, blue on a schedule. Your super atom carries more electrons than the rest.</p><div id="sheet"></div></main>
<script>${js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
fs.writeFileSync(path.join(dist, "spritesheet.html"), html);
console.log("wrote dist/spritesheet.html");

if (process.argv.includes("--png")) {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
  const fontDir = process.env.FONTSOURCE_DIR || path.join(root, "node_modules", "@fontsource");
  const face = (fam, file, w, style = "normal") => `@font-face{font-family:"${fam}";font-style:${style};font-weight:${w};src:url(https://fonts.gstatic.com/local/${file}) format("woff2")}`;
  const fontCss = [face("Doto", "doto/files/doto-latin-900-normal.woff2", 900), ...[400, 600].map(w => face("Geist", `geist-sans/files/geist-sans-latin-${w}-normal.woff2`, w)), face("Geist Mono", "geist-mono/files/geist-mono-latin-400-normal.woff2", 400), face("Newsreader", "newsreader/files/newsreader-latin-400-italic.woff2", 400, "italic")].join("\n");
  const browser = await chromium.launch({ args: ["--no-sandbox"], ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}) });
  for (const scheme of ["dark", "light"]) {
    const ctx = await browser.newContext({ viewport: { width: 1080, height: 900 }, colorScheme: scheme, deviceScaleFactor: 2 });
    await ctx.route("**/*", r => {
      const u = r.request().url();
      if (u.startsWith("file:") || u.startsWith("data:")) return r.continue();
      if (u.includes("fonts.googleapis.com/css2")) return r.fulfill({ status: 200, contentType: "text/css", body: fontCss });
      const m = u.match(/fonts\.gstatic\.com\/local\/(.+\.woff2)$/);
      if (m && fs.existsSync(path.join(fontDir, m[1]))) return r.fulfill({ status: 200, contentType: "font/woff2", body: fs.readFileSync(path.join(fontDir, m[1])) });
      return r.abort();
    });
    const p = await ctx.newPage();
    await p.goto("file://" + path.join(dist, "spritesheet.html"));
    await p.waitForTimeout(1600);
    await p.screenshot({ path: path.join(dist, `spritesheet-${scheme}.png`), fullPage: true });
    await ctx.close();
  }
  await browser.close();
  console.log("wrote dist/spritesheet-dark.png, dist/spritesheet-light.png");
}
