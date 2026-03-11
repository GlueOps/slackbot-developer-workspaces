/**
 * Date formatting utilities for user-facing VM timestamps.
 * Stored format: ISO 8601 UTC (e.g. "2026-03-11T03:25:17.616Z")
 * Display format: "2026-03-11 03:25 UTC (Created 2 days, 14 minutes ago)"
 */

/**
 * Returns a friendly age string like "Created 2 days, 14 minutes ago"
 */
export function formatFriendlyAge(isoString) {
  if (!isoString) return null;

  const created = new Date(isoString);
  if (isNaN(created.getTime())) return null;

  const now = new Date();
  let diffMs = now - created;
  if (diffMs < 0) diffMs = 0;

  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const parts = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  const remainingHours = hours % 24;
  if (remainingHours > 0) parts.push(`${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes > 0 || parts.length === 0) {
    parts.push(`${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`);
  }

  // Show at most 2 most significant parts
  return `Created ${parts.slice(0, 2).join(', ')} ago`;
}

/**
 * Returns a full formatted date string like "2026-03-11 03:25 UTC (Created 2 days, 14 minutes ago)"
 * Falls back to "Unknown" if the date is missing or invalid.
 */
export function formatCreatedDate(isoString) {
  if (!isoString) return 'Unknown';

  const created = new Date(isoString);
  if (isNaN(created.getTime())) return 'Unknown';

  const yyyy = created.getUTCFullYear();
  const mm = String(created.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(created.getUTCDate()).padStart(2, '0');
  const hh = String(created.getUTCHours()).padStart(2, '0');
  const min = String(created.getUTCMinutes()).padStart(2, '0');

  const dateStr = `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
  const friendly = formatFriendlyAge(isoString);

  return friendly ? `${dateStr} (${friendly})` : dateStr;
}

/**
 * Sort comparator for servers by created_at ascending (oldest first, newest last).
 * Servers without created_at sort to the top.
 */
export function sortByCreatedAtAsc(a, b) {
  const aDate = a.tags?.created_at || '';
  const bDate = b.tags?.created_at || '';
  if (!aDate && !bDate) return 0;
  if (!aDate) return -1;
  if (!bDate) return 1;
  return aDate.localeCompare(bDate);
}
