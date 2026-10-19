// Site settings. The APIs (functions/) only exist on the Cloudflare Pages deployment,
// so the AI chat is hidden and results are not sent anywhere else (e.g. a local test server).
window.DISC_CONFIG = (function () {
  const onPages = /\.pages\.dev$/.test(location.hostname);
  return {
    aiEndpoint: onPages ? "/api/chat" : "",
    resultsEndpoint: onPages ? "/api/results" : ""
  };
})();
