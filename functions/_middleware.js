// Login wall for the whole site (Cloudflare Pages Functions).
// Visitors sign in with Google; the server verifies Google's ID token and sets a signed session cookie.
//
// Pages project → Settings → Variables and Secrets:
//   GOOGLE_CLIENT_ID  (Text)    OAuth "Web application" client ID from Google Cloud
//   SESSION_SECRET    (Secret)  any long random string; used to sign session cookies

import { readSession, signSession, sessionCookie, clearCookie } from "../lib/session.js";

const SESSION_DAYS = 7;

export async function onRequest(context) {
  const { request, env, next, data } = context;
  const url = new URL(request.url);

  // Public pages Google requires for the sign-in consent screen
  if (url.pathname === "/privacy" || url.pathname === "/privacy.html") return next();

  if (!env.GOOGLE_CLIENT_ID || !env.SESSION_SECRET) {
    return new Response("Login is not configured: set GOOGLE_CLIENT_ID and SESSION_SECRET in the Pages project settings.", { status: 500 });
  }

  if (url.pathname === "/auth/google" && request.method === "POST") return googleLogin(request, env);
  if (url.pathname === "/auth/logout") {
    return new Response(null, { status: 302, headers: { "Location": "/", "Set-Cookie": clearCookie() } });
  }

  const user = await readSession(request, env.SESSION_SECRET);
  if (user) {
    data.user = user;
    if (url.pathname === "/auth/me") return Response.json({ email: user.email, name: user.name });
    return next();
  }

  if (url.pathname.startsWith("/api/") || url.pathname === "/auth/me") {
    return Response.json({ error: "login" }, { status: 401 });
  }
  return new Response(loginPage(env.GOOGLE_CLIENT_ID), {
    status: 401,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
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

function loginPage(clientId) {
  const id = String(clientId).replace(/[^A-Za-z0-9._-]/g, "");
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Đăng nhập · DISC</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Be+Vietnam+Pro:wght@400;600&display=swap">
<style>
  :root { --bg: #F2F4F7; --surface: #FFFFFF; --fg: #162033; --muted: #5A6477; --line: #DCE1E9; --err: #CF4430; }
  @media (prefers-color-scheme: dark) { :root { --bg: #10151F; --surface: #19202D; --fg: #E8ECF3; --muted: #A0AABB; --line: #2C3546; --err: #F0705C; color-scheme: dark; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--fg);
    font-family: "Be Vietnam Pro", system-ui, sans-serif; padding: 24px max(16px, env(safe-area-inset-left, 0px)); }
  .card { width: 100%; max-width: 400px; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 32px 28px; display: flex; flex-direction: column; gap: 16px; align-items: center; text-align: center; }
  .dots { display: grid; grid-template-columns: 14px 14px; gap: 3px; }
  .dots i { width: 14px; height: 14px; border-radius: 3px; display: block; }
  h1 { font-family: "Bricolage Grotesque", sans-serif; font-weight: 800; font-size: 1.6rem; margin: 0; }
  p { margin: 0; color: var(--muted); line-height: 1.6; font-size: .95rem; }
  #err { color: var(--err); font-size: .9rem; min-height: 1.2em; }
  .langs { font-size: .8rem; color: var(--muted); }
</style>
</head>
<body>
<main class="card">
  <span class="dots" aria-hidden="true"><i style="background:#CF4430"></i><i style="background:#D99211"></i><i style="background:#2E66CF"></i><i style="background:#24935F"></i></span>
  <h1>Trắc nghiệm DISC</h1>
  <p>Đăng nhập bằng tài khoản Google để làm bài test.<br>Sign in with Google to take the test.<br>Googleアカウントでログインしてください。</p>
  <div id="g_id_onload" data-client_id="${id}" data-callback="onGoogleSignIn" data-auto_prompt="false"></div>
  <div class="g_id_signin" data-type="standard" data-shape="pill" data-theme="outline" data-size="large" data-text="signin_with"></div>
  <p id="err" role="alert"></p>
  <p class="langs">Trang chỉ dùng email và tên để nhận diện bạn. · Only your email and name are used to identify you. · <a href="/privacy.html" style="color:inherit">Privacy</a></p>
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
