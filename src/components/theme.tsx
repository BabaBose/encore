'use client';

import { useEffect, useState } from 'react';

const KEY = 'booktheact-theme';

/**
 * Applied before paint, so a returning visitor never sees the wrong theme
 * flash. It has to be inline for that reason — a module would arrive too late.
 *
 * Dark is the default. The design was drawn on a dark canvas and the light
 * theme is the alternate, so the system preference does not get a vote until
 * someone picks a theme here; after that their choice is what sticks.
 */
export function ThemeScript() {
  const script = `(function(){try{var t=localStorage.getItem('${KEY}');document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:'dark';}catch(e){document.documentElement.dataset.theme='dark';}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

/** Both themes were designed, so the visitor gets to pick between them. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as 'dark' | 'light') ?? 'dark');
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode — the choice simply will not persist */
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn--sm"
      style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 50, borderRadius: 999 }}
      aria-label={`Switch to the ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}
