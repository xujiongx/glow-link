"use client";

import { useEffect, useState } from "react";

import { BlackHoleBackground } from "./components/BlackHoleBackground";
import { SiteChrome } from "./components/SiteChrome";
import { GlowInkPage } from "./pages/GlowInkPage";
import { HomePage } from "./pages/HomePage";
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

  const isHome = route === "home";

  return (
    <div className={`shell shell-${route}`}>
      {isHome ? <BlackHoleBackground /> : null}
      {isHome ? <SiteChrome route={route} /> : null}
      {isHome ? <HomePage /> : <GlowInkPage />}
    </div>
  );
}
