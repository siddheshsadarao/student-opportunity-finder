-- ============================================================================
--  STUDENT OPPORTUNITY FINDER - DATABASE SCHEMA (PostgreSQL)
-- ============================================================================
--  This file creates every table, index and constraint used by the project.
--  Run it once on an empty database:
--      psql -U postgres -d student_opportunity_finder -f schema.sql
--
--  Design notes (useful for viva):
--   * "users" stores login credentials only. Student-specific details live in
--     "student_profiles". This keeps authentication separate from profile data
--     and lets us add other roles (admin) without leaving empty columns.
--   * Skills and interests are stored in their own lookup tables so that the
--     same skill ("Python") is one row shared by many students and many
--     opportunities. This is called normalisation and it avoids spelling
--     mismatches such as "python" vs "Python".
--   * Many-to-many relationships use junction tables
--     (student_skills, student_interests, opportunity_skills, ...).
-- ============================================================================

-- Drop everything first so the script can be re-run safely during development.
DROP TABLE IF EXISTS notifications                 CASCADE;
DROP TABLE IF EXISTS applications                  CASCADE;
DROP TABLE IF EXISTS saved_opportunities           CASCADE;
DROP TABLE IF EXISTS opportunity_views             CASCADE;
DROP TABLE IF EXISTS opportunity_skills            CASCADE;
DROP TABLE IF EXISTS opportunities                 CASCADE;
DROP TABLE IF EXISTS student_preferred_categories  CASCADE;
DROP TABLE IF EXISTS student_interests             CASCADE;
DROP TABLE IF EXISTS student_skills                CASCADE;
DROP TABLE IF EXISTS student_profiles              CASCADE;
DROP TABLE IF EXISTS interests                     CASCADE;
DROP TABLE IF EXISTS skills                        CASCADE;
DROP TABLE IF EXISTS categories                    CASCADE;
DROP TABLE IF EXISTS users                         CASCADE;

-- ----------------------------------------------------------------------------
-- 1. USERS  (login + role)
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id              SERIAL       PRIMARY KEY,
    name            VARCHAR(120) NOT NULL,
    email           VARCHAR(160) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,          -- bcrypt hash, never plain text
    role            VARCHAR(20)  NOT NULL DEFAULT 'student',
    avatar_url      TEXT,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT users_role_check  CHECK (role IN ('student', 'admin')),
    CONSTRAINT users_email_check CHECK (email = lower(email))
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_role  ON users (role);

