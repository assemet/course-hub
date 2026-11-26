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
