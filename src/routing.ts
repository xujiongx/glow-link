export type Route = "home" | "works" | "glow-ink" | "glass-fractal";

export function getRouteFromHash(hash = window.location.hash): Route {
  const path = hash.replace(/^#\/?/, "").replace(/\/$/, "");
  if (path === "works") return "works";
  if (path === "glow-ink") return "glow-ink";
  if (path === "glass-fractal") return "glass-fractal";
  return "home";
}

export function routeToHash(route: Route): string {
  return route === "home" ? "#/" : `#/${route}`;
}

export function navigate(route: Route): void {
  const next = routeToHash(route);
  if (window.location.hash === next) return;
  window.location.hash = next;
}
