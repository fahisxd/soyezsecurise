# Contributor-code isolation audit

Scope: the Archive v2 HTML/CSS/JavaScript renderer, content validation, and its
communication with the host. This is a local code review and Chromium regression
suite, not a production penetration test or a guarantee against browser bugs.

## Finding and remediation

The original renderer used `sandbox="allow-scripts"`, an opaque `srcdoc` origin,
and a per-flash CSP. Those controls blocked direct parent DOM/storage access but
did not isolate the visitor's network credentials. An adversarial HTTPS probe
reproduced a sandboxed request carrying an existing HttpOnly authentication cookie.
The earlier parent-DOM test did not cover that attack.

The renderer now requires the browser's credentialless iframe implementation and
emits the actual boolean `credentialless` attribute before loading `srcdoc`.
Unsupported browsers do not instantiate contributor frames. Sandbox tokens remain
exactly `allow-scripts`; adding `allow-same-origin` is forbidden.

Application/authentication hostnames are rejected from every external-resource
list in both Python import validation and frontend API validation. Known
production domains are protected by default. The current frontend and configured
API hostname are also protected at runtime. Custom auth domains require matching
backend/frontend protected-host configuration; deployment owners must supply them.
A render-time host check defends against bypassing the catalog validation path.

An explicit deny policy covers every feature exposed by the browser's Permissions
Policy enumeration, with sensitive-feature defaults if enumeration is absent.
The policy is on the parent-owned iframe and cannot be relaxed by child HTML.
Worker/manifest/object loads and form submission are denied by CSP. The policy
meta tag precedes any author HTML/style/script, so later CSP meta tags can only
further restrict it. Author code does not get an eval/DOM/credential/RPC bridge.
There is no `message` listener in Archive and no secrets are passed into frames.

## Regression evidence

Run `npm run test:api-browser`; tests use dummy secrets and a disposable local
HTTPS server, with a positive control demonstrating the browser really has and
transmits the seeded auth cookie outside the contributor frame.

| Boundary | Tested behavior |
| --- | --- |
| Actual iframe configuration | Sandbox is exactly `allow-scripts`, credentialless attribute exists, child reports `window.credentialless === true` |
| Parent credentials | Cannot read parent cookies, local/session storage, global token or DOM |
| Own origin storage | Cookie access, local/session storage, IndexedDB, Cache Storage, storage-access request and service-worker registration fail |
| Sibling contributor | Cannot read another mounted contributor frame's DOM/global secret |
| BroadcastChannel | Does not receive a parent channel's dummy secret or reach its listener |
| Parent messaging | Forged bookmark/eval/token messages produce no saved-state or parent-code changes |
| Browser privilege | All enumerated policy features are denied; clipboard, password/WebAuthn credential requests and fullscreen attempts fail |
| Escape attempts | User-click popup and top-level navigation attempts fail |
| Ambient network cookies | Explicit credentialed fetch, image request and iframe self-navigation send no seeded HttpOnly cookie; tested requests also have no Authorization or Referer header |
| External hosts | Allowed HTTPS fetch works, unlisted fetch is blocked, application/auth hosts are rejected |
| Unsupported browser | Disabling credentialless support creates no contributor iframe |

The negative BroadcastChannel assertion tests communication, not whether its
constructor throws: Chromium may allow construction even when origin/storage-key
separation prevents the channel from reaching the parent.

## Limits and deployment

Credentialless remains an experimental feature with incomplete browser support;
compatibility is handled by disabling execution, rather than weakening isolation.
Tests cover the locally installed Chromium only. Other engines are not certified.

A flash can navigate its own frame; CSP subresource allowlists do not prevent that
navigation. The parent-owned sandbox, Permissions Policy and credentialless
context persist. A contributor can still render misleading UI, ask the visitor to
type sensitive information into their own flash, send explicitly provided data to
an approved host, or consume CPU/memory. Review remains required.

The published collection is public. Another post's public content is not a secret;
the protected boundary is that contributor's frame DOM and private runtime state.
Normal authenticated APIs must retain authorization and CSRF defenses. Do not
make credentials or private data available to an opaque `Origin: null` through
permissive credentialed CORS. Protected host lists do not replace API authorization.

No production headers, cookies, DNS, or deployed browser behavior were audited in
this change. For defense in depth before accepting arbitrary unreviewed uploads,
serve executable content from a dedicated cookie-free site on a different
registrable domain, with response-header sandbox/CSP/Permissions Policy and
`frame-ancestors` limited to Archive; implement and test that deployment before
claiming it exists. The current implementation is reviewed-content publication
using credentialless opaque frames in the main frontend.

References:
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/IFrame_credentialless
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy
