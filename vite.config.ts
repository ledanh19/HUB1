import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  build: {
    // Target modern browsers for smaller bundle
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor: core React + router + state (must stay together)
          'vendor-react': ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', 'zustand'],
          // Vendor: UI framework
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-toast',
          ],
          // Vendor: data layer (no React dependency)
          'vendor-data': ['@supabase/supabase-js'],
          // Vendor: date utilities
          'vendor-date': ['date-fns', 'date-fns-tz'],
          // Vendor: charts (heavy, only Dashboard + Reports)
          'vendor-charts': ['recharts'],
          // Vendor: form + validation
          'vendor-form': ['react-hook-form', '@hookform/resolvers', 'zod'],
        },
      },
    },
  },
}));
