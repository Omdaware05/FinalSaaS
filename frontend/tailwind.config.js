/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      colors: {
        // Remapped to Orange primary palette per design system
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407',
        },
        surface: {
          light: '#ffffff',
          'light-subtle': '#f8fafc',
          'light-muted': '#f1f5f9',
          dark: 'rgba(18, 18, 20, 0.55)',
          'dark-subtle': 'rgba(22, 22, 26, 0.60)',
          'dark-card': 'rgba(18, 18, 20, 0.55)',
          'dark-elevated': 'rgba(24, 24, 28, 0.65)',
          'dark-glass': 'rgba(18, 18, 20, 0.55)',
          'dark-modal': 'rgba(18, 18, 22, 0.85)',
        },
        // Strict semantic status colors only
        status: {
          success: '#10b981',
          danger: '#ef4444',
          warning: '#f97316',
        }
      },
      backdropBlur: {
        '18': '18px',
        '20': '20px',
        '22': '22px',
      },
      spacing: {
        '18': '4.5rem',
        '20': '5rem',
        '64': '16rem',
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      boxShadow: {
        'subtle-light': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'card-light': '0 2px 8px -2px rgba(0, 0, 0, 0.04), 0 1px 4px -1px rgba(0, 0, 0, 0.02)',
        'card-dark': '0 8px 32px rgba(0, 0, 0, 0.35)',
        'glass-hover': '0 12px 36px -4px rgba(0, 0, 0, 0.55), 0 0 24px -4px rgba(249, 115, 22, 0.12)',
        'glass-glow': '0 0 25px -5px rgba(249, 115, 22, 0.15)',
      }
    },
  },
  plugins: [],
}
