# Project Overview

A viva-oriented walkthrough of the Student Opportunity Finder: what it does, how
it is built, why each decision was made, and how to present it.

---

## 1. What the project is

A web platform where a student creates one profile and then sees the internships,
scholarships, hackathons, competitions, courses, workshops, fellowships and career
programmes that are **actually relevant to them** — ranked by a machine learning
engine that also explains its reasoning.

There are two kinds of user:

- **Students** — browse, search, receive recommendations, save opportunities,
  track applications and watch deadlines.
- **Administrators** — publish and manage opportunities and categories, view
  students and read platform analytics.

---

## 2. The problem, in concrete terms

Opportunity information is fragmented:

| Where students look | What goes wrong |
| --- | --- |
| LinkedIn | Buried in a general feed; mostly experienced-hire roles |
| Company career pages | You must already know the company exists |
| Scholarship portals | Government and trust sites, each with its own format |
| Hackathon sites | Several competing platforms |
| College WhatsApp / Telegram groups | Messages scroll away; no search |

Two problems follow. **Discovery**: students simply do not hear about most
opportunities. **Relevance**: even where a list exists, it is the same list for
everyone — a second-year Mechanical student and a final-year Data Science student
see identical results.

This project addresses both: one catalogue (discovery) with per-student ranking
(relevance).

---

## 3. Objectives

1. Centralise every type of student opportunity in one searchable place.
2. Recommend opportunities per student using their skills, interests, education
   and career goals.
3. **Explain** every recommendation, so the ranking can be trusted.
4. Let students save opportunities, track applications and meet deadlines.
5. Give administrators full content management and usage analytics.
6. Keep the system simple enough to explain end to end in a viva.

---

## 4. Architecture

Three tiers plus a dedicated machine learning microservice.

```
React (5173)  →  Express API (5000)  →  PostgreSQL (5432)
                        │                      ▲
                        └──→ FastAPI (8000) ───┘
```

| Tier | Technology | Responsibility |
| --- | --- | --- |
| Presentation | React 18 + Vite + Tailwind | Pages, components, client-side routing and validation |
| Application | Node.js + Express | REST API, authentication, authorisation, business rules |
| Data | PostgreSQL 17 | 14 tables with foreign keys, constraints and indexes |
| ML service | Python + FastAPI + scikit-learn | TF-IDF vectorisation, cosine similarity, scoring, explanations |

### Why separate the ML service?

| Reason | Explanation |
| --- | --- |
| **Right tool per job** | scikit-learn, NumPy and pandas have no real equivalent in Node. Express has no real equivalent in Python for this style of app |
| **Independent deployment** | The model can be changed or retrained without redeploying the web API |
| **Demonstrable on its own** | FastAPI generates interactive docs at `/docs`, so the engine can be shown working in isolation |
| **Clean interface** | One HTTP contract (`POST /recommend`) means either side can be replaced |

**The honest trade-off:** a separate service means one more process to run and
network latency on each call. For a project of this size a single Node service
would also have worked — but then the ML would have to be reimplemented in
JavaScript, losing scikit-learn entirely. Being able to state the trade-off
clearly is more valuable than pretending there isn't one.

### Request flow — "show me my recommendations"

```
1. Student opens /recommended
2. React calls  GET /api/recommendations   (JWT in the Authorization header)
3. Express `protect` middleware verifies the token and re-reads the user
4. `restrictTo('student')` confirms the role
5. recommendationService  →  POST http://127.0.0.1:8000/recommend {student_id}
6. FastAPI loads the profile + all open opportunities from PostgreSQL
7. scikit-learn builds TF-IDF vectors and computes cosine similarity
8. Rule-based boosts are blended in; scores and reasons are returned
9. Express loads the full opportunity rows for the returned ids
10. React renders the cards with match percentages and explanations
```

**If step 5 fails** (service not running), Express catches it, runs its own
JavaScript scorer and marks the response `"engine": "fallback"`. The student still
gets recommendations; the UI says which engine produced them.

