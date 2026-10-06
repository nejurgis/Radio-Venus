// ── Date reliability ────────────────────────────────────────────────────────
// 'exact'       — a real, specific date: a birthday, or a group's debut release.
// 'approximate' — a placeholder (year only, or the Jan 1 / Jun 15 / mid-month
//                 stand-ins lookups write for partial dates) or a stand-in
//                 release date.
// An entry's own `dateReliability` wins (use it to mark a real-looking date that
// is only a stand-in, or to vouch for a date that ends on Jan 1/Jun 15).
// Shared by build-db (every artist) and admin-resolve (the add-artist tool);
// the site can show exact dates only via EXACT_DATES_ONLY in src/matcher.js.
export function dateReliability(entry) {
  if (entry.dateReliability === 'exact' || entry.dateReliability === 'approximate') return entry.dateReliability;
  const [, m, d] = (entry.birthDate ?? '').split('-').map(Number);
  if (!m || !d || (m === 1 && d === 1) || (m === 6 && d === 15)) return 'approximate';
  return 'exact';
}
