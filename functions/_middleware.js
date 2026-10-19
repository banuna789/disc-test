// Access control for the whole site (Cloudflare Pages Functions).
// Visitors sign in with Google; the server verifies Google's ID token and sets a signed session cookie.
//
// Pages project → Settings → Variables and Secrets:
//   GOOGLE_CLIENT_ID  (Text)    OAuth "Web application" client ID from Google Cloud
//   SESSION_SECRET    (Secret)  any long random string; used to sign session cookies
//   ADMIN_EMAILS      (Text)    comma-separated Google emails allowed into /admin
//   REQUIRE_LOGIN     (Text)    "false" opens the test (and AI chat) without sign-in;
//                               anything else, or unset, requires Google sign-in for the whole site.
//                               /admin always requires sign-in with an admin email.

import { readSession, signSession, sessionCookie, clearCookie } from "../lib/session.js";

const SESSION_DAYS = 7;
const html = (body, status) => new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

function isAdmin(env, email) {
  const admins = String(env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return !!email && admins.includes(String(email).toLowerCase());
}

export async function onRequest(context) {
  const { request, env, next, data } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Public page Google requires for the sign-in consent screen
  if (path === "/privacy" || path === "/privacy.html") return next();

  const loginReady = !!(env.GOOGLE_CLIENT_ID && env.SESSION_SECRET);
  const openSite = String(env.REQUIRE_LOGIN).trim().toLowerCase() === "false";
  const adminArea = path === "/admin" || path === "/admin.html" || path.startsWith("/api/admin/") || path === "/js/admin.js";

  if (path === "/auth/google" && request.method === "POST") {
    if (!loginReady) return Response.json({ error: "login not configured" }, { status: 500 });
    return googleLogin(request, env);
  }
  if (path === "/auth/logout") {
    return new Response(null, { status: 302, headers: { "Location": "/", "Set-Cookie": clearCookie() } });
  }

  const user = loginReady ? await readSession(request, env.SESSION_SECRET) : null;
  if (user) {
    data.user = user;
    data.isAdmin = isAdmin(env, user.email);
  }

  if (path === "/auth/me") {
    return user ? Response.json({ email: user.email, name: user.name, admin: data.isAdmin }) : Response.json({ error: "login" }, { status: 401 });
  }

  if (adminArea) {
    if (!loginReady) return html("Admin login is not configured: set GOOGLE_CLIENT_ID and SESSION_SECRET.", 500);
    if (!user) return path.startsWith("/api/") ? Response.json({ error: "login" }, { status: 401 }) : html(loginPage(env.GOOGLE_CLIENT_ID, true), 401);
    if (!data.isAdmin) return path.startsWith("/api/") ? Response.json({ error: "forbidden" }, { status: 403 }) : html(forbiddenPage(user.email), 403);
    return next();
  }

  if (openSite || user) return next();

  if (!loginReady) return html("Login is not configured: set GOOGLE_CLIENT_ID and SESSION_SECRET in the Pages project settings.", 500);
  if (path.startsWith("/api/")) return Response.json({ error: "login" }, { status: 401 });
  return html(loginPage(env.GOOGLE_CLIENT_ID, false), 401);
}

async function googleLogin(request, env) {
  let credential;
  try { ({ credential } = await request.json()); } catch { return Response.json({ error: "bad request" }, { status: 400 }); }
  if (typeof credential !== "string" || credential.length > 4096) return Response.json({ error: "bad request" }, { status: 400 });

  // Google checks the token's signature and expiry; we check it was issued for this site.
  const res = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
  if (!res.ok) return Response.json({ error: "invalid token" }, { status: 401 });
  const info = await res.json();
  const issuerOk = info.iss === "accounts.google.com" || info.iss === "https://accounts.google.com";
  if (info.aud !== env.GOOGLE_CLIENT_ID || !issuerOk || info.email_verified !== "true" || !info.email) {
    return Response.json({ error: "invalid token" }, { status: 401 });
  }

  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const token = await signSession({ email: info.email, name: info.name || "", exp }, env.SESSION_SECRET);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(token, SESSION_DAYS * 86400) } });
}

