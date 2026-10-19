// POST /api/chat: AI coach on Cloudflare Workers AI (free daily allocation, no API key).
// Runs behind the login middleware, so only signed-in users reach it.
//
// Pages project → Settings → Bindings: Workers AI, variable name AI.
// Optional variable MODEL: another Workers AI text model ID.
// Replies stream to the browser as:  data: {"t":"text chunk"}  ...  data: [DONE]

const DEFAULT_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
const MAX_MESSAGES = 12;          // conversation turns sent per request
const MAX_CHARS = 1500;           // per user message
const RATE_LIMIT = 20;            // requests per user ...
const RATE_WINDOW_MS = 10 * 60e3; // ... per 10 minutes (best effort, per instance)

const LANG_NAMES = { vi: "Vietnamese", en: "English", ja: "Japanese" };
const STYLE_NAMES = { D: "Dominance", I: "Influence", S: "Steadiness", C: "Conscientiousness" };
const hits = new Map();

export async function onRequestPost({ request, env, data }) {
  const json = (body, status) => Response.json(body, { status });
  if (!env.AI) return json({ error: "Workers AI binding 'AI' is missing" }, 500);

  const who = (data.user && data.user.email) || request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const recent = (hits.get(who) || []).filter(ts => now - ts < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) return json({ error: "rate" }, 429);
  recent.push(now);
  hits.set(who, recent);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const input = validate(body);
  if (input.error) return json({ error: input.error }, 400);

  let modelStream;
  try {
    modelStream = await env.AI.run(env.MODEL || DEFAULT_MODEL, {
      messages: [{ role: "system", content: systemPrompt(input) }, ...input.messages],
      stream: true,
      max_tokens: 1200,
      temperature: 0.7
    });
  } catch (e) {
    const msg = String((e && e.message) || e);
    console.log("Workers AI error:", msg);
    const quota = /4006|allocation|neuron/i.test(msg); // 4006 = daily free allocation used up
    return json({ error: quota ? "quota" : "ai" }, quota ? 503 : 502);
  }

  return new Response(normalize(modelStream), {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
  });
}

// Reads the model's SSE stream (either {response} or OpenAI-style choices[].delta) and re-emits
// only the visible answer text, dropping any <think>...</think> reasoning.
function normalize(stream) {
  const enc = new TextEncoder(), dec = new TextDecoder();
  let buf = "", inThink = false, carry = "";
  const send = (ctrl, text) => {
    let s = carry + text, out = "";
    carry = "";
    while (s.length) {
      if (inThink) {
        const end = s.indexOf("</think>");
        if (end < 0) { carry = s.slice(-7); s = ""; break; }
        s = s.slice(end + 8); inThink = false;
      } else {
        const start = s.indexOf("<think>");
        if (start < 0) {
          const lt = s.lastIndexOf("<");
          if (lt >= 0 && s.length - lt < 7 && "<think>".startsWith(s.slice(lt))) { out += s.slice(0, lt); carry = s.slice(lt); }
          else out += s;
          s = "";
        } else { out += s.slice(0, start); s = s.slice(start + 7); inThink = true; }
      }
    }
    if (out) ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ t: out })}\n\n`));
  };
  return stream.pipeThrough(new TransformStream({
    transform(chunk, ctrl) {
      buf += dec.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let ev; try { ev = JSON.parse(payload); } catch { continue; }
        const text = typeof ev.response === "string" ? ev.response
          : ev.choices && ev.choices[0] && ev.choices[0].delta && typeof ev.choices[0].delta.content === "string" ? ev.choices[0].delta.content
          : "";
        if (text) send(ctrl, text);
      }
    },
    flush(ctrl) {
      if (carry && !inThink) ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ t: carry })}\n\n`));
      ctrl.enqueue(enc.encode("data: [DONE]\n\n"));
    }
  }));
}

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
    content: String((m && m.content) || "").slice(0, m && m.role === "assistant" ? 6000 : MAX_CHARS)
  })).filter(m => m.content.trim());
  while (messages.length && messages[0].role !== "user") messages.shift();
  for (let i = 1; i < messages.length; i++) if (messages[i].role === messages[i - 1].role) return { error: "Messages must alternate" };
  if (!messages.length || messages[messages.length - 1].role !== "user") return { error: "Last message must be from the user" };
  return { lang, counts, primary, secondary, messages };
}

function systemPrompt({ lang, counts, primary, secondary }) {
  const total = counts.D + counts.I + counts.S + counts.C || 1;
  const pct = k => Math.round(counts[k] / total * 100);
  const scores = ["D", "I", "S", "C"].map(k => `${STYLE_NAMES[k]} (${k}) ${pct(k)}%`).join(", ");
  return `/no_think
You are a warm, practical personal-development coach on a free DISC personality test website. The person you're talking with has just finished the test.

Their result: ${scores}. Primary style: ${primary ? `${STYLE_NAMES[primary]} (${primary})` : "unclear"}${secondary ? `; secondary style: ${STYLE_NAMES[secondary]} (${secondary})` : ""}.

Help them understand their style and grow: strengths and blind spots, communication with other styles, teamwork, leadership, relationships, study habits and career direction. Ground your advice in the DISC model and their specific scores, and give concrete examples and small actions they can try.

Always reply in ${LANG_NAMES[lang]} only, even if they write in another language, unless they explicitly ask you to switch. Keep replies short and easy to read on a phone: under 200 words, using short paragraphs or a brief bulleted list. Ask a clarifying question when their situation is unclear.

DISC describes behavioral tendencies. It does not measure intelligence, ability or worth, and it is not a clinical tool, so don't diagnose. If someone mentions serious distress or a crisis, respond with care and encourage them to reach out to people they trust or a professional. If asked about something unrelated to personality, work, relationships or self-development, answer briefly and steer back.`;
}
