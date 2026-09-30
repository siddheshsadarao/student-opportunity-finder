import { createContext, useContext, useEffect, useMemo, useState } from 'react';

// Versioned so visitors who inherited the old system-based default start in light mode.
const STORAGE_KEY = 'sof_theme_v2';
const ThemeContext = createContext(null);

function resolveTheme(preference) {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(() => localStorage.getItem(STORAGE_KEY) || 'light');
  const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(preference));

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const next = resolveTheme(preference);
      document.documentElement.classList.toggle('dark', next === 'dark');
      document.documentElement.style.colorScheme = next;
      setResolvedTheme(next);
    };

    localStorage.setItem(STORAGE_KEY, preference);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);

  const value = useMemo(
    () => ({
      preference,
      resolvedTheme,
      setPreference,
      toggleTheme: () => setPreference(resolvedTheme === 'dark' ? 'light' : 'dark'),
    }),
    [preference, resolvedTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
