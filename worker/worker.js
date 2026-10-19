// Cloudflare Worker: a small proxy between the DISC site and the Claude API.
// It keeps the API key secret, fixes the system prompt server-side, limits request size and
// rate, and streams Claude's reply back to the browser as Server-Sent Events.
//
// Settings (Worker → Settings → Variables and Secrets):
//   ANTHROPIC_API_KEY  (Secret)  your Claude API key from console.anthropic.com
//   ALLOWED_ORIGINS    (Text)    comma-separated site origins, e.g. https://banuna789.github.io
//
// Written with plain fetch so it can be pasted straight into the Cloudflare dashboard editor,
// which cannot install npm packages such as @anthropic-ai/sdk.

const MODEL = "claude-opus-5-5";
const MAX_MESSAGES = 12;          // conversation turns sent per request
const MAX_CHARS = 1500;           // per user message
const RATE_LIMIT = 20;            // requests per IP ...
const RATE_WINDOW_MS = 10 * 60e3; // ... per 10 minutes (best effort, per Worker instance)

const LANG_NAMES = { vi: "Vietnamese", en: "English", ja: "Japanese" };
const STYLE_NAMES = { D: "Dominance", I: "Influence", S: "Steadiness", C: "Conscientiousness" };
const hits = new Map();

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    const originOk = allowed.length === 0 || allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": originOk && origin ? origin : allowed[0] || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };
    const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "Use POST" }, 405);
    if (!originOk) return json({ error: "Origin not allowed" }, 403);
    if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY is not set" }, 500);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter(ts => now - ts < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT) return json({ error: "Too many requests" }, 429);
    recent.push(now);
    hits.set(ip, recent);

    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const input = validate(body);
    if (input.error) return json({ error: input.error }, 400);

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        stream: true,
        output_config: { effort: "low" },
        // If a safety classifier declines, the API retries on a suitable fallback model.
        fallbacks: "default",
        system: systemPrompt(input),
        messages: input.messages
      })
    });

    if (!upstream.ok || !upstream.body) {
      console.log("Claude API error", upstream.status, await upstream.text());
      return json({ error: "Upstream error" }, upstream.status === 429 ? 429 : 502);
    }
    return new Response(upstream.body, {
      headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
    });
  }
};

function validate(body) {
  if (!body || typeof body !== "object") return { error: "Missing body" };
  const lang = LANG_NAMES[body.lang] ? body.lang : "en";
  const counts = body.profile && body.profile.counts;
  if (!counts || !["D", "I", "S", "C"].every(k => Number.isInteger(counts[k]) && counts[k] >= 0 && counts[k] <= 100)) {
    return { error: "Invalid profile" };
  }
  const primary = STYLE_NAMES[body.profile.primary] ? body.profile.primary : null;
  const secondary = STYLE_NAMES[body.profile.secondary] ? body.profile.secondary : null;
  if (!Array.isArray(body.messages) || body.messages.length === 0) return { error: "No messages" };
  const messages = body.messages.slice(-MAX_MESSAGES).map(m => ({
    role: m && m.role === "assistant" ? "assistant" : "user",
    content: String((m && m.content) || "").slice(0, m && m.role === "assistant" ? 8000 : MAX_CHARS)
  })).filter(m => m.content.trim());
  // The API needs the conversation to start with a user turn, alternate, and end with a user turn.
  while (messages.length && messages[0].role !== "user") messages.shift();
  for (let i = 1; i < messages.length; i++) if (messages[i].role === messages[i - 1].role) return { error: "Messages must alternate" };
  if (!messages.length || messages[messages.length - 1].role !== "user") return { error: "Last message must be from the user" };
  return { lang, counts, primary, secondary, messages };
}

function systemPrompt({ lang, counts, primary, secondary }) {
  const total = counts.D + counts.I + counts.S + counts.C || 1;
  const pct = k => Math.round(counts[k] / total * 100);
  const scores = ["D", "I", "S", "C"].map(k => `${STYLE_NAMES[k]} (${k}) ${pct(k)}%`).join(", ");
  return `You are a warm, practical personal-development coach on a free DISC personality test website. The person you're talking with has just finished the test.

Their result: ${scores}. Primary style: ${primary ? `${STYLE_NAMES[primary]} (${primary})` : "unclear"}${secondary ? `; secondary style: ${STYLE_NAMES[secondary]} (${secondary})` : ""}.

Help them understand their style and grow: strengths and blind spots, communication with other styles, teamwork, leadership, relationships, study habits and career direction. Ground your advice in the DISC model and their specific scores, and give concrete examples and small actions they can try.

Always reply in ${LANG_NAMES[lang]}, even if they write in another language, unless they explicitly ask you to switch. Keep replies short and easy to read on a phone: usually under 200 words, using short paragraphs or a brief bulleted list. Ask a clarifying question when their situation is unclear.

DISC describes behavioral tendencies. It does not measure intelligence, ability or worth, and it is not a clinical tool, so don't diagnose. If someone mentions serious distress or a crisis, respond with care and encourage them to reach out to people they trust or a professional. If asked about something unrelated to personality, work, relationships or self-development, answer briefly and steer back.`;
}
