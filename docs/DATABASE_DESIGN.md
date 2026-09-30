# Database Design

PostgreSQL schema for the Student Opportunity Finder. The complete, runnable
script is [`database/schema.sql`](../database/schema.sql).

---

## 1. Design principles

| Principle | How it is applied here |
| --- | --- |
| **Separation of concerns** | `users` holds only login credentials and role. Student-specific details live in `student_profiles`. Adding an admin therefore does not leave a dozen empty student columns |
| **Normalisation** | Skills and interests are lookup tables, so "Python" is one row shared by every student and every opportunity that needs it |
| **Junction tables** | Every many-to-many relationship gets its own table with a composite primary key |
| **Referential integrity** | Foreign keys everywhere, with deliberate `ON DELETE` rules |
| **Constraints over trust** | `CHECK` constraints enforce valid roles, work modes and application statuses at the database level, not only in application code |
| **Indexes on access paths** | Every column used in a `WHERE` or `JOIN` is indexed, plus a GIN index for text search |

---

## 2. Entity-Relationship overview

```
                         ┌─────────────┐
                         │    users    │
                         │─────────────│
                         │ id (PK)     │
                         │ name        │
                         │ email  (UQ) │
                         │ password_hash│
                         │ role        │
                         └──────┬──────┘
                    1:1         │        1:N
        ┌───────────────────────┼────────────────────────┐
        ▼                       ▼                        ▼
┌──────────────────┐  ┌──────────────────┐   ┌──────────────────┐
│ student_profiles │  │saved_opportunities│  │  notifications   │
│──────────────────│  │──────────────────│   │──────────────────│
│ id (PK)          │  │ id (PK)          │   │ id (PK)          │
│ user_id (FK,UQ)  │  │ user_id (FK)     │   │ user_id (FK)     │
│ college, degree  │  │ opportunity_id FK│   │ opportunity_id FK│
│ branch, year     │  │ UNIQUE(user,opp) │   │ title, message   │
│ city, career_goal│  └──────────────────┘   │ type, is_read    │
│ preferred_mode   │                          └──────────────────┘
│ onboarding_done  │  ┌──────────────────┐   ┌──────────────────┐
└────────┬─────────┘  │   applications   │   │ opportunity_views│
         │            │──────────────────│   │──────────────────│
    M:N  │            │ id (PK)          │   │ id (PK)          │
         │            │ user_id (FK)     │   │ user_id (FK)     │
    ┌────┴─────┬──────┴──┐               │   │ opportunity_id FK│
    ▼          ▼         ▼               │   │ viewed_at        │
┌────────┐ ┌─────────┐ ┌──────────────┐ │   └──────────────────┘
│student_│ │student_ │ │student_      │ │
│skills  │ │interests│ │preferred_    │ │
│────────│ │─────────│ │categories    │ │
│prof FK │ │prof FK  │ │──────────────│ │
│skill FK│ │inter FK │ │profile_id FK │ │
│PK(both)│ │PK(both) │ │category_id FK│ │
└───┬────┘ └────┬────┘ └──────┬───────┘ │
    │           │             │         │
    ▼           ▼             ▼         ▼
┌────────┐ ┌─────────┐ ┌────────────────────────┐
│ skills │ │interests│ │     opportunities      │
│────────│ │─────────│ │────────────────────────│
│id (PK) │ │id (PK)  │ │ id (PK)                │
│name UQ │ │name UQ  │ │ title, organization    │
│slug UQ │ │slug UQ  │ │ category_id (FK)───────┼──▶ ┌────────────┐
│category│ └─────────┘ │ description,eligibility│    │ categories │
└───┬────┘             │ location, mode         │    │────────────│
    │        M:N       │ deadline, stipend      │    │ id (PK)    │
    └──────────────────┤ application_url        │    │ name  (UQ) │
      ┌────────────────┤ is_demo, is_active     │    │ slug  (UQ) │
      ▼                │ views_count,saves_count│    │ icon,color │
┌──────────────────┐   │ created_by (FK→users)  │    └────────────┘
│opportunity_skills│   └────────────────────────┘
│──────────────────│
│ opportunity_id FK│
│ skill_id      FK │
│ PRIMARY KEY(both)│
└──────────────────┘
```

---

## 3. Tables

### 3.1 `users`

Login credentials and role. Nothing student-specific.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | SERIAL | PRIMARY KEY |
| `name` | VARCHAR(120) | NOT NULL |
| `email` | VARCHAR(160) | NOT NULL, **UNIQUE**, must be lowercase |
| `password_hash` | VARCHAR(255) | NOT NULL — bcrypt hash, never plain text |
| `role` | VARCHAR(20) | NOT NULL, CHECK IN ('student','admin') |
| `avatar_url` | TEXT | |
| `is_active` | BOOLEAN | NOT NULL DEFAULT TRUE |
| `created_at`, `updated_at` | TIMESTAMPTZ | DEFAULT NOW() |

*Indexes:* `email`, `role`.

The `email = lower(email)` CHECK guarantees `Student@x.com` and `student@x.com`
can never both exist.