---

## 5. Core flows

### Student

```
Register → Onboarding (7 steps) → Dashboard
    → Discover / Recommended
    → Opportunity details ("Why this matches you")
    → Save  →  Apply (external link)  →  Track status  →  Deadline reminders
```

### Admin

```
Admin login → Dashboard → Add / edit / delete opportunities
                        → Manage categories
                        → View students
                        → Read analytics
```

---

## 6. Key implementation decisions

| Decision | Reasoning |
| --- | --- |
| **JWT instead of sessions** | Stateless: the API stores nothing per user, so it scales and works cleanly with a separate frontend origin |
| **Re-read the user on every request** | A token alone is not enough — if an account is deleted or deactivated, the old token must stop working immediately |
| **`bcryptjs` rather than `bcrypt`** | Same algorithm, pure JavaScript, no native compiler needed. Far easier to install on a lab machine |
| **Filters stored in the URL** | A filtered Discover view can be bookmarked and shared, and the browser Back button behaves correctly |
| **One `/api/dashboard` endpoint** | The dashboard needs five different figures. One endpoint means one round trip instead of five |
| **Optimistic UI for saving** | The bookmark icon flips instantly and only rolls back on failure, so the interface feels immediate |
| **Slugs on skills and interests** | `Node.JS`, `node js` and `Node.js` all resolve to one row instead of three duplicates |
| **Denormalised view/save counters** | The analytics page sorts by them across the whole table; a stored counter keeps that instant. Updated inside the same transaction, so they cannot drift |
| **`ON DELETE RESTRICT` on categories** | Deleting a category with opportunities would orphan them. The database refuses and the API explains why |
| **Deadlines seeded relative to today** | The demo never looks expired, whenever the seed script is run |
| **`is_demo` flag** | Fictional listings are visibly badged, so nobody mistakes demo data for real opportunities |

---

## 7. What is genuinely working

Every feature listed below was tested end to end against the running application,
not just written:

- Registration, login, admin login, password change, password reset
- The full 7-step onboarding wizard, pre-filled from registration data
- Dashboard with live statistics and real ML-scored recommendations
- Discover: search, six filters, four sort orders, pagination
- Opportunity details with the score breakdown from the live model
- Save / unsave, with the counters staying correct
- Application tracker: create, move between all five statuses, delete
- Calendar rendering real deadlines
- Notifications, including auto-generated deadline reminders
- Admin: create, edit and delete opportunities; create and delete categories
- Admin analytics with all four charts drawing real data
- Role guards (a student token is rejected by every `/api/admin` route)
- Server-side validation rejecting malformed input field by field

There are no placeholder buttons and no stubbed primary features.

---

## 8. Honest limitations

| Limitation | Why, and what it would take to fix |
| --- | --- |
| **Opportunities are entered manually** | Automated collection needs scrapers or official API access, plus handling of rate limits and site changes — a project in itself |
| **Demo data is fictional** | Real listings would need verification. Everything fictional is flagged `is_demo` and badged "Sample" |
| **No email delivery** | Password reset and deadline emails need an SMTP account and deliverability setup. Reset is handled in-app instead, limited to student accounts |
| **TF-IDF matches words, not meaning** | "Deep learning" and "neural networks" only match because a synonym table says so. Sentence embeddings would understand this natively, but need a much larger model |
| **Fixed scoring weights** | The weights are hand-tuned rather than learned, because there is no interaction data to learn from yet |
| **Eligibility is free text** | Year and branch requirements can only be checked approximately, so eligibility is used for explanation, never for hard filtering |
| **No file uploads** | Profile photos use generated initials; logos are URLs. File storage was out of scope |

---

## 9. Likely viva questions

**Why not just use a database `LIKE` search?**
A `LIKE` search finds opportunities containing a word. It cannot rank them by how
well they suit a particular student, cannot weigh a skill match against a location
match, and cannot explain itself. That ranking and explanation is the whole point
of the project.

