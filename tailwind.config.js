/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        urgent: '#dc2626',
        warn: '#eab308',
        ok: '#16a34a',
      },
      // Soft, layered shadows (defined as CSS variables in index.css so dark
      // mode can use deeper ones) — every `shadow-*` in the app picks them up.
      boxShadow: {
        sm: 'var(--sh-sm)',
        DEFAULT: 'var(--sh-sm)',
        md: 'var(--sh-md)',
        lg: 'var(--sh-lg)',
        xl: 'var(--sh-xl)',
        '2xl': 'var(--sh-xl)',
        glow: 'var(--sh-orange)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': { from: { opacity: '0', transform: 'translateY(10px) scale(.97)' }, to: { opacity: '1', transform: 'none' } },
        'sheet-in': { from: { transform: 'translateY(40px)', opacity: '.6' }, to: { transform: 'none', opacity: '1' } },
      },
      animation: {
        'fade-up': 'fade-up .34s cubic-bezier(.22,1,.36,1) backwards',
        'fade-in': 'fade-in .25s ease-out backwards',
        'pop-in': 'pop-in .26s cubic-bezier(.22,1,.36,1) backwards',
        'sheet-in': 'sheet-in .32s cubic-bezier(.22,1,.36,1) backwards',
      },
    },
  },
  plugins: [],
}