### 3.2 `categories`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | SERIAL | PRIMARY KEY |
| `name` | VARCHAR(60) | UNIQUE — "Internship" |
| `slug` | VARCHAR(60) | UNIQUE — "internship", used in URLs |
| `icon` | VARCHAR(40) | lucide-react icon name |
| `color` | VARCHAR(20) | colour key used by the UI |
| `description` | TEXT | |

Seeded with 8 rows: Internship, Scholarship, Hackathon, Competition, Course,
Workshop, Fellowship, Career Program.

### 3.3 `skills` and `interests`

Both follow the same shape: `id`, `name` (UNIQUE), `slug` (UNIQUE), `created_at`.
`skills` also has a `category` column ("Programming", "Data", "Soft Skill" …).

**Why a slug?** Students type freely. "Node.JS", "node js" and "Node.js" all
produce the slug `node-js`, so they resolve to one row instead of three
near-duplicates. See `resolveSkillIds()` in `backend/src/services/taxonomyService.js`.

### 3.4 `student_profiles`

One row per student — a **1:1** relationship with `users`, enforced by the UNIQUE
constraint on `user_id`.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | SERIAL | PRIMARY KEY |
| `user_id` | INTEGER | **UNIQUE**, FK → `users(id)` ON DELETE CASCADE |
| `college` | VARCHAR(160) | |
| `degree` | VARCHAR(40) | B.Tech, B.E., B.Sc, BCA, MCA, MBA, Other |
| `branch` | VARCHAR(80) | |
| `year` | SMALLINT | CHECK BETWEEN 1 AND 6 |
| `city` | VARCHAR(80) | |
| `career_goal` | VARCHAR(80) | |
| `preferred_mode` | VARCHAR(20) | CHECK IN ('Remote','Hybrid','On-site','Any') |
| `preferred_location` | VARCHAR(120) | |
| `bio` | TEXT | Also used by the recommendation engine |
| `onboarding_done` | BOOLEAN | Drives the redirect to the wizard |

### 3.5 `opportunities`

The main content table.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | SERIAL | PRIMARY KEY |
| `title` | VARCHAR(200) | NOT NULL |
| `organization` | VARCHAR(160) | NOT NULL |
| `organization_logo` | TEXT | |
| `category_id` | INTEGER | NOT NULL, FK → `categories(id)` **ON DELETE RESTRICT** |
| `description` | TEXT | NOT NULL |
| `eligibility`, `benefits` | TEXT | |
| `location` | VARCHAR(120) | NOT NULL DEFAULT 'India' |
| `mode` | VARCHAR(20) | CHECK IN ('Remote','Hybrid','On-site') |
| `duration` | VARCHAR(80) | "6 months", "48 hours" |
| `stipend` | VARCHAR(120) | Free text — covers stipends, prizes and awards alike |
| `deadline` | DATE | NOT NULL |
| `application_url` | TEXT | NOT NULL |
| `source` | VARCHAR(160) | Where the listing came from |
| `is_demo` | BOOLEAN | TRUE = fictional sample data, shown with a "Sample" badge |
| `is_active` | BOOLEAN | FALSE hides it without deleting it |
| `views_count`, `saves_count` | INTEGER | Denormalised counters for analytics |
| `created_by` | INTEGER | FK → `users(id)` ON DELETE SET NULL |

*Indexes:* `category_id`, `deadline`, `is_active`, `mode`, `created_at DESC`, plus:

```sql
CREATE INDEX idx_opportunities_search ON opportunities
    USING GIN (to_tsvector('english', title || ' ' || organization || ' ' || description));
```

**Why `ON DELETE RESTRICT` on the category?** Deleting a category that still has
opportunities would orphan them. The database refuses, and the API turns that into
a clear message: *"This category is used by 8 opportunities. Move or delete them
first."*

**Why denormalised counters?** `views_count` and `saves_count` could be computed
with `COUNT(*)`, but the analytics page sorts by them across the whole table. A
stored counter keeps that instant. They are updated inside the same transaction
as the insert/delete, so they cannot drift.

### 3.6 Junction tables (many-to-many)

| Table | Links | Primary key |
| --- | --- | --- |
| `student_skills` | student ↔ skill (+ `proficiency`) | `(profile_id, skill_id)` |
| `student_interests` | student ↔ interest | `(profile_id, interest_id)` |
| `student_preferred_categories` | student ↔ category | `(profile_id, category_id)` |
| `opportunity_skills` | opportunity ↔ skill | `(opportunity_id, skill_id)` |

A **composite primary key** makes duplicates impossible: a student cannot have
"Python" listed twice.

### 3.7 `saved_opportunities`

| Column | Notes |
| --- | --- |
| `user_id`, `opportunity_id` | Both FK ON DELETE CASCADE |
| | `CONSTRAINT saved_unique UNIQUE (user_id, opportunity_id)` |

The UNIQUE constraint lets the API use `ON CONFLICT DO NOTHING`, so clicking
"Save" twice is harmless rather than an error.

### 3.8 `applications`

