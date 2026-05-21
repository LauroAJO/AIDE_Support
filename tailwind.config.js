/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}'
  ],
  theme: {
    extend: {
      colors: {
        base: '#FAF8F5',      // warm off-white background
        surface: '#FFFFFF',   // cards, sidebar, header
        surface2: '#F3F0EB',  // hover states, subtle backgrounds
        line: '#E8E3DB',      // borders
        ink: '#1A1814',       // text primary
        ink2: '#6B6560',      // text secondary
        muted: '#9E9890',     // text muted
        accent: {
          DEFAULT: '#6366f1',
          hover: '#4F52D3'
        },
        danger: '#DC2626'
      },
      boxShadow: {
        soft: '0 4px 12px rgba(0,0,0,0.06)'
      }
    }
  },
  plugins: []
}
