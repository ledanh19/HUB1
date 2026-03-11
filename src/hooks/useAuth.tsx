import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, safeRpc } from "@/integrations/supabase";
import { queryClient } from "@/lib/queryClient";

type AppRole = 'admin' | 'sale' | 'cskh' | 'ke_toan' | 'super_admin' | 'ota_staff' | 'ota_lead';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Defer role fetching
        if (session?.user) {
          setTimeout(() => {
            fetchUserRole(session.user.id);
          }, 0);
        } else {
          setUserRole(null);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRole(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRole = async (userId: string) => {
    try {
      // Use backend function to avoid any RLS or query issues
      const { data, error } = await safeRpc(() => supabase.rpc('get_user_role', { _user_id: userId }));

      if (error) {
        console.error('Error fetching user role via RPC:', error.message);
        return;
      }

      if (data) {
        setUserRole(data as AppRole);
      }
    } catch (err) {
      console.error('Error fetching user role:', err);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    return { error };
  };

  const signOut = async () => {
    // Capture current user ID BEFORE any async call
    const currentUserId = user?.id;

    try {
      await supabase.auth.signOut();
    } finally {
      // Always runs — even if signOut throws or network fails

      // Clear namespaced (v1) + legacy (R1/R2) notification keys
      if (currentUserId) {
        // v1 namespaced keys
        localStorage.removeItem(`rrch:v1:notification_last_read_at:${currentUserId}`);
        localStorage.removeItem(`rrch:v1:pwa_notifications:${currentUserId}`);
        localStorage.removeItem(`rrch:v1:pwa_notifications_last_read:${currentUserId}`);
        // R1/R2 legacy per-user keys
        localStorage.removeItem(`notification_last_read_at_${currentUserId}`);
        localStorage.removeItem(`roomrise_notifications_${currentUserId}`);
        localStorage.removeItem(`roomrise_notifications_last_read_${currentUserId}`);
      }
      // Shared/anon legacy keys
      localStorage.removeItem('notification_last_read_at');
      localStorage.removeItem('roomrise_notifications');
      localStorage.removeItem('roomrise_notifications_last_read');
      localStorage.removeItem('notification_last_read_at_anon');
      localStorage.removeItem('roomrise_notifications_anon');
      localStorage.removeItem('roomrise_notifications_last_read_anon');

      // Targeted removal: only notification-related queries
      queryClient.removeQueries({ queryKey: ["notification-messages"], exact: false });
      queryClient.removeQueries({ queryKey: ["notification-booking-changes"], exact: false });
      queryClient.removeQueries({ queryKey: ["notification-bookings-info"], exact: false });

      setUser(null);
      setSession(null);
      setUserRole(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, userRole, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// =====================================================
// PERMISSION HELPERS
// Per user spec - FOH (cskh/sale) restrictions:
// ✔ Check-in / Check-out
// ✔ Thu tiền theo rule
// ❌ Không sửa cost host
// ❌ Không quyết toán
// ❌ Không refund deposit đã applied
// =====================================================

export function usePermissions() {
  const { userRole } = useAuth();

  // FOH roles = cskh and sale (Front of House operations)
  const isFoh = userRole === 'cskh' || userRole === 'sale';
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  const isKeToan = userRole === 'ke_toan';
  const isFinanceRole = isAdmin || isKeToan;

  return {
    userRole,
    isFoh,
    isAdmin,
    isKeToan,
    isFinanceRole,

    // FOH allowed actions
    canCheckInOut: true, // Everyone can check-in/out
    canCollectPayment: true, // Everyone can collect (with OTA_COLLECT restrictions)

    // Finance-only actions
    canEditHostCost: isFinanceRole,
    canCreateSettlement: isFinanceRole,
    canFinalizeSettlement: isAdmin,
    canApplyDeposit: isFinanceRole,
    canRefundDeposit: isAdmin, // Only admin can refund applied deposits
    canCreateAdjustment: isFinanceRole,
    canApproveAdjustment: isAdmin,

    // Admin-only
    canDeleteRecords: isAdmin,
    canAccessReports: isFinanceRole || isAdmin,
  };
}
