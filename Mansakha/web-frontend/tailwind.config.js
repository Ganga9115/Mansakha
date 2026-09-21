/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          // Full ramp re-derived from the sidebar's real navy (900) so every
          // tint/shade shares its hue instead of drifting toward the old,
          // more saturated blue-violet the scale used to be built around.
          50: '#f2f3fa',
          100: '#e2e3f4',
          200: '#c0c2e8',
          300: '#9398d7',
          400: '#5b62c2',
          500: '#3b42a0',
          600: '#2d337b',
          700: '#242861',
          800: '#1e224f',
          900: '#1a1d45', // exact match for the deep sidebar color
          950: '#101128',
        }
      },
      screens: {
        'xs': '475px',
      },
    },
  },
  plugins: [],
}