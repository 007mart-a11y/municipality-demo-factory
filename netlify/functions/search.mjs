export default async (request) => {
  try {
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ ok: false, error: "Method Not Allowed" }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }

    const { message, thread_id } = await request.json();

    if (!message) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing message" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const assistantId = process.env.ASSISTANT_ID;

    if (!apiKey || !assistantId) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Missing OPENAI_API_KEY or ASSISTANT_ID"
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

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
          JSON.stringify({
            ok: false,
            error: "Failed to create thread",
            status: threadRes.status,
            details: threadData
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      currentThreadId = threadData.id;
    }

    // 2) Add user message
    const addMsgRes = await fetch(
      `https://api.openai.com/v1/threads/${currentThreadId}/messages`,
      {
        method: "POST",
        headers: BASE_HEADERS,
        body: JSON.stringify({
          role: "user",
          content: message
        })
      }
    );

    const addMsgData = await addMsgRes.json().catch(() => ({}));
    if (!addMsgRes.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Failed to add message",
          status: addMsgRes.status,
          details: addMsgData
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3) Create run
    const runRes = await fetch(
      `https://api.openai.com/v1/threads/${currentThreadId}/runs`,
      {
        method: "POST",
        headers: BASE_HEADERS,
        body: JSON.stringify({
          assistant_id: assistantId
        })
      }
    );

    const runData = await runRes.json();

    if (!runRes.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Failed to create run",
          status: runRes.status,
          details: runData
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const runId = runData.id;

    // 4) Poll run status
    let status = runData.status || "queued";
    let attempts = 0;

    while (status !== "completed" && status !== "failed" && attempts < 60) {
      await new Promise((r) => setTimeout(r, 900));
      attempts++;

      const statusRes = await fetch(
        `https://api.openai.com/v1/threads/${currentThreadId}/runs/${runId}`,
        { headers: AUTH_HEADERS }
      );

      const statusData = await statusRes.json();

      if (!statusRes.ok) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Failed to fetch run status",
            status: statusRes.status,
            details: statusData
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      status = statusData.status;

      if (status === "failed") {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Assistant run failed",
            details: statusData
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    if (status !== "completed") {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Assistant run did not complete in time",
          status,
          thread_id: currentThreadId,
          run_id: runId
        }),
        { status: 504, headers: { "Content-Type": "application/json" } }
      );
    }

    // 5) Get messages
    const messagesRes = await fetch(
      `https://api.openai.com/v1/threads/${currentThreadId}/messages`,
      { headers: AUTH_HEADERS }
    );

    const messagesData = await messagesRes.json();

    if (!messagesRes.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Failed to fetch messages",
          status: messagesRes.status,
          details: messagesData
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 6) Extract assistant answer robustly
    let answer = "";
    const dataArr = Array.isArray(messagesData.data) ? messagesData.data : [];

    for (const msg of dataArr) {
      if (msg?.role !== "assistant") continue;
      const contentArr = Array.isArray(msg.content) ? msg.content : [];

      // Prefer text blocks
      const textBlock = contentArr.find((c) => c?.type === "text");
      if (textBlock?.text?.value) {
        answer = textBlock.text.value;
        break;
      }

      // Fallback: join any string-like pieces
      const joined = contentArr
        .map((c) => {
          if (!c) return "";
          if (typeof c === "string") return c;
          if (c?.text?.value) return c.text.value;
          try {
            return JSON.stringify(c);
          } catch {
            return String(c);
          }
        })
        .filter(Boolean)
        .join("\n");

      if (joined) {
        answer = joined;
        break;
      }
    }

    // DEBUG: když jsme nic nenašli, vrať strukturu zpráv
    if (!answer) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "No assistant text found in messages",
          thread_id: currentThreadId,
          run_id: runId,
          messagesData
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        answer,
        thread_id: currentThreadId
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
