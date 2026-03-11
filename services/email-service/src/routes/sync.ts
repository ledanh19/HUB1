/**
 * Sync Route – manual trigger for sync
 * RBAC: only admin/super_admin can trigger sync (requireEmailManage)
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requireEmailManage } from '../middleware/auth';
import { serviceSupabase } from '../lib/supabase';
import { syncAccount } from '../workers/syncWorker';

const router = Router();

/**
 * POST /email/sync/:accountId
 * Manually trigger sync for a specific account.
 */
router.post('/:accountId', requireAuth, requireEmailManage, async (req: Request, res: Response) => {
  const { accountId } = req.params;

  // ── Shared workspace: admin can sync any account ──────────
  const { data: account, error } = await serviceSupabase
    .from('email_accounts')
    .select('id, status')
    .eq('id', accountId)
    .single();

  if (error || !account) {
    return res.status(404).json({ error: 'Account not found' });
  }
  if (account.status !== 'ACTIVE') {
    return res.status(400).json({ error: `Account status is ${account.status}, cannot sync` });
  }

  try {
    await syncAccount(accountId, req.auth!.userId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Sync failed' });
  }
});

export default router;
