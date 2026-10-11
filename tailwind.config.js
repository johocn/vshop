/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  corePlugins: {
    // Taro H5 端有默认样式，preflight 若启用会与小程序内置样式打架
    preflight: false,
  },
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        gold: {
          1: '#C89B3C',
          2: '#E0B95F',
          3: '#8A6A24',
        },
        ink: {
          deep: '#1C1613',
          panel: '#2A211B',
          light: '#F2EBE0',
        },
        inkText: {
          1: '#F5EFE6',
          2: '#C9BFB2',
          dark: '#3A2F27',
        },
        func: {
          success: '#4F8F7D',
          warn: '#C0522F',
        },
      },
      fontFamily: {
        sans: ['PingFang SC', 'Helvetica Neue', 'Helvetica', 'sans-serif'],
      },
      borderRadius: {
        card: '16px',
        pill: '999px',
        btn: '12px',
      },
      boxShadow: {
        atelier: '0 8px 24px rgba(0, 0, 0, 0.28)',
        bead: '0 12px 28px rgba(0, 0, 0, 0.35)',
      },
      keyframes: {
        dropIn: {
          '0%': { opacity: '0', transform: 'translateY(-6px) scale(0.85)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        pulseGold: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(200, 155, 60, 0.55)' },
          '50%': { boxShadow: '0 0 0 8px rgba(200, 155, 60, 0)' },
        },
      },
      animation: {
        dropIn: 'dropIn 260ms cubic-bezier(.22,.9,.3,1) both',
        pulseGold: 'pulseGold 900ms ease-out',
      },
      transitionTimingFunction: {
        param: 'cubic-bezier(.22,.9,.3,1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
