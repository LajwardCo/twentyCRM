import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The app is served under /sales/ on the same domain as the Twenty server in
// production (avoids CORS entirely); in dev it proxies API calls to the local
// twenty-server on :3010.
export default defineConfig({
  base: '/sales/',
  plugins: [react()],
  server: {
    port: 3012,
    proxy: {
      '/graphql': 'http://localhost:3010',
      '/metadata': 'http://localhost:3010',
      '/rest': 'http://localhost:3010',
    },
  },
  build: {
    outDir: 'dist',
  },
});
