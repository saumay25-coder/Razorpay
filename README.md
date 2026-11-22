# Tarang Cloud · Portfolio Intelligence

A single-file, vanilla JavaScript portfolio planning prototype for Case 3 of the Razorpay GTM Campus Build-a-thon.

## Run locally

Requires Node.js 18 or later. No package installation is needed.

~~~powershell
node dev-server.cjs
~~~

Open [the local preview](http://127.0.0.1:4174/). The preview serves the same frontend and API handler used by Vercel. Live AI requires GEMINI_API_KEY in the server environment. Otherwise, use the explicitly labelled offline simulator. Never enter an API key in the browser.

## Use the product

- **Portfolio:** The two emergency cases stay separate from the ranked queue. Choose one of four weekly scenarios, inspect "What Changed?", compare deal-value sorting, or open Priority Scoring Settings. Task details contain the complete six-factor formula.
- **Capacity:** Edit each assignment in quarter-hour increments. Engineer capacity is 8h and Demo Specialist capacity is 1h. Overbooking names the conflicting assignments. Zero hours leaves work visibly unallocated; it does not resolve or remove the task.
- **AI Triage:** Use a separate sample account or paste your own message. Live Gemini classification is validated before JavaScript computes priority and capacity. Review is mandatory before adding a task. Identical messages cannot be added twice.
- **Human Approval:** Replace all placeholders and complete the draft-specific checklist. Editing resets approval. Copying is available after verification and does not send a message.
- **Export Plan:** Downloads the ordered tasks, source labels, factor values, normalized weights, formulas and separate resource budgets as JSON.

All tabs and information controls support keyboard access. Use arrow keys between navigation tabs and Escape to dismiss information popovers.

## Preserved business model

The original case contains 12 accounts: six active client triggers, six quiet accounts, plus one internal task. Active annual contract value is ₹3.80 Cr; potential expansion is a separate ₹60L. These values do not imply that all revenue is threatened or protected.

The four scenario presets and all original 1–5 factor ratings remain intact. Emergencies stay pinned even in deal-value comparison. Weights normalize to 100% using full precision; all-zero input uses an equal split.

Default allocations remain Annam Foods 4h, Recurring Order Bug 2.5h and Orbit Electronics 1.5h for the Engineer, plus Wednesday Demo 1h for the Demo Specialist. Kabir uses Tier-2 Support and consumes zero Engineer hours.

## Validation

~~~powershell
node --test tests/triage.test.cjs
~~~

Verified on 22 November 2026:

- 24 automated tests passed, covering baseline totals, scenario ordering, normalized math, emergency separation, editable capacity, human approval, duplicate prevention, export, untrusted text and API failures.
- Browser checks passed at 1440px desktop, 1280px laptop and 375px mobile widths. Portfolio, AI Triage, expanded formula and Human Approval views had no horizontal overflow on mobile.
- Verified scenario changes, repeated weight adjustments, auto-balancing, independent capacity edits, visible unallocated work, API-error fallback, both kinds of overbooking, duplicate prevention, draft copying and re-locking after edits.
- Downloaded and parsed the actual browser export: weights totaled 100%, the added demo correctly showed 2/1h, and externalActionsExecuted remained false.
- The existing hosted page and POST /api/triage both returned HTTP 200. The synthetic public-complaint probe returned the PR emergency classification from Gemini.
- Saved desktop and mobile screenshots in artifacts/.

Provider calls in the automated tests are mocked. The local backend failure path was exercised separately; the successful live Gemini check used the existing Vercel deployment.

## Deployment status

The redesigned code is local and has **not** been deployed. The existing [Vercel deployment](https://razorpay-seven-alpha.vercel.app/) still serves the previous interface. No authenticated GitHub/Vercel deployment connection was available in this workspace.

To publish, update the connected saumay25-coder/Razorpay repository with index.html, api/triage.js and vercel.json, then use its existing Vercel deployment workflow. Keep GEMINI_API_KEY only in Vercel server environment variables.

## Files

- index.html — responsive interface, case data, deterministic scoring and approval controls.
- api/triage.js — validated Gemini 2.5 Flash classification endpoint.
- vercel.json — existing API routing and 30-second function limit.
- dev-server.cjs — dependency-free local preview with the actual API handler.
- tests/triage.test.cjs — business-rule and API regression tests.
- artifacts/ — desktop and mobile preview screenshots.

## Prototype limits

No inbox, CRM, LinkedIn, ticketing or booking service is connected. Recommendations are proposals, not executed actions. Quiet-account reviews are a workflow plan, not live monitoring. Added items, allocations and edited drafts reset when the page reloads; export the plan before closing it.

New technical investigation and demo estimates start at 2h and 1h respectively and remain editable. They are not completion promises. New account values come from user input. Existing account messages do not add the same contract value twice. Explicit expansion amounts are recorded only when supplied.
