(function () {
  // ====== KONFIG ======
  const DEFAULT_THEME = {
    bg: "#071018",
    primary: "#00E5FF"
  };

  // ====== HELPERS ======
  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function createEl(tag, attrs = {}, html = "") {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") el.className = v;
      else if (k === "style") el.setAttribute("style", v);
      else el.setAttribute(k, v);
    });
    if (html) el.innerHTML = html;
    return el;
  }

  function inferSlugFromPath() {
    // podporované varianty:
    // /radim/   -> radim
    // /demo/radim -> radim
    // /obec/radim -> radim
    const parts = location.pathname.split("/").filter(Boolean);
    if (!parts.length) return "radim";

    const first = parts[0].toLowerCase();
    if ((first === "demo" || first === "obec") && parts[1]) return parts[1].toLowerCase();
    return first;
  }

  async function fetchMunicipality(slug) {
    const res = await fetch(`/.netlify/functions/municipality?obec=${encodeURIComponent(slug)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) return null;
    return data;
  }

  function applyTheme(theme) {
    const t = theme || DEFAULT_THEME;
    document.documentElement.style.setProperty("--m-bg", t.bg || DEFAULT_THEME.bg);
    document.documentElement.style.setProperty("--m-primary", t.primary || DEFAULT_THEME.primary);
  }

  function linkify(text) {
    // jednoduché linkování URL v textu
    const urlRegex = /(https?:\/\/[^\s)]+)\b/g;
    return text.replace(urlRegex, (url) => {
      const safe = url.replace(/"/g, "%22");
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
  }

  // ====== UI ======
  const styles = `
:root{
  --m-bg: ${DEFAULT_THEME.bg};
  --m-primary: ${DEFAULT_THEME.primary};
  --m-text: #e8eefc;
  --m-muted: rgba(232,238,252,.72);
  --m-border: rgba(255,255,255,.08);
  --m-panel: rgba(255,255,255,.03);
}
#muni-launcher{
  position:fixed; right:18px; bottom:18px; z-index:999999;
  width:58px; height:58px; border-radius:18px;
  background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
  border:1px solid var(--m-border);
  box-shadow: 0 18px 40px rgba(0,0,0,.45);
  display:flex; align-items:center; justify-content:center;
  cursor:pointer; user-select:none;
}
#muni-launcher span{ font-size:22px; }
#muni-panel{
  position:fixed; right:18px; bottom:88px; z-index:999999;
  width: 360px; max-width: calc(100vw - 36px);
  height: 520px; max-height: calc(100vh - 130px);
  border-radius: 18px;
  border: 1px solid var(--m-border);
  overflow:hidden;
  background: radial-gradient(1200px 600px at 30% 0%, rgba(0,229,255,.14), transparent 55%),
              linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02)),
              var(--m-bg);
  box-shadow: 0 20px 55px rgba(0,0,0,.55);
  display:none;
}
.m-header{
  display:flex; align-items:center; justify-content:space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--m-border);
  background: rgba(0,0,0,.14);
  backdrop-filter: blur(6px);
}
.m-hleft{ display:flex; align-items:center; gap:10px; min-width:0; }
.m-logo{
  width:34px; height:34px; border-radius: 10px;
  display:flex; align-items:center; justify-content:center;
  background: rgba(0,229,255,.10);
  border: 1px solid rgba(0,229,255,.18);
  font-size:18px;
}
.m-title{
  font-weight: 800;
  font-size: 13px;
  color: var(--m-text);
  white-space: nowrap; overflow:hidden; text-overflow: ellipsis;
  max-width: 220px;
}
.m-badge{
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.14);
  background: rgba(255,255,255,.06);
  color: var(--m-text);
}
.m-close{
  margin-left:10px;
  width:30px; height:30px; border-radius: 10px;
  border:1px solid var(--m-border);
  background: rgba(255,255,255,.04);
  color: var(--m-text);
  display:flex; align-items:center; justify-content:center;
  cursor:pointer;
}
.m-body{
  height: calc(100% - 52px - 62px);
  padding: 12px;
  overflow:auto;
}
.m-row{ display:flex; margin: 10px 0; }
.m-ai{ justify-content:flex-start; }
.m-user{ justify-content:flex-end; }
.m-bubble{
  max-width: 88%;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--m-border);
  line-height:1.35;
  font-size: 13px;
  color: var(--m-text);
  white-space: pre-wrap;
  word-break: break-word;
}
.m-bubble a{ color: var(--m-primary); text-decoration: none; }
.m-bubble a:hover{ text-decoration: underline; }
.m-ai .m-bubble{
  background: rgba(0,229,255,.08);
  border-color: rgba(0,229,255,.14);
}
.m-user .m-bubble{
  background: rgba(255,255,255,.06);
}
.m-footer{
  height:62px;
  border-top: 1px solid var(--m-border);
  padding: 10px;
  display:flex; gap:8px; align-items:center;
  background: rgba(0,0,0,.14);
  backdrop-filter: blur(6px);
}
.m-input{
  flex:1;
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--m-border);
  background: rgba(255,255,255,.04);
  color: var(--m-text);
  padding: 0 12px;
  outline:none;
}
.m-send{
  height:40px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid rgba(0,229,255,.18);
  background: rgba(0,229,255,.10);
  color: var(--m-text);
  font-weight: 700;
  cursor:pointer;
}
.m-send:disabled{
  opacity:.55; cursor:not-allowed;
}
.m-hint{
  margin-top:8px;
  font-size: 12px;
  color: var(--m-muted);
}
  `;

  const styleEl = createEl("style", {}, styles);
  document.head.appendChild(styleEl);

  const launcher = createEl("div", { id: "muni-launcher", title: "Otevřít chat" }, `<span>🤖</span>`);
  const panel = createEl("div", { id: "muni-panel" });

  const header = createEl(
    "div",
    { class: "m-header" },
    `
      <div class="m-hleft">
        <div class="m-logo" aria-hidden="true">🤖</div>
        <div class="m-title">Ukázka DEMO pro obec</div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <div class="m-badge">DEMO</div>
        <button class="m-close" aria-label="Zavřít">✕</button>
      </div>
    `
  );

  const body = createEl("div", { class: "m-body" });
  const footer = createEl(
    "div",
    { class: "m-footer" },
    `
      <input class="m-input" placeholder="Napište dotaz…" />
      <button class="m-send">Odeslat</button>
    `
  );

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(footer);

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  const closeBtn = qs(".m-close", panel);
  const titleEl = qs(".m-title", panel);
  const inputEl = qs(".m-input", panel);
  const sendBtn = qs(".m-send", panel);

  let currentSlug = inferSlugFromPath();
  let currentThreadId = localStorage.getItem(`muni_thread_${currentSlug}`) || "";

  function addMessage(role, text) {
    const row = createEl("div", { class: `m-row ${role === "user" ? "m-user" : "m-ai"}` });
    const bubble = createEl("div", { class: "m-bubble" });
    bubble.innerHTML = linkify(text);
    row.appendChild(bubble);
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
  }

  async function initHeaderAndTheme() {
    const meta = await fetchMunicipality(currentSlug);
    if (meta?.name) {
      titleEl.textContent = `Ukázka DEMO pro obec: ${meta.name}`;
    } else {
      // fallback
      titleEl.textContent = `Ukázka DEMO pro obec: ${currentSlug}`;
    }
    applyTheme(meta?.theme || DEFAULT_THEME);
  }

  async function sendMessage() {
    const text = (inputEl.value || "").trim();
    if (!text) return;

    inputEl.value = "";
    sendBtn.disabled = true;

    addMessage("user", text);
    addMessage("assistant", "Generuje se odpověď…");

    const loadingRow = body.lastElementChild;

    try {
      const res = await fetch("/.netlify/functions/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          thread_id: currentThreadId || undefined,
          obec: currentSlug
        })
      });

      const data = await res.json().catch(() => ({}));

      // smaž loading
      if (loadingRow) loadingRow.remove();

      if (!res.ok || !data?.ok) {
        addMessage("assistant", "Omlouvám se, teď se mi nepodařilo odpovědět. Zkuste to prosím znovu.");
        sendBtn.disabled = false;
        return;
      }

      if (data.thread_id) {
        currentThreadId = data.thread_id;
        localStorage.setItem(`muni_thread_${currentSlug}`, currentThreadId);
      }

      addMessage("assistant", data.answer || "Omlouvám se, nepodařilo se mi najít odpověď.");
    } catch (e) {
      if (loadingRow) loadingRow.remove();
      addMessage("assistant", "Omlouvám se, došlo k chybě připojení. Zkuste to prosím znovu.");
    } finally {
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  // Launcher behavior
  launcher.addEventListener("click", async () => {
    const isOpen = panel.style.display === "block";
    if (isOpen) {
      panel.style.display = "none";
      return;
    }
    panel.style.display = "block";
    await initHeaderAndTheme();

    // úvodní text jen jednou per slug
    const key = `muni_intro_${currentSlug}`;
    if (!localStorage.getItem(key)) {
      addMessage(
        "assistant",
        "Dobrý den 👋 Jsem ukázkový AI asistent pro občany. Umím poradit, kde na webu najdete důležité informace (kontakty, úřední hodiny, poplatky, odpady, podatelna)."
      );
      localStorage.setItem(key, "1");
    }

    inputEl.focus();
  });

  closeBtn.addEventListener("click", () => (panel.style.display = "none"));
  sendBtn.addEventListener("click", sendMessage);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  // pokud se změní path (např. navigace mezi /radim/ a /zeleznice/)
  // obnov slug+thread
  window.addEventListener("popstate", () => {
    const newSlug = inferSlugFromPath();
    if (newSlug !== currentSlug) {
      currentSlug = newSlug;
      currentThreadId = localStorage.getItem(`muni_thread_${currentSlug}`) || "";
    }
  });
})();
