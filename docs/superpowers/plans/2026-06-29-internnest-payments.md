# InternNest Payments (Milestone 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real Stripe-test-mode payments so a student can buy the $9.99 Premium unlock or the $29 Match Report, with the unlock verified server-side and gated client-side — all on the existing site design, testable locally via `netlify dev`.

**Architecture:** Two new Netlify Functions. `create-checkout` builds a Stripe Checkout Session (server-side, secret key never exposed) and returns its hosted URL; the browser redirects there. On payment, Stripe redirects back to the site with `?session_id=…`; `verify-unlock` retrieves the session, confirms `payment_status === 'paid'`, and returns an **HMAC-signed unlock token** the browser stores in `localStorage`. Premium gating (`isUnlocked()`) reads that token. The $29 product additionally enables a print-optimized Match Report (`window.print()` → Save as PDF). Pure logic (token signing, Stripe request/response shaping) lives in `netlify/lib/` and is unit-tested; functions are thin handlers.

**Tech Stack:** Node (CommonJS) Netlify Functions, node built-in `crypto` (HMAC) and `fetch` (Stripe REST API), `node --test` (node:test), vanilla JS front-end, Stripe Checkout (test mode).

## Global Constraints

- **Design freeze (Dillon's rule):** do NOT change front-end design/structure unless actively glitchy. Allowed: wiring the three existing pricing buttons + a print action. No new sections, no restyle. Copy verbatim from spec §2.
- **Stay on Netlify** — static + serverless functions + env vars. No new hosting.
- **All secrets in gitignored `.env` locally / Netlify env in prod; never committed.** `.env` is already gitignored.
- **Stripe TEST MODE only** in this milestone (`sk_test_…`). Live keys swapped in at handoff (Milestone 5), not here.
- **AI provider / model unchanged:** `claude-haiku-4-5-20251001` (not touched by this milestone).
- **CommonJS** (`package.json` has `"type":"commonjs"`); lib files start with `'use strict';` and `module.exports`. Match existing style in `netlify/lib/`.
- **No live deploy.** Everything tested under `netlify dev` (port 8888). Commits stay local until the Milestone 5 handoff push.
- **Unlock is per-browser** (localStorage) — an honest v1 limit, documented, not "real" account enforcement.

## Products (exact)

| Product key | Amount (cents) | Stripe line-item name | Effect |
|-------------|----------------|-----------------------|--------|
| `premium`   | `999`          | `InternNest Premium Unlock` | Unlocks all matches + full reasoning/outreach |
| `report`    | `2900`         | `InternNest Match Report`   | Same unlock + enables printable Match Report |

## Environment variables (added this milestone)

- `STRIPE_SECRET_KEY` — Jack pastes a Stripe **test** secret key (`sk_test_…`) into `.env`. (External credential — must be supplied by the human; the assistant never types it.)
- `UNLOCK_SIGNING_SECRET` — already present in `.env` (blank). Filled with a locally-generated random hex string in Task 7.

## File Structure

- **Create** `netlify/lib/unlock.js` — `signUnlockToken(payload, secret)`, `verifyUnlockToken(token, secret, now)`. Pure, node:crypto. Unit-tested.
- **Create** `netlify/lib/stripe.js` — `buildSessionParams({product, origin})`, `createCheckoutSession({secretKey, product, origin, fetchImpl})`, `retrieveSession({secretKey, sessionId, fetchImpl})`. fetch injectable for tests.
- **Create** `netlify/functions/create-checkout.js` — POST `{product}` → `{url}`.
- **Create** `netlify/functions/verify-unlock.js` — POST `{session_id}` → `{token, product}` or 402.
- **Create** `netlify/lib/unlock.test.js`, `netlify/lib/stripe.test.js` — node:test.
- **Modify** `script.js` — replace `isUnlocked()` stub; add `startCheckout(product)`, success-redirect handler on load, and Match Report print builder.
- **Modify** `index.html:360`, `index.html:378` (pricing buttons) + Premium results CTA already in `script.js:295`.
- **Modify** `.env` — fill `UNLOCK_SIGNING_SECRET`, add `STRIPE_SECRET_KEY` placeholder (Task 7).
- **Modify** `docs/BUILD-LOG.md`, `docs/OWNER-GUIDE.md` — Milestone 4 entry + Stripe-key owner section (Task 8).

---

### Task 1: Unlock token signing (`netlify/lib/unlock.js`)

**Files:**
- Create: `netlify/lib/unlock.js`
- Test: `netlify/lib/unlock.test.js`

**Interfaces:**
- Produces:
  - `signUnlockToken(payload: object, secret: string) -> string` — returns `base64url(JSON(payload)).base64url(HMAC_SHA256(thatBody, secret))`.
  - `verifyUnlockToken(token: string, secret: string, now: number) -> object|null` — returns the payload object if the signature is valid (constant-time compare) AND `payload.exp > now` (ms epoch); otherwise `null`. Never throws on malformed input.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { signUnlockToken, verifyUnlockToken } = require('./unlock');

const SECRET = 'test-signing-secret-0123456789';

test('sign then verify round-trips the payload', () => {
  const now = 1_000_000;
  const token = signUnlockToken({ product: 'premium', exp: now + 5000 }, SECRET);
  const payload = verifyUnlockToken(token, SECRET, now);
  assert.strictEqual(payload.product, 'premium');
});

test('verify rejects a tampered body', () => {
  const now = 1_000_000;
  const token = signUnlockToken({ product: 'premium', exp: now + 5000 }, SECRET);
  const [body, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ product: 'report', exp: now + 5000 })).toString('base64url');
  assert.strictEqual(verifyUnlockToken(`${forged}.${sig}`, SECRET, now), null);
});

