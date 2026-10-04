import { ICON } from "../core/constants";
import { $ } from "../core/helpers";
import { S } from "../core/state";
import { paintAsks } from "../features/asks";
import { paintApps } from "./apps";
import { paintDot } from "./dot";
import { paintHome } from "./home";
import { paintSeeds } from "./seeds";

/* ═════════ views ═════════ */
export let viewKey = "";
export function renderView() {
  const key = S.view + ":" + (S.view === "dot" ? S.selected : "");
  if (key !== viewKey) { viewKey = key; buildView(); }
  paintView();
}
export function buildView() {
  const v = $("#view");
  if (S.view === "dot") {
    v.innerHTML = `<section class="dotv">
      <header class="dv-h">
        <button class="icon-btn back" data-nav="home" aria-label="Back to home">${ICON.back}</button>
        <span id="dvAv"></span>
        <div class="dv-id"><h2 id="dvName"></h2><div class="dv-meta" id="dvMeta"></div></div>
        <div class="dv-act" id="dvAct"></div>
      </header>
      <div class="banner" id="banner" role="status"></div>
      <div class="confirm" id="dvConfirm" role="alert"></div>
      <div class="tabs" role="tablist" id="dvTabs"></div>
      <div class="panels" id="dvPanels">
        <div class="tp" id="tp-chat" role="tabpanel" aria-labelledby="tab-chat">
          <div class="msgs" id="msgs"></div>
          <form class="composer" id="composer" autocomplete="off">
            <div class="chips" id="cmpChips"></div>
            <div class="cmp-box">
              <label class="icon-btn" id="attachLbl" title="Attach an image" hidden>${ICON.clip}<span class="sr">Attach an image</span><input type="file" id="replyImg" accept="image/*" hidden></label>
              <label class="sr" for="reply">Message your dot</label>
              <textarea id="reply" rows="1" placeholder="Message…"></textarea>
              <button class="send" type="submit" id="replySend" aria-label="Send">${ICON.send}</button>
            </div>
            <div class="reply-att" id="replyAtt"></div>
            <p class="note" id="replyNote"></p>
          </form>
        </div>
        <div class="tp scroll" id="tp-activity" role="tabpanel" aria-labelledby="tab-activity" hidden><div class="tp-in" id="activity"></div></div>
        <div class="tp scroll" id="tp-schedule" role="tabpanel" aria-labelledby="tab-schedule" hidden><div class="tp-in"><section class="card cloud-card" id="cloud"></section></div></div>
        <div class="tp scroll" id="tp-settings" role="tabpanel" aria-labelledby="tab-settings" hidden><div class="tp-in" id="settings"></div></div>
      </div>
    </section>`;
    if (S.pendingReply) { $("#reply").value = S.pendingReply; S.pendingReply = ""; }
    S.settingsKey = "";
  } else if (S.view === "asks") {
    v.innerHTML = `<section class="page"><header class="page-h"><span class="eyebrow">Waiting on you</span><h1 class="title" id="asksTitle"></h1><p class="sub">Your dots never act alone. Each ask waits here until you say yes — then one click does it.</p><div class="chips" id="asksFilter"></div></header><div class="page-body"><div class="asks" id="asksList"></div><div id="handled"></div></div></section>`;
  } else if (S.view === "apps") {
    v.innerHTML = `<section class="page"><header class="page-h"><span class="eyebrow">Your apps</span><h1 class="title">Apps</h1><p class="sub">Everything you've connected in Claude. Turn an app on and your dots can read it and propose actions with it. Nothing runs until you approve.</p></header><div class="page-body"><div class="appgrid" id="appGrid"></div><p class="fine" id="appsFoot"></p></div></section>`;
  } else if (S.view === "seeds") {
    v.innerHTML = `<section class="page"><header class="page-h"><span class="eyebrow">Seeds</span><h1 class="title">Plant a dot</h1><p class="sub">Starter dots, plus the ones people here have shared. Planting copies the setup into your field — your notes always stay private.</p></header><div class="page-body"><div class="seedgrid" id="seedGrid"></div></div></section>`;
  } else {
    v.innerHTML = `<section class="home">
      <header class="home-h"><div class="eyebrow" id="clock">&nbsp;</div><h1 class="greet" id="greet">Dotworks</h1><p class="voice" id="voice"></p><div class="home-actions" id="homeActions"></div><div class="banner" id="banner" role="status"></div></header>
      <div class="field" id="field" data-uncommentable></div>
      <div class="home-foot" id="homeFoot"><div class="horizon" id="horizon"></div><aside class="peek" id="peek" aria-label="Next ask"></aside></div>
    </section>`;
  }
}
export function paintView() {
  if (S.view === "dot") paintDot();
  else if (S.view === "asks") paintAsks();
  else if (S.view === "seeds") paintSeeds();
  else if (S.view === "apps") paintApps();
  else paintHome();
}
