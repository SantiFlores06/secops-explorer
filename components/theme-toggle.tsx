"use client";

import { useEffect, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "secops-theme";
const THEME_EVENT = "secops-theme-change";

// Storage can be blocked (private windows, disabled site data): the page works without it.
function readStored(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function writeStored(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not persisted; the choice still applies for this page view.
  }
}

function systemTheme(): Theme {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** The theme on screen: the data-theme attribute when set, otherwise the system choice. */
function currentTheme(): Theme {
  const attribute = document.documentElement.dataset.theme;
  return attribute === "dark" || attribute === "light" ? attribute : systemTheme();
}

function subscribeTheme(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

/** Switches light and dark. Sets data-theme on <html>; no inline script (CSP). */
export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => "light" as Theme);

  // Apply a stored choice once mounted. The event tells the toggle to read it again.
  useEffect(() => {
    const stored = readStored();
    if (!stored) return;
    document.documentElement.dataset.theme = stored;
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    writeStored(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Cambiar al tema claro" : "Cambiar al tema oscuro"}
      className="btn btn-secondary size-11 shrink-0 p-0"
    >
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </button>
  );
}