test('verify rejects a wrong secret', () => {
  const now = 1_000_000;
  const token = signUnlockToken({ product: 'premium', exp: now + 5000 }, SECRET);
  assert.strictEqual(verifyUnlockToken(token, 'other-secret', now), null);
});

test('verify rejects an expired token', () => {
  const now = 1_000_000;
  const token = signUnlockToken({ product: 'premium', exp: now - 1 }, SECRET);
  assert.strictEqual(verifyUnlockToken(token, SECRET, now), null);
});

test('verify returns null on malformed input instead of throwing', () => {
  assert.strictEqual(verifyUnlockToken('garbage', SECRET, 1), null);
  assert.strictEqual(verifyUnlockToken('', SECRET, 1), null);
  assert.strictEqual(verifyUnlockToken('a.b.c', SECRET, 1), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test netlify/lib/unlock.test.js`
Expected: FAIL — `Cannot find module './unlock'`.

- [ ] **Step 3: Write minimal implementation**

```js
'use strict';
const crypto = require('node:crypto');

function b64url(buf) { return Buffer.from(buf).toString('base64url'); }

function hmac(body, secret) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

function signUnlockToken(payload, secret) {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${hmac(body, secret)}`;
}

function verifyUnlockToken(token, secret, now) {
  try {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expected = hmac(body, secret);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || typeof payload.exp !== 'number' || payload.exp <= now) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

module.exports = { signUnlockToken, verifyUnlockToken };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test netlify/lib/unlock.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/lib/unlock.js netlify/lib/unlock.test.js
git commit -m "feat(payments): HMAC-signed unlock token (sign/verify)"
```

---

### Task 2: Stripe REST wrapper (`netlify/lib/stripe.js`)

**Files:**
- Create: `netlify/lib/stripe.js`
- Test: `netlify/lib/stripe.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `PRODUCTS` — `{ premium: {amount:999, name:'InternNest Premium Unlock'}, report: {amount:2900, name:'InternNest Match Report'} }`.
  - `buildSessionParams({product, origin}) -> URLSearchParams` — Stripe form body. Throws `Error('unknown product')` if product not in `PRODUCTS`. `success_url = ${origin}/?paid=${product}&session_id={CHECKOUT_SESSION_ID}`, `cancel_url = ${origin}/#pricing`.
  - `createCheckoutSession({secretKey, product, origin, fetchImpl=fetch}) -> Promise<{id, url}>`.
  - `retrieveSession({secretKey, sessionId, fetchImpl=fetch}) -> Promise<{id, payment_status, metadata}>`.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { PRODUCTS, buildSessionParams, createCheckoutSession, retrieveSession } = require('./stripe');

test('PRODUCTS has correct amounts', () => {
  assert.strictEqual(PRODUCTS.premium.amount, 999);
  assert.strictEqual(PRODUCTS.report.amount, 2900);
});

test('buildSessionParams encodes a known product', () => {
  const p = buildSessionParams({ product: 'premium', origin: 'http://localhost:8888' });
  assert.strictEqual(p.get('mode'), 'payment');
  assert.strictEqual(p.get('line_items[0][price_data][unit_amount]'), '999');
  assert.strictEqual(p.get('line_items[0][price_data][currency]'), 'usd');
  assert.strictEqual(p.get('line_items[0][price_data][product_data][name]'), 'InternNest Premium Unlock');
  assert.strictEqual(p.get('line_items[0][quantity]'), '1');
  assert.strictEqual(p.get('metadata[product]'), 'premium');
  assert.match(p.get('success_url'), /session_id=\{CHECKOUT_SESSION_ID\}/);
  assert.match(p.get('success_url'), /paid=premium/);
  assert.strictEqual(p.get('cancel_url'), 'http://localhost:8888/#pricing');
});

test('buildSessionParams rejects an unknown product', () => {
  assert.throws(() => buildSessionParams({ product: 'nope', origin: 'http://x' }), /unknown product/);
});

test('createCheckoutSession posts form body and returns id+url', async () => {
  let captured;
  const fakeFetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, json: async () => ({ id: 'cs_test_123', url: 'https://checkout.stripe.com/c/cs_test_123' }) };
  };
  const out = await createCheckoutSession({ secretKey: 'sk_test_x', product: 'report', origin: 'http://localhost:8888', fetchImpl: fakeFetch });
  assert.strictEqual(out.id, 'cs_test_123');
  assert.strictEqual(out.url, 'https://checkout.stripe.com/c/cs_test_123');
  assert.strictEqual(captured.url, 'https://api.stripe.com/v1/checkout/sessions');
  assert.strictEqual(captured.opts.method, 'POST');
  assert.strictEqual(captured.opts.headers.Authorization, 'Bearer sk_test_x');
  assert.match(captured.opts.headers['content-type'], /x-www-form-urlencoded/);
});

test('createCheckoutSession throws on a non-ok response', async () => {
  const fakeFetch = async () => ({ ok: false, status: 400, text: async () => 'bad request' });
  await assert.rejects(
    createCheckoutSession({ secretKey: 'sk_test_x', product: 'premium', origin: 'http://x', fetchImpl: fakeFetch }),
    /stripe 400/
  );
});

test('retrieveSession GETs the session by id', async () => {
  let captured;
  const fakeFetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, json: async () => ({ id: 'cs_test_123', payment_status: 'paid', metadata: { product: 'premium' } }) };
  };
  const out = await retrieveSession({ secretKey: 'sk_test_x', sessionId: 'cs_test_123', fetchImpl: fakeFetch });
  assert.strictEqual(out.payment_status, 'paid');
  assert.strictEqual(out.metadata.product, 'premium');
  assert.strictEqual(captured.url, 'https://api.stripe.com/v1/checkout/sessions/cs_test_123');
  assert.strictEqual(captured.opts.method, 'GET');
  assert.strictEqual(captured.opts.headers.Authorization, 'Bearer sk_test_x');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test netlify/lib/stripe.test.js`
Expected: FAIL — `Cannot find module './stripe'`.

- [ ] **Step 3: Write minimal implementation**

```js
'use strict';

const PRODUCTS = {
  premium: { amount: 999, name: 'InternNest Premium Unlock' },
  report: { amount: 2900, name: 'InternNest Match Report' },
};

function buildSessionParams({ product, origin }) {
  const p = PRODUCTS[product];
  if (!p) throw new Error('unknown product');
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'usd');
  params.set('line_items[0][price_data][unit_amount]', String(p.amount));
  params.set('line_items[0][price_data][product_data][name]', p.name);
  params.set('metadata[product]', product);
  params.set('success_url', `${origin}/?paid=${product}&session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${origin}/#pricing`);
  return params;
}

async function createCheckoutSession({ secretKey, product, origin, fetchImpl = fetch }) {
  const body = buildSessionParams({ product, origin });
  const res = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error('stripe ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const data = await res.json();
  return { id: data.id, url: data.url };
}

async function retrieveSession({ secretKey, sessionId, fetchImpl = fetch }) {
  const res = await fetchImpl('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(sessionId), {
    method: 'GET',
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!res.ok) throw new Error('stripe ' + res.status + ': ' + (await res.text()).slice(0, 200));
  return res.json();
}

module.exports = { PRODUCTS, buildSessionParams, createCheckoutSession, retrieveSession };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test netlify/lib/stripe.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/lib/stripe.js netlify/lib/stripe.test.js
git commit -m "feat(payments): Stripe checkout-session REST wrapper"
```

---

### Task 3: `create-checkout` function

**Files:**
- Create: `netlify/functions/create-checkout.js`

**Interfaces:**
- Consumes: `createCheckoutSession`, `PRODUCTS` from `../lib/stripe`.
- Produces: POST handler. Body `{product}` → `200 {url}`. Missing/unknown product → `400`. Missing `STRIPE_SECRET_KEY` → `503 {error:'payments not configured'}`. Stripe error → `502`.

- [ ] **Step 1: Write the implementation**

```js
'use strict';
const { createCheckoutSession, PRODUCTS } = require('../lib/stripe');

const json = (statusCode, obj) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  let product;
  try {
    product = (JSON.parse(event.body || '{}').product || '').toString();
  } catch (e) { return json(400, { error: 'bad JSON' }); }
  if (!PRODUCTS[product]) return json(400, { error: 'unknown product' });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return json(503, { error: 'payments not configured' });

  // Origin to build the return URLs; fall back to the site host header.
  const proto = (event.headers['x-forwarded-proto'] || 'https');
  const host = event.headers.host || event.headers['x-forwarded-host'];
  const origin = event.headers.origin || `${proto}://${host}`;

  try {
    const { url } = await createCheckoutSession({ secretKey, product, origin });
    return json(200, { url });
  } catch (e) {
    return json(502, { error: 'stripe error' });
  }
};
```

- [ ] **Step 2: Smoke-test it loads (no Stripe call)**

Run: `node -e "process.env.STRIPE_SECRET_KEY=''; require('./netlify/functions/create-checkout').handler({httpMethod:'POST',headers:{},body:JSON.stringify({product:'premium'})}).then(r=>console.log(r.statusCode, r.body))"`
Expected: `503 {"error":"payments not configured"}`

- [ ] **Step 3: Smoke-test unknown product**

Run: `node -e "require('./netlify/functions/create-checkout').handler({httpMethod:'POST',headers:{},body:JSON.stringify({product:'nope'})}).then(r=>console.log(r.statusCode, r.body))"`
Expected: `400 {"error":"unknown product"}`

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/create-checkout.js
git commit -m "feat(payments): create-checkout function"
```

---

### Task 4: `verify-unlock` function

**Files:**
- Create: `netlify/functions/verify-unlock.js`

**Interfaces:**
- Consumes: `retrieveSession` from `../lib/stripe`; `signUnlockToken` from `../lib/unlock`.
- Produces: POST handler. Body `{session_id}` → if session `payment_status === 'paid'`: `200 {token, product}` where token payload `{product, iat, exp}` (`exp = now + 365 days`, ms). Not paid → `402 {error:'not paid'}`. Missing config → `503`. Missing/invalid session → `400`/`502`. `product` derived from `session.metadata.product`, defaulting to `'premium'`.

- [ ] **Step 1: Write the implementation**

```js
'use strict';
const { retrieveSession } = require('../lib/stripe');
const { signUnlockToken } = require('../lib/unlock');

const json = (statusCode, obj) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) });
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  let sessionId;
  try {
    sessionId = (JSON.parse(event.body || '{}').session_id || '').toString();
  } catch (e) { return json(400, { error: 'bad JSON' }); }
  if (!sessionId) return json(400, { error: 'missing session_id' });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const signingSecret = process.env.UNLOCK_SIGNING_SECRET;
  if (!secretKey || !signingSecret) return json(503, { error: 'payments not configured' });

  let session;
  try {
    session = await retrieveSession({ secretKey, sessionId });
  } catch (e) {
    return json(502, { error: 'stripe error' });
  }

  if (!session || session.payment_status !== 'paid') return json(402, { error: 'not paid' });

  const product = (session.metadata && session.metadata.product) || 'premium';
  const now = Date.now();
  const token = signUnlockToken({ product, iat: now, exp: now + YEAR_MS }, signingSecret);
  return json(200, { token, product });
};
```

- [ ] **Step 2: Smoke-test missing config**

Run: `node -e "process.env.STRIPE_SECRET_KEY='';process.env.UNLOCK_SIGNING_SECRET='';require('./netlify/functions/verify-unlock').handler({httpMethod:'POST',headers:{},body:JSON.stringify({session_id:'cs_test_x'})}).then(r=>console.log(r.statusCode, r.body))"`
Expected: `503 {"error":"payments not configured"}`

- [ ] **Step 3: Smoke-test missing session_id**

Run: `node -e "require('./netlify/functions/verify-unlock').handler({httpMethod:'POST',headers:{},body:'{}'}).then(r=>console.log(r.statusCode, r.body))"`
Expected: `400 {"error":"missing session_id"}`

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/verify-unlock.js
git commit -m "feat(payments): verify-unlock function (issues signed token on paid)"
```

---

### Task 5: Front-end wiring (`script.js` + pricing buttons)

**Files:**
- Modify: `script.js:13-14` (replace `isUnlocked()` stub), add helpers near it.
- Modify: `index.html:360` (Premium button), `index.html:378` (Match Report button).

**Interfaces:**
- Consumes: `/.netlify/functions/create-checkout`, `/.netlify/functions/verify-unlock`.
- Produces (global, called from inline `onclick`): `startCheckout(product)`; `isUnlocked()` now reads `localStorage`.

**Token storage:** key `inn_unlock`, value = the raw token string. `isUnlocked()` decodes the payload's `exp` (no secret needed client-side — the signature was already validated server-side at issuance; the client just checks the token exists and isn't expired). Separate flag `inn_report` (set when `product==='report'`) gates the Match Report button.

- [ ] **Step 1: Replace the `isUnlocked()` stub**

In `script.js`, replace lines 13-14:

```js
/* Premium unlock — Stripe-verified token stored per browser (Milestone 4) */
function readUnlock() {
  try {
    const raw = localStorage.getItem('inn_unlock');
    if (!raw) return null;
    const body = JSON.parse(atob(raw.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
    if (!body || typeof body.exp !== 'number' || body.exp <= Date.now()) return null;
    return body;
  } catch (e) { return null; }
}
function isUnlocked() { return readUnlock() !== null; }
function hasReport() { return localStorage.getItem('inn_report') === '1'; }

async function startCheckout(product) {
  try {
    const res = await fetch('/.netlify/functions/create-checkout', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ product }),
    });
    const data = await res.json();
    if (data.url) { window.location.href = data.url; return; }
    alert(data.error === 'payments not configured'
      ? 'Payments are not set up yet — check back soon.'
      : 'Could not start checkout. Please try again.');
  } catch (e) { alert('Could not start checkout. Please try again.'); }
}

