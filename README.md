# Meridian — AI Email Agent (Browser Extension)

A browser extension version of the Meridian AI email agent. Unlike the web-app version this was
built from, this has **no backend server at all** — no Supabase, no Node.js hosting, no OAuth
consent screens. Everything runs inside your own browser, on your own machine.

## Why this exists, and how it's different from the web-app version

The web-app version is a real multi-tenant SaaS: many people can sign up, each gets an isolated
workspace, data lives in a hosted Postgres database, Gmail access goes through Google's OAuth
flow with encrypted refresh tokens stored server-side. That's the right architecture for a
product meant to serve many customers.

This extension is architected completely differently, on purpose: **one person, one browser, no
server.** Every person who installs it runs their own private copy. This trades away multi-tenant
SaaS capability in exchange for removing an entire category of setup and failure points:

| | Web app | This extension |
|---|---|---|
| Database | Supabase (can pause, needs service-role key) | `chrome.storage.local` — nothing to pause, nothing hosted |
| Gmail access | Google OAuth (consent screen, test users, redirect URIs, encrypted token storage) | Reads the Gmail page you're already logged into — no OAuth at all |
| Hosting | Next.js on Vercel | None — runs entirely in your browser |
| AI keys | Server env vars | Entered once in the extension's own settings, stored locally |

## The real tradeoff — read this honestly before relying on it

**Gmail's page structure (HTML/CSS classes) is not a published, stable API.** The content script
(`src/content/content.js`) reads specific CSS class names Gmail currently uses (`h2.hP` for
subject, `div.a3s` for message bodies, `span.gD` for sender). Google can and does change these
without notice. If Meridian suddenly stops finding your open email correctly, this is almost
certainly why — the selectors in that one file need updating to match Gmail's current markup.
This is a real, ongoing maintenance cost that the OAuth-based web app doesn't have, in exchange
for not needing any Google Cloud setup at all.

**This extension can never send email on its own — by design, not just by default.** There is no
code anywhere in this project that submits Gmail's compose form. Every mode (Observe, Draft,
Autonomous) only ever gets as far as *inserting text into Gmail's own reply box*. You always
click Gmail's own Send button yourself. This isn't a safety setting you could accidentally
misconfigure — the send action simply isn't implemented, anywhere.

**"Autonomous" scanning of your whole inbox in the background is not implemented.** The floating
"M" button analyzes whichever single email you currently have open. There is no background
polling loop constantly scanning your inbox — Manifest V3 service workers are not designed to
run long-lived background loops, and building a reliable one is a substantially bigger and more
fragile undertaking than this first version attempts. If you want that specific capability, the
web app's Pub/Sub-based real-time path or manual sync button are the better fit — see that
project's README.

## Setup

1. Get a free Gemini API key: **aistudio.google.com/apikey**. (OpenRouter is optional, same as
   the web app — see that project's docs for the same honest caveats about its rotating free tier.)
2. Open Chrome (or any Chromium-based browser) → `chrome://extensions` → enable **Developer mode**
   (top right) → **Load unpacked** → select this folder.
3. The extension's settings page opens automatically on install. Add your Gemini key under
   **AI Setup**, click Save.
4. Go to **Company**, enter your website, optionally add instructions, click **Start research**.
   You'll be asked to grant permission for that specific website — this is intentional and scoped
   to only that domain, not "all websites."
5. Review the extracted facts, accept or reject them.
6. Go to **Communication Style**, set your preferences.
7. Go to **Mode**, pick **Draft** to start (recommended).
8. Open Gmail in a tab, open any email, click the round "M" button in the bottom-right corner.

## What "production grade" honestly means for a project like this

This is real, working code — not a mockup. Every button does something real: real fetch calls to
your company website, real AI calls, real DOM reads/writes inside Gmail, real local storage. It
has not been submitted to or reviewed by the Chrome Web Store (that's a separate process you'd
need to do yourself if you want to distribute this beyond your own "Load unpacked" install, and
Google does review extensions requesting broad content-script access to Gmail). And exactly like
the web app before it, this has not been executed end-to-end by me in a live browser — I have no
way to launch a real Chrome instance from this environment. The same rule applies as before: load
it unpacked, open the DevTools console (both the extension's background service worker console,
inspectable from `chrome://extensions`, and Gmail's own page console), and tell me exactly what
errors show up if anything doesn't work. That loop is what actually gets code to genuinely zero
errors — not a claim that it already is.
