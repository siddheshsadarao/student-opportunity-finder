/**
 * Fills the database with demo content.
 *
 *   npm run db:seed
 *
 * Creates:
 *   - 8 categories, ~46 skills, 15 interests
 *   - 1 admin account
 *   - 2 demo student accounts with complete profiles
 *   - 28 fictional opportunities (all flagged is_demo = TRUE)
 *   - a few saved items / applications so the dashboard is not empty
 *
 * The script is safe to run more than once: it clears the content tables
 * first, so you always end up with exactly this data set.
 */
import bcrypt from 'bcryptjs';
import { pool, query, withTransaction } from '../src/config/db.js';
import config from '../src/config/env.js';
import slugify from '../src/utils/slugify.js';
import { CATEGORIES, SKILLS, INTERESTS, OPPORTUNITIES, daysFromNow } from './seedData.js';

const SALT_ROUNDS = 10;

/** Demo students so the dashboard and recommendations can be shown immediately. */
const DEMO_STUDENTS = [
  {
    name: 'Aarav Mehta',
    email: 'demo.student@example.com',
    password: 'Student@123',
    college: 'Example Institute of Technology',
    degree: 'B.Tech',
    branch: 'Data Science',
    year: 3,
    city: 'Pune',
    careerGoal: 'Data Scientist',
    preferredMode: 'Remote',
    preferredLocation: 'Pune',
    bio: 'Third year Data Science student interested in machine learning and analytics.',
    skills: ['Python', 'SQL', 'Machine Learning', 'Pandas', 'Statistics', 'Data Analysis'],
    interests: ['Data Science', 'Artificial Intelligence', 'Research'],
    preferredCategories: ['internship', 'hackathon', 'competition', 'scholarship'],
  },
  {
    name: 'Meera Nair',
    email: 'demo.web@example.com',
    password: 'Student@123',
    college: 'Example College of Engineering',
    degree: 'B.E.',
    branch: 'Computer Science',
    year: 2,
    city: 'Bengaluru',
    careerGoal: 'Software Developer',
    preferredMode: 'Hybrid',
    preferredLocation: 'Bengaluru',
    bio: 'Second year CSE student who enjoys building web applications.',
    skills: ['JavaScript', 'React', 'Node.js', 'HTML/CSS', 'Git'],
    interests: ['Web Development', 'Open Source', 'Entrepreneurship'],
    preferredCategories: ['internship', 'hackathon', 'course'],
  },
];

async function clearContent() {
  console.log('[seed] Clearing existing data ...');
  // TRUNCATE ... CASCADE also empties the tables that reference these.
  await query(`
    TRUNCATE TABLE
      notifications, applications, saved_opportunities, opportunity_views,
      opportunity_skills, opportunities, student_preferred_categories,
      student_interests, student_skills, student_profiles, users,
      interests, skills, categories
    RESTART IDENTITY CASCADE
  `);
}

