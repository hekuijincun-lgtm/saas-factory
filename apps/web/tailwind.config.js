/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#F8FAFC',
          panel: '#0B1220',
          panel2: '#0F172A',
          primary: '#2563EB',
          header: '#475569',
          text: '#0F172A',
          muted: '#64748B',
          border: '#E2E8F0',
        },
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        soft: '0 10px 30px rgba(2,6,23,0.08)',
      },
    },
  },
  plugins: [],
};

