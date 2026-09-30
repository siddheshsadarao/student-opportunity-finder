# Automatic Data Ingestion

How the platform fills itself with real, currently-open opportunities instead of
relying on an admin typing every listing by hand.

---

## 1. The decision: which sites can we actually use?

The obvious idea is "scrape all the big job and hackathon sites". That is the
wrong answer, and not for vague reasons — it fails on evidence.

Before writing a single adapter, every candidate site was checked on
**29 September 2026** by reading its `robots.txt` and making one test request.
`robots.txt` is the file where a website states which automated clients may
access which paths. Ignoring it is both a legal problem and a technical dead
end, because sites that forbid crawling also actively block it.

### Sources we use

| Source | `robots.txt` says | Test result |
| --- | --- | --- |
| **Devpost** | `User-agent: *` / `Disallow:` — an empty Disallow means everything is allowed | `200`, JSON, ~14,000 hackathons |
| **Unstop** | `Allow: /api/public/*` — the exact endpoint we use is **explicitly permitted** | `200`, JSON, Indian listings |
| **Devfolio** | `User-agent: *` / `Disallow:` — allow all | `200`, JSON, 27 open hackathons |
| **HackerEarth** | `User-agent: *` / `Allow: /` | `200`, JSON, live events |
| **Greenhouse** | Official public job-board API, published *for* aggregators | `200`, JSON, 709 jobs on one board |
| **Ashby** | Official public company job-board API | `200`, JSON |
| **Lever** | Documented public Postings API | `200`, JSON, 96 student roles in the configured boards during verification |
| **SmartRecruiters** | Public company postings API | `200`, JSON |
| **Arbeitnow** | Public job-board API | `200`, JSON |
| **Remotive** | Public remote-jobs API with attribution requirements | `200`, JSON |
| **AtCoder** | Public upcoming-contests schedule | `200`, HTML schedule |

Unstop is worth calling out: their own `robots.txt` contains the line
`Allow: /api/public/*`. We are using the endpoint they published for this
purpose.

### Sources we deliberately refuse to use

| Site | Evidence | Verdict |
| --- | --- | --- |
| **Indeed India** | Returned **HTTP 403** to our request | Actively blocks automated access |
| **foundit / Zuni** | Returned **HTTP 403** | Actively blocks automated access |
| **Internshala** | `robots.txt` has `Disallow: /api/`, `Disallow: /internship/details/`, `Disallow: /*?*` | The exact pages we would need are forbidden |
| **LinkedIn** | No `User-agent: *` allow rule at all — only named bots such as `LinkedInBot` are permitted. Terms of service prohibit scraping | Not permitted for our client |
| **Wellfound** | `Disallow: /*?role=*`, `/*?jobId=*` — the job listing parameters | Listings are forbidden, and login-gated |
| **RippleMatch** | Marketing site only; jobs are behind a login and US-only | No public listings to read |
| **Simplify** | Same — login-gated aggregator | No public listings to read |
| **AICTE internship portal** | `Disallow: /api/`, and the site is a Next.js app whose listings load from `/api/` | The data path is forbidden |

**This is not a limitation of the project — it is the correct engineering
decision.** A scraper built against LinkedIn would get the college's IP address
banned within days, break every time they change their markup, and expose the
team to a terms-of-service complaint.

### The better answer for internships

Aggregators are the wrong layer to scrape. Companies publish their openings on
an **Applicant Tracking System** (Greenhouse, Lever, Ashby), and those systems
expose a public API *specifically so that job boards can list their roles*.

```
GET https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true
→ 709 jobs, structured JSON, first-hand from the employer
```

No scraping, no blocking, no terms violated, and the data is better. Add or
remove companies in `ingestion/config.py`:

```python
GREENHOUSE_COMPANIES = [
    {"token": "stripe", "name": "Stripe"},
    {"token": "databricks", "name": "Databricks"},
]
```

To find a company's token, open its careers page and look for
`boards.greenhouse.io/<token>` or `job-boards.greenhouse.io/<token>` in the URL.

---

## 2. Architecture

```
 Devpost  Unstop  Devfolio  ATS boards  Contest platforms  Job APIs
     │       │        │         │              │             │
     └───────┴────────┴─────────┴──────────────┴─────────────┘
                        │
                 one adapter each
              (adapters/*.py — the ONLY
               place source-specific
               code is allowed to live)
                        │
                        ▼
            NormalisedOpportunity
        (one common shape for everything)
                        │
                        ▼
              Clean · detect skills ·
              remove duplicates · validate
                        │
                        ▼
                  PostgreSQL
                        │
                        ▼
            Express API  →  React website
```

