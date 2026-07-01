/* ============================================================================
 * studio.js — the rep-facing studio
 * ----------------------------------------------------------------------------
 * Flow:
 *   1. Upload a deck file        -> POST /api/decks (backend renders + extracts)
 *   2. Review page thumbnails    -> click to enlarge (lightbox)
 *   3. Generate narration        -> POST /api/decks/{id}/narrate
 *   4. Edit narration + pick voice
 *   5. Publish                   -> POST /api/decks/{id}/publish -> share link
 *
 * The Anthropic key is NOT here — all model calls go through the backend.
 * ==========================================================================*/

const API = (window.DECK_AGENT_CONFIG && window.DECK_AGENT_CONFIG.API_BASE) || "";
const el = (id) => document.getElementById(id);

let deck = null;            // current deck object from the backend
let narrationReady = false; // becomes true after narration is generated

/* --------------------------------------------------------------------------
 * 1. Upload (dropzone + file picker)
 * ------------------------------------------------------------------------ */
const dropzone = el("dropzone");
const fileInput = el("fileInput");

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("drag"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault(); dropzone.classList.remove("drag");
  if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", () => { if (fileInput.files[0]) uploadFile(fileInput.files[0]); });
el("newDeckBtn").addEventListener("click", resetToUpload);

async function uploadFile(file) {
  const errBox = el("uploadErr"); errBox.style.display = "none";
  el("uploadProgress").classList.add("show");
  el("progressLabel").textContent = `Uploading & rendering "${file.name}"…`;
  try {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${API}/api/decks`, { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Upload failed");

    deck = data.deck;
    narrationReady = false;
    renderWorkspace(data.warning);
  } catch (e) {
    errBox.textContent = "Couldn't process that deck: " + e.message;
    errBox.style.display = "block";
  } finally {
    el("uploadProgress").classList.remove("show");
  }
}

function resetToUpload() {
  window.speechSynthesis.cancel();
  deck = null; narrationReady = false;
  el("workspace").classList.remove("show");
  el("liveSession").classList.remove("show");
  el("uploadCard").style.display = "block";
  el("shareCard").classList.remove("show");
  el("stagelabel").textContent = "STEP 1 · UPLOAD";
  fileInput.value = "";
}

/* --------------------------------------------------------------------------
 * 2. Render workspace: page thumbnail grid
 * ------------------------------------------------------------------------ */
function renderWorkspace(warning) {
  el("uploadCard").style.display = "none";
  el("workspace").classList.add("show");
  el("stagelabel").textContent = "STEP 2 · REVIEW PAGES";
  el("deckTitle").textContent = deck.title;
  el("pageCountPill").textContent = deck.pages.length + (deck.pages.length === 1 ? " page" : " pages");

  const renderPill = el("renderPill");
  renderPill.style.display = deck.rendered ? "none" : "inline-block";
  const wsWarn = el("wsWarn");
  if (warning) { wsWarn.textContent = warning; wsWarn.style.display = "block"; }
  else wsWarn.style.display = "none";

  buildGrid();
  el("enterLiveBtn").disabled = true;
  el("liveSession").classList.remove("show");
  el("reviewHint").style.display = "none";
  el("shareCard").classList.remove("show");
}

function buildGrid() {
  const grid = el("pageGrid");
  grid.innerHTML = "";
  deck.pages.forEach((p, i) => {
    const card = document.createElement("div");
    card.className = "page-card";
    const thumbInner = p.thumb
      ? `<img src="${API}${p.thumb}" alt="page ${p.index}" loading="lazy" />`
      : `<div class="noimg">no page image<br/>(text only)</div>`;
    card.innerHTML = `
      <div class="page-thumb" data-idx="${i}">
        <span class="idx">${String(p.index).padStart(2, "0")}</span>
        ${thumbInner}
        ${p.image ? '<span class="zoom">⤢ enlarge</span>' : ""}
      </div>
      <div class="page-body">
        <div class="lab">Narration</div>
        <div class="narr-slot" data-slot="${i}">
          <div class="empty-narr">Not generated yet — press “Generate narration”.</div>
        </div>
      </div>`;
    grid.appendChild(card);
  });
  grid.querySelectorAll(".page-thumb").forEach((t) => {
    t.addEventListener("click", () => {
      const idx = +t.dataset.idx;
      if (deck.pages[idx].image) openLightbox(idx);
    });
  });
  if (narrationReady) fillNarrationFields();
}

/* --------------------------------------------------------------------------
 * 2b. Lightbox (click to enlarge)
 * ------------------------------------------------------------------------ */
let lbIndex = 0;
function openLightbox(idx) {
  lbIndex = idx;
  el("lbImg").src = `${API}${deck.pages[idx].image}`;
  el("lbCap").textContent = `Page ${deck.pages[idx].index} of ${deck.pages.length}`;
  el("lightbox").classList.add("show");
}
function closeLightbox() { el("lightbox").classList.remove("show"); }
function lbStep(d) {
  let n = lbIndex + d;
  while (n >= 0 && n < deck.pages.length && !deck.pages[n].image) n += d;
  if (n >= 0 && n < deck.pages.length) openLightbox(n);
}
el("lbClose").addEventListener("click", closeLightbox);
el("lbPrev").addEventListener("click", () => lbStep(-1));
el("lbNext").addEventListener("click", () => lbStep(1));
el("lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") closeLightbox(); });
document.addEventListener("keydown", (e) => {
  if (!el("lightbox").classList.contains("show")) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") lbStep(-1);
  if (e.key === "ArrowRight") lbStep(1);
});

/* --------------------------------------------------------------------------
 * 3. Generate narration
 * ------------------------------------------------------------------------ */
el("genBtn").addEventListener("click", generateNarration);

async function generateNarration() {
  const btn = el("genBtn"); const errBox = el("genErr"); errBox.style.display = "none";
  btn.disabled = true; btn.textContent = "Generating…";
  try {
    deck.rep_name = el("repName").value.trim() || "the rep";
    const res = await fetch(`${API}/api/decks/${deck.id}/narrate`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Narration failed");
    data.narration.forEach((line, i) => { deck.pages[i].narration = line; });
    narrationReady = true;
    fillNarrationFields();
    el("reviewHint").style.display = "block";
    el("enterLiveBtn").disabled = false;
    el("stagelabel").textContent = "STEP 3 · REVIEW SCRIPT";
    btn.textContent = "Regenerate narration";
  } catch (e) {
    errBox.textContent = "Couldn't generate narration: " + e.message;
    errBox.style.display = "block";
    btn.textContent = "Generate narration →";
  } finally {
    btn.disabled = false;
  }
}

function fillNarrationFields() {
  deck.pages.forEach((p, i) => {
    const slot = document.querySelector(`.narr-slot[data-slot="${i}"]`);
    if (!slot) return;
    slot.innerHTML = `<textarea data-idx="${i}">${escapeAttr(p.narration)}</textarea>`;
    const ta = slot.querySelector("textarea");
    ta.addEventListener("input", (e) => { deck.pages[+e.target.dataset.idx].narration = e.target.value; });
  });
}

/* --------------------------------------------------------------------------
 * 4. Voice picker (browser TTS)
 * ------------------------------------------------------------------------ */
function populateVoices() {
  const sel = el("voiceSelect");
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  sel.innerHTML = "";
  voices.forEach((v) => {
    const o = document.createElement("option");
    o.value = v.name;
    o.textContent = `${v.name} (${v.lang})`;
    if (v.default) o.selected = true;
    sel.appendChild(o);
  });
}
populateVoices();
if ("speechSynthesis" in window) window.speechSynthesis.onvoiceschanged = populateVoices;

el("previewVoiceBtn").addEventListener("click", () => {
  window.speechSynthesis.cancel();
  const sample = (deck && deck.pages[0] && deck.pages[0].narration)
    || "This is how your published deck will sound to a prospect.";
  const u = new SpeechSynthesisUtterance(sample);
  applyVoice(u);
  window.speechSynthesis.speak(u);
});

function applyVoice(utter) {
  const voices = window.speechSynthesis.getVoices();
  const v = voices.find((x) => x.name === el("voiceSelect").value);
  if (v) utter.voice = v;
  utter.rate = parseFloat(el("voiceRate").value) || 1;
}

/* --------------------------------------------------------------------------
 * 4b. Live preview — walk through your own build
 * The builder experiences the deck exactly as a recipient would: narrated
 * playback on the real rendered pages, Q&A, and a live rep console
 * (engagement, dwell time, inbox) with the escalation signal beam.
 * ------------------------------------------------------------------------ */
const live = { idx: 0, playing: false, questions: 0 };
let dwellTimer = null;

el("enterLiveBtn").addEventListener("click", enterLive);
el("backToReviewBtn").addEventListener("click", () => {
  window.speechSynthesis.cancel();
  clearInterval(dwellTimer);
  el("liveSession").classList.remove("show");
  el("workspace").classList.add("show");
  el("stagelabel").textContent = "STEP 3 · REVIEW SCRIPT";
});

function enterLive() {
  deck.rep_name = el("repName").value.trim() || "the rep";
  live.idx = 0; live.playing = false; live.questions = 0;

  el("workspace").classList.remove("show");
  el("liveSession").classList.add("show");
  el("stagelabel").textContent = "STEP 4 · LIVE PREVIEW";
  el("repInitial").textContent = "· " + deck.rep_name;
  el("mOpened").textContent = "just now";
  el("playBtn").textContent = "▶ Play narration";

  buildProgressDots();
  buildDwellList();
  buildLiveSuggestions();
  el("transcript").innerHTML = "";
  el("inboxList").innerHTML = '<div class="inbox-empty">No questions yet. Ask something on the right →</div>';
  goLive(0, false);
  updateLiveMetrics();
}

function buildProgressDots() {
  const wrap = el("progressDots"); wrap.innerHTML = "";
  deck.pages.forEach(() => wrap.appendChild(document.createElement("span")));
  refreshDots();
}
function refreshDots() {
  document.querySelectorAll("#progressDots span").forEach((d, i) => {
    d.classList.toggle("active", i === live.idx);
    d.classList.toggle("done", i < live.idx);
  });
}

function buildDwellList() {
  const wrap = el("dwellList"); wrap.innerHTML = "";
  deck.pages.forEach((p, i) => {
    const label = (p.text || "").split("\n")[0].slice(0, 22) || `Page ${p.index}`;
    const row = document.createElement("div");
    row.className = "metric-row";
    row.innerHTML = `<span>${String(p.index).padStart(2, "0")} · ${escapeAttr(label)}</span><span class="val" id="dwell-${i}">0.0s</span>`;
    wrap.appendChild(row);
  });
}

function buildLiveSuggestions() {
  const wrap = el("suggestRow"); wrap.innerHTML = "";
  ["How is pricing structured?", "What's the implementation timeline?", "How is this different from doing it manually?"].forEach((q) => {
    const b = document.createElement("button");
    b.textContent = q;
    b.addEventListener("click", () => { el("qaInput").value = q; askLive(); });
    wrap.appendChild(b);
  });
}

function goLive(i, speak = true) {
  if (i < 0 || i >= deck.pages.length) return;
  window.speechSynthesis.cancel();
  clearInterval(dwellTimer);
  live.idx = i;
  const p = deck.pages[i];

  const host = el("stageInner");
  if (p.image) {
    host.innerHTML = `<img src="${API}${p.image}" alt="Slide ${p.index}" />`;
  } else {
    const firstLine = (p.text || "").split("\n")[0] || `Slide ${p.index}`;
    host.innerHTML = `<div class="textslide"><h2>${escapeAttr(firstLine)}</h2><p>${escapeAttr(p.text || "")}</p></div>`;
  }
  el("slideCounter").textContent = `Slide ${i + 1} of ${deck.pages.length}`;
  el("slideCaption").textContent = "";
  refreshDots();
  updateLiveMetrics();

  const start = Date.now();
  dwellTimer = setInterval(() => {
    const secs = (Date.now() - start) / 1000;
    const d = el("dwell-" + i);
    if (d) d.textContent = secs.toFixed(1) + "s";
  }, 200);

  if (speak) speakLive(p, i);
}

function speakLive(p, i) {
  el("slideCaption").textContent = p.narration || "";
  if (!p.narration || !("speechSynthesis" in window)) {
    el("speakLabel").textContent = p.narration ? "audio unsupported" : "no narration";
    return;
  }
  const u = new SpeechSynthesisUtterance(p.narration);
  applyVoice(u);
  el("speakDot").classList.add("live");
  el("speakLabel").textContent = "speaking…";
  u.onend = () => {
    el("speakDot").classList.remove("live");
    el("speakLabel").textContent = "idle";
    if (live.playing) {
      if (i < deck.pages.length - 1) goLive(i + 1, true);
      else { live.playing = false; el("playBtn").textContent = "▶ Replay from start"; }
    }
  };
  window.speechSynthesis.speak(u);
}

el("playBtn").addEventListener("click", () => {
  if (live.playing) {
    live.playing = false;
    window.speechSynthesis.cancel();
    el("speakDot").classList.remove("live");
    el("speakLabel").textContent = "paused";
    el("playBtn").textContent = "▶ Resume";
  } else {
    live.playing = true;
    el("playBtn").textContent = "⏸ Pause";
    const start = (live.idx >= deck.pages.length - 1 && el("playBtn").textContent.includes("Replay")) ? 0 : live.idx;
    goLive(start, true);
  }
});
el("prevBtn").addEventListener("click", () => { live.playing = false; el("playBtn").textContent = "▶ Play narration"; goLive(live.idx - 1, false); });
el("nextBtn").addEventListener("click", () => { live.playing = false; el("playBtn").textContent = "▶ Play narration"; goLive(live.idx + 1, false); });

function updateLiveMetrics() {
  const watched = live.idx + 1;
  el("mWatched").textContent = `${watched} / ${deck.pages.length}`;
  el("mCompletion").textContent = Math.round((watched / deck.pages.length) * 100) + "%";
  el("mQuestions").textContent = live.questions;
}

/* ---- Q&A in the live preview (grounded, with escalation) ---- */
el("askBtn").addEventListener("click", askLive);
el("qaInput").addEventListener("keydown", (e) => { if (e.key === "Enter") askLive(); });

async function askLive() {
  const input = el("qaInput");
  const q = input.value.trim();
  if (!q) return;
  input.value = "";
  live.questions++;
  updateLiveMetrics();
  addMsg("prospect", q);
  const thinking = addMsg("agent-thinking");

  try {
    const res = await fetch(`${API}/api/decks/${deck.id}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q }),
    });
    const data = await res.json();
    thinking.remove();
    if (!res.ok) throw new Error(data.detail || "error");
    addMsg("agent", data.answer, data.escalate, data.slide_ref);
    if (data.escalate) fireSignalBeam();
    pushInbox({ question: q, escalated: !!data.escalate, answer: data.answer, slide_ref: data.slide_ref, ts: new Date() });
  } catch (e) {
    thinking.remove();
    const rep = deck.rep_name || "the rep";
    addMsg("agent", `Good question — let me get ${rep} to answer that directly for you.`, true, null);
    fireSignalBeam();
    pushInbox({ question: q, escalated: true, answer: "(agent error — auto-escalated) " + e.message, ts: new Date() });
  }
}

