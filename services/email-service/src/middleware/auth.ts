/**
 * Auth Middleware – verify Supabase JWT + extract user context
 * ═══════════════════════════════════════════════════════════
 * ARCHITECTURE: Shared workspace with RBAC.
 * Email Module is NOT personal inbox – access is role-based.
 * JWT `sub` → userId, app role fetched from user_roles table.
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config';
import { serviceSupabase } from '../lib/supabase';

export interface AuthContext {
  userId: string;
  email: string;
  jwtRole: string;         // Supabase JWT role ('authenticated')
  appRole: string | null;  // App-level role from user_roles table
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Verify JWT and extract user identity + app role.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, env.SUPABASE_JWT_SECRET, {
      algorithms: ['HS256'],
    }) as Record<string, unknown>;

    const userId = decoded.sub as string;
    const email = decoded.email as string;
    const jwtRole = (decoded.role as string) ?? 'authenticated';

    if (!userId) {
      res.status(403).json({ error: 'Invalid token claims: missing sub' });
      return;
    }

    // Fetch app-level role from user_roles via get_user_role RPC
    const { data: appRole } = await serviceSupabase
      .rpc('get_user_role', { _user_id: userId });

    req.auth = {
      userId,
      email,
      jwtRole,
      appRole: (appRole as string) ?? null,
    };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── Role-based permission guards ───────────────────────────

/**
 * Middleware factory: require the user to have one of the specified app roles.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth?.appRole || !allowedRoles.includes(req.auth.appRole)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

// ─── Email permission presets ───────────────────────────────

/** Roles that can VIEW email data (inbox, threads, accounts list) */
export const EMAIL_VIEW_ROLES = ['admin', 'super_admin', 'cskh', 'sale'] as const;

/** Roles that can REPLY to emails */
export const EMAIL_REPLY_ROLES = ['admin', 'super_admin', 'cskh'] as const;

/** Roles that can MANAGE accounts (connect, disconnect, sync) */
export const EMAIL_MANAGE_ROLES = ['admin', 'super_admin'] as const;

export const requireEmailView = requireRole(...EMAIL_VIEW_ROLES);
export const requireEmailReply = requireRole(...EMAIL_REPLY_ROLES);
export const requireEmailManage = requireRole(...EMAIL_MANAGE_ROLES);
