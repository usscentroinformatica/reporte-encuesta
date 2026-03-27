/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      boxShadow: {
        '3d-card': '10px 10px 20px rgba(166, 180, 200, 0.4), -10px -10px 20px rgba(255, 255, 255, 0.9), inset 2px 2px 4px rgba(255,255,255,0.8), inset -2px -2px 4px rgba(0,0,0,0.04)',
        '3d-button': '5px 5px 12px rgba(166, 180, 200, 0.4), -5px -5px 12px rgba(255, 255, 255, 0.9)',
        '3d-button-pressed': 'inset 5px 5px 10px rgba(166, 180, 200, 0.5), inset -5px -5px 10px rgba(255, 255, 255, 0.9)',
        '3d-inner': 'inset 4px 4px 8px rgba(166, 180, 200, 0.4), inset -4px -4px 8px rgba(255, 255, 255, 0.9)',
        '3d-dark': '10px 10px 20px rgba(0, 0, 0, 0.4), -5px -5px 15px rgba(255, 255, 255, 0.1), inset 2px 2px 4px rgba(255,255,255,0.2), inset -2px -2px 4px rgba(0,0,0,0.3)',
      },
      colors: {
        'neo-bg': '#e0e5ec',
      }
    },
  },
  plugins: [],
}

