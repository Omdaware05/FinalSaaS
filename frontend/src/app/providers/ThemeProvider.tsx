import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

/** Interface "look": 'classic' is the original glass/dark design system;
 * 'modern' is the clean light design (solid white cards, soft shadows,
 * pill controls — see styles/modern.css). The look is applied as
 * data-look on <html>; modern always resolves to the light scheme. */
export type Look = 'classic' | 'modern';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  look: Look;
  setLook: (look: Look) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('voxora_theme') as Theme | null;
    return saved || 'dark'; // default to modern dark theme
  });

  const [look, setLook] = useState<Look>(() => {
    const saved = localStorage.getItem('voxora_look') as Look | null;
    return saved === 'modern' ? 'modern' : 'classic';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    root.dataset.look = look;
    localStorage.setItem('voxora_look', look);

    const updateResolved = () => {
      let isDark = false;
      if (look === 'modern') {
        isDark = false; // the modern look is a light design, always
      } else if (theme === 'system') {
        isDark = mediaQuery.matches;
      } else {
        isDark = theme === 'dark';
      }

      setResolvedTheme(isDark ? 'dark' : 'light');
      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    updateResolved();
    localStorage.setItem('voxora_theme', theme);

    const listener = () => {
      if (theme === 'system') updateResolved();
    };

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [theme, look]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme, look, setLook }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
