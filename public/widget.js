(function () {
  // ===============================
  // Utils
  // ===============================
  function getSlugFromPath() {
    const path = window.location.pathname
      .replace(/^\/+|\/+$/g, "")
      .toLowerCase();

    if (!path) return "radim";
    return path.split("/")[0];
  }

  const slug = getSlugFromPath();

  // ===============================
  // APPLY BACKGROUND SKIN
  // ===============================
  (function applySkinBackground() {
    const url = `/skins/${slug}.jpg`;

    document.body.style.backgroundImage =
      `linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.70)), url("${url}")`;

    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center";
    document.body.style.backgroundAttachment = "fixed";
    document.body.style.backgroundRepeat = "no-repeat";
  })();

  // ===============================
  // Chat UI
  // ===============================
  const chat = document.getElementById("chat");
  const input = document.getElementById("inp");
  const sendBtn = document.getElementById("send");
  const statusEl = document.getElementById("status");

  const THREAD_KEY = `municipality_thread_${slug}`;
  let threadId = localStorage.getItem(THREAD_KEY) || null;

  function addMessage(role, text) {
    const wrap = document.createElement("div");
    wrap.className = "msg " + (role === "user" ? "user" : "ai");

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;

    wrap.appendChild(bubble);
    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;
  }

  // ===============================
  // API CALL
  // ===============================
  async function ask(question) {
    const q = question || input.value.trim();
    if (!q) return;

    addMessage("user", q);
    input.value = "";
    sendBtn.disabled = true;
    statusEl.textContent = "Generuje se odpověď…";

    try {
      const res = await fetch("/.netlify/functions/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: q,
          thread_id: threadId,
          obec: slug
        })
      });

      const data = await res.json();

      if (!data.ok) {
        addMessage("ai", "Chyba: " + (data.error || "Neznámá chyba"));
      } else {
        addMessage("ai", data.answer || "(bez odpovědi)");
        if (data.thread_id) {
          threadId = data.thread_id;
          localStorage.setItem(THREAD_KEY, threadId);
        }
      }
    } catch (e) {
      addMessage("ai", "Chyba spojení: " + e.message);
    } finally {
      sendBtn.disabled = false;
      statusEl.textContent = threadId ? "DEMO aktivní" : "";
      input.focus();
    }
  }

  // ===============================
  // Events
  // ===============================
  sendBtn.addEventListener("click", () => ask());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") ask();
  });

  document.querySelectorAll("[data-q]").forEach((el) => {
    el.addEventListener("click", () => ask(el.getAttribute("data-q")));
  });

  const resetBtn = document.getElementById("reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      localStorage.removeItem(THREAD_KEY);
      threadId = null;
      chat.innerHTML = "";
      addMessage("ai", `Resetováno. Ukázka pro obec ${slug}.`);
      statusEl.textContent = "Reset";
    });
  }

  // ===============================
  // Init
  // ===============================
  addMessage(
    "ai",
    `Dobrý den 👋 Jsem ukázkový AI asistent pro obec ${slug}. Jak vám mohu pomoci?`
  );
})();
