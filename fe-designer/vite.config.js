export default {
  server: {
    host: '0.0.0.0',
    port: 4200,
    strictPort: true,
    hmr: {
      clientPort: 4200,
    },
    // Allow all Replit hosts
    allowedHosts: [
      '.replit.dev',
      '.riker.replit.dev',
      'bbfbbad3-45a5-478d-a573-7d48649adf38-00-2p1jsae09o3lq.riker.replit.dev'
    ],
  },
};
