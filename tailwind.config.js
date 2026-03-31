/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        lume: {
          bgLight: 'hsl(210, 14%, 96%)',
          surfaceLight: 'hsl(0, 0%, 100%)',
          bgDark: 'hsl(225, 8%, 8%)',
          surfaceDark: 'hsl(225, 8%, 12%)',
          surfaceDarker: 'hsl(225, 8%, 10%)',
          borderLight: 'hsla(210, 14%, 80%, 0.3)',
          borderDark: 'hsla(225, 8%, 100%, 0.04)',
        },
      },
    },
  },
  plugins: [],
};
