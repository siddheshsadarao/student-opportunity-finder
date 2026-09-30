/**
 * Turns "Machine Learning" into "machine-learning".
 *
 * Skills, interests and categories all store a slug next to their name.
 * The slug is what we compare on, so "Node.JS", "node js" and "Node.js"
 * all resolve to the same row instead of creating duplicates.
 */
export function slugify(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // any run of non-alphanumerics becomes one dash
    .replace(/^-+|-+$/g, '');    // trim leading/trailing dashes
}

export default slugify;
