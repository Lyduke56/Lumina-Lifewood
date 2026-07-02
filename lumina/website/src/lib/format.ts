// Small relative-time formatter so the sidebar/dashboard can show
// "10:42 AM", "Yesterday", "Monday", "Last week" style labels from
// real created_at timestamps instead of hardcoded strings.
export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  if (diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: "long" });
  }

  if (diffDays < 14) {
    return "Last week";
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}