/* On a successful return from Stripe (?paid=…&session_id=…), confirm + store the unlock. */
async function handlePaymentReturn() {
  const q = new URLSearchParams(window.location.search);
  const sessionId = q.get('session_id');
  if (!sessionId) return;
  try {
    const res = await fetch('/.netlify/functions/verify-unlock', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('inn_unlock', data.token);
      if (data.product === 'report') localStorage.setItem('inn_report', '1');
    }
  } catch (e) { /* leave locked; user can retry */ }
  // Clean the URL so a refresh doesn't re-run verification.
  window.history.replaceState({}, '', window.location.pathname + '#results');
}
document.addEventListener('DOMContentLoaded', handlePaymentReturn);
```

- [ ] **Step 2: Wire the two pricing buttons**

In `index.html`, line 360 — change:
```html
          <a href="#form" class="btn-primary">Start Premium — $9.99/mo</a>
```
to:
```html
          <a href="#form" class="btn-primary" onclick="startCheckout('premium');return false;">Start Premium — $9.99</a>
```

Line 378 — change:
```html
          <a href="#form" class="btn-outline">Buy Report — $29</a>
```
to:
```html
          <a href="#form" class="btn-outline" onclick="startCheckout('report');return false;">Buy Report — $29</a>
```

(The "/mo" is dropped from the Premium label to match the spec's one-time v1 unlock. No other copy/layout changes.)

- [ ] **Step 3: Verify the page still loads under `netlify dev`**

Run (assumes `netlify dev` already running on 8888): `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8888/`
Expected: `200`

- [ ] **Step 4: Commit**

```bash
git add script.js index.html
git commit -m "feat(payments): wire checkout buttons + localStorage unlock gating"
```

---

### Task 6: Printable Match Report (the $29 deliverable)

**Files:**
- Modify: `script.js` — in `renderResults`, when `hasReport()` is true, show a "Print / Save as PDF" button; add `printReport(user)` that opens a print-optimized window and calls `window.print()`.

**Interfaces:**
- Consumes: the `matches` + `user` already in scope in `renderResults` (`script.js:284`); `hasReport()` from Task 5. Reuses each match's `title, company, location, score, why, missing, tip, application_url`.
- Produces: global `printReport()` reading the last rendered results from a module-level `lastResults` variable.

- [ ] **Step 1: Capture the last results + add the report button**

At the top of `renderResults` (after `script.js:284`), store results for the printer. Find the start of `renderResults` and add `lastResults = { matches, user };` as the first line of its body, and declare `let lastResults = null;` near the other globals (next to `let cardCounter = 200;` at `script.js:11`).

In `renderResults`, where the premium CTA is built (`script.js:294-295`), add — for report buyers — a print button. After the existing CTA block, insert:

```js
  const reportBtn = hasReport()
    ? `<div style="grid-column:1/-1;text-align:center;padding:8px 0 24px"><a class="btn-outline" href="#" onclick="printReport();return false;">🖨️ Print / Save as PDF</a></div>`
    : '';
