import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// The app is served under /sales/ on the same domain as the Twenty server in
// production (avoids CORS entirely); in dev it proxies API calls to the
// target in SALES_API_TARGET (.env.local) — the local twenty-server by
// default, or the live CRM for testing against real data.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // real environment wins over .env.local so a second server can target
  // a different API (e.g. local dev) without touching the file
  const apiTarget =
    process.env.SALES_API_TARGET ?? env.SALES_API_TARGET ?? 'http://localhost:3010';
  const proxyEntry = {
    target: apiTarget,
    changeOrigin: true,
    secure: true,
  };

  return {
    base: '/sales/',
    plugins: [react()],
    server: {
      port: 3012,
      proxy: {
        '/graphql': proxyEntry,
        '/metadata': proxyEntry,
        '/rest': proxyEntry,
        '/public': proxyEntry,
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});
