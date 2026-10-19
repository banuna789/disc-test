// Site settings. aiEndpoint is the chat API (functions/api/chat.js on Cloudflare Pages).
// It only exists on the Cloudflare Pages deployment, so the chat is hidden everywhere else.
window.DISC_CONFIG = {
  aiEndpoint: /\.pages\.dev$/.test(location.hostname) ? "/api/chat" : ""
};
