(function () {
  const I18N = window.DISC_I18N, BANK = window.DISC_QUESTIONS, CONFIG = window.DISC_CONFIG || {};
  const KEYS = ["D", "I", "S", "C"];
  const COLORS = { D: "var(--d)", I: "var(--i)", S: "var(--s)", C: "var(--c)" };
  const SOFT = { D: "var(--d-soft)", I: "var(--i-soft)", S: "var(--s-soft)", C: "var(--c-soft)" };
  const LANGS = ["vi", "en", "ja"];
  const BY_ID = Object.fromEntries(BANK.map(q => [q.id, q]));
  const app = document.getElementById("app");

  // ---------- storage (always optional) ----------
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const PROGRESS = "disc-v2-progress", RESULT = "disc-v2-result", LANG = "disc-v2-lang";

  // ---------- language ----------
  function detectLang() {
    const saved = store.get(LANG);
    if (LANGS.includes(saved)) return saved;
    const nav = (navigator.language || "vi").slice(0, 2).toLowerCase();
    return LANGS.includes(nav) ? nav : "vi";
  }
  let lang = detectLang();
  const L = () => I18N[lang];
  function t(key, vars) {
    let s = L().ui[key];
    if (vars) for (const k in vars) s = s.split("{" + k + "}").join(vars[k]);
    return s;
  }
  function setLang(l) {
    lang = l; store.set(LANG, l);
    document.documentElement.lang = l;
    document.title = t("brand");
    rerender();
  }
  document.documentElement.lang = lang;
  document.title = t("brand");

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- shared chrome ----------
  function topbar(extra = "") {
    const langs = LANGS.map(l => `<button type="button" data-lang="${l}" aria-pressed="${l === lang}" title="${I18N[l].langName}">${l.toUpperCase()}</button>`).join("");
    return `<div class="topbar"><div class="brand"><span class="dots" aria-hidden="true"><i style="background:var(--d)"></i><i style="background:var(--i)"></i><i style="background:var(--c)"></i><i style="background:var(--s)"></i></span>${t("brand")}</div>
      <div class="top-right">${extra}<div class="langs" role="group" aria-label="Language">${langs}</div></div></div>`;
  }
  function bindTopbar() {
    app.querySelectorAll("[data-lang]").forEach(b => b.onclick = () => setLang(b.dataset.lang));
  }

  // DISC circle: D top-left, I top-right, S bottom-right, C bottom-left. Wedge radius scales with score when given.
  function quadrant(scores) {
    const cx = 130, cy = 130, R = 96;
    const pos = { D: [180, 270], I: [270, 360], S: [0, 90], C: [90, 180] };
    const max = scores ? Math.max(...KEYS.map(k => scores[k])) || 1 : 1;
    const pt = (r, deg) => [cx + r * Math.cos(deg * Math.PI / 180), cy + r * Math.sin(deg * Math.PI / 180)];
    let wedges = "", letters = "";
    KEYS.forEach(k => {
      const [a0, a1] = pos[k];
      const r = scores ? 22 + (R - 22) * (scores[k] / max) : R;
      const [x0, y0] = pt(r, a0), [x1, y1] = pt(r, a1);
      if (scores) {
        const [gx0, gy0] = pt(R, a0), [gx1, gy1] = pt(R, a1);
        wedges += `<path d="M${cx},${cy} L${gx0},${gy0} A${R},${R} 0 0 1 ${gx1},${gy1} Z" fill="var(--line)" opacity=".55"/>`;
      }
      wedges += `<path d="M${cx},${cy} L${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1} Z" fill="${COLORS[k]}"/>`;
      const [lx, ly] = pt(R * 0.55, (a0 + a1) / 2);
      letters += `<text x="${lx}" y="${ly + 9}" text-anchor="middle" font-family="Bricolage Grotesque, sans-serif" font-weight="800" font-size="26" fill="var(--ink-fg)">${k}</text>`;
    });
    const axes = { vi: ["Nhanh · Chủ động", "Thận trọng · Chừng mực", "Hướng công việc", "Hướng con người"], en: ["Fast-paced · Outgoing", "Moderate-paced · Reserved", "Task-oriented", "People-oriented"], ja: ["速いペース・外向的", "慎重なペース・控えめ", "仕事志向", "人間志向"] }[lang];
    const lab = 'font-size="10.5" fill="var(--muted)" text-anchor="middle"';
    return `<svg class="quad-svg" viewBox="0 0 260 260" role="img" aria-label="DISC">
      ${wedges}
      <line x1="${cx}" y1="${cy - R}" x2="${cx}" y2="${cy + R}" stroke="var(--bg)" stroke-width="3"/>
      <line x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}" stroke="var(--bg)" stroke-width="3"/>
      ${letters}
      <text x="${cx}" y="20" ${lab}>${axes[0]}</text>
      <text x="${cx}" y="252" ${lab}>${axes[1]}</text>
      <text x="14" y="${cy + 4}" ${lab} transform="rotate(-90 14 ${cy})">${axes[2]}</text>
      <text x="246" y="${cy + 4}" ${lab} transform="rotate(90 246 ${cy})">${axes[3]}</text>
    </svg>`;
  }

  // ---------- test state ----------
  let state = null; // { mode, ids, answers: {id: key}, idx }
  let view = "intro", resultView = null, advanceTimer = null;
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function newTest(mode) {
    const sit = BANK.filter(q => q.type === "s").map(q => q.id), words = BANK.filter(q => q.type === "w").map(q => q.id);
    const ids = mode === "full" ? shuffle(sit.concat(words)) : shuffle(shuffle(sit).slice(0, 20).concat(shuffle(words).slice(0, 10)));
    // option display order is fixed per test so going back shows the same layout
    const orders = Object.fromEntries(ids.map(id => [id, shuffle([0, 1, 2, 3])]));
    state = { mode, ids, orders, answers: {}, idx: 0 };
    saveProgress();
  }
  const saveProgress = () => store.set(PROGRESS, state);
  const answeredCount = () => state.ids.filter(id => state.answers[id]).length;

  // ---------- intro ----------
  function renderIntro() {
    view = "intro";
    const saved = store.get(PROGRESS);
    const resumable = saved && saved.ids && saved.ids.every(id => BY_ID[id]) && Object.keys(saved.answers || {}).length > 0;
    const n = resumable ? saved.ids.filter(id => saved.answers[id]).length : 0;
    const types = L().types;
    app.innerHTML = `<div class="screen stack-lg">
      ${topbar()}
      <section class="hero">
        <div class="stack">
          <span class="eyebrow">${t("eyebrow")}</span>
          <h1>${t("heroTitle")}</h1>
          <p class="lead">${t("heroLead")}</p>
        </div>
        ${quadrant()}
      </section>
      ${resumable ? `<div class="row"><button class="btn" id="resume">${t("resume", { n: Math.min(n + 1, saved.ids.length), total: saved.ids.length })}</button></div>` : ""}
      <div class="modes">
        <button class="mode ${resumable ? "" : "primary"}" id="quick"><strong>${t("modeQuick")}</strong><span>${t("modeQuickSub")}</span></button>
        <button class="mode" id="full"><strong>${t("modeFull")}</strong><span>${t("modeFullSub")}</span></button>
      </div>
      <div class="facts">
        <div><b>${BANK.length}</b><span>${t("factQ")}</span></div>
        <div><b>3</b><span>${t("factLang")}</span></div>
        <div><b>4</b><span>${t("factGroups")}</span></div>
      </div>
      <section class="stack">
        <h2>${t("fourGroups")}</h2>
        <div class="types">${KEYS.map(k => `<div class="type-chip"><span class="letter" style="background:${COLORS[k]}">${k}</span><p><strong>${types[k].name}${lang === "en" ? "" : " · " + types[k].en}</strong>${types[k].short}</p></div>`).join("")}</div>
      </section>
      <section class="howto"><h3>${t("howTitle")}</h3><ul>${t("how").map(x => `<li>${x}</li>`).join("")}</ul></section>
      <p class="note">${t("about")}</p>
    </div>`;
    bindTopbar();
    const start = mode => { store.del(RESULT); newTest(mode); renderQuestion(); window.scrollTo(0, 0); };
    document.getElementById("quick").onclick = () => start("quick");
    document.getElementById("full").onclick = () => start("full");
    const r = document.getElementById("resume");
    if (r) r.onclick = () => { state = saved; state.idx = Math.min(n, state.ids.length - 1); renderQuestion(); };
  }

  // ---------- question ----------
  function renderQuestion() {
    view = "quiz";
    clearTimeout(advanceTimer);
    const total = state.ids.length, i = state.idx, q = BY_ID[state.ids[i]], text = q[lang];
    const sel = state.answers[q.id], order = state.orders[q.id];
    const isWord = q.type === "w";
    const title = isWord ? t("wordPrompt") : text[0];
    const opts = isWord ? text : text.slice(1);
    const answered = answeredCount(), isLast = i === total - 1, firstMissing = state.ids.findIndex(id => !state.answers[id]);
    app.innerHTML = `<div class="screen stack-lg">
      ${topbar(`<button class="btn ghost small" id="home">${t("exit")}</button>`)}
      <div class="stack">
        <div class="progress" aria-hidden="true">${state.ids.map((id, j) => `<i class="${j === i ? "cur" : state.answers[id] ? "done" : ""}"></i>`).join("")}</div>
        <div class="qmeta"><span>${t("qCount", { n: i + 1, total })}</span><span>${t("answered", { n: answered })}</span></div>
      </div>
      <h2 class="qtext">${esc(title)}</h2>
      <div class="opts ${isWord ? "words" : ""}" role="radiogroup" aria-label="${t("radioLabel")}">
        ${order.map((oi, n) => `<button class="opt ${sel === KEYS[oi] ? "sel" : ""}" role="radio" aria-checked="${sel === KEYS[oi]}" data-k="${KEYS[oi]}"><span class="k">${n + 1}</span><span>${esc(opts[oi])}</span></button>`).join("")}
      </div>
      <div class="row" style="justify-content:space-between">
        <button class="btn ghost" id="prev" ${i === 0 ? "disabled" : ""}>${t("prev")}</button>
        ${isLast ? `<button class="btn" id="finish" ${answered < total ? "disabled" : ""}>${t("seeResult")}</button>`
                 : `<button class="btn ghost" id="next" ${!sel ? "disabled" : ""}>${t("next")}</button>`}
      </div>
      ${isLast && answered < total ? `<p class="hint">${t("missing", { n: total - answered })} <button class="btn ghost small" id="jump">${t("jumpTo", { n: firstMissing + 1 })}</button></p>` : ""}
      <p class="hint">${t("tip")}</p>
    </div>`;
    bindTopbar();
    app.querySelectorAll(".opt").forEach(b => b.onclick = () => choose(b.dataset.k));
    document.getElementById("home").onclick = renderIntro;
    document.getElementById("prev").onclick = () => go(-1);
    const nx = document.getElementById("next"); if (nx) nx.onclick = () => go(1);
    const fin = document.getElementById("finish"); if (fin) fin.onclick = finish;
    const jp = document.getElementById("jump"); if (jp) jp.onclick = () => { state.idx = firstMissing; renderQuestion(); };
  }
  function choose(k) {
    const id = state.ids[state.idx];
    state.answers[id] = k; saveProgress();
    app.querySelectorAll(".opt").forEach(b => { const on = b.dataset.k === k; b.classList.toggle("sel", on); b.setAttribute("aria-checked", on); });
    advanceTimer = setTimeout(() => {
      if (state.idx < state.ids.length - 1) { state.idx++; renderQuestion(); }
      else if (answeredCount() === state.ids.length) finish();
      else renderQuestion();
    }, 260);
  }
  function go(d) {
    const n = state.idx + d;
    if (n < 0 || n >= state.ids.length) return;
    if (d > 0 && !state.answers[state.ids[state.idx]]) return;
    state.idx = n; renderQuestion();
  }
  document.addEventListener("keydown", e => {
    if (view !== "quiz" || e.target.closest("textarea, input")) return;
    if (["1", "2", "3", "4"].includes(e.key)) { const b = app.querySelectorAll(".opt")[+e.key - 1]; if (b) b.click(); }
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
  });

  function finish() {
    const counts = { D: 0, I: 0, S: 0, C: 0 };
    state.ids.forEach(id => { const a = state.answers[id]; if (a) counts[a]++; });
    store.set(RESULT, counts);
    store.del(PROGRESS);
    try { history.replaceState(null, "", "#kq-" + KEYS.map(k => counts[k]).join("-")); } catch (e) {}
    chat = { messages: [], busy: false };
    renderResult(counts, false);
    window.scrollTo(0, 0);
  }

  // ---------- result ----------
  function analyze(counts) {
    const total = KEYS.reduce((s, k) => s + counts[k], 0) || 1;
    const pct = k => Math.round(counts[k] / total * 100);
    const ranked = [...KEYS].sort((a, b) => counts[b] - counts[a]);
    const p = ranked[0], s = ranked[1];
    const secondaryStrong = counts[s] > 0 && counts[s] >= counts[p] * 0.7;
    const comboKey = ["DI", "DS", "DC", "IS", "IC", "SC"].find(c => c.includes(p) && c.includes(s));
    const balanced = counts[ranked[0]] - counts[ranked[3]] <= Math.max(3, Math.round(total * 0.1));
    return { total, pct, ranked, p, s, secondaryStrong, comboKey, balanced, label: secondaryStrong ? p + s : p };
  }

  function renderResult(counts, shared) {
    view = "result"; resultView = { counts, shared };
    const a = analyze(counts), T = L().types, tp = T[a.p], combo = L().combos[a.comboKey];
    const bars = KEYS.map(k => `<div class="bar"><span><strong style="color:${COLORS[k]}">${k}</strong> · ${T[k].name}</span><div class="track"><div class="fill" style="width:0;background:${COLORS[k]}" data-w="${a.pct(k)}"></div></div><b>${a.pct(k)}%</b></div>`).join("");
    app.innerHTML = `<div class="screen stack-lg">
      ${topbar(`<button class="btn ghost small" id="again">${t("retake")}</button>`)}
      ${shared ? `<div class="shared-banner"><span>${t("sharedBanner")}</span><button class="btn small" id="mine">${t("takeYours")}</button></div>` : ""}
      <section class="result-head">
        <div class="stack">
          <span class="eyebrow">${shared ? t("theirResult") : t("yourResult")}</span>
          <div class="big-type"><span class="letter" style="background:${COLORS[a.p]}">${a.p}</span><div><h1 style="font-size:clamp(1.9rem,6vw,2.6rem)">${tp.name}</h1><p class="muted">${tp.nick}${lang === "en" ? "" : " · " + tp.en}</p></div></div>
          <p>${tp.summary}</p>
          <div class="tags">${tp.keywords.map(w => `<span class="tag">${w}</span>`).join("")}</div>
        </div>
        ${quadrant(counts)}
      </section>

      <section class="panel stack">
        <div class="row" style="justify-content:space-between"><h3>${t("scores")}</h3><span class="muted" style="font-size:.9rem;font-variant-numeric:tabular-nums">${KEYS.map(k => `${k} ${counts[k]}`).join(" · ")} ${t("ofQuestions", { n: a.total })}</span></div>
        <div class="bars">${bars}</div>
        <p class="muted" style="font-size:.92rem">${a.balanced ? t("balanced") : t("notBalanced", { p: a.p, s: a.s })}</p>
      </section>

      ${combo ? `<section class="panel tint stack" style="background:${SOFT[a.p]}">
        <span class="eyebrow">${t("combo", { k: a.p + a.s })}</span>
        <h3>${combo.name}</h3><p>${combo.text}</p>
        ${a.secondaryStrong ? "" : `<p class="muted" style="font-size:.9rem">${t("comboWeak", { p: a.p, s: a.s })}</p>`}
      </section>` : ""}

      ${shared ? "" : chatPanel(a)}

      <div class="grid2">
        <section class="panel stack"><h3>${t("strengths")}</h3><ul class="list">${tp.strengths.map(x => `<li>${x}</li>`).join("")}</ul></section>
        <section class="panel stack"><h3>${t("weaknesses")}</h3><ul class="list">${tp.weaknesses.map(x => `<li>${x}</li>`).join("")}</ul></section>
      </div>
      <section class="panel stack">
        <h3>${t("deeper")}</h3>
        <div class="grid2">
          <div><span class="eyebrow">${t("motivation")}</span><p>${tp.motivation}</p></div>
          <div><span class="eyebrow">${t("fear")}</span><p>${tp.fear}</p></div>
          <div><span class="eyebrow">${t("stress")}</span><p>${tp.stress}</p></div>
          <div><span class="eyebrow">${t("environment")}</span><p>${tp.environment}</p></div>
        </div>
      </section>
      <div class="grid2">
        <section class="panel stack"><h3>${t("howto")}</h3><ul class="list">${tp.howto.map(x => `<li>${x}</li>`).join("")}</ul></section>
        <section class="panel stack"><h3>${t("growth")}</h3><ul class="list">${tp.growth.map(x => `<li>${x}</li>`).join("")}</ul></section>
      </div>
      <section class="panel stack">
        <h3>${t("careers")}</h3>
        <div class="tags">${tp.careers.map(c => `<span class="tag">${c}</span>`).join("")}</div>
        <p class="muted" style="font-size:.9rem">${t("careersNote")}</p>
      </section>
      <section class="stack">
        <h3>${t("others")}</h3>
        <div class="others">${a.ranked.slice(1).map(k => `<div class="panel stack" style="gap:8px"><div class="row" style="gap:10px"><span class="letter" style="background:${COLORS[k]};width:32px;height:32px;font-size:1rem">${k}</span><strong>${T[k].name} · ${a.pct(k)}%</strong></div><p>${T[k].short} ${t("othersWork")} ${T[k].howto[0]}${lang === "ja" ? "。" : "."}</p></div>`).join("")}</div>
      </section>
      <section class="panel stack">
        <h3>${t("shareTitle")}</h3>
        <div class="row"><button class="btn" id="copy">${t("copy")}</button><button class="btn ghost" id="again2">${t("retake")}</button></div>
        <span class="toast" id="toast" hidden></span>
        <textarea id="copytext" readonly hidden style="width:100%;min-height:110px;font:inherit;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--fg)"></textarea>
      </section>
      <p class="note">${t("disclaimer")}</p>
    </div>`;
    bindTopbar();
    requestAnimationFrame(() => requestAnimationFrame(() => app.querySelectorAll(".fill").forEach(f => f.style.width = f.dataset.w + "%")));

    const again = () => { store.del(RESULT); try { history.replaceState(null, "", location.pathname); } catch (e) {} renderIntro(); window.scrollTo(0, 0); };
    document.getElementById("again").onclick = again;
    document.getElementById("again2").onclick = again;
    const mine = document.getElementById("mine"); if (mine) mine.onclick = () => { try { history.replaceState(null, "", location.pathname); } catch (e) {} renderIntro(); };
    document.getElementById("copy").onclick = () => copyResult(counts, a);
    if (!shared) bindChat(a, counts);
  }

  function copyResult(counts, a) {
    const tp = L().types[a.p], T = L().types;
    const link = /^https?:$/.test(location.protocol) ? location.origin + location.pathname + "#kq-" + KEYS.map(k => counts[k]).join("-") : "";
    const text = t("shareText", { k: a.label, name: tp.name, nick: tp.nick }) + "\n" + KEYS.map(k => `${k} ${T[k].name}: ${a.pct(k)}%`).join(" | ") + (link ? `\n${t("seeDetail")} ${link}` : "");
    const ta = document.getElementById("copytext"), toast = document.getElementById("toast");
    ta.value = text;
    const fallback = () => { ta.hidden = false; ta.focus(); ta.select(); toast.hidden = false; toast.textContent = t("copyFallback"); };
    try { navigator.clipboard.writeText(text).then(() => { toast.hidden = false; toast.textContent = t("copied"); }, fallback); } catch (e) { fallback(); }
  }

  // ---------- AI chat ----------
  let chat = { messages: [], busy: false };
  const online = () => !!CONFIG.aiEndpoint;

  function chatPanel() {
    if (!online()) return "";
    return `<section class="panel chat stack" id="chat">
      <div class="chat-head">
        <span class="spark" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg></span>
        <div class="stack" style="gap:4px"><h3>${t("chatTitle")}</h3><p class="muted" style="font-size:.92rem">${t("chatSub")}</p></div>
      </div>
      <div class="chips">${t("chatSuggest").map(s => `<button type="button" class="chip">${esc(s)}</button>`).join("")}</div>
      <div class="msgs" id="msgs"></div>
      <form class="chat-form" id="chatform">
        <textarea id="chatinput" rows="1" maxlength="1500" placeholder="${t("chatPlaceholder")}" aria-label="${t("chatPlaceholder")}"></textarea>
        <button class="btn" type="submit" id="chatsend">${t("send")}</button>
      </form>
      <p class="hint">${t("chatNote")}</p>
    </section>`;
  }

  function bindChat(a, counts) {
    const form = document.getElementById("chatform"), input = document.getElementById("chatinput");
    if (!form) return;
    renderMsgs();
    app.querySelectorAll(".chip").forEach(c => c.onclick = () => { input.value = c.textContent; form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true })); });
    input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 160) + "px"; });
    input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : null; } });
    form.addEventListener("submit", e => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q || chat.busy) return;
      input.value = ""; input.style.height = "auto";
      sendChat(q, a, counts);
    });
  }

  function mdToHtml(md) {
    // Small, safe markdown subset: paragraphs, bullet/numbered lists, headings, bold, italics.
    const lines = esc(md).split(/\r?\n/);
    let html = "", list = null;
    const inline = s => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
    const close = () => { if (list) { html += `</${list}>`; list = null; } };
    for (const raw of lines) {
      const line = raw.trim();
      let m;
      if (!line) { close(); continue; }
      if ((m = line.match(/^#{1,6}\s+(.*)/))) { close(); html += `<h4>${inline(m[1])}</h4>`; }
      else if ((m = line.match(/^[-*•]\s+(.*)/))) { if (list !== "ul") { close(); html += "<ul>"; list = "ul"; } html += `<li>${inline(m[1])}</li>`; }
      else if ((m = line.match(/^\d+[.)]\s+(.*)/))) { if (list !== "ol") { close(); html += "<ol>"; list = "ol"; } html += `<li>${inline(m[1])}</li>`; }
      else { close(); html += `<p>${inline(line)}</p>`; }
    }
    close();
    return html;
  }

  function renderMsgs(streamingText) {
    const box = document.getElementById("msgs");
    if (!box) return;
    let html = chat.messages.map(m => m.role === "user" ? `<div class="msg user">${esc(m.content)}</div>` : m.role === "error" ? `<div class="msg err">${esc(m.content)}</div>` : `<div class="msg ai">${mdToHtml(m.content)}</div>`).join("");
    if (chat.busy) html += streamingText ? `<div class="msg ai">${mdToHtml(streamingText)}</div>` : `<div class="typing">${t("thinking")}</div>`;
    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
    const send = document.getElementById("chatsend"); if (send) send.disabled = chat.busy;
  }

  async function sendChat(q, a, counts) {
    chat.messages.push({ role: "user", content: q });
    chat.busy = true; renderMsgs();
    const history = chat.messages.filter(m => m.role === "user" || m.role === "assistant").slice(-12);
    let text = "";
    try {
      const res = await fetch(CONFIG.aiEndpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, profile: { counts, primary: a.p, secondary: a.secondaryStrong ? a.s : null }, messages: history })
      });
      if (res.status === 429) throw new Error("rate");
      if (res.status === 503) throw new Error("quota");
      if (!res.ok || !res.body) throw new Error("http");
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let cut;
        while ((cut = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, cut); buf = buf.slice(cut + 2);
          const data = block.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("");
          if (!data || data === "[DONE]") continue;
          let ev; try { ev = JSON.parse(data); } catch (e) { continue; }
          if (typeof ev.t === "string") { text += ev.t; renderMsgs(text); }
        }
      }
      text = text.trim();
      if (!text) throw new Error("empty");
      chat.messages.push({ role: "assistant", content: text });
    } catch (e) {
      chat.messages.pop(); // drop the unanswered question so the history stays user/assistant alternating
      const msg = e.message === "rate" ? t("chatRate") : e.message === "quota" ? t("chatQuota") : t("chatError");
      chat.messages.push({ role: "error", content: msg + "\n“" + q + "”" });
    }
    chat.busy = false; renderMsgs();
  }

  // ---------- routing ----------
  function rerender() {
    if (view === "quiz" && state) renderQuestion();
    else if (view === "result" && resultView) renderResult(resultView.counts, resultView.shared);
    else renderIntro();
  }
  function boot() {
    const m = /^#kq-(\d+)-(\d+)-(\d+)-(\d+)$/.exec(location.hash || "");
    if (m) {
      const counts = { D: +m[1], I: +m[2], S: +m[3], C: +m[4] };
      const mine = store.get(RESULT);
      if (KEYS.reduce((s, k) => s + counts[k], 0) > 0) { renderResult(counts, !(mine && KEYS.every(k => mine[k] === counts[k]))); return; }
    }
    const mine = store.get(RESULT);
    if (mine) { renderResult(mine, false); return; }
    renderIntro();
  }
  window.addEventListener("hashchange", () => { if (/^#kq-/.test(location.hash)) { boot(); window.scrollTo(0, 0); } });
  boot();
})();
