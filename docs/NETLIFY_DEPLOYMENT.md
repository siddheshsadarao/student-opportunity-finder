# Deploying the frontend to Netlify

How to host the React app on Netlify while the rest of the project runs on your
VPS.

---

## 1. What goes where, and why

Netlify hosts **static files** and short-lived serverless functions. It has no
persistent server and no persistent disk, so four parts of this project cannot
live there:

| Part | Needs | Netlify |
| --- | --- | --- |
| React frontend | Static files after `npm run build` | ✅ **Yes** |
| Express API | A Node process running continuously | ❌ No |
| FastAPI ML service | A Python process holding scikit-learn in memory | ❌ No |
| PostgreSQL | A persistent database | ❌ No |
| Ingestion job | A cron job running for minutes every 6 hours | ❌ No |

So the split is:

```
   Browser
      │
      ▼
 ┌─────────────────────────────┐
 │  NETLIFY                    │   React build, global CDN, HTTPS,
 │  your-site.netlify.app      │   auto-deploy on every git push
 └──────────────┬──────────────┘
                │  /api/*  proxied server-side
                ▼
 ┌─────────────────────────────┐
 │  YOUR VPS                   │   Express API  (:5000)
 │  nginx → API                │   FastAPI ML   (:8000)
 │                             │   PostgreSQL   (:5432)
 │                             │   cron: importer every 6h
 └─────────────────────────────┘
```

This is a normal, sensible architecture — not a compromise. Netlify gives the
frontend a CDN, free HTTPS and a deploy on every push; the VPS does the work
that needs a real server.

**Set up the VPS first** using [`DEPLOYMENT.md`](DEPLOYMENT.md), skipping the
nginx block that serves `frontend/dist`. Come back here once
`https://yourdomain.com/api/health` responds.

---

## 2. How the frontend finds the API

`frontend/src/services/api.js` reads:

```js
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
```

That gives two deployment modes.

### Mode A — Netlify proxy (recommended)

Leave `VITE_API_BASE_URL` unset. The app calls `/api/...` on its own origin,
and the Netlify Function forwards those requests to your VPS **server-side**.
Its destination comes from the private `API_ORIGIN` Netlify environment
variable, not from the repository.

The function lives at `frontend/netlify/functions/api.js`; do not hard-code a
server address in that file.

Two real advantages:

- **No CORS at all.** The browser only ever talks to the Netlify domain.
- **No mixed-content block.** A browser refuses to let an HTTPS page call a
  plain HTTP API. Netlify's proxy runs on its servers, not in the browser, so
  this works even before you have HTTPS on the VPS.

The cost is one extra network hop (browser → Netlify → VPS), which is a few
tens of milliseconds.

### Mode B — direct

Set `VITE_API_BASE_URL=https://api.yourdomain.com/api` in the Netlify UI. The
browser calls your VPS directly. Slightly faster, but then:

- the VPS **must** have valid HTTPS, otherwise the browser blocks every call;
- the backend's CORS whitelist must include your Netlify domain (section 5).

**Use Mode A unless you have a reason not to.**

---

## 3. Deploy

### 3.1 Configure the API origin privately

The repository deliberately contains no VPS address. In Netlify, open
**Site configuration → Environment variables** and add:

| Key | Value |
| --- | --- |
| `API_ORIGIN` | Your private deployment value, such as `https://api.example.com` |

For a non-standard HTTP port, the value can include the port. The variable is
read only by the server-side Netlify Function and is not included in the
browser bundle or committed to GitHub. Trigger a new deploy after changing it.

### 3.2 Connect the repository

