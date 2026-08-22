/* Universal Coffre frontend configuration. Change the API URL only here. */
const COFFRE_API_URL = "http://127.0.0.1:8000";

/* Backward-compatible alias used by the existing vault modules. */
const server_link = COFFRE_API_URL;

Object.defineProperty(window, "COFFRE_API_URL", {
    value: COFFRE_API_URL,
    writable: false,
    configurable: false,
    enumerable: true
});