**How does TF-IDF actually work?**
Term Frequency × Inverse Document Frequency. TF is how often a word appears in
this document; IDF is `log(total documents / documents containing the word)`, so
rare words score higher. Multiplying them makes a word important when it is
frequent *here* but rare *everywhere else* — exactly what distinguishes one
opportunity from another.

**Why cosine similarity rather than Euclidean distance?**
Cosine measures the angle, ignoring magnitude. A long opportunity description
produces a large vector; with Euclidean distance it would look "far away" from the
short student document and be penalised for length alone. The angle compares what
the documents are *about*.

**Where is the database schema enforced?**
In the database itself — `CHECK` constraints on role, work mode and application
status, `UNIQUE` constraints on email and on each (user, opportunity) pair, and
foreign keys with deliberate `ON DELETE` rules. Application-level validation sits
on top as a second layer, not as the only layer.

**How is SQL injection prevented?**
Every query is parameterised: values travel separately from the SQL text, so they
can never be interpreted as code. The one thing that cannot be a parameter — the
`ORDER BY` column — is chosen from a fixed whitelist in the code.

**What happens if the Python service is down?**
The backend catches the connection failure and falls back to a JavaScript scorer
using plain set overlap. Responses are marked `"engine": "fallback"`, the
Recommended page shows a notice, and the admin dashboard shows the service as
offline. Nothing breaks and nothing pretends the model ran.

**How would you scale this to 100,000 students?**
Three main changes: cache each student's recommendations rather than recomputing
on every page load (the catalogue changes far more slowly than pages are viewed);
precompute the TF-IDF matrix for opportunities once instead of refitting per
request; and add read replicas for the heavy `GET` traffic. The three-tier split
already means each tier can be scaled independently.

**What did you find hardest?**
Two bugs worth mentioning because both were found by testing rather than by
reading code. First, PostgreSQL rejected a query where one parameter was used both
as a value and inside a `CASE` comparison — "inconsistent types deduced for
parameter $1" — fixed with an explicit `::text` cast. Second, the "Why this
matches you" panel silently showed the wrong score: the backend requested 200
results but the Python service caps `limit` at 100, so the request failed
validation and fell through to the fallback scorer. It looked like it was working;
only comparing the number against the dashboard revealed it. The fix was to call
the service's own `/explain` endpoint instead.

---

## 10. Suggested demonstration order

1. **Landing page** — the problem statement, categories, live statistics.
2. **Register a new student** — walk through all seven onboarding steps.
3. **Dashboard** — point out the match percentages and the "Recommended because…"
   lines under each card.
4. **Open one opportunity** — read the "Why this matches you" list, then expand
   the score breakdown.
5. **FastAPI docs** (`127.0.0.1:8000/docs`) — run `POST /recommend` live and show
   the same numbers coming out of scikit-learn.
6. **Log in as the second demo student** — show that the rankings are completely
   different, proving the personalisation is real.
7. **Discover** — combine filters, then show the URL carrying the filter state.
8. **Save an opportunity, then the tracker** — drag a card between columns.
9. **Calendar** — deadlines colour-coded by category.
10. **Admin panel** — publish a new opportunity, then show it appearing in the
    student feed and in the analytics charts.

Total: about 10 minutes, covering both roles and the ML engine.

---

## 11. Further reading

| Document | Contents |
| --- | --- |
| [`../README.md`](../README.md) | Setup instructions, environment variables, feature list |
| [`DATABASE_DESIGN.md`](DATABASE_DESIGN.md) | Every table, constraint, index and the normalisation analysis |
| [`API_DOCUMENTATION.md`](API_DOCUMENTATION.md) | All endpoints with request and response examples |
| [`RECOMMENDATION_ENGINE.md`](RECOMMENDATION_ENGINE.md) | The algorithm step by step, with worked numbers |