async function seedTaxonomy() {
  console.log('[seed] Inserting categories, skills and interests ...');

  for (const category of CATEGORIES) {
    await query(
      `INSERT INTO categories (name, slug, icon, color, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [category.name, category.slug, category.icon, category.color, category.description]
    );
  }

  for (const skill of SKILLS) {
    await query('INSERT INTO skills (name, slug, category) VALUES ($1, $2, $3)', [
      skill.name,
      slugify(skill.name),
      skill.category,
    ]);
  }

  for (const interest of INTERESTS) {
    await query('INSERT INTO interests (name, slug) VALUES ($1, $2)', [
      interest,
      slugify(interest),
    ]);
  }
}

async function seedAdmin() {
  console.log('[seed] Creating the admin account ...');
  if (!config.admin.password) {
    throw new Error('ADMIN_PASSWORD is required when running the seed script.');
  }
  const passwordHash = await bcrypt.hash(config.admin.password, SALT_ROUNDS);
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin') RETURNING id`,
    ['Platform Administrator', config.admin.email, passwordHash]
  );
  return rows[0].id;
}

async function seedOpportunities(adminId) {
  console.log(`[seed] Inserting ${OPPORTUNITIES.length} demo opportunities ...`);

  // Look up ids once instead of querying inside the loop.
  const categoryRows = await query('SELECT id, slug FROM categories');
  const categoryBySlug = new Map(categoryRows.rows.map((r) => [r.slug, r.id]));

  const skillRows = await query('SELECT id, slug FROM skills');
  const skillBySlug = new Map(skillRows.rows.map((r) => [r.slug, r.id]));

  for (const opportunity of OPPORTUNITIES) {
    const categoryId = categoryBySlug.get(opportunity.category);
    if (!categoryId) throw new Error(`Unknown category slug: ${opportunity.category}`);

    await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO opportunities
            (title, organization, category_id, description, eligibility, benefits,
             location, mode, duration, stipend, deadline, application_url, source,
             is_demo, is_active, created_by, views_count, saves_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE,TRUE,$14,$15,$16)
         RETURNING id`,
        [
          opportunity.title,
          opportunity.organization,
          categoryId,
          opportunity.description,
          opportunity.eligibility,
          opportunity.benefits,
          opportunity.location,
          opportunity.mode,
          opportunity.duration,
          opportunity.stipend,
          daysFromNow(opportunity.deadlineIn),
          opportunity.applicationUrl,
          opportunity.source,
          adminId,
          // A little starting activity so the analytics charts are not flat.
          Math.floor(Math.random() * 180) + 20,
          Math.floor(Math.random() * 25) + 2,
        ]
      );

      const opportunityId = rows[0].id;

      for (const skillName of opportunity.skills) {
        const skillId = skillBySlug.get(slugify(skillName));
        if (!skillId) throw new Error(`Unknown skill in seed data: ${skillName}`);
        await client.query(
          'INSERT INTO opportunity_skills (opportunity_id, skill_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [opportunityId, skillId]
        );
      }
    });
  }
}

async function seedStudents() {
  console.log('[seed] Creating demo student accounts ...');
  const createdIds = [];

  for (const student of DEMO_STUDENTS) {
    const passwordHash = await bcrypt.hash(student.password, SALT_ROUNDS);

    const userId = await withTransaction(async (client) => {
      const user = await client.query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, 'student') RETURNING id`,
        [student.name, student.email, passwordHash]
      );
      const newUserId = user.rows[0].id;

      const profile = await client.query(
        `INSERT INTO student_profiles
            (user_id, college, degree, branch, year, city, career_goal,
             preferred_mode, preferred_location, bio, onboarding_done)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE)
         RETURNING id`,
        [
          newUserId,
          student.college,
          student.degree,
          student.branch,
          student.year,
          student.city,
          student.careerGoal,
          student.preferredMode,
          student.preferredLocation,
          student.bio,
        ]
      );
      const profileId = profile.rows[0].id;

      for (const skillName of student.skills) {
        await client.query(
          `INSERT INTO student_skills (profile_id, skill_id)
           SELECT $1, id FROM skills WHERE slug = $2
           ON CONFLICT DO NOTHING`,
          [profileId, slugify(skillName)]
        );
      }

      for (const interestName of student.interests) {
        await client.query(
          `INSERT INTO student_interests (profile_id, interest_id)
           SELECT $1, id FROM interests WHERE slug = $2
           ON CONFLICT DO NOTHING`,
          [profileId, slugify(interestName)]
        );
      }

      for (const categorySlug of student.preferredCategories) {
        await client.query(
          `INSERT INTO student_preferred_categories (profile_id, category_id)
           SELECT $1, id FROM categories WHERE slug = $2
           ON CONFLICT DO NOTHING`,
          [profileId, categorySlug]
        );
      }

      await client.query(
        `INSERT INTO notifications (user_id, title, message, type)
         VALUES ($1, $2, $3, 'system')`,
        [
          newUserId,
          'Welcome to Student Opportunity Finder',
          'Your profile is ready. Open the Recommended page to see your matches.',
        ]
      );

      return newUserId;
    });

    createdIds.push(userId);
  }

  return createdIds;
}

/** Gives the first demo student some saved items and tracked applications. */
async function seedActivity(studentIds) {
  console.log('[seed] Adding sample saved items and applications ...');
  const [primaryStudentId] = studentIds;
  if (!primaryStudentId) return;

  const { rows } = await query(
    `SELECT o.id FROM opportunities o
       JOIN categories c ON c.id = o.category_id
      WHERE c.slug IN ('internship', 'hackathon', 'competition')
      ORDER BY o.deadline ASC
      LIMIT 5`
  );

  for (const [index, row] of rows.entries()) {
    await query(
      `INSERT INTO saved_opportunities (user_id, opportunity_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [primaryStudentId, row.id]
    );
    await query('UPDATE opportunities SET saves_count = saves_count + 1 WHERE id = $1', [row.id]);

    // Track the first three as applications at different pipeline stages.
    const statuses = ['Applied', 'Shortlisted', 'Planning to Apply'];
    if (index < statuses.length) {
      const status = statuses[index];
      // "Planning to Apply" has no application date yet; the others do.
      const appliedOn = status === 'Planning to Apply' ? null : daysFromNow(-3);
      await query(
        `INSERT INTO applications (user_id, opportunity_id, status, applied_on)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [primaryStudentId, row.id, status, appliedOn]
      );
    }
  }
}

async function run() {
  console.log('[seed] Starting ...');
  await clearContent();
  await seedTaxonomy();
  const adminId = await seedAdmin();
  await seedOpportunities(adminId);
  const studentIds = await seedStudents();
  await seedActivity(studentIds);

  const counts = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM categories)    AS categories,
      (SELECT COUNT(*)::int FROM skills)        AS skills,
      (SELECT COUNT(*)::int FROM interests)     AS interests,
      (SELECT COUNT(*)::int FROM opportunities) AS opportunities,
      (SELECT COUNT(*)::int FROM users)         AS users
  `);

  console.log('\n[seed] Finished. Database now contains:');
  console.table(counts.rows[0]);
  console.log('Login details for the demo:');
  console.log(`  Admin    : ${config.admin.email} / ${config.admin.password}`);
  console.log('  Student  : demo.student@example.com / Student@123');
  console.log('  Student  : demo.web@example.com     / Student@123\n');

  await pool.end();
}

run().catch(async (error) => {
  console.error('[seed] Failed:', error.message);
  await pool.end();
  process.exit(1);
});
