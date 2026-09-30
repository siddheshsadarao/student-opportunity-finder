# API Documentation

Base URL: `http://localhost:5000/api`

---

## Conventions

### Response envelope

Every endpoint returns the same shape, which keeps the React code simple.

**Success**

```json
{ "success": true, "data": { } }
```

**Failure**

```json
{
  "success": false,
  "message": "Please fix the highlighted fields.",
  "errors": [
    { "field": "email", "message": "Enter a valid email address." },
    { "field": "password", "message": "Password must be at least 8 characters." }
  ]
}
```

`errors` is only present for validation failures. In development the response
also carries a `stack` field; in production it is omitted.

### Authentication

Protected endpoints require the JWT in a header:

```
Authorization: Bearer <token>
```

The token is returned by `/auth/login`, `/auth/register` and `/auth/admin/login`.

### Access levels

| Level | Meaning |
| --- | --- |
| **Public** | No token needed |
| **Public+** | Works without a token, but adds personalised fields (`isSaved`, `applicationStatus`) when one is sent |
| **Student** | Valid token with `role = 'student'` |
| **Admin** | Valid token with `role = 'admin'` |

### Status codes

| Code | Meaning |
| --- | --- |
| 200 | Success |
| 201 | Created |
| 400 | Validation error or bad request |
| 401 | Missing, invalid or expired token |
| 403 | Authenticated but not allowed (wrong role, deactivated account) |
| 404 | Not found |
| 409 | Conflict (e.g. email already registered) |
| 429 | Too many authentication attempts (rate limited) |
| 500 | Server error |
| 503 | A required service is unavailable |

---

## 1. Authentication — `/api/auth`

### `POST /auth/register` — Public

Creates a student account plus an (initially sparse) profile, and returns a token
so the user can go straight to onboarding.

**Request**

```json
{
  "name": "Rahul Menon",
  "email": "rahul@student.com",
  "password": "Testpass123",
  "confirmPassword": "Testpass123",
  "college": "COEP Technological University",
  "degree": "B.Tech",
  "branch": "AI/ML",
  "year": 2,
  "city": "Pune"
}
```

Only `name`, `email`, `password` and `confirmPassword` are required.
Password rules: at least 8 characters, containing a letter and a number.

**Response `201`**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { "id": 4, "name": "Rahul Menon", "email": "rahul@student.com", "role": "student", "avatarUrl": null },
    "onboardingDone": false
  }
}
```

**Errors** — `409` if the email is already registered, `400` for validation.

---

### `POST /auth/login` — Public

Works for both students and admins; the `role` in the response tells the frontend
which dashboard to open.

**Request**

```json
{ "email": "demo.student@example.com", "password": "Student@123" }
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOi...",
    "user": { "id": 2, "name": "Aarav Mehta", "email": "demo.student@example.com", "role": "student", "avatarUrl": null },
    "onboardingDone": true
  }
}
```

**Errors** — `401 "Incorrect email or password."` The message is identical whether
the email or the password was wrong, so the endpoint cannot be used to discover
which addresses are registered.

---

### `POST /auth/admin/login` — Public

Identical to `/auth/login` but returns `403` for any account whose role is not
`admin`.

### `GET /auth/me` — Token

Used on page refresh to restore the session.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "user": { "id": 2, "name": "Aarav Mehta", "email": "demo.student@example.com", "role": "student", "avatarUrl": null },
    "profile": { "id": 1, "college": "…", "skills": [], "interests": [], "completion": { "percentage": 100, "suggestions": [] } },
    "onboardingDone": true
  }
}
```

### `PATCH /auth/password` — Token

```json
{ "currentPassword": "Student@123", "newPassword": "Student@456" }
```

**Errors** — `400 "Your current password is incorrect."`

### `POST /auth/forgot-password` — Public

Acknowledges a reset request without revealing whether the email exists.

### `POST /auth/reset-password` — Public

Demo-only direct reset. Works for **student accounts only**, so the admin account
cannot be taken over this way. Always returns the same generic message.

```json
{ "email": "demo.web@example.com", "newPassword": "NewPass123" }
```

> A production build would email a time-limited reset token. Email delivery was
> kept out of scope for this project.

---

## 2. Opportunities — `/api/opportunities`

### `GET /opportunities` — Public+

