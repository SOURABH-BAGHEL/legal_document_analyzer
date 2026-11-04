import { Suspense, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Navbar } from "../components/Navbar";
import { NAV_ITEMS, Sidebar } from "../components/Sidebar";
import { cx } from "../components/Badges";
import { LoadingState } from "../components/States";

const COLLAPSE_KEY = "lda.sidebar.collapsed";

function pageTitle(pathname: string): string {
  if (pathname.startsWith("/analysis/")) return "Analysis Results";
  const match = NAV_ITEMS.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)));
  return match?.label ?? "Legal Document Analyzer";
}

export function AppLayout() {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.title = `${pageTitle(pathname)} · Legal Document Analyzer`;
    window.scrollTo(0, 0);
  }, [pathname]);

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !c;
    });

  return (
    <div className="min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={toggle} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className={cx("transition-[padding] duration-[250ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none", collapsed ? "lg:pl-[76px]" : "lg:pl-64")}>
        <Navbar title={pageTitle(pathname)} onOpenMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
          <Suspense fallback={<LoadingState />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
