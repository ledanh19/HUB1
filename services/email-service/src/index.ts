/**
 * Email Service – Express Server Entry
 * ═══════════════════════════════════════════════════════════
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config';
import oauthRoutes from './routes/oauth';
import threadRoutes from './routes/threads';
import replyRoutes from './routes/reply';
import syncRoutes from './routes/sync';
import { requireAuth } from './middleware/auth';
import { startSyncScheduler } from './workers/syncWorker';

const app = express();

// ─── Security ───────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// ─── Logging (NEVER log tokens) ────────────────────────────
app.use(morgan(':method :url :status :response-time ms'));

// ─── Health Check ───────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'email-service', timestamp: new Date().toISOString() });
});

// ─── Routes ─────────────────────────────────────────────────
app.use('/email', oauthRoutes);              // /email/gmail/connect, /email/gmail/callback, /email/accounts, /email/accounts/:id/disconnect
app.use('/email/threads', requireAuth, threadRoutes);  // /email/threads, /email/threads/:id
app.use('/email/threads', requireAuth, replyRoutes);   // /email/threads/:threadId/reply
app.use('/email/sync', requireAuth, syncRoutes);       // /email/sync/:accountId

// ─── Start ──────────────────────────────────────────────────
const port = Number(env.PORT);
app.listen(port, () => {
  console.log(`🚀 Email service running on port ${port}`);
  console.log(`   Frontend: ${env.FRONTEND_URL}`);
  console.log(`   OAuth callback: ${env.GOOGLE_REDIRECT_URI}`);

  // Start background sync scheduler
  startSyncScheduler();
});

export default app;