| Parameter | Type | Description |
| --- | --- | --- |
| `search` | string | Matches title, organisation or description |
| `category` | string | Category slug (`internship`) or id |
| `skills` | string | Comma-separated: `Python,SQL` — matches **any** |
| `location` | string | Partial match |
| `mode` | string | `Remote` \| `Hybrid` \| `On-site` |
| `organization` | string | Partial match |
| `deadlineBefore` | date | `YYYY-MM-DD` |
| `includeExpired` | boolean | `true` to include past deadlines (default: hidden) |
| `sort` | string | `relevant` \| `newest` \| `deadline` \| `popular` |
| `page` | integer | Default 1 |
| `limit` | integer | Default 12, maximum 60 |

**Example**

```
GET /api/opportunities?search=data&category=internship&skills=Python,SQL&sort=deadline
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "opportunities": [
      {
        "id": 2,
        "title": "Data Science Summer Internship",
        "organization": "Vector Analytics",
        "organizationLogo": null,
        "description": "A structured 10-week summer internship…",
        "eligibility": "Students in the 3rd or final year…",
        "benefits": "Stipend, industry mentor, capstone certificate.",
        "location": "Pune",
        "mode": "On-site",
        "duration": "10 weeks",
        "stipend": "INR 30,000 / month",
        "deadline": "2026-10-05",
        "applicationUrl": "https://example.com/vector-analytics/summer-internship",
        "source": "Vector Analytics campus programme (sample)",
        "isDemo": true,
        "isActive": true,
        "viewsCount": 143,
        "savesCount": 12,
        "createdAt": "2026-09-17T06:12:44.021Z",
        "category": { "id": 1, "name": "Internship", "slug": "internship", "icon": "Briefcase", "color": "blue" },
        "skills": ["Data Analysis", "Pandas", "Power BI", "Python", "SQL", "Statistics"],
        "isSaved": true,
        "applicationStatus": "Applied",
        "matchScore": null
      }
    ],
    "pagination": { "page": 1, "limit": 12, "total": 2, "totalPages": 1 }
  }
}
```

### `GET /opportunities/:id` — Public+

Returns one opportunity and records a view (anonymous views are stored with a
`NULL` user id). `404` if it does not exist.

### `GET /opportunities/featured` — Public+

Six opportunities for the landing page, ordered by popularity then deadline.

### `GET /opportunities/filters` — Public

Everything the Discover sidebar needs.

```json
{
  "success": true,
  "data": {
    "categories": [{ "id": 1, "name": "Internship", "slug": "internship", "icon": "Briefcase", "color": "blue", "count": 8 }],
    "skills": ["Python", "Communication", "Problem Solving"],
    "locations": ["Bengaluru", "Chennai", "Delhi", "Remote"],
    "organizations": ["Nimbus AI Labs", "Vector Analytics"],
    "modes": ["Remote", "Hybrid", "On-site"],
    "sortOptions": [{ "value": "relevant", "label": "Most Relevant" }]
  }
}
```

### `GET /opportunities/calendar` — Public+

| Parameter | Description |
| --- | --- |
| `from`, `to` | Optional date range |
| `onlySaved` | `true` to restrict to the student's saved items |

---

## 3. Dashboard — `/api/dashboard` — Student

Everything the dashboard shows, in one request.

```json
{
  "success": true,
  "data": {
    "stats": { "recommended": 6, "saved": 5, "upcomingDeadlines": 2, "applications": 3 },
    "recommendations": [ { "id": 18, "title": "…", "matchScore": 93, "matchReasons": ["You know Machine Learning, Pandas, Python"] } ],
    "engine": "ml",
    "upcomingDeadlines": [
      { "id": 16, "title": "BuildAI 36-Hour National Hackathon", "organization": "CodeCrafters Community", "deadline": "2026-09-26",
        "category": { "name": "Hackathon", "slug": "hackathon", "color": "violet" } }
    ],
    "applicationBreakdown": [{ "status": "Applied", "count": 1 }]
  }
}
```

`engine` is `"ml"` when the Python service answered, `"fallback"` when the backend
used its built-in JavaScript scorer.

---

## 4. Profile — `/api/profile` — Student

### `GET /profile`

