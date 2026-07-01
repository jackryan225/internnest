'use strict';
const { signUnlockToken } = require('../lib/unlock');

// Public Supabase values (safe to ship; they also live in the frontend). Env overrides if set.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wupynvbrmbpzibwkobui.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_G3jRiHKjPP3GJWz2Wgf8gg_RbjbnskK';
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (e) { return null; }
}

// Mints a signed unlock token for a signed-in Premium account so any device gets the upgraded model.
// The Supabase access token is verified by using it (under RLS) to read the caller's own profile row —
// an invalid/expired token returns no row, so no token is ever minted for a non-premium or spoofed caller.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = readBody(req);
  if (body === null) return res.status(400).json({ error: 'bad JSON' });
  const accessToken = (body.access_token || '').toString();
  if (!accessToken) return res.status(400).json({ error: 'missing access_token' });

  const signingSecret = process.env.UNLOCK_SIGNING_SECRET;
  if (!signingSecret) return res.status(200).json({ premium: false }); // unlock not configured

  let premium = false, product = 'premium';
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=premium,premium_product`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${accessToken}` },
    });
    if (r.ok) {
      const rows = await r.json();
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row && row.premium) { premium = true; product = row.premium_product || 'premium'; }
    }
  } catch (e) { /* treat any failure as non-premium */ }

  if (!premium) return res.status(200).json({ premium: false });

  const now = Date.now();
  const token = signUnlockToken({ product, iat: now, exp: now + YEAR_MS }, signingSecret);
  return res.status(200).json({ premium: true, token, product });
};