```

Then include `reportBtn` in the results HTML string alongside the existing CTA (same insertion point).

- [ ] **Step 2: Add the `printReport` function**

Add near `startCheckout` in `script.js`:

```js
function printReport() {
  if (!lastResults) return;
  const { matches, user } = lastResults;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const rows = matches.map((m, i) => `
    <div class="r">
      <h3>${i + 1}. ${esc(m.title)} — ${esc(m.company)}</h3>
      <p class="meta">${esc(m.location || '')} · Match score ${esc(m.score)}</p>
      <p>${esc(m.why || '')}</p>
      ${(m.missing && m.missing.length) ? `<p><strong>Build these skills:</strong> ${esc(m.missing.join(', '))}</p>` : ''}
      ${m.tip ? `<p><strong>Tip:</strong> ${esc(m.tip)}</p>` : ''}
      ${m.application_url ? `<p><strong>Apply:</strong> ${esc(m.application_url)}</p>` : ''}
    </div>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>InternNest Match Report</title>
    <style>
      body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a2e;max-width:720px;margin:32px auto;padding:0 24px;line-height:1.5}
      h1{font-size:24px}h3{margin:0 0 4px;font-size:16px}.meta{color:#667;margin:0 0 8px;font-size:13px}
      .r{padding:16px 0;border-bottom:1px solid #eee;page-break-inside:avoid}
      .head{margin-bottom:24px}
    </style></head><body>
    <div class="head"><h1>InternNest — Match Report</h1>
      <p>Prepared for ${esc(user && user.name ? user.name : 'you')} · ${matches.length} matches</p></div>
    ${rows}
    <script>window.onload=function(){window.print();}<\/script>
    </body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}
```

- [ ] **Step 3: Verify page loads (syntax check)**

Run: `node -e "require('fs').readFileSync('script.js','utf8'); new Function(require('fs').readFileSync('script.js','utf8')); console.log('parse-ok')"`
Expected: `parse-ok` (confirms no syntax error; browser globals are not executed).

- [ ] **Step 4: Commit**

```bash
git add script.js
git commit -m "feat(payments): printable Match Report for the \$29 product"
```

---

### Task 7: Configure secrets + full local end-to-end test (Stripe test mode)

**Files:**
- Modify: `.env` (fill `UNLOCK_SIGNING_SECRET`; add `STRIPE_SECRET_KEY=` placeholder for Jack).

**This task has a human handoff:** Jack pastes a Stripe **test** secret key. The assistant generates the signing secret and runs the flow.

- [ ] **Step 1: Generate + set the signing secret**

Run: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`
Put the output as `UNLOCK_SIGNING_SECRET=<value>` in `.env`. Add a line `STRIPE_SECRET_KEY=` (Jack fills the `sk_test_…` value — assistant does not type it).

- [ ] **Step 2: Restart `netlify dev`** so it injects the new env vars (kill + relaunch the existing background task).

- [ ] **Step 3: Verify `create-checkout` returns a real Stripe URL**

Run: `curl -s -X POST http://localhost:8888/.netlify/functions/create-checkout -H 'content-type: application/json' -d '{"product":"premium"}'`
Expected: JSON with a `"url":"https://checkout.stripe.com/..."`. (If `503 payments not configured`, the Stripe key isn't loaded yet.)

> Note: `curl` is blocked by a Bash hook in this environment — run HTTP checks via the context-mode `ctx_execute` sandbox (or Jack runs the curl himself). The function-load smoke tests in Tasks 3–4 use `node -e` and are not blocked.

- [ ] **Step 4: Browser test the full flow** (Jack drives, or via Claude Preview / Chrome MCP):
  1. Open `http://localhost:8888`, submit the matcher form → results render, free shows 3 + unlock CTA.
  2. Click **Start Premium — $9.99** → redirected to Stripe Checkout (test mode).
  3. Pay with test card `4242 4242 4242 4242`, any future expiry, any CVC/ZIP.
  4. Redirected back to `/?paid=premium&session_id=…` → `verify-unlock` runs → `localStorage.inn_unlock` set.
  5. Re-run a match → all matches now shown (premium unlocked).
  6. Repeat with **Buy Report — $29** → after return, the "🖨️ Print / Save as PDF" button appears → opens a clean printable report.

- [ ] **Step 5: Commit the env scaffolding note** (NOT the secret values — `.env` is gitignored, so nothing secret is committed; this step just confirms `.gitignore` still covers `.env`).

Run: `git status --porcelain .env`
Expected: empty output (─ `.env` is ignored, not staged).

---

### Task 8: Documentation (BUILD-LOG + Owner's Guide)

**Files:**
- Modify: `docs/BUILD-LOG.md` (append Milestone 4 entry).
- Modify: `docs/OWNER-GUIDE.md` (add a "Payments / Stripe" owner section: where the money goes, test vs live keys, the handoff step to swap live keys).

- [ ] **Step 1: Append the BUILD-LOG entry** documenting: two functions + two libs, HMAC token, per-browser localStorage unlock (honest limit), printable report, Stripe test mode, design-freeze-safe button wiring, what's deferred to handoff (live keys).

- [ ] **Step 2: Add the Owner's Guide Stripe section** in plain language for Dillon: money flows to his Stripe → his bank; v1 is test mode; at handoff he creates live keys and pastes them into Netlify env (screenshot-level steps).

- [ ] **Step 3: Commit**

```bash
git add docs/BUILD-LOG.md docs/OWNER-GUIDE.md
git commit -m "docs(payments): Milestone 4 build-log + owner Stripe section"
```

---

## Self-Review

**Spec coverage (§7):**
- Stripe Checkout Sessions via serverless function ✓ (Task 2/3)
- Flow: buy → session → hosted checkout → redirect `?session_id` → verify paid → HMAC token → localStorage → unlock ✓ (Tasks 3–5)
- $9.99 Premium + $29 Report, both from existing pricing page ✓ (Task 5 buttons; `PRODUCTS` Task 2)
- $29 → polished printable page → Save as PDF, also flips unlock ✓ (Task 6 + `metadata.product` in Task 4)
- Money → Dillon's Stripe; built in test mode, swap live at handoff ✓ (Task 7 test mode; Task 8 handoff doc)
- Honest per-browser limit, documented ✓ (Task 5 localStorage; Task 8 doc)

**Type consistency:** `signUnlockToken`/`verifyUnlockToken` (Task 1) used identically in Task 4 + Task 5's client decode mirrors the `body.exp` shape. `createCheckoutSession`/`retrieveSession`/`PRODUCTS` (Task 2) consumed with the same signatures in Tasks 3–4. `isUnlocked`/`hasReport`/`startCheckout`/`printReport` defined in Task 5/6, called from `renderResults` (Task 6) and inline `onclick` (Task 5).

**Placeholder scan:** no TBD/TODO; all code blocks complete. The only human-supplied value is `STRIPE_SECRET_KEY` (external credential, by design).

**Scope:** single milestone, one subsystem (payments). No decomposition needed.
