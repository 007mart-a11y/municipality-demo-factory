import fs from "fs";
import path from "path";

export default async (request) => {
  try {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { slug, message } = await request.json();

    if (!slug || !message) {
      return new Response(JSON.stringify({ ok: false, error: "Missing slug or message" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Načteme KB soubor obce
    const kbPath = path.join(process.cwd(), "data", "kb", `${slug}.txt`);
    let kbText = "";

    if (fs.existsSync(kbPath)) {
      kbText = fs.readFileSync(kbPath, "utf8");
    } else {
      kbText = `KB soubor pro slug "${slug}" nebyl nalezen.`;
    }

    // Omezíme velikost kontextu (MVP)
    const kbSlice = kbText.slice(0, 12000);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ ok: false, error: "Missing OPENAI_API_KEY env var" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Jednoduché volání Responses API (bez Assistants) – rychle a stabilně
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
              "Jsi AI asistent obce. Odpovídej česky. Používej pouze informace z podkladů. " +
              "Když odpověď v podkladech není, řekni: „Tohle v podkladech obce nemám, pošlete mi prosím odkaz nebo upřesnění.“"
          },
         
