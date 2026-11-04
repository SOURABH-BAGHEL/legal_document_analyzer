import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./Badges";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  icon?: ReactNode;
  /** Small right-aligned detail, such as a count. */
  meta?: ReactNode;
}

interface Props<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  /** Links an external <label htmlFor>. Otherwise pass ariaLabel. */
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

const EDGE_GAP = 8;

/** Styled dropdown following the ARIA select-only combobox pattern: focus stays on the trigger. */
export function Select<T extends string>({ value, onChange, options, id, ariaLabel, disabled, className }: Props<T>) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState({ up: false, right: false });
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex];

  const openMenu = useCallback((index = selectedIndex) => {
    setActive(index);
    setOpen(true);
  }, [selectedIndex]);

  const choose = (index: number) => {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  // Flip the menu when it would run off the bottom or right edge of the screen.
  useLayoutEffect(() => {
    if (!open || !rootRef.current || !listRef.current) return;
    const trigger = rootRef.current.getBoundingClientRect();
    const below = window.innerHeight - trigger.bottom;
    setPlacement({
      up: below < listRef.current.offsetHeight + EDGE_GAP && trigger.top > below,
      right: trigger.left + listRef.current.offsetWidth > window.innerWidth - EDGE_GAP,
    });
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${uid}-option-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, uid]);

  const typeahead = (char: string) => {
    const now = Date.now();
    const text = now - typed.current.at > 600 ? char : typed.current.text + char;
    typed.current = { text, at: now };
    const match = options.findIndex((o) => o.label.toLowerCase().startsWith(text.toLowerCase()));
    if (match >= 0) openMenu(match);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
      typeahead(e.key);
      return;
    }
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    const last = options.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(active + 1, last),
      ArrowUp: Math.max(active - 1, 0),
      Home: 0,
      End: last,
    };
    if (e.key in moves) {
      e.preventDefault();
      setActive(moves[e.key]);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Tab") {
      choose(active);
    }
  };

  return (
    <div ref={rootRef} className={cx("relative", className)}>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${uid}-list`}
        aria-activedescendant={open ? `${uid}-option-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={cx(
          "input flex items-center gap-2.5 text-left transition-[border-color,box-shadow] hover:border-navy-300 disabled:cursor-not-allowed disabled:opacity-60",
          open && "border-accent-500 ring-2 ring-accent-100",
        )}
      >
        {selected?.icon && <span className="grid size-4 shrink-0 place-items-center">{selected.icon}</span>}
        <span className="min-w-0 flex-1 truncate font-medium">{selected?.label}</span>
        <ChevronDown className={cx("size-4 shrink-0 text-slate-400 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180 text-accent-600")} aria-hidden />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={`${uid}-list`}
          role="listbox"
          aria-label={ariaLabel}
          className={cx(
            "menu-pop absolute z-30 max-h-80 w-max max-w-[min(24rem,calc(100vw-2rem))] min-w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-menu",
            placement.up ? "bottom-full mb-2 origin-bottom" : "top-full mt-2 origin-top",
            placement.right && "right-0",
          )}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                id={`${uid}-option-${index}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(index)}
                className={cx(
                  "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors duration-100",
                  index === active ? "bg-navy-50" : "bg-transparent",
                )}
              >
                {option.icon && (
                  <span className={cx("grid shrink-0 place-items-center", option.description ? "size-8 rounded-lg bg-white ring-1 ring-slate-200" : "size-4")}>
                    {option.icon}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className={cx("block truncate", isSelected ? "font-semibold text-navy-900" : "font-medium text-slate-700")}>{option.label}</span>
                  {option.description && <span className="block text-xs text-slate-500">{option.description}</span>}
                </span>
                {option.meta && <span className="shrink-0 text-xs text-slate-500 tabular-nums">{option.meta}</span>}
                <Check className={cx("size-4 shrink-0 text-accent-600", !isSelected && "invisible")} aria-hidden />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
