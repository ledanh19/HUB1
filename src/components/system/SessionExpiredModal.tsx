/**
 * SessionExpiredModal — Global Session Expired Notification
 * 
 * Rendered ONCE at app level (inside AuthProvider).
 * Listens to sessionManager 'session:expired' event.
 * Shows modal with redirect to /auth?reason=expired.
 * 
 * No per-page alert handling needed.
 * 
 * @author Session Reliability V1
 */

import { useEffect, useState } from 'react';
import { sessionManager } from '@/auth/sessionManager';
import { SESSION_RECOVERY_V1 } from '@/auth/featureFlags';
import { LogIn, ShieldAlert } from 'lucide-react';

export function SessionExpiredModal() {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (!SESSION_RECOVERY_V1) return;

        const handleExpired = () => {
            // Do not show session-expired modal on public pages
            // These pages should be fully accessible without any session
            const publicPaths = ['/about', '/privacy-policy', '/terms', '/auth', '/docs', '/403'];
            const currentPath = window.location.pathname;
            if (publicPaths.some(p => currentPath === p || currentPath.startsWith(p + '/'))) {
                return;
            }
            setIsOpen(true);
        };

        sessionManager.addEventListener('session:expired', handleExpired);

        return () => {
            sessionManager.removeEventListener('session:expired', handleExpired);
        };
    }, []);

    const handleLogin = () => {
        setIsOpen(false);
        window.location.href = '/auth?reason=expired';
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 animate-fade-in">
            <div className="rounded-xl bg-card border border-border shadow-2xl px-6 py-6 max-w-sm mx-4 animate-scale-in">
                <div className="flex flex-col items-center gap-4 text-center">
                    {/* Icon */}
                    <div className="h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <ShieldAlert className="h-6 w-6 text-amber-500" />
                    </div>

                    {/* Title */}
                    <div>
                        <h3 className="text-base font-semibold text-foreground">
                            Phiên đăng nhập đã hết hạn
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            Vui lòng đăng nhập lại để tiếp tục sử dụng.
                        </p>
                    </div>

                    {/* Action */}
                    <button
                        onClick={handleLogin}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                        <LogIn className="h-4 w-4" />
                        Đăng nhập lại
                    </button>
                </div>
            </div>
        </div>
    );
}