function addMsg(role, text, escalated = false, slideRef = null) {
  const wrap = el("transcript");
  const div = document.createElement("div");
  if (role === "agent-thinking") {
    div.className = "msg agent"; div.textContent = "…";
  } else {
    div.className = "msg " + (role === "prospect" ? "prospect" : ("agent" + (escalated ? " escalated" : "")));
    div.innerHTML = escapeAttr(text) + (slideRef ? `<span class="cite">from slide ${slideRef}</span>` : "");
  }
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
  return div;
}

function pushInbox(item) {
  const wrap = el("inboxList");
  const empty = wrap.querySelector(".inbox-empty");
  if (empty) wrap.innerHTML = "";
  const div = document.createElement("div");
  div.className = "inbox-item new " + (item.escalated ? "escalated" : "answered");
  div.innerHTML = `<span class="badge">${item.escalated ? "Escalated to " + (deck.rep_name || "rep") : "Answered from deck"}</span>
    <div class="q">${escapeAttr(item.question)}</div>
    <div>${escapeAttr(item.answer)}</div>
    <div class="meta">${item.ts.toLocaleTimeString()}${item.slide_ref ? " · slide " + item.slide_ref : ""}</div>`;
  wrap.prepend(div);
  setTimeout(() => div.classList.remove("new"), 1000);
}