**The single most important idea** is the normalised shape. Devpost calls the
prize `prize_amount` and formats dates as `"Jul 31 - Oct 01, 2026"`; Unstop
nests everything under `regnRequirements`; HackerEarth uses unix timestamps.
If that mess reached the database, every page would need source-specific code.

Instead, each adapter's only job is to produce one `NormalisedOpportunity`:

```python
@dataclass
class NormalisedOpportunity:
    source: str            # "devpost"
    source_id: str         # the listing's id at that source
    title: str
    organization: str
    description: str
    category_slug: str     # must match a row in our categories table
    application_url: str
    deadline: date
    ...
```

Everything after that — deduplication, skill detection, saving — is identical
for every source. **Adding a sixth source means writing one file and adding one
line to `ADAPTERS`. Nothing else changes.**

---

## 3. The three hard problems

### 3.1 Running twice must not create duplicates (idempotency)

The job runs every six hours. Without protection, the same hackathon would be
inserted 4 times a day.

Solved with a unique index and an upsert:

```sql
CREATE UNIQUE INDEX idx_opportunities_source_unique
    ON opportunities (source, source_id)
    WHERE source_id IS NOT NULL;
```

```sql
INSERT INTO opportunities (...) VALUES (...)
ON CONFLICT (source, source_id) WHERE source_id IS NOT NULL
DO UPDATE SET title = EXCLUDED.title, deadline = EXCLUDED.deadline, ...
RETURNING id, (xmax = 0) AS was_inserted;
```

`xmax = 0` is PostgreSQL's way of reporting whether the row was **inserted** or
**updated**, which is how the run log gets accurate "new vs updated" counts.

The partial index (`WHERE source_id IS NOT NULL`) matters: opportunities added
by hand through the admin form have no `source_id`, and are never affected.

**Verified:** the second run of an unchanged catalogue reported
`created=0 updated=180` — exactly right.

### 3.2 The same event listed on two different sites

A college hackathon is often posted on Devfolio *and* Unstop with completely
different ids, so the unique index cannot see it. We compare a fingerprint:

```python
def fingerprint(title, deadline):
    cleaned = remove_words(title, ["2026", "hackathon", "hack", "challenge", ...])
    cleaned = keep_only_letters_and_digits(cleaned)
    return f"{cleaned}|{deadline}"
```

`"HackCelestial 3.0"` and `"HackCelestial 3.0 Hackathon 2026"` both reduce to
`hackcelestial|2026-10-13`. Including the deadline prevents merging genuinely
different annual editions of the same event.

### 3.3 Expiry

Listings whose deadline has passed must disappear from the site — but not be
deleted, because the admin may want the history and the analytics counts.

```sql
UPDATE opportunities SET is_active = FALSE
 WHERE is_external AND is_active AND deadline < CURRENT_DATE;
```

---

## 4. Data quality

Raw API data is not usable as-is. Four cleaning steps run on everything:

| Problem | Fix |
| --- | --- |
| **HTML in descriptions** | Tags stripped, entities decoded |
| **Markdown in descriptions** | Devfolio returns raw markdown; `#`, `**`, `[link](url)` and bullets are converted to plain text, including unmatched `**` markers |
| **No skills listed** | Skills detected from the title, description and tags using a pattern table of ~40 known skills. This matters because skill overlap is **22%** of the recommendation score — an opportunity with no skills can never match a student strongly |
| **Missing or bad dates** | Devpost's `"Jul 31 - Oct 01, 2026"` is parsed into real dates (including year-crossing ranges); anything without a usable future deadline is dropped |

Unstop is the best source here because it provides `required_skills` directly —
a real, human-curated skill list rather than one we had to infer.

### Two bugs this caught, worth knowing about

**1. `"Internal Audit Lead"` was being published as an internship.** The filter
used a substring test, and `"Internal"` contains `"intern"`. It looked correct
and was completely wrong. Fixed with word boundaries:

```python
re.search(rf"(?<![a-z]){re.escape(hint)}(?![a-z])", title, re.IGNORECASE)
```

Result: 54 "internships" from company boards dropped to 34 genuine ones.

**2. Unstop returned almost nothing.** The adapter fetched 20 listings per
type and kept 0. The filters were right — Unstop's default sort returns mostly
*closed* listings from previous years (measured: 0 of 20 still open). The API
needs `oppstatus=open`:

