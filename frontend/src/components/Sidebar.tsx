import { FileStack, FileUp, History, Info, LayoutDashboard, PanelLeftClose, Scale, Settings, X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { projectConfig } from "../config/project";
import { useAppSettings } from "../hooks/useAppSettings";
import { cx } from "./Badges";

export const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/analyze", label: "Analyze Document", icon: FileUp },
  { to: "/documents", label: "My Documents", icon: FileStack },
  { to: "/history", label: "Analysis History", icon: History },
  { to: "/about", label: "About Project", icon: Info },
  { to: "/settings", label: "Settings", icon: Settings },
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

/**
 * The panel keeps one layout in both states. Icons sit at a fixed x (centred in the collapsed
 * width) and only the panel width changes, so labels are clipped and faded instead of removed.
 * Nothing may switch alignment or display on toggle, or items jump before the width animates.
 */
export function Sidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }: Props) {
  const { settings } = useAppSettings();
  const mode = settings?.ai.mode;
  // Labels leave quickly on collapse and return slightly late on expand, once there is room.
  const fade = cx(
    "whitespace-nowrap transition-opacity duration-150 motion-reduce:transition-none",
    collapsed ? "lg:opacity-0" : "lg:delay-100",
  );

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-navy-950/50 lg:hidden" onClick={onCloseMobile} aria-hidden />}
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-hidden bg-navy-950 text-navy-100",
          "transition-[width,translate] duration-[250ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          collapsed ? "lg:w-[76px]" : "lg:w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/5 px-5">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent-500 to-navy-600 shadow-inner ring-1 ring-white/10">
            <Scale className="size-5 text-white" aria-hidden />
          </div>
          <div className={cx("min-w-0 lg:w-44 lg:shrink-0", fade)}>
            <p className="truncate font-serif text-[15px] font-semibold text-white">{projectConfig.shortName}</p>
            <p className="truncate text-[11px] text-navy-300">{projectConfig.tagline}</p>
          </div>
          <button type="button" className="ml-auto rounded-lg p-1.5 text-navy-300 hover:bg-white/5 lg:hidden" onClick={onCloseMobile} aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-3 py-5">
          <p className={cx("overflow-hidden px-3 pb-2 text-[11px] font-semibold tracking-wider text-navy-400 uppercase", fade)}>Workspace</p>
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onCloseMobile}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                cx(
                  "group relative flex items-center gap-3 overflow-hidden rounded-xl py-2.5 pr-3 pl-[17px] text-sm font-medium transition-colors",
                  isActive ? "bg-white/10 text-white" : "text-navy-200 hover:bg-white/5 hover:text-white",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-accent-500" aria-hidden />}
                  <Icon className={cx("size-[18px] shrink-0", isActive ? "text-accent-200" : "text-navy-300 group-hover:text-navy-100")} aria-hidden />
                  <span className={fade}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="shrink-0 space-y-3 border-t border-white/5 p-3">
          {mode && (
            <div className="flex items-center gap-3 rounded-xl bg-white/5 py-2.5 pr-3 pl-[17px] text-xs" title={collapsed ? settings?.ai.message : undefined}>
              <span className="grid size-[18px] shrink-0 place-items-center">
                <span className={cx("size-2 rounded-full", mode === "live" ? "bg-emerald-400" : mode === "demo" ? "bg-violet-400" : "bg-rose-400")} />
              </span>
              <div className={cx("min-w-0 lg:w-44 lg:shrink-0", fade)}>
                <p className="truncate font-medium text-white">
                  {mode === "live" ? "AI provider configured" : mode === "demo" ? "Demo mode" : "AI misconfigured"}
                </p>
                <p className="mt-0.5 truncate text-navy-300">{settings?.ai.model ?? (mode === "demo" ? "Rule-based engine, no AI" : "Check Settings")}</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={onToggle}
            className="hidden w-full items-center gap-3 rounded-xl py-2 pr-3 pl-[17px] text-sm text-navy-300 hover:bg-white/5 hover:text-white lg:flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <PanelLeftClose className={cx("size-[18px] shrink-0 transition-transform duration-[250ms] motion-reduce:transition-none", collapsed && "rotate-180")} aria-hidden />
            <span className={fade}>Collapse</span>
          </button>
        </div>
      </aside>
    </>
  );
}
