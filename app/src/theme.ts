/**
 * Godeez brand tokens — single source of truth for the native app.
 * Mirrors web-preview/index.html. Yellow owns the chrome (header/badges/mascot),
 * never the map. Sky-blue = movement (route lines + live bus chips). Semantics:
 * green = go-now, amber = heads-up, grey = later. Service-type tint: trunk = sky,
 * feeder = teal (teal deliberately ≠ go-now green, so the two greens never clash).
 */
export const colors = {
  yellow: "#FFC93C",
  yellowPress: "#F0B92E",
  cream: "#FFF8EC",
  card: "#FFFFFF",
  ink: "#3A2F28",
  amberInk: "#5C4708",
  muted: "#9A8B72",
  faint: "#B8A98E",
  line: "#F0E8D6",
  line2: "#F5EEDD",
  sky: "#3E9BD6", // trunk + movement
  teal: "#1B9E8A", // feeder
  go: "#1F6B3A",
  goBg: "#E6F4EA",
  goBorder: "#A5D6A7",
  soon: "#C77B1E",
  soonBg: "#FBEFD8",
  soonBorder: "#F0C36B",
  later: "#7A6E5E",
  laterBg: "#F0E8D6",
  laterBorder: "#E6DCC4",
  chip: "#FFF1D6",
} as const;

export type ServiceType = "trunk" | "feeder";

export function serviceColor(t?: ServiceType): string {
  return t === "feeder" ? colors.teal : colors.sky;
}

/**
 * Brand arrival semantics from minutes-to-arrival.
 * ≤5 = go-now (green), 6–15 = heads-up (amber), >15 = later (grey).
 */
export function arrivalSemantic(diffMin: number): {
  key: "arriving" | "soon" | "later";
  label: string;
  color: string;
  bg: string;
} {
  if (diffMin <= 5)
    return { key: "arriving", label: diffMin <= 0 ? "Go now" : "Go now", color: colors.go, bg: colors.goBg };
  if (diffMin <= 15) return { key: "soon", label: "Get ready", color: colors.soon, bg: colors.soonBg };
  return { key: "later", label: "Next bus", color: colors.later, bg: colors.laterBg };
}
