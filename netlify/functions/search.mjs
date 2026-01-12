export default async (request) => {
  try {
    // Povolit jen POST
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

    /* ===============================
       1️⃣ THREAD – vytvořit / použít
    =============================== */
    let currentThreadId = thread_id;

    if (!currentThreadId) {
      const threadRes = await fetch("https://api.openai.com/v1/threads", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      });

      const threadData = await threadRes.json();
      currentThreadId = threadData.id;
    }

    /* ===============================
       2️⃣ Přidat zprávu uživatele
    =============================== */
    await fetch(
      `https://api.openai.com/v1/threads/${currentThreadId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          role: "user",
          content: message
        })
      }
    );

    /* ===============================
       3️⃣ Spustit asistenta
    =============================== */
    const runRes = await fetch(
      `https://api.openai.com/v1/threads/${currentThreadId}/runs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          assistant_id: assistantId
        })
      }
    );

    const runData = await runRes.json();
    const runId = runData.id;

    /* ===============================
       4️⃣ Počkat na dokončení
    =============================== */
    let status = "queued";
    let attempts = 0;

    while (status !== "completed" && attempts < 25) {
      await new Promise((r) => setTimeout(r, 700));
      attempts++;

      const statusRes = await fetch(
        `https://api.openai.com/v1/threads/${currentThreadId}/runs/${runId}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`
          }
        }
      );

      const statusData = await statusRes.json();
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

    /* ===============================
       5️⃣ Načíst odpověď asistenta
    =============================== */
    const messagesRes = await fetch(
      `https://api.openai.com/v1/threads/${currentThreadId}/messages`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      }
    );

    const messagesData = await messagesRes.json();

    let answer = "Omlouvám se, odpověď se nepodařilo získat.";

    if (Array.isArray(messagesData.data)) {
      for (const msg of messagesData.data) {
        if (msg.role === "assistant" && Array.isArray(msg.content)) {
          const textBlock = msg.content.find((c) => c.type === "text");
          if (textBlock?.text?.value) {
            answer = textBlock.text.value;
            break;
          }
        }
      }
    }

    /* ===============================
       6️⃣ Vrátit odpověď
    =============================== */
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
