/* ============================================================================
 * config.js — frontend runtime config
 * ----------------------------------------------------------------------------
 * The frontend is served by the backend, so the API lives on the same origin
 * and API_BASE can stay empty. Set it only if you host the frontend separately
 * from the backend (e.g. "https://your-backend.example.com").
 *
 * NOTE: there is NO API key here anymore. The Anthropic key lives server-side
 * in backend/.env so it is never exposed to the browser.
 * ==========================================================================*/
window.DECK_AGENT_CONFIG = {
  API_BASE: "",
};
