import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // 개발 중에는 프론트가 같은 오리진으로 API를 호출하게 해 CORS 설정을 미루고,
    // 배포 시 API 컨테이너가 정적 빌드를 서빙하는 구성과 동일한 경로를 쓰게 한다.
    proxy: {
      '/api': { target: process.env.API_ORIGIN ?? 'http://localhost:8080', changeOrigin: true },
    },
  },
});