```json
{
  "success": true,
  "data": {
    "id": 1, "userId": 2,
    "name": "Aarav Mehta", "email": "demo.student@example.com",
    "college": "Sinhgad Institute of Technology",
    "degree": "B.Tech", "branch": "Data Science", "year": 3, "city": "Pune",
    "careerGoal": "Data Scientist",
    "preferredMode": "Remote", "preferredLocation": "Pune",
    "bio": "Third year Data Science student…",
    "onboardingDone": true,
    "skills": [{ "id": 1, "name": "Python", "proficiency": "Intermediate" }],
    "interests": [{ "id": 2, "name": "Data Science" }],
    "preferredCategories": [{ "id": 1, "name": "Internship", "slug": "internship" }],
    "completion": { "percentage": 100, "suggestions": [] }
  }
}
```

### `PUT /profile`

All fields optional — a partial update leaves the others untouched. Sending a
`skills`, `interests` or `preferredCategories` array **replaces** that list.

```json
{
  "name": "Aarav Mehta",
  "city": "Pune",
  "careerGoal": "Data Scientist",
  "preferredMode": "Remote",
  "skills": ["Python", "SQL", "Machine Learning"],
  "interests": ["Data Science"],
  "preferredCategories": [1, 3]
}
```

Skills and interests that do not exist yet are created automatically, matched on a
slug so `Node.JS` and `node js` resolve to the same row.

### `POST /profile/onboarding`

Same body as `PUT /profile`, but also sets `onboarding_done = TRUE` and creates a
"your recommendations are ready" notification.

---

## 5. Recommendations — `/api/recommendations` — Student

### `GET /recommendations?limit=20`

```json
{
  "success": true,
  "data": {
    "opportunities": [
      {
        "id": 18,
        "title": "National Data Science Challenge",
        "matchScore": 93,
        "matchReasons": [
          "You know Machine Learning, Pandas, Python",
          "Matches your interest in Data Science",
          "Relevant to your goal of becoming a Data Scientist",
          "Competition is one of your preferred types"
        ]
      }
    ],
    "engine": "ml",
    "count": 20
  }
}
```

### `GET /recommendations/:id/explain`

Powers the "Why this matches you" panel.

```json
{
  "success": true,
  "data": {
    "opportunityId": 18,
    "matchScore": 93,
    "reasons": ["You know Machine Learning, Pandas, Python", "Matches your interest in Data Science"],
    "breakdown": {
      "content_similarity": 0.1836,
      "skill_match": 0.6,
      "category_match": 1.0,
      "interest_match": 0.5,
      "branch_match": 1.0,
      "goal_match": 1.0,
      "mode_match": 1.0,
      "location_match": 0.9,
      "history_bonus": 0.0,
      "eligibility_multiplier": 1.0
    },
    "weights": {
      "content": 0.32, "skills": 0.22, "category": 0.1, "interests": 0.1,
      "branch": 0.08, "goal": 0.08, "mode": 0.05, "location": 0.05
    },
    "analysis": {
      "score": 82,
      "verdict": "Strong match",
      "signals": [
        { "key": "skills", "label": "Skill match", "score": 0.6, "weight": 0.22,
          "points": 13.2, "detail": "You have 3 of 5 required skills: ..." }
      ],
      "matchedSkills": ["Data Analysis", "Machine Learning", "Statistics"],
      "missingSkills": ["Cybersecurity", "Finance"],
      "matchedInterests": ["Data Science"],
      "eligibility": { "status": "unknown", "reason": null, "degreeMatch": null },
      "strengths": ["Hackathon is one of your preferred types", "..."],
      "gaps": ["Skills you could add: Cybersecurity, Finance"],
      "profileUsed": { "skills": 6, "interests": 3, "branch": "Data Science",
                       "year": 3, "careerGoal": "Data Scientist" }
    },
    "engine": "ml"
  }
}
```

`matchScore` is `null` when the opportunity is closed and therefore was not
scored.

---

## 6. Saved — `/api/saved` — Student

| Method | Endpoint | Notes |
| --- | --- | --- |
| GET | `/saved` | Array of opportunities, each with `savedAt` |
| POST | `/saved/:id` | `201` when newly saved, `200` if it was already saved |
| DELETE | `/saved/:id` | `404` if it was not in the list |

```json
{ "success": true, "data": { "saved": true, "message": "Saved to your list." } }
```

---

