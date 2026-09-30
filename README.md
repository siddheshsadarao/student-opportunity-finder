# Student Opportunity Finder

## Live application

**[Open Student Opportunity Finder](https://studentopportunityfinder.netlify.app/)**

A full-stack web platform that centralises student opportunities — internships,
scholarships, hackathons, competitions, courses, workshops, fellowships and career
programmes — and recommends the most relevant ones to each student using a
content-based machine learning engine.

Opportunities are **imported automatically** every few hours from Devpost, Unstop,
Devfolio, coding platforms and company job boards, so the catalogue stays current
without anyone typing listings by hand.

> **B.Tech Data Science semester project.**
> All demo listings in the database are fictional and carry a visible **“Sample”**
> badge. See [Demo data and academic honesty](#demo-data-and-academic-honesty).

---

## Table of contents

1. [Problem statement](#problem-statement)
2. [Objectives](#objectives)
3. [Features](#features)
4. [Technology stack](#technology-stack)
5. [System architecture](#system-architecture)
6. [Folder structure](#folder-structure)
7. [Installation](#installation)
8. [Environment variables](#environment-variables)
9. [Database setup](#database-setup)
10. [Running the project](#running-the-project)
11. [Demo accounts](#demo-accounts)
12. [Where the opportunities come from](#where-the-opportunities-come-from)
13. [How the recommendation algorithm works](#how-the-recommendation-algorithm-works)
14. [API endpoints](#api-endpoints)
15. [Security](#security)
16. [Deployment](#deployment)
17. [Screenshots](#screenshots)
18. [Demo data and academic honesty](#demo-data-and-academic-honesty)
19. [Team members](#team-members)
20. [Future scope](#future-scope)

---

## Problem statement

Students miss valuable opportunities because the information is scattered.
Internships are posted on LinkedIn and company career pages, scholarships live on
government and trust portals, hackathons are announced on community sites, and
many opportunities only circulate through college WhatsApp or Telegram groups.

There is no single place where a student can see everything, and — more
importantly — nothing filters the flood down to what a particular student is
actually eligible for and interested in. A second-year Mechanical student and a
final-year Data Science student see exactly the same list everywhere.

## Objectives

1. Centralise opportunities of every type into one searchable catalogue.
2. Recommend opportunities to each student based on their skills, interests,
   education and career goals — and **explain** why each one was recommended.
3. Let students save opportunities, track their applications through a pipeline
   and never miss a deadline.
4. Give administrators a panel to publish and manage opportunities and to see
   how the platform is being used.
5. Keep the architecture simple enough to explain in a viva, while still being a
   genuine three-tier application with a separate ML service.

---

## Features

### Student

| Area | What it does |
| --- | --- |
| Registration & login | JWT authentication, bcrypt password hashing, password rules enforced on both client and server |
| Onboarding | 7-step wizard: basic info, education, skills, interests, opportunity types, work preferences, career goal |
| Dashboard | Greeting, 4 statistic cards, top recommendations with match scores, upcoming deadlines, profile strength meter |
| Recommended | Full personalised feed, each card showing a match percentage and the reasons behind it |
| Discover | Search with filters (category, skills, location, work mode, deadline, organisation) and 4 sort orders; filters are stored in the URL so a view can be shared |
| Category pages | A dedicated page and icon per category |
| Opportunity details | Full description, eligibility, benefits, skills, stipend, source, plus a **“Why this matches you”** panel with a score breakdown |
| Saved | Bookmark opportunities, mark as applied, remove |
| Applications | Kanban tracker with drag-and-drop across 5 statuses |
| Calendar | Month grid of deadlines colour-coded by category, plus “this week” and “this month” lists |
| Notifications | Welcome messages, deadline reminders (auto-generated 3 days out) and new-opportunity alerts for preferred categories |
| Profile | Edit everything the engine uses; profile strength percentage with concrete suggestions |
| Settings | Change password, sign out |

### Admin

| Area | What it does |
| --- | --- |
| Dashboard | Total/active opportunities, registered students, applications, live recommendation-service health check |
| Opportunities | Full CRUD with search and status filters (active / expired / hidden) |
| Add / edit form | Every field, with a searchable skills tag input and a “mark as sample data” toggle |
| Students | Searchable list with a detail modal showing each student’s profile and activity |
| Categories | Create, edit and delete categories with icon and colour pickers; deletion is refused while opportunities still use the category |
| Analytics | Recharts visualisations: opportunities by category, student growth, application pipeline, most viewed and most saved |

### Interface details

Skeleton loaders, empty states, toast notifications, modals, confirmation dialogs,
search suggestions, pagination, form validation, password visibility toggles, a
responsive sidebar and a mobile navbar. The layout works on desktop, tablet and
mobile.

---

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite, Tailwind CSS 3, React Router 6, Axios, Lucide React, Recharts |
| Backend | Node.js, Express 4, JWT (`jsonwebtoken`), `bcryptjs`, `express-validator`, Helmet, CORS, `express-rate-limit` |
| Database | PostgreSQL 17 (`pg` driver, parameterised queries) |
| Recommendation service | Python 3.11, FastAPI, scikit-learn (TF-IDF + cosine similarity), psycopg2, Pydantic |
| Ingestion service | Python 3.11, requests, psycopg2 — scheduled by cron |

> **Note on bcrypt:** the project uses `bcryptjs`, the pure-JavaScript
> implementation of the same bcrypt algorithm. It needs no native compiler
> toolchain, which makes the project far easier to set up on a lab machine.

---

## System architecture

The application is a **three-tier architecture with a separate ML microservice**:

```
┌────────────────────────────────────────────────────────────┐
│  PRESENTATION TIER                                              │
│  React + Vite  (http://localhost:5173)                          │
└─────────────────────────┬────────────────────────────────────┘
                           │  REST / JSON  (JWT in Authorization header)
                           ▼
┌────────────────────────────────────────────────────────────┐
│  APPLICATION TIER   Node.js + Express  (:5000)                  │
│  routes → middleware (auth, validation) → controllers →          │
│  services → database                                            │
└───────────┬─────────────────────────────────┬───────────────────┘
            │                                 │
            │ SQL (parameterised)             │ HTTP  POST /recommend
            ▼                                 ▼
┌─────────────────────────┐     ┌───────────────────────────────┐
│  DATA TIER                │     │  ML SERVICE                   │
│  PostgreSQL 17            │◀────│  Python + FastAPI  (:8000)    │
│  16 tables, FKs, indexes  │ SQL │  TF-IDF + cosine + 8 signals  │
└─────────────▲───────────┘     └───────────────────────────────┘
              │ writes
┌────────────┴─────────────────────────────────────────────────┐
│  INGESTION SERVICE   Python, scheduled by cron every 6 hours    │
│  Devpost · Unstop · Devfolio · HackerEarth · Greenhouse boards    │
└────────────────────────────────────────────────────────────┘
```

**Why the ML part is a separate service**

- Python has the mature machine-learning libraries; Node has the mature web
  ecosystem. Each tier uses the better tool.
- The model can be retrained or replaced without touching the Express code.
- It can be demonstrated on its own through FastAPI’s interactive docs at
  `http://127.0.0.1:8000/docs` — very useful in a viva.

**Graceful degradation.** If the Python service is not running, the backend falls
back to a simpler rule-based scorer written in JavaScript, so the platform keeps
working. Every response says which engine produced the scores (`"engine": "ml"`
or `"engine": "fallback"`), and the admin dashboard shows a live health
indicator.

---

## Folder structure

```
student-opportunity-finder/
├── frontend/                      React + Vite application
│   ├── public/
│   └── src/
│       ├── components/            Reusable UI
│       │   ├── layout/            Sidebar, Topbar, StudentLayout, AdminLayout
│       │   ├── ui/                Modal, ConfirmDialog, Skeletons, Pagination…
│       │   ├── OpportunityCard.jsx
│       │   └── TagInput.jsx
│       ├── context/               AuthContext, ToastContext
│       ├── hooks/                 useSaveToggle, useDebounce
│       ├── pages/
│       │   ├── auth/              Login, Register, AdminLogin, ForgotPassword
│       │   ├── admin/             7 admin pages
│       │   └── …                  Dashboard, Discover, Recommended, Saved…
│       ├── services/api.js        Single Axios layer for the whole app
│       └── utils/                 constants.js, format.js
│
├── backend/                       Node.js + Express REST API
│   ├── scripts/                   migrate.js, seed.js, seedData.js
│   └── src/
│       ├── config/                env.js, db.js (connection pool)
│       ├── controllers/           auth, profile, opportunity, saved,
│       │                          application, recommendation, notification,
│       │                          admin, meta
│       ├── middleware/            auth.js, validate.js, errorHandler.js
│       ├── routes/                one router per resource
│       ├── services/              profileService, recommendationService,
│       │                          taxonomyService
│       ├── utils/                 ApiError, asyncHandler, jwt, slugify
│       ├── app.js                 Express app (middleware + routes)
│       └── server.js              Entry point
│
├── recommendation-service/        Python + FastAPI ML service
│   ├── app/
│   │   ├── engine/
│   │   │   ├── recommender.py     TF-IDF + cosine similarity + scoring
│   │   │   └── text_builder.py    Feature engineering (text representation)
│   │   ├── config.py              Settings and scoring weights
│   │   ├── database.py            Read-only PostgreSQL access
│   │   ├── models.py              Pydantic request/response schemas
│   │   └── main.py                FastAPI app and endpoints
│   └── requirements.txt
│
├── ingestion/                      Python service that imports real opportunities
│   ├── adapters/                   One file per source — the ONLY place
│   │   ├── devpost.py              source-specific code is allowed to live
│   │   ├── unstop.py
│   │   ├── devfolio.py
│   │   ├── hackerearth.py
│   │   └── greenhouse.py
│   ├── common.py                   Normalised shape, polite HTTP, cleaning,
│   │                               skill detection, date parsing
│   ├── store.py                    Upsert, deduplication, expiry, run log
│   ├── config.py                   Sources, rate limits, company boards
│   └── run.py                      CLI entry point (scheduled by cron)
│
├── database/
│   ├── schema.sql                 Tables, constraints, indexes, triggers
│   └── migration_002_ingestion.sql  Ingestion columns, source registry, run log
│
└── docs/
    ├── PROJECT_OVERVIEW.md
    ├── DATABASE_DESIGN.md
    ├── API_DOCUMENTATION.md
    ├── RECOMMENDATION_ENGINE.md
    ├── DATA_INGESTION.md           Which sites, why, and the robots.txt evidence
    └── DEPLOYMENT.md               VPS setup: nginx, systemd, HTTPS, cron
```

---

## Installation

### Prerequisites

| Software | Version used | Notes |
| --- | --- | --- |
| Node.js | 20 or newer | `node -v` |
| Python | 3.11 | 3.11 has the widest scikit-learn wheel support |
| PostgreSQL | 15 or newer | Remember the `postgres` password you set |

On Windows, PostgreSQL can be installed with:

```bash
winget install PostgreSQL.PostgreSQL.17
```

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env     # then edit .env with your PostgreSQL password
```

### 2. Frontend

```bash
cd frontend
npm install
```

### 3. Ingestion service (imports real opportunities)

```bash
cd ingestion
py -3.11 -m venv venv
venv\Scripts\activate           # Windows
# source venv/bin/activate      # macOS / Linux
pip install -r requirements.txt
cp .env.example .env            # same database credentials as the backend
```

### 4. Recommendation service

```bash
cd recommendation-service
py -3.11 -m venv venv
venv\Scripts\activate           # Windows
# source venv/bin/activate      # macOS / Linux
pip install -r requirements.txt
cp .env.example .env            # same database credentials as the backend
```

---

## Environment variables

**`backend/.env`**

| Variable | Purpose | Example |
| --- | --- | --- |
| `PORT` | API port | `5000` |
| `NODE_ENV` | `development` or `production` | `development` |
| `DB_HOST` / `DB_PORT` | PostgreSQL host and port | `localhost` / `5432` |
| `DB_NAME` | Database name | `student_opportunity_finder` |
| `DB_USER` / `DB_PASSWORD` | PostgreSQL credentials | `postgres` / *your password* |
| `JWT_SECRET` | Secret used to sign tokens — use a long random string | `openssl rand -hex 32` |
| `JWT_EXPIRES_IN` | Token lifetime | `7d` |
| `CLIENT_URL` | Frontend origin, used for the CORS whitelist | `http://localhost:5173` |
| `EXTRA_ORIGINS` | Extra allowed origins, comma separated (only needed when the frontend calls the API host directly) | `https://my-site.netlify.app` |
| `NETLIFY_SITE_NAME` | Netlify site name only — also allows its deploy-preview URLs | `student-opportunity-finder` |
| `RECOMMENDATION_SERVICE_URL` | FastAPI base URL | `http://127.0.0.1:8000` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin account created by the seed script | `admin@sof.com` / `Admin@123` |

**`recommendation-service/.env`**

| Variable | Purpose |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Same database as the backend |
| `HOST`, `PORT` | Where the service listens (`127.0.0.1`, `8000`) |
| `ALLOWED_ORIGINS` | Comma-separated CORS whitelist |

**`frontend/.env`** (optional)

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Full API URL, e.g. `https://api.yourdomain.com/api`. Leave unset to use `/api` on the same origin — correct for local development and for Netlify with the proxy |

> `.env` files are listed in `.gitignore` and must never be committed. No secret
> is hard-coded anywhere in the source. Anything prefixed `VITE_` is baked into
> the JavaScript bundle at build time and is visible to anyone who opens the
> site, so never put a secret there.

---

## Database setup

```bash
cd backend
npm run db:migrate     # creates the database (if needed) and applies schema.sql
npm run db:seed        # inserts categories, skills, interests, demo data, accounts
```

Then apply the ingestion migration and pull in real opportunities:

```bash
psql -U postgres -d student_opportunity_finder -f ../database/migration_002_ingestion.sql
psql -U postgres -d student_opportunity_finder -f ../database/migration_003_mlh.sql
psql -U postgres -d student_opportunity_finder -f ../database/migration_004_sources.sql
psql -U postgres -d student_opportunity_finder -f ../database/migration_005_source_expansion.sql
cd .. && ./ingestion/venv/Scripts/python.exe -m ingestion.run
```

`npm run db:reset` runs both in sequence.

This creates 8 categories, 46 skills, 15 interests, **28 demo opportunities**, one
admin account and two demo student accounts with complete profiles.

> `schema.sql` begins with `DROP TABLE` statements so it can be re-applied during
> development. Running `db:migrate` **deletes all existing data**.

---

## Running the project

Open three terminals:

```bash
# Terminal 1 — API
cd backend
npm run dev
```

```bash
# Terminal 2 — Recommendation service
cd recommendation-service
venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

```bash
# Terminal 3 — Frontend
cd frontend
npm run dev
```

| Service | URL |
| --- | --- |
| Web application | http://localhost:5173 |
| REST API | http://localhost:5000/api |
| API health check | http://localhost:5000/api/health |
| Recommendation service docs | http://127.0.0.1:8000/docs |

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@sof.com` | `Admin@123` |
| Student | `demo.student@example.com` | `Student@123` |
| Student | `demo.web@example.com` | `Student@123` |

The two students have different profiles on purpose — log in as each and compare
the Recommended page to see the engine produce genuinely different rankings.

> Change the admin password from **Admin → Settings** before showing the project
> to anyone outside your team.

---

## Where the opportunities come from

The catalogue is filled automatically. A scheduled job pulls from five public
APIs, converts every source's format into one common shape, removes duplicates
and writes the results to the database.

| Source | What it gives | Why it is allowed |
| --- | --- | --- |
| **Devpost** | Global hackathons (~14,000 listed) | `robots.txt`: `User-agent: * / Disallow:` — allow all |
| **Unstop** | Indian hackathons, competitions, internships, scholarships | `robots.txt` **explicitly** contains `Allow: /api/public/*` |
| **Devfolio** | Indian college hackathons | `robots.txt`: `Disallow:` — allow all |
| **HackerEarth** | Hackathons and hiring challenges | `robots.txt`: `Allow: /` |
| **Greenhouse** | Real internships from company job boards | Official public API, published for aggregators |

**We deliberately do not scrape LinkedIn, Indeed, Internshala, foundit,
Wellfound, RippleMatch or Simplify.** Their `robots.txt` or terms forbid it, and
several actively block automated requests (Indeed and foundit returned HTTP 403
during testing). The evidence for every decision is recorded in
[`docs/DATA_INGESTION.md`](docs/DATA_INGESTION.md).

For internships the better route is not scraping job boards at all: companies
publish their openings on an **Applicant Tracking System** whose public API
exists precisely so aggregators can read it.

```bash
# See what would be imported, without writing anything
./ingestion/venv/Scripts/python.exe -m ingestion.run --dry-run

# Import for real
./ingestion/venv/Scripts/python.exe -m ingestion.run
```

Running it twice is safe: a unique index on `(source, source_id)` turns the
second run into updates rather than duplicates (verified: `created=0
updated=180`). **Admin → Data Sources** shows every run, lets you disable a
source, and holds the review queue.

---

## How the recommendation algorithm works

The engine is **content-based**: it describes the student as text, describes every
opportunity as text, and recommends the opportunities whose text is most similar.

Content-based filtering was chosen over collaborative filtering (“students like
you also applied to…”) because collaborative filtering needs a large history of
user behaviour, which a new platform does not have. This is the **cold-start
problem**. A content-based model works correctly from the very first student.

### Step 1 — Text representation (feature engineering)

Each student and each opportunity becomes one text document. Important fields are
**repeated** so TF-IDF weights them more heavily, and synonyms are expanded so
“AI/ML” still matches “machine learning”.

```
Student      → "python python python sql sql sql machine learning …
                data science artificial intelligence … data scientist
                b.tech data science remote pune internship hackathon"

Opportunity  → "python python python sql sql sql pandas pandas pandas
                data science summer internship … vector analytics
                pune on-site internship"
```

### Step 2 — TF-IDF vectorisation

`TfidfVectorizer` converts each document into a vector of numbers.

- **TF** (term frequency) — how often a word appears in this document.
- **IDF** (inverse document frequency) — rare words score higher than common ones.

So “machine learning” (rare, meaningful) counts far more than “student” (appears
everywhere). Bigrams are enabled, so “machine learning” is indexed as one concept
rather than two unrelated words.

### Step 3 — Cosine similarity

Cosine similarity measures the **angle** between the student vector and each
opportunity vector: `1.0` means they point the same way, `0.0` means nothing in
common. Using the angle rather than the distance means a long description is not
penalised just for being long.

### Step 4 — Structured signals

Pure text similarity ignores things we know exactly, so four rule-based scores are
added: skill overlap, preferred category, work mode and location.

### Step 5 — Final blended score (eight signals)

Text similarity alone was not enough. With TF-IDF carrying 55% of the score, a
Data Science student and a Mechanical student scored almost identically whenever
both had written "Python" — the wording overlapped even though the fit did not.
So weight moved onto signals we can check exactly:

| Signal | Weight | What it measures |
| --- | ---: | --- |
| Text similarity | 0.32 | TF-IDF cosine similarity |
| Skill match | 0.22 | Fraction of required skills the student has |
| Opportunity type | 0.10 | Is it a category they chose? |
| Interests | 0.10 | How many of their interests it touches |
| Branch | 0.08 | Is it in their field of study? |
| Career goal | 0.08 | Does it move them towards the job they want? |
| Work mode | 0.05 | Remote / Hybrid / On-site preference |
| Location | 0.05 | City or preferred location |

```
raw   = Σ (signal × weight) + saved-similarity bonus
raw   = raw × eligibility multiplier      (0.6 when their year clearly does not fit)
score = min(99, raw × 1.35 × 100)
```

Cosine values on short documents rarely exceed ~0.5, so a straight `× 100` would
make every match look weak. The multiplier stretches the useful range. The cap
is **99, not 100**, deliberately — claiming a perfect match would be dishonest
for a text-similarity model.

Eligibility never hides an opportunity, because the eligibility field is free
text written by hand and may be incomplete. A clear year mismatch only reduces
the score.

### Step 6 — Full analysis, not just a number

Every recommendation carries a complete, readable analysis:

> **82% — Strong match**
>
> **In your favour**
> ✓ You have 3 of 5 required skills: Data Analysis, Machine Learning, Statistics
> ✓ Hackathon is one of your preferred types
> ✓ Relevant to Data Science (analytics)
> ✓ Builds towards becoming a Data Scientist
>
> **What would make this a stronger match**
> ✗ Skills you could add: Cybersecurity, Finance
>
> **How the 82% was calculated** — biggest factor: skill match
> Skill match 60% × 0.22 = **13.2 pts** · Opportunity type 100% × 0.10 = **10.0 pts**
> Branch 100% × 0.08 = **8.0 pts** · Career goal 100% × 0.08 = **8.0 pts** …

The "skills you could add" list is the part students actually act on: it turns a
mediocre score into a study plan. The eligibility verdict is read from the
listing's own text and always says to confirm on the official page.

**A full walkthrough with worked numbers is in
[`docs/RECOMMENDATION_ENGINE.md`](docs/RECOMMENDATION_ENGINE.md).**

---

## API endpoints

Every response has the same shape:

```jsonc
// success
{ "success": true, "data": { ... } }

// failure
{ "success": false, "message": "…", "errors": [ { "field": "email", "message": "…" } ] }
```

### Authentication — `/api/auth`

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| POST | `/register` | Public | Create a student account (+ empty profile) |
| POST | `/login` | Public | Student or admin login |
| POST | `/admin/login` | Public | Admin-only login |
| POST | `/forgot-password` | Public | Acknowledge a reset request |
| POST | `/reset-password` | Public | Demo direct reset (student accounts only) |
| GET | `/me` | Token | Current user + profile (restores the session) |
| PATCH | `/password` | Token | Change password |

### Opportunities — `/api/opportunities`

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| GET | `/` | Public* | List with filters, sorting and pagination |
| GET | `/featured` | Public* | 6 items for the landing page |
| GET | `/filters` | Public | Options for the filter sidebar |
| GET | `/calendar` | Public* | Deadlines for the calendar page |
| GET | `/:id` | Public* | Full details (also records a view) |

\* Personalised extras (`isSaved`, `applicationStatus`) are added when a token is sent.

Query parameters for `GET /`: `search`, `category`, `skills`, `location`, `mode`,
`organization`, `deadlineBefore`, `includeExpired`, `sort`, `page`, `limit`.

### Student — token required

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/dashboard` | Stats, recommendations and deadlines in one call |
| GET | `/api/profile` | Full profile with completion percentage |
| PUT | `/api/profile` | Update profile |
| POST | `/api/profile/onboarding` | Save the wizard and mark onboarding complete |
| GET | `/api/recommendations` | Personalised feed |
| GET | `/api/recommendations/:id/explain` | Score, reasons and breakdown for one opportunity |
| GET | `/api/saved` | Saved opportunities |
| POST | `/api/saved/:id` | Save |
| DELETE | `/api/saved/:id` | Unsave |
| GET | `/api/applications` | Tracker, pre-grouped by status |
| POST | `/api/applications/:opportunityId` | Start tracking |
| PATCH | `/api/applications/:id` | Change status |
| DELETE | `/api/applications/:id` | Stop tracking |
| GET | `/api/notifications` | List (also generates deadline reminders) |
| PATCH | `/api/notifications/:id/read` | Mark one as read |
| PATCH | `/api/notifications/read-all` | Mark all as read |
| DELETE | `/api/notifications/:id` | Delete |

### Admin — `/api/admin` (admin token required)

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/analytics` | All dashboard numbers, charts and service health |
| GET | `/students` | Paginated, searchable student list |
| GET | `/opportunities` | All opportunities, including hidden and expired |
| POST | `/opportunities` | Create (and notify matching students) |
| PUT | `/opportunities/:id` | Update |
| DELETE | `/opportunities/:id` | Delete |
| POST | `/categories` | Create category |
| PUT | `/categories/:id` | Update category |
| DELETE | `/categories/:id` | Delete (refused while in use) |

### Public lookups

`GET /api/categories`, `GET /api/skills?search=`, `GET /api/interests`,
`GET /api/stats`, `GET /api/health`

### Recommendation service (Python, port 8000)

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/health` | Service and database status |
| POST | `/recommend` | `{ "student_id": 2, "limit": 20 }` → ranked list with scores, reasons and breakdowns |
| GET | `/explain/{student_id}/{opportunity_id}` | Full score breakdown for one pair |

Full request/response examples are in
[`docs/API_DOCUMENTATION.md`](docs/API_DOCUMENTATION.md).

---

## Security

| Measure | Implementation |
| --- | --- |
| Password hashing | bcrypt with a per-password salt, 10 rounds. Plain passwords are never stored or logged |
| Authentication | Signed JWTs with an expiry; the user is re-read from the database on every request, so a deleted or deactivated account cannot keep using an old token |
| Authorisation | `protect` + `restrictTo('admin' \| 'student')` middleware guards every private route |
| SQL injection | Every query is parameterised (`$1`, `$2` …). No user value is ever concatenated into SQL. Sort columns come from a fixed whitelist |
| Input validation | `express-validator` rules on every write endpoint, mirrored in the React forms |
| Brute force | Rate limiting: 20 authentication attempts per IP per 15 minutes |
| CORS | Whitelist of known origins, not `*` |
| HTTP headers | Helmet |
| Secrets | Environment variables only; `.env` is git-ignored |
| Error handling | One central handler; stack traces are only returned in development |
| Enumeration | Login and password-reset return the same message whether or not the email exists |

---

## Deployment

The project is four processes plus a database, so hosting splits naturally in
two:

| Part | Where | Why |
| --- | --- | --- |
| React frontend | **Netlify** | It is static files after `npm run build` — exactly what Netlify is for |
| Express API, FastAPI ML service, PostgreSQL, importer cron | **VPS** | These need long-running processes and a persistent disk, which Netlify does not provide |

The frontend calls `/api/...` on its own origin and a Netlify Function proxies
those requests to the VPS server-side. Its destination is stored in Netlify's
private `API_ORIGIN` environment variable, so VPS details stay out of GitHub.

```
Browser → Netlify (React build + /api proxy) → VPS (API, ML service, PostgreSQL)
```

| Guide | Covers |
| --- | --- |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | VPS: nginx, systemd, PostgreSQL, HTTPS, cron, backups, security checklist |
| [`docs/NETLIFY_DEPLOYMENT.md`](docs/NETLIFY_DEPLOYMENT.md) | Netlify: build settings, the API proxy, CORS for direct mode, troubleshooting |

You can also serve the frontend from the VPS itself with nginx and skip Netlify
entirely — `DEPLOYMENT.md` covers that too.

---

## Screenshots

> Add your own screenshots here before submitting. Suggested list:

| Screen | File |
| --- | --- |
| Landing page | `docs/screenshots/landing.png` |
| Registration & onboarding wizard | `docs/screenshots/onboarding.png` |
| Student dashboard | `docs/screenshots/dashboard.png` |
| Recommended feed with match scores | `docs/screenshots/recommended.png` |
| Discover with filters | `docs/screenshots/discover.png` |
| Opportunity details — “Why this matches you” | `docs/screenshots/why-match.png` |
| Application tracker (kanban) | `docs/screenshots/applications.png` |
| Deadline calendar | `docs/screenshots/calendar.png` |
| Admin dashboard & analytics | `docs/screenshots/admin.png` |
| FastAPI interactive docs | `docs/screenshots/fastapi.png` |

---

## Demo data and academic honesty

The 28 opportunities created by `npm run db:seed` are **fictional**. The
organisations (Nimbus AI Labs, Vector Analytics, Aarna Education Foundation and so
on), their deadlines, stipends and application links were written for this project
so the platform could be demonstrated with realistic data.

To make sure nobody is misled:

- every seeded row is stored with `is_demo = TRUE`;
- the interface shows a **“Sample”** badge on those cards and a full notice on the
  details page;
- the admin form has a **“Mark as sample data”** checkbox, unticked by default, so
  genuine opportunities you add later appear without any badge.

Deadlines are generated relative to the date you run the seed script, so the demo
never looks expired.

---

## Team members

| Name | Contribution |
| --- | --- |
| Siddhesh Rambhau Sadarao | Full-stack development and system integration |
| Ninad Santosh Mahajan | Backend and database development |
| Nishant Bharat Jadhav | Frontend development and UI/UX |
| Aditya Dnyaneshwar Sabale | Data ingestion and project documentation |

**Course:** B.Tech Data Science  
**Institution:** RCPIT, Shirpur

---

## Future scope

| Idea | Why it matters |
| --- | --- |
| **Automated opportunity collection** | Scrape or use official APIs so the catalogue stays current without manual entry |
| **Better ML model** | Replace TF-IDF with sentence embeddings (e.g. Sentence-BERT) to capture meaning rather than word overlap. The engine is already modular: write a new class with the same `recommend()` method and point `main.py` at it |
| **Hybrid recommendations** | Once there is enough usage data, blend collaborative filtering with the content-based score |
| **Learning from feedback** | Use saves, applications and dismissals as training signal to tune the weights per student |
| **Email and push notifications** | Deadline reminders that reach students outside the app |
| **Resume parsing** | Extract skills automatically from an uploaded resume instead of typing them |
| **Eligibility as structured data** | Store year/branch/CGPA requirements in columns rather than free text, enabling hard filtering |
| **College admin role** | Let each college publish opportunities to its own students |
| **Mobile application** | React Native client reusing the same REST API |
