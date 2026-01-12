import fs from "fs";
import path from "path";

export default async (request) => {
  try {
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ ok: false, error: "Method Not Allowed" }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }

    const { slug, message } = await request.json();

    if (!slug || !message) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing slug or message" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const kbPath = path.join(process.cwd(), "data", "kb", `${slug}.txt`);
    let kbText = "";

    if (fs.existsSync(kbPath)) {
      kbText = fs.readFileSync(kbPath, "utf8");
    } else {
      kbText = `Podklady obce pro slug "${slug}" nebyly nalezeny.`;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing OPENAI_API_KEY" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content:
              "Jsi AI asistent obce. Odpovídej česky a pouze z poskytnutých podkladů. " +
              "Pokud informace chybí, řekni: „Tohle v podkladech obce nemám.“"
          },
          {
            role: "user",
            content: `PODKLADY OBCE:\n${kbText}\n\nDOTAZ:\n${message}`
          }
        ]
      })
    });

    const data = await res.json();
    const answer =
      data.output_text ||
      "Omlouvám se, odpověď se nepodařilo vygenerovat.";

    return new Response(JSON.stringify({ ok: true, answer }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
