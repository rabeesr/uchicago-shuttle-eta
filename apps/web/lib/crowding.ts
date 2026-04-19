// Passio's paxLoad field. We don't have firm documentation of the range, but
// observed values are 0–100. Treat as a percentage of bus capacity.
export type Crowding = "empty" | "light" | "medium" | "full" | "unknown";

export function crowdingFromPax(paxLoad: number | null | undefined): Crowding {
  if (paxLoad == null) return "unknown";
  if (paxLoad <= 5) return "empty";
  if (paxLoad <= 40) return "light";
  if (paxLoad <= 75) return "medium";
  return "full";
}

export function crowdingLabel(c: Crowding): string {
  switch (c) {
    case "empty": return "Empty";
    case "light": return "Light";
    case "medium": return "Medium";
    case "full": return "Full";
    default: return "—";
  }
}

export function crowdingColorClass(c: Crowding): string {
  switch (c) {
    case "empty":
    case "light":
      return "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200";
    case "medium":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
    case "full":
      return "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200";
    default:
      return "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-400";
  }
}
