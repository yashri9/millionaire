/* ============================================================================
 * viewer.js — the published, shareable full-screen player
 * ----------------------------------------------------------------------------
 * Loaded at /d/{deckId}. It:
 *   1. Reads the deck id from the URL and fetches the published deck
 *   2. Shows each page full-screen (rendered image, or text if no image)
 *   3. Plays narration aloud with the rep's chosen voice (browser TTS),
 *      auto-advancing slide by slide
 *   4. Answers questions grounded in the deck, escalating to the rep
 * ==========================================================================*/

const API = (window.DECK_AGENT_CONFIG && window.DECK_AGENT_CONFIG.API_BASE) || "";
const el = (id) => document.getElementById(id);

const deckId = location.pathname.split("/").filter(Boolean).pop();

let deck = null;
let idx = 0;
let isPlaying = false;

init();

async function init() {
  try {
    const res = await fetch(`${API}/api/decks/${deckId}`);
    if (!res.ok) throw new Error("not found");
    deck = await res.json();
  } catch {
    el("loading").textContent = "This presentation could not be found.";
    return;
  }
  mountPlayer();
}

/* --------------------------------------------------------------------------
 * Build the player UI from the <template>
 * ------------------------------------------------------------------------ */
function mountPlayer() {
  const shell = el("shell");
  shell.innerHTML = "";
  shell.appendChild(el("playerTpl").content.cloneNode(true));

  el("vTitle").textContent = deck.title || "Presentation";
  document.title = `${deck.title || "Presentation"} — Deck Agent`;

  buildDots();
  buildSuggestions();
  el("vPrev").addEventListener("click", () => { stop(); go(idx - 1); });
  el("vNext").addEventListener("click", () => { stop(); go(idx + 1); });
  el("vPlay").addEventListener("click", togglePlay);
  el("vAsk").addEventListener("click", ask);
  el("vInput").addEventListener("keydown", (e) => { if (e.key === "Enter") ask(); });

  go(0, false);
}

function buildDots() {
  const wrap = el("vDots"); wrap.innerHTML = "";
  deck.pages.forEach(() => wrap.appendChild(document.createElement("span")));
  refreshDots();
}
function refreshDots() {
  document.querySelectorAll("#vDots span").forEach((d, i) => {
    d.classList.toggle("active", i === idx);
    d.classList.toggle("done", i < idx);
  });
}

/* --------------------------------------------------------------------------
 * Slide navigation + rendering
 * ------------------------------------------------------------------------ */
function go(i, speak = true) {
  if (i < 0 || i >= deck.pages.length) return;
  window.speechSynthesis.cancel();
  idx = i;
  const p = deck.pages[i];

  const host = el("vSlideHost");
  if (p.image) {
    host.innerHTML = `<img src="${API}${p.image}" alt="Slide ${p.index}" />`;
  } else {
    host.innerHTML = `<div class="v-textslide"><p>${escapeHtml(p.text || "")}</p></div>`;
  }
  el("vCaption").textContent = p.narration || "";
  el("vCounter").textContent = `${i + 1} / ${deck.pages.length}`;
  refreshDots();

  if (speak) speak_(p, i);
}

function speak_(p, i) {
  if (!p.narration || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(p.narration);
  const voices = window.speechSynthesis.getVoices();
  const want = (deck.voice && deck.voice.name) || null;
  const v = want && voices.find((x) => x.name === want);
  if (v) u.voice = v;
  u.rate = (deck.voice && deck.voice.rate) || 1;

  el("vSpeakDot").classList.add("live");
  el("vSpeakLabel").textContent = "speaking…";
  u.onend = () => {
    el("vSpeakDot").classList.remove("live");
    el("vSpeakLabel").textContent = "idle";
    if (isPlaying) {
      if (i < deck.pages.length - 1) go(i + 1, true);
      else { isPlaying = false; el("vPlay").textContent = "▶ Replay"; }
    }
  };
  window.speechSynthesis.speak(u);
}

function togglePlay() {
  if (isPlaying) { stop(); return; }
  isPlaying = true;
  el("vPlay").textContent = "⏸ Pause";
  const start = (idx >= deck.pages.length - 1) ? 0 : idx;
  go(start, true);
}
function stop() {
  isPlaying = false;
  window.speechSynthesis.cancel();
  el("vSpeakDot").classList.remove("live");
  el("vSpeakLabel").textContent = "idle";
  el("vPlay").textContent = "▶ Play";
}

/* Some browsers need voices to load before first speak. */
if ("speechSynthesis" in window) window.speechSynthesis.onvoiceschanged = () => {};

/* --------------------------------------------------------------------------
 * Q&A (grounded, with escalation) via backend proxy
 * ------------------------------------------------------------------------ */
function buildSuggestions() {
  const wrap = el("vSuggest"); wrap.innerHTML = "";
  ["How is pricing structured?", "What's the timeline?", "How is this different?"].forEach((q) => {
    const b = document.createElement("button");
    b.textContent = q;
    b.addEventListener("click", () => { el("vInput").value = q; ask(); });
    wrap.appendChild(b);
  });
}

async function ask() {
  const input = el("vInput");
  const q = input.value.trim();
  if (!q) return;
  input.value = "";
  addMsg("me", q);
  const thinking = addMsg("bot", "…");

  try {
    const res = await fetch(`${API}/api/decks/${deckId}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q }),
    });
    const data = await res.json();
    thinking.remove();
    if (!res.ok) throw new Error(data.detail || "error");
    addMsg("bot", data.answer, data.escalate, data.slide_ref);
  } catch (e) {
    thinking.remove();
    const rep = deck.rep_name || "the rep";
    addMsg("bot", `Good question — let me get ${rep} to answer that directly for you.`, true, null);
  }
}

function addMsg(who, text, escalated = false, slideRef = null) {
  const wrap = el("vTranscript");
  const div = document.createElement("div");
  div.className = "v-msg " + (who === "me" ? "me" : "bot" + (escalated ? " esc" : ""));
  div.innerHTML = escapeHtml(text) + (slideRef ? `<span class="cite">from slide ${slideRef}</span>` : "");
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
  return div;
}

function escapeHtml(s) {
  const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML;
}
