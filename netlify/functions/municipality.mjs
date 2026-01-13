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

  if (Array.isArray(reg)) {
    return reg.find((m) => m?.slug === slug || m?.id === slug) || null;
  }
  if (Array.isArray(reg.municipalities)) {
    return reg.municipalities.find((m) => m?.slug === slug || m?.id === slug) || null;
  }
  if (reg[slug]) return { slug, ...reg[slug] };
  return null;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export default async (request) => {
  try {
    const url = new URL(request.url);

    // slug může přijít jako ?obec=radim
    let slug = (url.searchParams.get("obec") || "").toLowerCase().trim();

    // nebo jako /municipality?slug=radim
    if (!slug) slug = (url.searchParams.get("slug") || "").toLowerCase().trim();

    // fallback: z path /municipality/radim (kdybys někdy chtěl)
    if (!slug) {
      const parts = url.pathname.split("/").filter(Boolean);
      slug = (parts[parts.length - 1] || "").toLowerCase().trim();
      if (slug === "municipality") slug = "";
    }

    if (!slug) slug = "radim";

    const reg = loadRegistry();
    if (reg?.error) return json({ ok: false, error: reg.error }, 500);

    const m = pickMunicipality(reg, slug);
    if (!m) return json({ ok: false, error: `Obec "${slug}" není v registry`, slug }, 404);

    // ✅ vrať jen to, co frontend potřebuje
    return json({
      ok: true,
      slug,
      name: m.name || slug,
      website_url: m.website_url || "",
      theme: m.theme || null
    });
  } catch (e) {
    return json({ ok: false, error: e?.message || "Unknown error" }, 500);
  }
};
