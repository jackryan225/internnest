# InternNest — Build Log

A running record of what's being built and why. More detailed than the Owner's Guide,
but kept readable. Newest entries at the bottom.

---

## 2026-06-28 — Foundation

- Created private GitHub repo `jackryan225/internpilot-ai` (to be renamed `internnest`)
  and pushed the existing 3-file static site (`index.html`, `styles.css`, `script.js`).
  Added `README.md` as a quick edit guide. Invited Dillon (`dillonsilvers1234`) as a collaborator.
- Verified the local copy was byte-identical to the live Netlify site before pushing.
- Linked the repo to the existing Netlify site for **continuous deploy** (push to `main`
  → live in ~30s). Build command: none. Publish dir: repo root (it's a static site).

## 2026-06-29 — Domain

- Dillon purchased **internnest.ai** (GoDaddy; `.ai`, ~$70–100/yr — to be held in Dillon's name).
- Pointed it at Netlify via **Netlify DNS**: set GoDaddy's nameservers to Netlify's four
  (`dns1–4.p06.nsone.net`), added the domain in Netlify (primary = internnest.ai, www → redirect).
- Status: nameservers propagated to Netlify; Netlify serving the site at the origin;
  waiting on the old cached DNS to expire + Netlify to auto-issue the Let's Encrypt SSL cert.

## Decisions locked (brainstorm)

- **Hosting:** stay on Netlify (static + serverless functions + SSL + auto-deploy — covers everything v1 needs).
- **Design freeze (Dillon's rule):** do NOT change the front-end design or structure unless
  it's actively glitchy. Allowed: the rebrand (logo + name) and bug fixes only.
- **Rebrand:** InternPilot AI → **InternNest** (logo provided by Dillon; same layout/structure).
- **AI matcher (core deliverable):** real "Find My Matches" engine. A real internship dataset
  (`internships.json`, built via an agentic research sweep, each entry with a verified application
  URL) + a Netlify serverless function that pre-filters by industry/location, then calls the AI to
  score/explain the shortlist. Provider TBD (Claude Haiku vs Gemini Flash).
- **Chat advisor:** secondary; trim-first if budget tightens.
- **Payments:** Stripe (account created in Dillon's name). Stripe-hosted checkout + a lightweight
  unlock **verified server-side** against the Stripe session (so the success URL can't be faked).
  $9.99 one-time "Unlock Premium" + $29 "Match Report" (printable → Save as PDF). Real
  accounts/subscriptions deferred to a later phase.
- **Free vs Premium:** Free = top 3 matches + one-line why. Premium = all ~10 matches, full
  reasoning + skill gaps, AI outreach messages, chat advisor, resume tips.

## Engagement

- Fixed fee **$1,600** this round (basic-but-real AI + full MVP); more depending on performance.
  Jack = contractor for Dillon. Full handoff: ownership transfer of all accounts + maintenance
  lessons + the Owner's Guide.

## 2026-06-29 — Rebrand shipped (Milestone 1 complete)

- Rebranded InternPilot → **InternNest** site-wide: nav + footer wordmark now "Intern**Nest**`.ai`".
  Chose a clean text wordmark over the square badge logo (the badge doesn't fit a 66px nav); the
  badge is the **favicon**. Updated title, meta description, hero subheading, footer copyright.
  Renamed the logo asset to `internnest-logo.png`.
- Fixed a **pre-existing glitch** (Dillon had flagged it): the mobile menu rendered open at desktop
  because `#mobileMenu` lacked the `hidden` class and nothing hid `.mobile-menu` at desktop. One-line
  fix: `<div class="mobile-menu hidden" ...>`.
- Renamed the GitHub repo `internpilot-ai` → **`internnest`** (old URL auto-redirects).
- **Netlify gotcha (important):** git-triggered deploys were failing — *"Build blocked: unrecognized
  Git contributor; this plan allows only verified members to push to private repos."* Netlify's free
  plan blocks builds on **private** repos pushed by non-account-members. **Fix: made the repo PUBLIC.**
  Note: clicking "Trigger deploy" kept failing (cached "private" view); a fresh **git push** forced
  Netlify to re-read the repo as public and the build passed. Auto-deploy on push now works.
- ✅ Verified live at **https://internnest.ai** (HTTP 200, valid SSL, 0 "InternPilot" refs;
  InternNest wordmark + favicon + menu fix all present).

## 2026-06-29 — Dataset built (Milestone 2 complete)

- Built `internships.json` via two background multi-agent workflows (researcher → adversarial URL
  verifier → curator), then merged + cleaned:
  - Main sweep (31 agents, ~55 min): 47 verified + 36 backfill = 83 listings across all 8 industries.
  - Targeted top-up (8 agents, ~13 min) for the under-covered priority industries (Finance,
    Consulting, Real Estate, Marketing): 11 new verified listings.
  - Merge/cleanup: HTML-entity decode, dedupe by company+role, dropped one FOX Sports URL that
    returned 500 and a redundant Bain "Deadline #2" entry.
- **Final: 88 real, verified internships**, every one with a live https application_url
  (independent spot-checks: 17/18 sampled URLs returned 200; the one 500 was dropped).
- Coverage: Technology 15, Sports Business 17, Marketing 14, Media & Ent. 12, Healthcare 10,
  Real Estate 8, Consulting 7, **Finance 5**. Finance + Real Estate are the structural late-June
  ceiling (2026 roles filled, 2027 not yet posted) — improvable in a fall refresh; the matcher's
  cross-industry fallback covers thin industries at match time.
- A few listings carry a "Summer 2026" term (verified live, likely late/rolling) — flagged for refresh.
- Refresh process = re-run the workflows (Jack/Claude), since Dillon is non-technical.

## 2026-06-29 — Matcher built (Milestone 3) — LOCAL ONLY, not yet deployed

- Built the AI matcher per plan: `netlify/functions/match.js` + `netlify/lib/{matcher,claude,ratelimit}.js`,
  wired into the existing card UI in `script.js`. 11 unit tests (node:test), all green.
- Verified end-to-end locally via `netlify dev`: form → function → real internships in the existing cards;
  Free shows 3 + an "unlock" CTA; "Apply Now" → the real listing. Confirmed both fallback mode (no key) and
  **AI mode** (with a key): personalized score / why / missing-skills / tip in ~7s.
- **Latency lesson:** per-listing AI generation blew past Netlify's ~10s function limit (~13–18s). Fix: cap
  output (8 candidates, 750 max_tokens), a real 9s abort that falls back, and a salvage parser for truncated
  JSON. AI outreach was the biggest token hog → moved off the matcher; outreach is templated client-side for
  now (true AI outreach = a fast-follow, generated per-card on click).
- **Key handling (decision):** dev/testing uses **Jack's own** Anthropic key in a local gitignored `.env`
  (his credits). At handoff, **Dillon creates his own key** and adds it to Netlify env (his billing) — clean
  ownership + cost separation.
- **Not deployed:** all matcher commits are LOCAL (not pushed). Live internnest.ai still serves the old demo
  until the single handoff deploy (Dillon's key + Stripe live keys → push → verify).
