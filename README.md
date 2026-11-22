# Tarang Cloud · Monday Morning AI Triage Agent (Vercel Ready)

Deploy this folder to **Vercel** for free in ~5 minutes to get a permanent public `https://...vercel.app` URL with a **real live Gemini 2.5 Flash AI backend** (your API key stays hidden on the server so Razorpay judges can test it in one click).

## Folder Contents
- `index.html` — The self-contained frontend UI (automatically calls `/api/triage` when hosted on Vercel, and gracefully falls back to the built-in simulator if run offline).
- `api/triage.js` — Vercel Serverless Function that securely reads `GEMINI_API_KEY` from Vercel Environment Variables and calls `gemini-2.5-flash` with strict JSON output.
- `vercel.json` — Clean routing config for Vercel.

## Step-by-Step Free Deployment (5 Minutes)
1. **Get a free Gemini API key:** Go to [Google AI Studio](https://aistudio.google.com/apikey), sign in with Google, and click **Create API Key**. Copy it.
2. **Upload this folder to GitHub:** Create a free repository on GitHub (e.g., `tarang-cloud-triage-agent`), unzip this archive, and upload `index.html`, `vercel.json`, `README.md`, and the `api/` folder (`api/triage.js`).
3. **Import into Vercel:** Sign in to [Vercel](https://vercel.com) with GitHub → click **Add New → Project** → select your `tarang-cloud-triage-agent` repository.
4. **Add your API key securely:** Before clicking Deploy, expand **Environment Variables**, add:
   - **Key:** `GEMINI_API_KEY`
   - **Value:** *(paste your Google AI Studio API key)*
5. **Click Deploy:** In ~30 seconds, Vercel gives you a live public link like `https://tarang-cloud-triage-agent.vercel.app`. Put that URL directly in your Razorpay Build-a-thon pitch deck!

## Verifying the Live AI Backend
Open your deployed Vercel link → click **Step 2 · Live AI Agent** → leave the optional API key box blank → click **Run 5-Step AI Triage Agent**. You will see `LIVE Vercel Backend → Gemini 2.5 Flash (HTTP 200 OK)` in the execution trace!