const PAGE_STYLE = `
  :root { --bg: #F2F4F7; --surface: #FFFFFF; --fg: #162033; --muted: #5A6477; --line: #DCE1E9; --err: #CF4430; }
  @media (prefers-color-scheme: dark) { :root { --bg: #10151F; --surface: #19202D; --fg: #E8ECF3; --muted: #A0AABB; --line: #2C3546; --err: #F0705C; color-scheme: dark; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--fg);
    font-family: "Be Vietnam Pro", system-ui, sans-serif; padding: 24px max(16px, env(safe-area-inset-left, 0px)); }
  .card { width: 100%; max-width: 420px; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 32px 28px; display: flex; flex-direction: column; gap: 16px; align-items: center; text-align: center; }
  .dots { display: grid; grid-template-columns: 14px 14px; gap: 3px; }
  .dots i { width: 14px; height: 14px; border-radius: 3px; display: block; }
  h1 { font-family: "Bricolage Grotesque", sans-serif; font-weight: 800; font-size: 1.6rem; margin: 0; }
  p { margin: 0; color: var(--muted); line-height: 1.6; font-size: .95rem; }
  a { color: inherit; }
  #err { color: var(--err); font-size: .9rem; min-height: 1.2em; }
  .small { font-size: .8rem; }`;

const HEAD = title => `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Be+Vietnam+Pro:wght@400;600&display=swap">
<style>${PAGE_STYLE}</style>
</head>`;

const DOTS = `<span class="dots" aria-hidden="true"><i style="background:#CF4430"></i><i style="background:#D99211"></i><i style="background:#2E66CF"></i><i style="background:#24935F"></i></span>`;

function loginPage(clientId, admin) {
  const id = String(clientId).replace(/[^A-Za-z0-9._-]/g, "");
  const intro = admin
    ? "Đăng nhập bằng tài khoản quản trị để xem kết quả.<br>Sign in with an admin account to view results."
    : "Đăng nhập bằng tài khoản Google để làm bài test.<br>Sign in with Google to take the test.<br>Googleアカウントでログインしてください。";
  return `${HEAD(admin ? "Quản trị · DISC" : "Đăng nhập · DISC")}
<body>
<main class="card">
  ${DOTS}
  <h1>${admin ? "Quản trị DISC" : "Trắc nghiệm DISC"}</h1>
  <p>${intro}</p>
  <div id="g_id_onload" data-client_id="${id}" data-callback="onGoogleSignIn" data-auto_prompt="false"></div>
  <div class="g_id_signin" data-type="standard" data-shape="pill" data-theme="outline" data-size="large" data-text="signin_with"></div>
  <p id="err" role="alert"></p>
  <p class="small">Trang chỉ dùng email và tên để nhận diện bạn. · Only your email and name are used to identify you. · <a href="/privacy">Privacy</a></p>
</main>
<script>
  async function onGoogleSignIn(resp) {
    const err = document.getElementById("err");
    err.textContent = "";
    try {
      const r = await fetch("/auth/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: resp.credential }) });
      if (!r.ok) throw new Error();
      location.reload();
    } catch (e) {
      err.textContent = "Đăng nhập không thành công, vui lòng thử lại. · Sign-in failed, please try again.";
    }
  }
</script>
<script src="https://accounts.google.com/gsi/client" async></script>
</body>
</html>`;
}

function forbiddenPage(email) {
  const safe = String(email).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  return `${HEAD("Không có quyền · DISC")}
<body>
<main class="card">
  ${DOTS}
  <h1>Không có quyền truy cập</h1>
  <p>Tài khoản <strong>${safe}</strong> không phải quản trị viên.<br>This account is not an administrator.</p>
  <p><a href="/auth/logout">Đăng xuất · Sign out</a> · <a href="/">Trang chủ · Home</a></p>
</main>
</body>
</html>`;
}
