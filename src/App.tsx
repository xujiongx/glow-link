"use client";

import { useEffect, useState } from "react";

import { BlackHoleBackground } from "./components/BlackHoleBackground";
import { SiteChrome } from "./components/SiteChrome";
import { GlassFractalPage } from "./pages/GlassFractalPage";
import { GlowInkPage } from "./pages/GlowInkPage";
import { HomePage } from "./pages/HomePage";
import { WorksPage } from "./pages/WorksPage";
import { getRouteFromHash, type Route } from "./routing";

export default function App() {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === "undefined" ? "home" : getRouteFromHash()
  );

  useEffect(() => {
    const sync = () => setRoute(getRouteFromHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const showSiteChrome = route === "home" || route === "works";
  const showBlackHole = route === "home" || route === "works";

  let page = <HomePage />;
  if (route === "works") page = <WorksPage />;
  else if (route === "glow-ink") page = <GlowInkPage />;
  else if (route === "glass-fractal") page = <GlassFractalPage />;

  return (
    <div className={`shell shell-${route}`}>
      {showBlackHole ? <BlackHoleBackground /> : null}
      {showSiteChrome ? <SiteChrome route={route} /> : null}
      {page}
    </div>
  );
}
