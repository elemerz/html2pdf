import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 4200,
    strictPort: true,
    hmr: {
      clientPort: 4200,
    },
    // Allow all hosts for Replit's dynamic URLs
    allowedHosts: ['.replit.dev', '.riker.replit.dev'],
  },
});
