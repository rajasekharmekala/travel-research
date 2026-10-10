// Public page names come from destination names. Internal research ids are unchanged.
export function pageSlug(name) {
  const slug = String(name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) throw new Error('Destination name cannot produce a page name');
  return slug;
}

// Maps each destination to a unique slug. Collisions fail rather than overwrite a page.
export function pageSlugs(destinations) {
  const slugs = new Map();
  const seen = new Map();
  for (const destination of destinations) {
    const slug = pageSlug(destination.name);
    if (seen.has(slug)) throw new Error(`Page name ${slug} is used by ${seen.get(slug)} and ${destination.name}`);
    seen.set(slug, destination.name);
    slugs.set(destination.id, slug);
  }
  return slugs;
}
