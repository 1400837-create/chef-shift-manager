/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        urgent: '#dc2626',
        warn: '#eab308',
        ok: '#16a34a',
      },
    },
  },
  plugins: [],
}
