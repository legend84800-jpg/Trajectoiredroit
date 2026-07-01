/* Assistant Trajectoire Droit — bulle de chat autonome.
   Injecte son propre style et son HTML. Appelle /api/chat et /api/lead.
   Charte : navy #1A2851, bordeaux #8B1538, or #C9A961. Police Hanken Grotesk. */
(function () {
  "use strict";

  var BOT_NAME = "Assistant TJD";
  var BOT_SUBTITLE = "Je t'oriente vers le bon cours";
  var WELCOME =
    "Bonjour 👋 Je suis l'assistant de Trajectoire Droit. Dis-moi ton niveau et ta matière, ou ce que tu cherches, et je t'envoie vers le bon contenu.";
  var SUGGESTIONS = [
    "Je cherche des fiches de révision",
    "J'ai besoin d'aide sur la méthode",
    "Quel cours pour moi ?",
  ];

  var EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
  var history = []; // { role, content }
  var busy = false;

  // ---------- Style ----------
  var css = `
  .tjd-fab{position:fixed;right:20px;bottom:20px;z-index:9998;width:60px;height:60px;border:none;border-radius:50%;
    background:#1A2851;color:#fff;cursor:pointer;box-shadow:0 8px 24px rgba(15,26,53,.32);display:flex;align-items:center;
    justify-content:center;opacity:0;pointer-events:none;
    transition:transform .2s ease,box-shadow .2s ease,opacity .3s ease}
  .tjd-fab.tjd-fab--visible{opacity:1;pointer-events:auto}
  .tjd-fab:hover{transform:translateY(-2px) scale(1.04);box-shadow:0 12px 30px rgba(15,26,53,.4)}
  @media(max-width:768px){.tjd-fab.tjd-fab--raised{bottom:92px}}
  .tjd-fab svg{width:28px;height:28px}
  .tjd-fab__dot{position:absolute;top:6px;right:6px;width:12px;height:12px;border-radius:50%;background:#C9A961;border:2px solid #1A2851}
  .tjd-panel{position:fixed;right:20px;bottom:20px;z-index:9999;width:380px;max-width:calc(100vw - 32px);height:560px;
    max-height:calc(100vh - 40px);background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(15,26,53,.32);
    display:none;flex-direction:column;overflow:hidden;font-family:"Hanken Grotesk",system-ui,-apple-system,sans-serif;
    border:1px solid #E2E8F0}
  .tjd-panel.tjd-open{display:flex;animation:tjd-in .22s ease}
  @keyframes tjd-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  .tjd-head{background:#1A2851;color:#fff;padding:16px 18px;display:flex;align-items:center;gap:12px;border-bottom:3px solid #C9A961}
  .tjd-head__av{width:38px;height:38px;border-radius:50%;background:#8B1538;display:flex;align-items:center;justify-content:center;
    font-family:"Spectral",Georgia,serif;font-weight:700;font-size:1.1rem;flex-shrink:0}
  .tjd-head__t{font-family:"Spectral",Georgia,serif;font-weight:600;font-size:1.05rem;line-height:1.2}
  .tjd-head__s{font-size:.78rem;color:rgba(255,255,255,.7);margin-top:2px}
  .tjd-head__x{margin-left:auto;background:none;border:none;color:rgba(255,255,255,.8);cursor:pointer;font-size:1.4rem;line-height:1;padding:4px}
  .tjd-head__x:hover{color:#fff}
  .tjd-body{flex:1;overflow-y:auto;padding:18px;background:#FBFBFD;display:flex;flex-direction:column;gap:12px}
  .tjd-msg{max-width:85%;padding:10px 14px;border-radius:14px;font-size:.92rem;line-height:1.5;word-wrap:break-word}
  .tjd-msg a{color:#8B1538;font-weight:600;text-decoration:underline}
  .tjd-bot{align-self:flex-start;background:#fff;border:1px solid #E2E8F0;color:#1A2851;border-bottom-left-radius:4px}
  .tjd-user{align-self:flex-end;background:#1A2851;color:#fff;border-bottom-right-radius:4px}
  .tjd-sugg{display:flex;flex-direction:column;gap:8px;align-items:flex-start}
  .tjd-chip{background:#fff;border:1px solid #CBD5E1;color:#1A2851;border-radius:20px;padding:8px 14px;font-size:.86rem;
    cursor:pointer;font-family:inherit;transition:background .15s,border-color .15s;text-align:left}
  .tjd-chip:hover{background:#FBF8EE;border-color:#C9A961}
  .tjd-typing{align-self:flex-start;display:flex;gap:4px;padding:12px 14px}
  .tjd-typing span{width:7px;height:7px;border-radius:50%;background:#94A3B8;animation:tjd-bounce 1.2s infinite}
  .tjd-typing span:nth-child(2){animation-delay:.2s}.tjd-typing span:nth-child(3){animation-delay:.4s}
  @keyframes tjd-bounce{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-5px);opacity:1}}
  .tjd-foot{border-top:1px solid #E2E8F0;padding:12px;display:flex;gap:8px;background:#fff}
  .tjd-input{flex:1;border:1px solid #CBD5E1;border-radius:22px;padding:10px 16px;font-size:.92rem;font-family:inherit;
    outline:none;resize:none;max-height:90px}
  .tjd-input:focus{border-color:#1A2851}
  .tjd-send{border:none;background:#8B1538;color:#fff;width:42px;height:42px;border-radius:50%;cursor:pointer;flex-shrink:0;
    display:flex;align-items:center;justify-content:center;transition:background .15s}
  .tjd-send:hover{background:#6E0F2C}.tjd-send:disabled{opacity:.45;cursor:not-allowed}
  .tjd-send svg{width:20px;height:20px}
  .tjd-note{font-size:.7rem;color:#94A3B8;text-align:center;padding:0 0 8px;background:#fff}
  @media(max-width:480px){.tjd-panel{right:0;bottom:0;width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;border-radius:0}}
  @media(prefers-reduced-motion:reduce){.tjd-panel.tjd-open,.tjd-fab,.tjd-typing span{animation:none;transition:none}}
  `;

  // ---------- Rendu ----------
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function render(text) {
    var safe = esc(text);
    // liens markdown [texte](url)
    safe = safe.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, label, url) {
      return '<a href="' + url + '">' + label + "</a>";
    });
    // gras markdown **texte** (filet de sécurité si le modèle en met)
    safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return safe.replace(/\n/g, "<br>");
  }

  // ---------- DOM ----------
  var panel, body, input, sendBtn, fab;

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function addMsg(role, text) {
    var m = el("div", "tjd-msg " + (role === "user" ? "tjd-user" : "tjd-bot"), role === "user" ? esc(text) : render(text));
    body.appendChild(m);
    body.scrollTop = body.scrollHeight;
    return m;
  }

  function showTyping() {
    var t = el("div", "tjd-typing", "<span></span><span></span><span></span>");
    t.id = "tjd-typing";
    body.appendChild(t);
    body.scrollTop = body.scrollHeight;
  }
  function hideTyping() {
    var t = document.getElementById("tjd-typing");
    if (t) t.remove();
  }

  function showSuggestions() {
    var wrap = el("div", "tjd-sugg");
    SUGGESTIONS.forEach(function (s) {
      var c = el("button", "tjd-chip", esc(s));
      c.addEventListener("click", function () {
        wrap.remove();
        send(s);
      });
      wrap.appendChild(c);
    });
    body.appendChild(wrap);
  }

  async function maybeCaptureEmail(text) {
    var match = text.match(EMAIL_RE);
    if (!match) return;
    try {
      await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: match[0] }),
      });
    } catch (e) {
      /* silencieux : l'inscription est secondaire */
    }
  }

  async function send(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    input.value = "";
    input.style.height = "auto";

    addMsg("user", text);
    history.push({ role: "user", content: text });
    maybeCaptureEmail(text);
    showTyping();

    try {
      var res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      var data = await res.json();
      hideTyping();
      var reply = data.reply || data.error || "Désolé, une erreur est survenue.";
      addMsg("bot", reply);
      history.push({ role: "assistant", content: reply });
    } catch (e) {
      hideTyping();
      addMsg("bot", "Je n'arrive pas à répondre là tout de suite. Réessaie dans un instant.");
    } finally {
      busy = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  function toggle(open) {
    var isOpen = open != null ? open : !panel.classList.contains("tjd-open");
    panel.classList.toggle("tjd-open", isOpen);
    fab.style.display = isOpen ? "none" : "flex";
    if (isOpen) input.focus();
  }

  function build() {
    var style = el("style");
    style.textContent = css;
    document.head.appendChild(style);

    // Bouton flottant
    fab = el("button", "tjd-fab");
    fab.setAttribute("aria-label", "Ouvrir l'assistant");
    fab.innerHTML =
      '<span class="tjd-fab__dot"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>';
    fab.addEventListener("click", function () { toggle(true); });
    // Décale le bouton au-dessus de la barre d'achat sticky mobile quand elle existe sur la page
    if (document.querySelector(".sticky-cta-bar")) fab.classList.add("tjd-fab--raised");
    // Apparition différée : laisse la page respirer avant de proposer le chat
    setTimeout(function () { fab.classList.add("tjd-fab--visible"); }, 2500);

    // Panneau
    panel = el("div", "tjd-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Assistant Trajectoire Droit");

    var head = el("div", "tjd-head");
    head.appendChild(el("div", "tjd-head__av", "TD"));
    var ht = el("div");
    ht.appendChild(el("div", "tjd-head__t", BOT_NAME));
    ht.appendChild(el("div", "tjd-head__s", BOT_SUBTITLE));
    head.appendChild(ht);
    var x = el("button", "tjd-head__x", "&times;");
    x.setAttribute("aria-label", "Fermer");
    x.addEventListener("click", function () { toggle(false); });
    head.appendChild(x);

    body = el("div", "tjd-body");

    var foot = el("div", "tjd-foot");
    input = el("textarea", "tjd-input");
    input.setAttribute("rows", "1");
    input.setAttribute("placeholder", "Écris ta question…");
    input.addEventListener("input", function () {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 90) + "px";
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input.value); }
    });
    sendBtn = el("button", "tjd-send");
    sendBtn.setAttribute("aria-label", "Envoyer");
    sendBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
    sendBtn.addEventListener("click", function () { send(input.value); });
    foot.appendChild(input);
    foot.appendChild(sendBtn);

    var note = el("div", "tjd-note", "Assistant d'orientation, pas un conseil juridique.");

    panel.appendChild(head);
    panel.appendChild(body);
    panel.appendChild(note);
    panel.appendChild(foot);

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    addMsg("bot", WELCOME);
    showSuggestions();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
