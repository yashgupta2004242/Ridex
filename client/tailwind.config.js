/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#11201A',
        paper: '#F4F6F2',
        surface: '#FFFFFF',
        milestone: '#1F6F4A',
        kerb: '#D7DCD3',
        signal: '#E4572E',
        night: '#0B1512',
      },
      fontFamily: {
        display: ['Archivo', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        input: '4px',
        card: '12px',
        action: '999px',
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        dash: {
          to: { strokeDashoffset: '-50' },
        },
        glide: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      animation: {
        rise: 'rise 700ms ease-out both',
        dash: 'dash 1.6s linear infinite',
        glide: 'glide 3.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
