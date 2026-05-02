# Deploying threat-trace to Cloudflare Pages

threat-trace is a fully static SPA. The build produces `dist/index.html` (and a duplicate `dist/threat-trace.html` for direct file:// distribution) — both are self-contained, with all JS and CSS inlined. Cloudflare Pages just needs to serve the `dist/` directory.

API calls go directly from the user's browser to `api.anthropic.com` using the user's BYOK Anthropic key (memory-only, never persisted, never sent to your server). No backend, no proxy, no environment variables required.

## Path A — Git integration (recommended)

This is the lowest-friction setup. Pushes to your default branch auto-deploy.

1. Push the repository to GitHub (or GitLab / BitBucket — Cloudflare supports all three).
2. Sign in to <https://dash.cloudflare.com/>.
3. **Workers & Pages** → **Create** → **Pages** tab → **Connect to Git**.
4. Authorize Cloudflare to access your repo, then select it.
5. **Build settings**:
   - **Framework preset**: None (Vite is auto-detected on some configs; either works).
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: leave empty
   - **Environment variables**: none required
6. Save and Deploy. First build takes ~60–90 seconds.
7. After it's live: **Custom domains** → add your domain (e.g. `threat-trace.steppeintegrations.com`).

Subsequent pushes to the default branch auto-build and auto-deploy. Other branches deploy as preview URLs.

## Path B — Direct upload via wrangler CLI

Use this for ad-hoc deploys without Git integration, or to test before connecting the repo.

```sh
# One-time auth
npm install -g wrangler
npx wrangler login

# Build + deploy
npm run build
npx wrangler pages deploy dist --project-name=threat-trace
```

The first deploy creates the project. Subsequent deploys update it.

## Path C — Manual upload via dashboard

For the very first deploy, before any tooling:

1. `npm run build` locally.
2. Sign in to <https://dash.cloudflare.com/>.
3. **Workers & Pages** → **Create** → **Pages** → **Upload assets** → **Create a new project**.
4. Name it `threat-trace` (or whatever you want — this becomes the `*.pages.dev` subdomain).
5. Drag the entire `dist/` directory onto the upload zone.
6. Deploy.

## What this deployment does NOT do

- **No auth.** Anyone can land on the URL. By design — the user brings their own API key.
- **No analytics by default.** Add Cloudflare Web Analytics if you want hit counts (free, no JS injection required if Cloudflare proxies your DNS).
- **No server.** There's no backend to misconfigure. The only network call is browser → `api.anthropic.com` with the user's key.

## Verifying after deploy

1. Open the deployed URL.
2. Settings (gear icon) → switch backend to **Anthropic API** → paste your own Anthropic key.
3. Click **Run investigation** in the header.
4. Within ~10–15 seconds you should see hints fill in for all 3 streams, then summaries, then a trend, then ranked action items.

If any stage fails, check the browser DevTools console for the actual error from `api.anthropic.com` — typical issues are an invalid key, rate limits on a free tier, or a regional CORS block (rare).

## Optional: caching headers

Vite's single-file build inlines all assets into `index.html`, so the only file that matters for caching is `index.html` itself — and you want fresh HTML on every visit so updates ship immediately.

Cloudflare Pages defaults are already correct for this case. If you want to tighten things, add a `public/_headers` file (Vite copies `public/` contents into `dist/` as-is):

```
/*
  Cache-Control: public, max-age=0, must-revalidate
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

Skip CSP headers — the single-file build needs `unsafe-inline` for JS and CSS, which negates the protection. Defense-in-depth comes from the architecture (no auth, no persistence, BYOK), not from CSP.

## Updating the deployed version

If using Git integration: `git push` to your default branch.

If using wrangler: `npm run build && npx wrangler pages deploy dist --project-name=threat-trace`.

## Custom domain

Once deployed at `threat-trace.pages.dev`:

1. **Custom domains** tab → **Set up a custom domain**.
2. Enter your domain (e.g. `threat-trace.steppeintegrations.com`).
3. Cloudflare gives you a CNAME target. Add it at your DNS provider (or, if your DNS is on Cloudflare already, it's auto-configured).
4. SSL provisioning takes a few minutes. After that the custom domain is live.

## Cost

Cloudflare Pages free tier covers:
- 500 builds / month
- Unlimited bandwidth and requests
- 100 custom domains per project

For a hosted threat-trace reference deployment with low-to-moderate traffic, this stays free indefinitely.
