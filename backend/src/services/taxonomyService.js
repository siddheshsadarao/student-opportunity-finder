/**
 * Helpers for the three lookup tables: skills, interests and categories.
 *
 * The onboarding form lets a student type a skill that does not exist yet
 * ("Rust", for example). Instead of rejecting it we create the row on the
 * fly -- but we match on the slug first so we never end up with both
 * "Node.js" and "node js" as separate skills.
 */
import slugify from '../utils/slugify.js';

/**
 * Takes a list of skill names and returns their ids, creating any that are new.
 * @param {object} client an active pg client (so it joins the caller's transaction)
 * @param {string[]} names
 * @returns {Promise<number[]>} skill ids
 */
export async function resolveSkillIds(client, names = []) {
  const ids = [];
  for (const rawName of names) {
    const name = String(rawName || '').trim();
    if (!name) continue;
    const slug = slugify(name);
    if (!slug) continue;

    // Try to insert; if the slug already exists just read the existing row.
    const insert = await client.query(
      `INSERT INTO skills (name, slug)
       VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = skills.name
       RETURNING id`,
      [name, slug]
    );
    ids.push(insert.rows[0].id);
  }
  return [...new Set(ids)];
}

/** Same idea as resolveSkillIds but for the interests table. */
export async function resolveInterestIds(client, names = []) {
  const ids = [];
  for (const rawName of names) {
    const name = String(rawName || '').trim();
    if (!name) continue;
    const slug = slugify(name);
    if (!slug) continue;

    const insert = await client.query(
      `INSERT INTO interests (name, slug)
       VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = interests.name
       RETURNING id`,
      [name, slug]
    );
    ids.push(insert.rows[0].id);
  }
  return [...new Set(ids)];
}

/**
 * Converts a mixed list of category ids or category names into ids.
 * Unlike skills, categories are NOT created automatically -- only an admin
 * can add a category, so unknown names are simply ignored.
 */
export async function resolveCategoryIds(client, values = []) {
  const ids = [];
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;

    if (typeof value === 'number' || /^\d+$/.test(String(value))) {
      const found = await client.query('SELECT id FROM categories WHERE id = $1', [Number(value)]);
      if (found.rows[0]) ids.push(found.rows[0].id);
      continue;
    }

    const found = await client.query('SELECT id FROM categories WHERE slug = $1', [slugify(value)]);
    if (found.rows[0]) ids.push(found.rows[0].id);
  }
  return [...new Set(ids)];
}

export default { resolveSkillIds, resolveInterestIds, resolveCategoryIds };