## 7. Applications — `/api/applications` — Student

### `GET /applications`

Returns both a flat array and a version pre-grouped for the kanban board.

```json
{
  "success": true,
  "data": {
    "applications": [
      {
        "applicationId": 1,
        "status": "Applied",
        "notes": null,
        "appliedOn": "2026-09-14",
        "trackedAt": "2026-09-17T06:12:44.021Z",
        "statusUpdatedAt": "2026-09-17T06:12:44.021Z",
        "opportunity": { "id": 16, "title": "BuildAI 36-Hour National Hackathon" }
      }
    ],
    "grouped": { "Planning to Apply": [], "Applied": [], "Shortlisted": [], "Selected": [], "Rejected": [] },
    "statuses": ["Planning to Apply", "Applied", "Shortlisted", "Selected", "Rejected"]
  }
}
```

### `POST /applications/:opportunityId`

Starts tracking. Safe to call twice — it updates the existing entry instead of
failing.

```json
{ "status": "Applied", "notes": "Submitted through the portal." }
```

### `PATCH /applications/:id`

```json
{ "status": "Shortlisted" }
```

`applied_on` is set the first time the status moves past "Planning to Apply", and
is then preserved even if the card is dragged back.

### `DELETE /applications/:id`

Stops tracking. The opportunity itself is untouched.

---

## 8. Notifications — `/api/notifications` — Token

### `GET /notifications`

Also generates deadline reminders for saved opportunities closing within three
days, skipping any reminder that already exists.

```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": 7,
        "title": "Deadline approaching",
        "message": "BuildAI 36-Hour National Hackathon at CodeCrafters Community closes on 26 Sep 2026.",
        "type": "deadline",
        "isRead": false,
        "createdAt": "2026-09-17T08:30:00.000Z",
        "opportunityId": 16
      }
    ],
    "unreadCount": 1
  }
}
```

`type` is one of `info`, `deadline`, `match`, `system`.

| Method | Endpoint | Description |
| --- | --- | --- |
| PATCH | `/notifications/:id/read` | Mark one as read |
| PATCH | `/notifications/read-all` | Mark all as read |
| DELETE | `/notifications/:id` | Delete |

---

## 9. Admin — `/api/admin` — Admin

### `GET /admin/analytics`

```json
{
  "success": true,
  "data": {
    "totals": {
      "total_opportunities": 28, "active_opportunities": 28,
      "total_students": 2, "total_applications": 4,
      "total_saves": 5, "total_views": 12
    },
    "opportunitiesByCategory": [{ "name": "Internship", "color": "blue", "count": 8 }],
    "userGrowth": [{ "month": "Sep 2026", "students": 2 }],
    "mostViewed": [{ "id": 20, "title": "FinTech Innovation Hack", "organization": "Paysphere Labs", "value": 191 }],
    "mostSaved": [{ "id": 24, "title": "Full Stack Development Bootcamp", "organization": "Kairo Learning", "value": 26 }],
    "applicationStatuses": [{ "status": "Applied", "count": 2 }],
    "recommendationService": {
      "online": true, "status": "ok",
      "service": "recommendation-service", "database": true,
      "algorithm": "TF-IDF + cosine similarity"
    }
  }
}
```

### `GET /admin/students`

| Parameter | Description |
| --- | --- |
| `search` | Name, email or college |
| `page`, `limit` | Pagination |

Each row includes the profile plus `saved_count`, `application_count`,
`onboarding_done` and a `skills` array.

### `GET /admin/opportunities`

Like the public list but includes hidden and expired rows.

| Parameter | Description |
| --- | --- |
| `search` | Title or organisation |
| `category` | Slug or id |
| `status` | `active` \| `expired` \| `inactive` |
| `page`, `limit` | Pagination |

### `POST /admin/opportunities`

```json
{
  "title": "Data Engineering Winter Internship",
  "organization": "Vector Analytics",
  "organizationLogo": null,
  "categoryId": 1,
  "description": "Build and maintain data pipelines that move millions of records daily…",
  "eligibility": "3rd year onwards, any branch.",
  "benefits": "Stipend, mentor, certificate.",
  "location": "Pune",
  "mode": "Hybrid",
  "duration": "5 months",
  "stipend": "INR 35,000 / month",
  "deadline": "2026-11-20",
  "applicationUrl": "https://example.com/apply",
  "source": "Company careers page",
  "skills": ["SQL", "Python", "Docker"],
  "isDemo": false,
  "isActive": true
}
```

