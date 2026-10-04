import { diag } from "../core/diag";
import { $, autosize, clean, hashStr, toast } from "../core/helpers";
import { S } from "../core/state";
import { renderAll } from "../ui/shell";

/* Voice: atoms talk back in their own voices, and you can talk to them.
   - Speaking uses the device's built-in voices (speechSynthesis): each atom gets its own voice, pitch and pace,
     chosen from its id (or picked in its settings), and its mouth moves while it talks.
   - Listening uses speech recognition only where the page may use the microphone. claude.ai artifacts block the
     microphone today, so the mic button only appears where it can work; elsewhere you dictate with your
     keyboard's mic and, in voice mode, the message goes when you pause. */

const W = window as any;
export const canSpeak = () => typeof W.speechSynthesis?.speak === "function" && typeof W.SpeechSynthesisUtterance === "function";
const Rec = () => W.SpeechRecognition || W.webkitSpeechRecognition || null;
export function canListen(): boolean {
  if (!Rec() || S.micBlocked) return false;
  // the page's permissions policy says up front whether the microphone may be used here
  const pol = (document as any).permissionsPolicy || (document as any).featurePolicy;
  try { if (pol?.allowsFeature && !pol.allowsFeature("microphone")) return false; } catch { /* unknown: let it try */ }
  return true;
}

// voice mode is a per-device preference: remembered here only
const KEY = "atoms.voice";
export function loadVoicePref() { try { S.voiceOn = localStorage.getItem(KEY) === "on"; } catch { S.voiceOn = false; } }
export function setVoiceMode(on: boolean) {
  S.voiceOn = on; try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private window */ }
  if (!on) { stopSpeaking(); stopListening(); }
  renderAll();
}

// the voices this device has, in the viewer's language first
let voicesCache: any[] = [];
export function voices(): any[] {
  if (!canSpeak()) return [];
  const all = W.speechSynthesis.getVoices?.() || [];
  if (all.length) {
    const lang = (navigator.language || "en").slice(0, 2).toLowerCase();
    const mine = all.filter(v => String(v.lang || "").toLowerCase().startsWith(lang));
    voicesCache = (mine.length ? mine : all).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }
  return voicesCache;
}
if (canSpeak()) { try { W.speechSynthesis.addEventListener?.("voiceschanged", () => { voices(); if (S.sheet || S.view === "dot") renderAll(); }); } catch { /* old engines */ } }

// an atom's voice: the one picked in its settings if this device has it, otherwise one chosen from its id;
// pitch and pace come from its id too, so the same atom always sounds like itself
export function voiceOf(d) {
  const h = hashStr(d?.id || d?.name || "atom"), vs = voices();
  const picked = d?.voice?.name ? vs.find(v => v.name === d.voice.name) : null;
  return { voice: picked || (vs.length ? vs[h % vs.length] : null), pitch: Number(d?.voice?.pitch) || 0.9 + ((h >>> 5) % 50) / 100, rate: 0.96 + ((h >>> 11) % 14) / 100 };
}

// what a note says, without the markdown
export function plainSpeech(text: string): string {
  return clean(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "a link")
    .replace(/^#+\s*/gm, "").replace(/^\s*[-*•]\s+/gm, "").replace(/[*_`>#|]/g, "")
    .replace(/\s*\n+\s*/g, ". ").replace(/\.\s*\./g, ".").replace(/\s+/g, " ").trim().slice(0, 900);
}

let current: any = null;
export function speak(d, text: string): Promise<boolean> {
  return new Promise(resolve => {
    if (!canSpeak() || !d) return resolve(false);
    const say = plainSpeech(text); if (!say) return resolve(false);
    try {
      stopSpeaking();
      const u = new W.SpeechSynthesisUtterance(say), v = voiceOf(d);
      if (v.voice) { u.voice = v.voice; u.lang = v.voice.lang; }
      u.pitch = Math.min(2, Math.max(0, v.pitch)); u.rate = v.rate;
      const done = ok => { if (current !== u) return; current = null; S.speaking = null; renderAll(); resolve(ok); };
      u.onstart = () => { S.speaking = d.id; renderAll(); };
      u.onend = () => done(true);
      u.onerror = e => { if (e?.error !== "interrupted" && e?.error !== "canceled") diag("voice.speak", { code: e?.error || "error" }); done(false); };
      current = u; S.speaking = d.id; renderAll();
      W.speechSynthesis.speak(u);
    } catch (e) { diag("voice.speak", e); S.speaking = null; resolve(false); }
  });
}
export function stopSpeaking() {
  if (!canSpeak()) return;
  current = null;
  try { W.speechSynthesis.cancel(); } catch { /* nothing to stop */ }
  if (S.speaking) { S.speaking = null; renderAll(); }
}

/* listening: words appear in the message box as you speak; a pause sends them */
let rec: any = null;
export function listen(onDone: (text: string) => void) {
  const R = Rec(); if (!R || rec) return;
  stopSpeaking();
  const ta = $("#reply"), before = ta?.value ? ta.value.trim() + " " : "";
  let finalText = "";
  try {
    rec = new R(); rec.lang = navigator.language || "en-US"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    rec.onresult = ev => {
      let interim = ""; finalText = "";
      for (let i = 0; i < ev.results.length; i++) { const r = ev.results[i]; if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript; }
      if (ta) { ta.value = (before + finalText + interim).trimStart(); autosize(ta); }
    };
    rec.onerror = ev => {
      const code = ev?.error || "error";
      if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") { S.micBlocked = true; toast("The microphone isn't available on this page. Use your keyboard's mic to dictate."); }
      else if (code !== "no-speech" && code !== "aborted") diag("voice.listen", { code });
    };
    rec.onend = () => { rec = null; S.listening = false; renderAll(); const t = (before + finalText).trim(); if (finalText.trim() && t) onDone(t); };
    rec.start(); S.listening = true; renderAll();
  } catch (e) { diag("voice.listen", e); rec = null; S.listening = false; S.micBlocked = true; renderAll(); }
}
export function stopListening() { if (rec) { try { rec.stop(); } catch { /* already stopped */ } } }

/* voice mode without a microphone: you dictate with your keyboard's mic; when the words stop for a moment, they go */
let idle = 0;
export const AUTO_SEND_MS = 2400;
export function dictationPaused(send: () => void) {
  clearTimeout(idle);
  if (!S.voiceOn || S.listening) return;
  idle = window.setTimeout(() => { const ta = $("#reply"); if (S.voiceOn && ta && document.activeElement === ta && ta.value.trim()) send(); }, AUTO_SEND_MS);
}
export function cancelAutoSend() { clearTimeout(idle); }