-- ----------------------------------------------------------------------------
-- 2. CATEGORIES  (Internship, Scholarship, Hackathon, ...)
-- ----------------------------------------------------------------------------
CREATE TABLE categories (
    id          SERIAL       PRIMARY KEY,
    name        VARCHAR(60)  NOT NULL UNIQUE,   -- "Internship"
    slug        VARCHAR(60)  NOT NULL UNIQUE,   -- "internship"  (used in URLs)
    icon        VARCHAR(40),                    -- lucide-react icon name
    color       VARCHAR(20),                    -- colour key used by the UI
    description TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_slug ON categories (slug);

-- ----------------------------------------------------------------------------
-- 3. SKILLS  (lookup table shared by students and opportunities)
-- ----------------------------------------------------------------------------
CREATE TABLE skills (
    id         SERIAL       PRIMARY KEY,
    name       VARCHAR(80)  NOT NULL UNIQUE,
    slug       VARCHAR(80)  NOT NULL UNIQUE,
    category   VARCHAR(40),                     -- "Programming", "Soft Skill" ...
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_skills_slug ON skills (slug);

-- ----------------------------------------------------------------------------
-- 4. INTERESTS  (Artificial Intelligence, Web Development, ...)
-- ----------------------------------------------------------------------------
CREATE TABLE interests (
    id         SERIAL       PRIMARY KEY,
    name       VARCHAR(80)  NOT NULL UNIQUE,
    slug       VARCHAR(80)  NOT NULL UNIQUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_interests_slug ON interests (slug);

-- ----------------------------------------------------------------------------
-- 5. STUDENT PROFILES  (1 : 1 with users where role = 'student')
-- ----------------------------------------------------------------------------
CREATE TABLE student_profiles (
    id                 SERIAL       PRIMARY KEY,
    user_id            INTEGER      NOT NULL UNIQUE
                         REFERENCES users(id) ON DELETE CASCADE,
    college            VARCHAR(160),
    degree             VARCHAR(40),
    branch             VARCHAR(80),
    year               SMALLINT,
    city               VARCHAR(80),
    career_goal        VARCHAR(80),
    preferred_mode     VARCHAR(20)  DEFAULT 'Any',
    preferred_location VARCHAR(120),
    bio                TEXT,
    onboarding_done    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT profiles_year_check CHECK (year IS NULL OR year BETWEEN 1 AND 6),
    CONSTRAINT profiles_mode_check CHECK (preferred_mode IN ('Remote','Hybrid','On-site','Any'))
);

CREATE INDEX idx_profiles_user_id ON student_profiles (user_id);
CREATE INDEX idx_profiles_branch  ON student_profiles (branch);

-- ----------------------------------------------------------------------------
-- 6. STUDENT SKILLS  (many-to-many: student <-> skill)
-- ----------------------------------------------------------------------------
CREATE TABLE student_skills (
    profile_id  INTEGER NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    skill_id    INTEGER NOT NULL REFERENCES skills(id)           ON DELETE CASCADE,
    proficiency VARCHAR(20) DEFAULT 'Intermediate',
    PRIMARY KEY (profile_id, skill_id),

    CONSTRAINT student_skills_prof_check
        CHECK (proficiency IN ('Beginner','Intermediate','Advanced'))
);

CREATE INDEX idx_student_skills_skill ON student_skills (skill_id);

-- ----------------------------------------------------------------------------
-- 7. STUDENT INTERESTS  (many-to-many: student <-> interest)
-- ----------------------------------------------------------------------------
CREATE TABLE student_interests (
    profile_id  INTEGER NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    interest_id INTEGER NOT NULL REFERENCES interests(id)        ON DELETE CASCADE,
    PRIMARY KEY (profile_id, interest_id)
);

CREATE INDEX idx_student_interests_interest ON student_interests (interest_id);

-- ----------------------------------------------------------------------------
-- 8. STUDENT PREFERRED CATEGORIES  (which opportunity types they care about)
-- ----------------------------------------------------------------------------
CREATE TABLE student_preferred_categories (
    profile_id  INTEGER NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id)       ON DELETE CASCADE,
    PRIMARY KEY (profile_id, category_id)
);

-- ----------------------------------------------------------------------------
-- 9. OPPORTUNITIES  (the main content table)
-- ----------------------------------------------------------------------------
CREATE TABLE opportunities (
    id                SERIAL       PRIMARY KEY,
    title             VARCHAR(200) NOT NULL,
    organization      VARCHAR(160) NOT NULL,
    organization_logo TEXT,
    category_id       INTEGER      NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    description       TEXT         NOT NULL,
    eligibility       TEXT,
    benefits          TEXT,
    location          VARCHAR(120) NOT NULL DEFAULT 'India',
    mode              VARCHAR(20)  NOT NULL DEFAULT 'Remote',
    duration          VARCHAR(80),
    stipend           VARCHAR(120),              -- free text: "INR 50,000/month", "USD 5,000 prize"
    deadline          DATE         NOT NULL,
    application_url   TEXT         NOT NULL,
    source            VARCHAR(160),              -- where the listing came from
    is_demo           BOOLEAN      NOT NULL DEFAULT FALSE,  -- TRUE = fictional sample data
    is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
    views_count       INTEGER      NOT NULL DEFAULT 0,
    saves_count       INTEGER      NOT NULL DEFAULT 0,
    created_by        INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT opportunities_mode_check CHECK (mode IN ('Remote','Hybrid','On-site'))
);

CREATE INDEX idx_opportunities_category ON opportunities (category_id);
CREATE INDEX idx_opportunities_deadline ON opportunities (deadline);
CREATE INDEX idx_opportunities_active   ON opportunities (is_active);
CREATE INDEX idx_opportunities_mode     ON opportunities (mode);
CREATE INDEX idx_opportunities_created  ON opportunities (created_at DESC);

-- Full-text search index on title + organization + description.
-- Lets the Discover page search quickly even with thousands of rows.
CREATE INDEX idx_opportunities_search ON opportunities
    USING GIN (to_tsvector('english', title || ' ' || organization || ' ' || description));

-- ----------------------------------------------------------------------------
-- 10. OPPORTUNITY SKILLS  (many-to-many: opportunity <-> skill)
-- ----------------------------------------------------------------------------
CREATE TABLE opportunity_skills (
    opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    skill_id       INTEGER NOT NULL REFERENCES skills(id)        ON DELETE CASCADE,
    PRIMARY KEY (opportunity_id, skill_id)
);

CREATE INDEX idx_opportunity_skills_skill ON opportunity_skills (skill_id);

-- ----------------------------------------------------------------------------
-- 11. SAVED OPPORTUNITIES  (bookmarks)
-- ----------------------------------------------------------------------------
CREATE TABLE saved_opportunities (
    id             SERIAL      PRIMARY KEY,
    user_id        INTEGER     NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
    opportunity_id INTEGER     NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    saved_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A student cannot save the same opportunity twice.
    CONSTRAINT saved_unique UNIQUE (user_id, opportunity_id)
);

CREATE INDEX idx_saved_user ON saved_opportunities (user_id);

-- ----------------------------------------------------------------------------
-- 12. APPLICATIONS  (application tracker with status)
-- ----------------------------------------------------------------------------
CREATE TABLE applications (
    id             SERIAL       PRIMARY KEY,
    user_id        INTEGER      NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
    opportunity_id INTEGER      NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    status         VARCHAR(30)  NOT NULL DEFAULT 'Planning to Apply',
    notes          TEXT,
    applied_on     DATE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT applications_unique UNIQUE (user_id, opportunity_id),
    CONSTRAINT applications_status_check CHECK (
        status IN ('Planning to Apply','Applied','Shortlisted','Selected','Rejected')
    )
);

CREATE INDEX idx_applications_user   ON applications (user_id);
CREATE INDEX idx_applications_status ON applications (status);

-- ----------------------------------------------------------------------------
-- 13. OPPORTUNITY VIEWS  (used by the recommendation engine + analytics)
-- ----------------------------------------------------------------------------
CREATE TABLE opportunity_views (
    id             SERIAL      PRIMARY KEY,
    user_id        INTEGER     REFERENCES users(id)                  ON DELETE CASCADE,
    opportunity_id INTEGER     NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    viewed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_views_user        ON opportunity_views (user_id);
CREATE INDEX idx_views_opportunity ON opportunity_views (opportunity_id);

-- ----------------------------------------------------------------------------
-- 14. NOTIFICATIONS
-- ----------------------------------------------------------------------------
CREATE TABLE notifications (
    id             SERIAL       PRIMARY KEY,
    user_id        INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title          VARCHAR(160) NOT NULL,
    message        TEXT         NOT NULL,
    type           VARCHAR(30)  NOT NULL DEFAULT 'info',
    opportunity_id INTEGER      REFERENCES opportunities(id) ON DELETE CASCADE,
    is_read        BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT notifications_type_check
        CHECK (type IN ('info','deadline','match','system'))
);

CREATE INDEX idx_notifications_user ON notifications (user_id, is_read);

-- ----------------------------------------------------------------------------
-- 15. updated_at trigger
--     Automatically refreshes updated_at whenever a row is modified, so we
--     never have to remember to set it in application code.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_profiles_updated
    BEFORE UPDATE ON student_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_opportunities_updated
    BEFORE UPDATE ON opportunities
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_applications_updated
    BEFORE UPDATE ON applications
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
