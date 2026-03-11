import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('4100'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().url(),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_JWT_SECRET: z.string().min(20),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().min(5),
  GOOGLE_CLIENT_SECRET: z.string().min(5),
  GOOGLE_REDIRECT_URI: z.string().url(),

  // AES-256-GCM key (64 hex chars = 32 bytes)
  TOKEN_ENCRYPTION_KEY: z.string().length(64),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  // Load .env if not in production (tsx auto-loads, but just in case)
  if (process.env.NODE_ENV !== 'production') {
    try {
      const { config } = require('dotenv');
      config({ path: '.env' });
    } catch { /* dotenv optional */ }
  }
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
