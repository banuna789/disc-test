// Admin-only results API. The middleware already requires a signed-in admin for /api/admin/*;
// the data.isAdmin check here is a second guard in case routing changes.
//   GET    /api/admin/results?q=&limit=   newest first
//   DELETE /api/admin/results?id=123

import { ensureSchema } from "../../../lib/db.js";

const deny = () => Response.json({ error: "forbidden" }, { status: 403 });

export async function onRequestGet({ request, env, data }) {
  if (!data.isAdmin) return deny();
  if (!env.DB) return Response.json({ error: "D1 binding 'DB' is missing" }, { status: 500 });
  await ensureSchema(env.DB);

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit"), 10) || 500, 1), 5000);

  const stmt = q
    ? env.DB.prepare("SELECT * FROM results WHERE name LIKE ?1 ORDER BY id DESC LIMIT ?2").bind(`%${q}%`, limit)
    : env.DB.prepare("SELECT * FROM results ORDER BY id DESC LIMIT ?1").bind(limit);
  const { results } = await stmt.all();
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM results").first();
  return Response.json({ total: n, results }, { headers: { "Cache-Control": "no-store" } });
}

export async function onRequestDelete({ request, env, data }) {
  if (!data.isAdmin) return deny();
  if (!env.DB) return Response.json({ error: "D1 binding 'DB' is missing" }, { status: 500 });
  const id = parseInt(new URL(request.url).searchParams.get("id"), 10);
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  await ensureSchema(env.DB);
  await env.DB.prepare("DELETE FROM results WHERE id = ?1").bind(id).run();
  return Response.json({ ok: true });
}