```python
params={"opportunity": "hackathons", "oppstatus": "open", "page": page}
```

Result: 3 listings became 57.

---

## 5. Being a polite client

We are making requests to someone else's servers. The rules the code follows:

| Rule | Implementation |
| --- | --- |
| **Say who you are** | A descriptive `User-Agent` with a contact address, so a site owner can email us instead of silently blocking us |
| **Wait between requests** | 1.5 seconds per source by default, configurable per source in the database |
| **Fetch a little, often** | 2–3 pages per source per run, not the whole catalogue |
| **Never run during a page load** | Ingestion is a background job. The website only ever reads the database, so a slow source can never make a page slow |
| **Stop when told to stop** | A `403` raises `PermissionError` and the run ends for that source. We never retry aggressively, rotate user agents, or try to bypass any block |

That last rule is the important one. If a site starts refusing us, the correct
response is to stop using it — which is exactly what the code does.

---

## 6. Running it

```bash
cd "Student opportunity"

# See what would be imported, without writing anything
./ingestion/venv/Scripts/python.exe -m ingestion.run --dry-run

# Import everything
./ingestion/venv/Scripts/python.exe -m ingestion.run

# One source only
./ingestion/venv/Scripts/python.exe -m ingestion.run --source unstop --pages 3

# Send everything to the admin review queue instead of publishing
./ingestion/venv/Scripts/python.exe -m ingestion.run --review

# List configured sources
./ingestion/venv/Scripts/python.exe -m ingestion.run --list
```

On the VPS, schedule it with cron (see [`DEPLOYMENT.md`](DEPLOYMENT.md)):

```cron
0 */6 * * * cd /var/www/sof && ./ingestion/venv/bin/python -m ingestion.run >> /var/log/sof-ingest.log 2>&1
```

### A real run

```
=== devpost ===      fetched=9   created=9  updated=0   skipped=0
=== unstop ===       fetched=116 created=85 updated=30  skipped=1
=== devfolio ===     fetched=27  created=27 updated=0   skipped=0
=== hackerearth ===  fetched=6   created=6  updated=0   skipped=0
=== greenhouse ===   fetched=34  created=23 updated=0   skipped=11

TOTAL: fetched=192 created=150 updated=30 skipped=12
```

Resulting catalogue: **82 hackathons, 56 internships, 21 competitions,
9 scholarships**, plus the original 28 clearly-marked sample listings.

---

## 7. Admin control

**Admin → Data Sources** shows:

- how many live listings each source has contributed
- every run, with created/updated/skipped counts and any error
- a toggle to **disable** a source that starts returning poor data
- a toggle to switch a source from auto-publish to **requires review**
- the review queue, where pending listings can be approved or rejected

A rejected listing is kept with `review_status = 'rejected'` rather than
deleted, so the next run does not simply re-import it.

There is deliberately **no "Run now" button**. Ingestion takes minutes; firing
it from a web request would hang the page and would let someone run it
repeatedly, which is impolite to the sites we fetch from.

---

## 8. Adding a new source

1. Create `ingestion/adapters/yoursource.py` with:

   ```python
   SOURCE_KEY = "yoursource"

   def fetch(session: PoliteSession, max_pages: int = 3) -> list[NormalisedOpportunity]:
       ...
   ```

2. Register it in `ingestion/run.py`:

   ```python
   ADAPTERS = { ..., yoursource.SOURCE_KEY: yoursource.fetch }
   ```

3. Add a row to `ingestion_sources` (or add it to the seed block in
   `database/migration_002_ingestion.sql`).

**Before writing any of that, check `https://thesite.com/robots.txt`.** If the
path you need is disallowed, or the site returns `403`, do not build the
adapter — find an official API instead, as we did with Greenhouse.

---

## 9. Limitations

| Limitation | Why |
| --- | --- |
| **Scholarships are thin** | Most Indian scholarship portals are government sites with no public API and restrictive robots rules. Unstop covers some; the rest are still added by hand |
| **Greenhouse deadlines are estimated** | Company boards rarely publish an application deadline, so a 45-day rolling window is shown and the description says to check the official page |
| **Duplicate detection is title-based** | Two events with very different titles would not be merged. A stricter check would need fuzzy string matching, which risks merging things that are genuinely different |
| **No full description for Devpost** | Their list API does not include one, so we build a summary from the themes, prize and location rather than making a second request per hackathon |
| **Skill detection is pattern-based** | A skill not in the pattern table is missed. Unstop's own `required_skills` is used whenever available because it is more reliable |
