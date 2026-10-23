import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// The dev proxy routes by path exactly like the AWS Application Load Balancer,
// so `VITE_API_BASE_URL=/` works locally against the five services.
const service = (port: number) => ({ target: `http://localhost:${port}`, changeOrigin: false });

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    port: 5173,
    proxy: {
      "/api/search": service(8001),
      "/api/bookings": service(8002),
      "/api/customers": service(8003),
      "/api/documents": service(8004),
    },
  },
});
