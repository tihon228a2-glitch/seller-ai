# SELLER AI — MVP

A small marketplace product-card drafting tool for Wildberries and Ozon.

## Run locally
1. Install Node.js 20 or newer.
2. In this folder run `npm install`.
3. Run `npm start`.
4. Open http://localhost:3000

## AI integration (optional)
Copy `.env.example` to `.env`, fill in `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL`, then load the variables into your hosting environment. Never commit `.env` or expose API keys in browser code.

Without credentials, the app uses a local demo template. This is not real AI generation.

## MVP limitations
- No registration or authentication.
- History is stored only in this browser using localStorage.
- No payments or subscriptions.
- No Telegram bot.
- Demo generation may require editing and verification before publishing a listing.
- Before real customers: add authentication, database, backups, rate limits, security controls, privacy/legal pages, and payment integration.