On success this also inserts a `match` notification for every student whose
preferred categories include this one.

**Validation** — `title` ≥ 3 characters, `description` ≥ 20 characters,
`mode` ∈ {Remote, Hybrid, On-site}, `deadline` a valid date,
`applicationUrl` a valid URL.

### `PUT /admin/opportunities/:id`

Same body as create.

### `DELETE /admin/opportunities/:id`

```json
{ "success": true, "data": { "message": "\"Data Engineering Winter Internship\" was deleted." } }
```

### Automatic ingestion

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/admin/ingestion` | Source registry, recent runs, totals and the pending count |
| PATCH | `/admin/ingestion/sources/:key` | `{ "isEnabled": false }` or `{ "autoApprove": false }` |
| GET | `/admin/ingestion/pending` | Listings waiting for review |
| PATCH | `/admin/ingestion/review/:id` | `{ "decision": "approved" }` or `"rejected"` |

There is no endpoint to start an import. Ingestion is a scheduled background
job (cron); running it from a web request would hang the page for minutes and
allow it to be fired repeatedly, which would be impolite to the sites we fetch
from. See [`DATA_INGESTION.md`](DATA_INGESTION.md).

### Categories

| Method | Endpoint | Body |
| --- | --- | --- |
| POST | `/admin/categories` | `{ "name": "Conference", "icon": "Users", "color": "teal", "description": "…" }` |
| PUT | `/admin/categories/:id` | Same |
| DELETE | `/admin/categories/:id` | — |

Deleting a category that is still in use returns `400`:

```json
{ "success": false, "message": "This category is used by 8 opportunities. Move or delete them first." }
```

---

## 10. Public lookups

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/categories` | All categories with a live `opportunity_count` |
| GET | `/api/skills?search=py` | Skills with `usage_count`, max 100 |
| GET | `/api/interests` | All interests |
| GET | `/api/stats` | Landing-page counters |
| GET | `/api/health` | `{ "status": "ok", "service": "sof-backend" }` |

---

## 11. Recommendation service (Python, port 8000)

Interactive documentation: **http://127.0.0.1:8000/docs**

### `GET /health`

```json
{
  "status": "ok",
  "service": "recommendation-service",
  "database": true,
  "algorithm": "TF-IDF + cosine similarity"
}
```

### `POST /recommend`

**Request** — `student_id` is the `users.id` of the student (the same id the JWT
carries), not `student_profiles.id`.

```json
{ "student_id": 2, "limit": 20 }
```

`limit` must be between 1 and 200.

**Response**

```json
{
  "student_id": 2,
  "count": 20,
  "algorithm": "tfidf-cosine-v1",
  "recommendations": [
    {
      "opportunity_id": 18,
      "recommendation_score": 93,
      "reasons": ["You know Machine Learning, Pandas, Python", "Matches your interest in Data Science"],
      "breakdown": {
        "content_similarity": 0.2821,
        "skill_match": 0.8,
        "category_match": 1.0,
        "mode_match": 1.0,
        "location_match": 0.9,
        "history_bonus": 0.08
      }
    }
  ]
}
```

**Errors** — `404` if there is no profile for that user id, `422` if the body
fails validation.

### `GET /explain/{student_id}/{opportunity_id}`

Full breakdown for one pair, including the weights used. This is the endpoint to
open during a viva.

---

## 12. Testing with curl

```bash
# Log in and capture the token
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo.student@example.com","password":"Student@123"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

# Dashboard
curl -s http://localhost:5000/api/dashboard -H "Authorization: Bearer $TOKEN"

# Filtered search (no token needed)
curl -s "http://localhost:5000/api/opportunities?category=internship&mode=Remote"

# Save an opportunity
curl -s -X POST http://localhost:5000/api/saved/3 -H "Authorization: Bearer $TOKEN"

# Explain a match
curl -s http://localhost:5000/api/recommendations/18/explain -H "Authorization: Bearer $TOKEN"

# Call the ML service directly
curl -s -X POST http://127.0.0.1:8000/recommend \
  -H "Content-Type: application/json" \
  -d '{"student_id":2,"limit":5}'
```