1. Sign in at [app.netlify.com](https://app.netlify.com) with GitHub.
2. **Add new site → Import an existing project → GitHub**, choose the repo.
3. Set the build settings — **the base directory matters**, because the React
   app is in a subfolder:

   | Field | Value |
   | --- | --- |
   | Base directory | `frontend` |
   | Build command | `npm run build` |
   | Publish directory | `frontend/dist` |

   Netlify reads the rest from `netlify.toml`.

4. **Deploy site.** The first build takes about two minutes.

You get a URL like `https://random-name-123.netlify.app`. Rename it under
**Site configuration → Change site name**.

### 3.3 Alternative: deploy from your laptop

Useful for a quick demo without connecting GitHub:

```bash
npm install -g netlify-cli
cd frontend
npm run build
netlify deploy --prod --dir=dist
```

You still need `netlify.toml`, `netlify/functions/api.js` and
`public/_redirects` in the frontend folder for the function and SPA fallback.

---

## 4. Point the backend at the new frontend

On the VPS, edit `backend/.env`:

```bash
CLIENT_URL=https://your-site.netlify.app
```

```bash
systemctl restart sof-api
```

`CLIENT_URL` is only used for the CORS whitelist, so in Mode A this is mostly
belt-and-braces. Set it anyway — it keeps the two modes interchangeable.

---

## 5. Only for Mode B — CORS

If you chose the direct mode, the backend must accept requests from the Netlify
origin. In `backend/.env`:

```bash
EXTRA_ORIGINS=https://your-site.netlify.app,https://www.yourdomain.com
NETLIFY_SITE_NAME=your-site
```

`NETLIFY_SITE_NAME` is the site name only — no `https://`, no `.netlify.app`.
It lets Netlify's branch and pull-request preview URLs through, which otherwise
could not be listed because each one is different:

```
https://deploy-preview-42--your-site.netlify.app
https://feature-login--your-site.netlify.app
```

The match is anchored, so a lookalike domain such as
`https://your-site.netlify.app.evil.com` is still rejected.

Restart afterwards:

```bash
systemctl restart sof-api
```

A blocked origin now returns a clear **403** with the reason, rather than a
confusing 500.

---

## 6. Check it worked

Open the Netlify URL and confirm:

- [ ] The landing page loads with live statistics (not zeros — that means the
      API is reachable)
- [ ] Log in as `demo.student@example.com` / `Student@123`
- [ ] The dashboard shows recommendations with match percentages
- [ ] Open an opportunity → **"Why this matches you"** appears with the signal
      breakdown (this proves the FastAPI service is reachable from the API)
- [ ] Navigate to `/discover`, then **press F5**. It must still work — this is
      the SPA fallback doing its job
- [ ] Open DevTools → Network. Requests to `/api/...` should return **200**

From the command line:

```bash
# Through the Netlify proxy — should return the same as the VPS
curl -s https://your-site.netlify.app/api/health

# Straight from the VPS
curl -s https://api.yourdomain.com/api/health
```

---

## 7. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Landing page loads, all statistics show 0 | The proxy target is wrong. Check `API_ORIGIN` in Netlify and confirm that `curl https://your-site.netlify.app/api/health` works |
| **404 on refresh** at `/dashboard` | The SPA fallback rule is missing or the API rule is after it. The `/api/*` rule must come **first** in `netlify.toml` |
| `Mixed Content ... was loaded over HTTPS but requested an insecure resource` | Mode B with an HTTP backend. Either switch to Mode A (proxy) or put HTTPS on the VPS with certbot |
| CORS error in the console | Mode B without the whitelist. Set `EXTRA_ORIGINS` and `NETLIFY_SITE_NAME` in `backend/.env`, then restart |
| `Origin ... is not allowed to call this API` (403) | Same as above — the message names the exact origin to add |
| Build fails: "vite: not found" | Base directory is not set to `frontend`, so Netlify ran `npm install` in the repo root |
| Build succeeds, page is blank | Open DevTools → Console. Usually the publish directory is wrong; it must be `frontend/dist` |
| Old version keeps loading after deploy | A cached `index.html`. `netlify.toml` already sets `max-age=0` on it — hard-refresh once (Ctrl+Shift+R) |
| Login works, then everything says 401 | `JWT_SECRET` changed on the VPS. All old tokens are void; log in again |

---

## 8. What you get from this setup

| | |
| --- | --- |
| **Auto-deploy** | Every push to `main` rebuilds and publishes in ~2 minutes |
| **Preview URLs** | Every pull request gets its own URL to share with your team or guide |
| **Rollback** | One click to restore any previous deploy |
| **Free HTTPS** | Netlify issues and renews the certificate |
| **Global CDN** | The app loads fast from anywhere |
| **Cost** | ₹0 for the frontend; only the VPS costs money |

---

## 9. A note for the viva

If asked *"why not host everything on Netlify?"*, the honest and correct answer
is:

> Netlify is a static host with serverless functions. Our project needs a
> PostgreSQL database, a long-running Python process that keeps the TF-IDF
> model in memory, and a cron job that imports opportunities every six hours.
> None of those can run on Netlify. So we host the React build there, because
> static files are exactly what it is good at, and run the API, the ML service,
> the database and the scheduler on a VPS. The frontend reaches the API through
> a Netlify proxy, which also removes the CORS problem.

That answer demonstrates you understand the difference between static hosting
and application hosting — which is the point of the question.