function fireSignalBeam() {
  const beam = el("signalBeam");
  const from = el("qaInput").getBoundingClientRect();
  const target = document.querySelector("#inboxList");
  if (!target) return;
  const to = target.getBoundingClientRect();
  beam.style.setProperty("--sx", from.left + "px");
  beam.style.setProperty("--sy", from.top + "px");
  beam.style.setProperty("--tx", to.left + "px");
  beam.style.setProperty("--ty", to.top + "px");
  beam.classList.remove("fire"); void beam.offsetWidth; beam.classList.add("fire");
}

/* --------------------------------------------------------------------------
 * 5. Publish -> shareable link
 * ------------------------------------------------------------------------ */
el("publishBtn").addEventListener("click", publishDeck);

async function publishDeck() {
  const btn = el("publishBtn"); btn.disabled = true; btn.textContent = "Publishing…";
  try {
    const body = {
      narration: deck.pages.map((p) => p.narration),
      rep_name: el("repName").value.trim() || "the rep",
      title: deck.title,
      voice: {
        name: el("voiceSelect").value || null,
        rate: parseFloat(el("voiceRate").value) || 1,
      },
    };
    const res = await fetch(`${API}/api/decks/${deck.id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Publish failed");

    el("shareLink").value = data.url;
    el("openLinkBtn").onclick = () => window.open(data.url, "_blank");
    el("shareCard").classList.add("show");
    el("shareCard").scrollIntoView({ behavior: "smooth", block: "center" });
    el("stagelabel").textContent = "PUBLISHED ✓";
  } catch (e) {
    alert("Couldn't publish: " + e.message);
  } finally {
    btn.disabled = false; btn.textContent = "Publish → shareable link";
  }
}

el("copyLinkBtn").addEventListener("click", async () => {
  const link = el("shareLink").value;
  try { await navigator.clipboard.writeText(link); el("copyLinkBtn").textContent = "Copied ✓"; }
  catch { el("shareLink").select(); document.execCommand("copy"); el("copyLinkBtn").textContent = "Copied ✓"; }
  setTimeout(() => (el("copyLinkBtn").textContent = "Copy"), 1500);
});

/* --------------------------------------------------------------------------
 * helpers
 * ------------------------------------------------------------------------ */
function escapeAttr(s) {
  const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML;
}
