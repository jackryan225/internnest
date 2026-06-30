'use strict';
const { retrieveSession } = require('../lib/stripe');
const { signUnlockToken } = require('../lib/unlock');

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Flip premium=true on the buyer's Supabase profile (server-side, service key bypasses RLS).
async function setAccountPremium(userId, product) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !userId) return;
  try {
    await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ premium: true, premium_product: product }),
    });
  } catch (e) { /* don't fail the unlock if the DB write hiccups */ }
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (e) { return null; }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = readBody(req);
  if (body === null) return res.status(400).json({ error: 'bad JSON' });
  const sessionId = (body.session_id || '').toString();
  if (!sessionId) return res.status(400).json({ error: 'missing session_id' });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const signingSecret = process.env.UNLOCK_SIGNING_SECRET;
  if (!secretKey || !signingSecret) return res.status(503).json({ error: 'payments not configured' });

  let session;
  try {
    session = await retrieveSession({ secretKey, sessionId });
  } catch (e) {
    return res.status(502).json({ error: 'stripe error' });
  }

  if (!session || session.payment_status !== 'paid') return res.status(402).json({ error: 'not paid' });

  const product = (session.metadata && session.metadata.product) || 'premium';
  const userId = session.metadata && session.metadata.user_id;
  if (userId) await setAccountPremium(userId, product); // persist Premium to the account (cross-device)

  const now = Date.now();
  const token = signUnlockToken({ product, iat: now, exp: now + YEAR_MS }, signingSecret);
  return res.status(200).json({ token, product });
};
