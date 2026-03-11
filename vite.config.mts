import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: Number(process.env.VITE_DEV_PORT || 5173),
        proxy: {
            '/api': `http://localhost:${process.env.VITE_BACKEND_PORT || 11345}`,
            '/scrape': `http://localhost:${process.env.VITE_BACKEND_PORT || 11345}`,
            '/scraper': `http://localhost:${process.env.VITE_BACKEND_PORT || 11345}`,
            '/agent': `http://localhost:${process.env.VITE_BACKEND_PORT || 11345}`,
            '/headful': `http://localhost:${process.env.VITE_BACKEND_PORT || 11345}`,
            '/tasks': `http://localhost:${process.env.VITE_BACKEND_PORT || 11345}`,
            '/screenshots': `http://localhost:${process.env.VITE_BACKEND_PORT || 11345}`,
            '/novnc': `http://localhost:${process.env.VITE_BACKEND_PORT || 11345}`,
            '/websockify': {
                target: `ws://localhost:${process.env.VITE_BACKEND_PORT || 11345}`,
                ws: true,
            },
        },
    },
    build: {
        outDir: 'dist',
        chunkSizeWarningLimit: 800,
    },
});
