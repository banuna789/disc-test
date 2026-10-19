// POST /api/results: store one finished test (name, date of birth, D/I/S/C counts).
// Only admins can read results back (see functions/api/admin/results.js).

import { ensureSchema } from "../../lib/db.js";

const KEYS = ["D", "I", "S", "C"];
const RATE_LIMIT = 10;            // saves per IP ...
const RATE_WINDOW_MS = 10 * 60e3; // ... per 10 minutes (best effort, per instance)
const hits = new Map();

export async function onRequestPost({ request, env }) {
  const json = (body, status = 200) => Response.json(body, { status });
  if (!env.DB) return json({ error: "D1 binding 'DB' is missing" }, 500);

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(ts => now - ts < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) return json({ error: "rate" }, 429);
  recent.push(now);
  hits.set(ip, recent);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const input = validate(body);
  if (input.error) return json({ error: input.error }, 400);

  await ensureSchema(env.DB);
  const r = await env.DB.prepare(
    `INSERT INTO results (created_at, name, dob, d, i, s, c, total, primary_style, secondary_style, mode, lang)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
  ).bind(new Date().toISOString(), input.name, input.dob, input.counts.D, input.counts.I, input.counts.S, input.counts.C,
    input.total, input.primary, input.secondary, input.mode, input.lang).run();

  return json({ ok: true, id: r.meta && r.meta.last_row_id });
}

function validate(body) {
  if (!body || typeof body !== "object") return { error: "Missing body" };
  const name = String(body.name || "").replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > 80) return { error: "Invalid name" };

  const dob = String(body.dob || "");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  const date = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!m || isNaN(date) || date.toISOString().slice(0, 10) !== dob || +m[1] < 1900 || date > new Date()) return { error: "Invalid date of birth" };

  const counts = body.counts;
  if (!counts || !KEYS.every(k => Number.isInteger(counts[k]) && counts[k] >= 0 && counts[k] <= 60)) return { error: "Invalid counts" };
  const total = KEYS.reduce((s, k) => s + counts[k], 0);
  if (total !== 30 && total !== 60) return { error: "Invalid total" };

  // Primary/secondary are recomputed here so stored data does not depend on the client.
  const ranked = [...KEYS].sort((a, b) => counts[b] - counts[a]);
  const secondary = counts[ranked[1]] > 0 && counts[ranked[1]] >= counts[ranked[0]] * 0.7 ? ranked[1] : null;

  const mode = body.mode === "full" ? "full" : "quick";
  const lang = ["vi", "en", "ja"].includes(body.lang) ? body.lang : "vi";
  return { name, dob, counts, total, primary: ranked[0], secondary, mode, lang };
}
