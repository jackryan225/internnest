# InternNest — Owner's Guide (for Dillon)

A plain-English guide to owning and running **InternNest** (internnest.ai).
No technical knowledge needed. Jack keeps this updated as the site is built.

---

## What you own

Everything below is **yours** and should be in **your name**, with **you** holding the
logins. Jack is building it for you and hands over all the keys at the end.

## Accounts & logins you need

| Service | What it's for | Who pays | Rough cost |
|---------|---------------|----------|-----------|
| **GitHub** | Stores the website's code (the master copy) | Free | $0 |
| **Vercel** | Hosts the live website + runs the "behind-the-scenes" code | Pro plan | ~$20 / month |
| **GoDaddy** | Your domain name, internnest.ai | You | ~$70–100 / year |
| **Supabase** | User accounts + login (Google / email) and the database | Free tier | $0 until heavy use |
| **Google Workspace** | Your business email, hello@internnest.ai | You | ~$6 / month |
| **Stripe** | Takes card payments, deposits money to your bank | Per sale | ~2.9% + 30¢ per sale |
| **AI API** (Anthropic / Claude) | Powers the "Find My Matches" engine | Per use | Pennies per search; grows with traffic |

*(As each one is set up, this guide says what it is and how to log in.)*

## How the site works (in plain English)

- The website's files live on **GitHub**.
- When a change is made, it's saved ("pushed") to GitHub, and **Vercel** automatically
  publishes the new version within about 30 seconds.
- Your domain **internnest.ai** points to Vercel, so visitors see your site.
- The AI matching runs through a small piece of code on Vercel that talks to the AI
  provider using your **API key** (a secret password). The key is stored safely on the
  server — never in the public website.
- **Accounts:** students can sign in with Google or an email link. Their account (and
  whether they've bought Premium) lives in **Supabase**, so it follows them across devices.

## How to make a change

You don't need to code. Open the project with **Claude** and describe what you want
(e.g., "change the price to $39"). It gets pushed and goes live automatically.
A full walkthrough + lessons come at handoff.

## What it costs to run (ongoing)

- Hosting: ~$20 / month (Vercel Pro)
- Email: ~$6 / month (Google Workspace)
- Domain: ~$70–100 / year (GoDaddy)
- AI usage: pay-as-you-go, scales with how many people use the matcher
- Supabase: free tier to start

## Getting paid (Stripe)

When a student buys **Premium ($9.99)** or the **Match Report ($29)**, the money flows
straight into **your Stripe account → your bank**. We never touch it.

- **How it works:** the student clicks a buy button → Stripe's own secure checkout page
  takes the card → on success they come back and the premium features unlock **on their
  account**, so it works on any device they sign in to. The unlock is confirmed by the
  server against Stripe, so it can't be faked.
- **Live mode:** Stripe is switched to **Live** — real cards work and real money moves.
  (To test the flow without spending, you can make a real purchase and refund it from your
  Stripe dashboard, or temporarily mark your own account Premium in Supabase.)

## Current status

- ✅ Code on GitHub (repo `jackryan225/internnest`), live on **Vercel**, auto-deploys on every push
- ✅ Domain **internnest.ai** live with SSL (DNS moved off Netlify to Vercel)
- ✅ Rebranded to InternNest (logo, favicon, wordmark) + Liquid Glass design site-wide
- ✅ Full multi-page site (How It Works, Pricing, About, Contact, Blog, Careers, legal pages)
- ✅ Internship dataset built — 88 real, verified listings in `internships.json`
- ✅ Real AI matcher built + working
- ✅ User accounts — sign in with Google or email; Premium is tied to the account
- ✅ Payments live (Stripe Checkout, $9.99 unlock + $29 report)
- ✅ Business email **hello@internnest.ai** wired across the site + legal pages
- 🔜 Handoff: move the accounts (Vercel, Supabase, Google Cloud, Stripe, AI key) into your name