| Column | Notes |
| --- | --- |
| `status` | CHECK IN ('Planning to Apply','Applied','Shortlisted','Selected','Rejected') |
| `notes` | Free text |
| `applied_on` | DATE, set the first time the status moves past "Planning to Apply" |
| | `UNIQUE (user_id, opportunity_id)` — one tracker entry per opportunity |

### 3.9 `opportunity_views`

One row per view, used for analytics and available to the recommendation engine.
`user_id` is nullable so anonymous visits are still counted.

### 3.10 `notifications`

| Column | Notes |
| --- | --- |
| `type` | CHECK IN ('info','deadline','match','system') |
| `opportunity_id` | Nullable FK — makes the notification clickable |
| `is_read` | Indexed together with `user_id` |

---

## 4. ON DELETE strategy

| Relationship | Rule | Reason |
| --- | --- | --- |
| `student_profiles.user_id` → users | CASCADE | Deleting an account must remove its profile |
| `student_skills.profile_id` → profiles | CASCADE | Junction rows are meaningless without their parent |
| `saved_opportunities.*` | CASCADE | A saved item is meaningless without the user or the opportunity |
| `applications.*` | CASCADE | Same reasoning |
| `notifications.*` | CASCADE | Same reasoning |
| `opportunities.category_id` → categories | **RESTRICT** | Never orphan opportunities; force the admin to decide |
| `opportunities.created_by` → users | **SET NULL** | Deleting the admin who created a listing must not delete the listing |

---

## 5. The `updated_at` trigger

Rather than remembering to set `updated_at` in every UPDATE statement, the
database does it:

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_opportunities_updated
    BEFORE UPDATE ON opportunities
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

Applied to `users`, `student_profiles`, `opportunities` and `applications`.

---

## 6. Normalisation

The schema is in **Third Normal Form (3NF)**:

| Form | Requirement | How we satisfy it |
| --- | --- | --- |
| **1NF** | Atomic values, no repeating groups | A student's skills are rows in `student_skills`, not a comma-separated string |
| **2NF** | No partial dependency on part of a composite key | In `student_skills` the only non-key column, `proficiency`, depends on *both* the profile and the skill |
| **3NF** | No transitive dependencies | Category name and colour live in `categories`, not repeated on every opportunity row |

**The two deliberate exceptions** are `views_count` and `saves_count` on
`opportunities`. These are denormalised for query performance, which is a
conscious trade-off, kept safe by updating them inside the same transaction as the
underlying row.

---

## 7. Common queries

**Opportunities with their skills and whether this student saved them:**

```sql
SELECT o.*, c.name AS category_name,
       COALESCE(
         (SELECT json_agg(s.name ORDER BY s.name)
            FROM opportunity_skills os
            JOIN skills s ON s.id = os.skill_id
           WHERE os.opportunity_id = o.id),
         '[]'
       ) AS skills,
       EXISTS (SELECT 1 FROM saved_opportunities sv
                WHERE sv.opportunity_id = o.id AND sv.user_id = $1) AS is_saved
  FROM opportunities o
  JOIN categories c ON c.id = o.category_id
 WHERE o.is_active = TRUE AND o.deadline >= CURRENT_DATE;
```

**Deadline reminders, without creating duplicates:**

```sql
INSERT INTO notifications (user_id, title, message, type, opportunity_id)
SELECT sv.user_id, 'Deadline approaching',
       o.title || ' closes on ' || to_char(o.deadline, 'DD Mon YYYY') || '.',
       'deadline', o.id
  FROM saved_opportunities sv
  JOIN opportunities o ON o.id = sv.opportunity_id
 WHERE sv.user_id = $1
   AND o.deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'
   AND NOT EXISTS (
         SELECT 1 FROM notifications n
          WHERE n.user_id = sv.user_id AND n.opportunity_id = o.id
            AND n.type = 'deadline');
```

---

## 8. SQL injection protection

Every query in the project is **parameterised**. Values travel separately from
the SQL text, so the database can never interpret user input as code.

```js
// SAFE — the value is sent separately
query('SELECT * FROM users WHERE email = $1', [email]);

// UNSAFE — never written in this project
query(`SELECT * FROM users WHERE email = '${email}'`);
```

If someone submits `' OR '1'='1` as their email, the parameterised version simply
searches for a user whose email is literally that string, and finds nobody.

Values that cannot be parameters — such as the `ORDER BY` column — are selected
from a **fixed whitelist** in the code, never taken from the request:

```js
const sortOptions = {
  newest:   'o.created_at DESC',
  deadline: 'o.deadline ASC',
  popular:  'o.views_count DESC, o.saves_count DESC',
  relevant: 'o.saves_count DESC, o.created_at DESC',
};
const orderBy = sortOptions[sort] || sortOptions.newest;
```

---

## 9. Table sizes after seeding

| Table | Rows |
| --- | --- |
| `categories` | 8 |
| `skills` | 46 |
| `interests` | 15 |
| `opportunities` | 28 (all `is_demo = TRUE`) |
| `opportunity_skills` | ~120 |
| `users` | 3 (1 admin, 2 students) |
| `student_profiles` | 2 |
| `saved_opportunities` | 5 |
| `applications` | 3 |
