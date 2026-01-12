import fs from "fs";
import path from "path";

let REG_CACHE = null;

function loadRegistry() {
  if (REG_CACHE) return REG_CACHE;

  const regPath = path.join(process.cwd(), "registry", "municipalities.json");
  if (!fs.existsSync(regPath)) {
    REG_CACHE = { error: `Registry not found: ${regPath}` };
    return REG_CACHE;
  }

  const raw = fs.readFileSync(regPath, "utf8");
  const json = JSON.parse(raw);

  REG_CACHE = json;
  return REG_CACHE;
}

function pickMunicipality(reg, slug) {
  if (!reg || !slug) return null;

  // podporujeme víc tvarů:
  // 1) [ {slug, assistant_id, ...}, ... ]
  if (Array.isArray(reg)) {
    return reg.find((m) => m?.slug === slug || m?.id === slug) || null;
  }

  // 2) { municipalities: [ ... ] }
  if (Array.isArray(reg.municipalities)) {
    return reg.municipalities.find((m) => m?.slug === slug || m?.id === slug) || null;
  }

  // 3) { "radim": {assistant_id,...}, "zeleznice": {...} }
  if (reg[slug]) return { slug, ...reg[slug] };

  return null;
}

export default async (request) => {
  try {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { message, thread_id, obec } = await request.json();

    if (!message) {
      return new Response(JSON.stringify({ ok: false, error: "Missing message" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ ok: false, error: "Missing OPENAI_API_KEY" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // slug obce: z body.obec nebo default radim
    const slug = String(obec || "radim").toLowerCase().trim();

    const reg = loadRegistry();
    if (reg?.error) {
      return new Response(JSON.stringify({ ok: false, error: reg.error }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const m = pickMunicipality(reg, slug);
    if (!m?.assistant_id) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Obec "${slug}" není v registry nebo nemá assistant_id`,
          slug
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const assistantId = m.assistant_id;

    const BASE_HEADERS = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "assistants=v2"
    };

    const AUTH_HEADERS = {
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Beta": "assistants=v2"
    };

    // 1) THREAD create / reuse
    let currentThreadId = thread_id;

    if (!currentThreadId) {
      const threadRes = await fetch("https://api.openai.com/v1/threads", {
        method: "POST",
        headers: BASE_HEADERS
      });

      const threadData = await threadRes.json();
      if (!threadRes.ok) {
        return new Response(
          JSON.stringify({ ok: false, error: "Failed to create thread", status: threadRes.status, details: threadData }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      currentThreadId = threadData.id;
    }

    // 2) Add user message
    const addMsgRes = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
      method: "POST",
      headers: BASE_HEADERS,
      body: JSON.stringify({
        role: "user",
        content: message
      })
    });

    const addMsgData = await addMsgRes.json().catch(() => ({}));
    if (!addMsgRes.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to add message", status: addMsgRes.status, details: addMsgData }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3) Create run (tady už používáme assistantId podle obce)
    const runRes = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/runs`, {
      method: "POST",
      headers: BASE_HEADERS,
      body: JSON.stringify({
        assistant_id: assistantId
      })
    });

    const runData = await runRes.json();
    if (!runRes.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to create run", status: runRes.status, details: runData }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const runId = runData.id;

    // 4) Poll status
    let status = runData.status || "queued";
    let attempts = 0;

    while (status !== "completed" && status !== "failed" && attempts < 60) {
      await new Promise((r) => setTimeout(r, 900));
      attempts++;

      const statusRes = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/runs/${runId}`, {
        headers: AUTH_HEADERS
      });

      const statusData = await statusRes.json();
      if (!statusRes.ok) {
        return new Response(
          JSON.stringify({ ok: false, error: "Failed to fetch run status", status: statusRes.status, details: statusData }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      status = statusData.status;

      if (status === "failed") {
        return new Response(
          JSON.stringify({ ok: false, error: "Assistant run failed", details: statusData }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    if (status !== "completed") {
      return new Response(
        JSON.stringify({ ok: false, error: "Run did not complete in time", status, thread_id: currentThreadId, run_id: runId }),
        { status: 504, headers: { "Content-Type": "application/json" } }
      );
    }

    // 5) Get messages
    const messagesRes = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
      headers: AUTH_HEADERS
    });

    const messagesData = await messagesRes.json();
    if (!messagesRes.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to fetch messages", status: messagesRes.status, details: messagesData }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 6) Extract assistant answer
    let answer = "";
    const dataArr = Array.isArray(messagesData.data) ? messagesData.data : [];

    for (const msg of dataArr) {
      if (msg?.role !== "assistant") continue;
      const contentArr = Array.isArray(msg.content) ? msg.content : [];
      const textBlock = contentArr.find((c) => c?.type === "text");
      if (textBlock?.text?.value) {
        answer = textBlock.text.value;
        break;
      }
    }

    if (!answer) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "No assistant text found",
          slug,
          assistant_id: assistantId
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        answer,
        thread_id: currentThreadId,
        slug,
        assistant_id: assistantId
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
