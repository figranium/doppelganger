/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                bg: '#020202',
                panel: 'rgba(10, 10, 10, 0.85)',
                border: 'rgba(255, 255, 255, 0.08)',
                accent: '#ffffff',
            },
            fontFamily: {
                sans: ['Geologica', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace'],
            },
        },
    },
    plugins: [],
}
