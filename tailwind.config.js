/** @type {import('tailwindcss').Config} */
// Palette colors read CSS variables defined in src/index.css, so the same
// classes render correctly in light and dark themes (see src/lib/theme.tsx).
const scale = (name) =>
  Object.fromEntries(
    ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'].map((shade) => [
      shade,
      `rgb(var(--c-${name}-${shade}) / <alpha-value>)`,
    ])
  );

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // `dark:` variants follow the class set by src/lib/theme.tsx, not the OS.
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', 'system-ui', '-apple-system', '"Segoe UI"', 'Tahoma', 'sans-serif'],
      },
      keyframes: {
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'pop-in': { '0%': { opacity: '0', transform: 'scale(0.85)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        'confetti-fall': {
          '0%': { transform: 'translateY(0) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(105vh) rotate(720deg)', opacity: '0.9' },
        },
      },
      animation: {
        'sheet-up': 'sheet-up 0.25s ease-out',
        'pop-in': 'pop-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'confetti-fall': 'confetti-fall 3s ease-in forwards',
      },
      colors: {
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        slate: scale('slate'),
        blue: scale('blue'),
        red: scale('red'),
        green: scale('green'),
        orange: scale('orange'),
        amber: scale('amber'),
        purple: scale('purple'),
        teal: scale('teal'),
        sky: scale('sky'),
      },
    },
  },
  plugins: [],
};
