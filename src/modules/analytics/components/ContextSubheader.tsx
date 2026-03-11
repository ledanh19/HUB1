/**
 * ContextSubheader Component
 * 
 * Shows the current context mode and property name when in Property Mode.
 * Provides visual indicator of whether user is viewing Portfolio or Property data.
 */

import { Building, LayoutGrid } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ContextMode } from '../types';

interface ContextSubheaderProps {
    mode: ContextMode;
    propertyName: string | null;
    className?: string;
}

export function ContextSubheader({ mode, propertyName, className }: ContextSubheaderProps) {
    if (mode === 'portfolio') {
        return (
            <div className={`flex items-center gap-2 text-sm ${className ?? ''}`}>
                <Badge variant="secondary" className="gap-1.5 px-2.5 py-1 text-xs font-medium">
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Portfolio Mode
                </Badge>
                <span className="text-muted-foreground">Đang xem tổng hợp tất cả chỗ nghỉ</span>
            </div>
        );
    }

    return (
        <div className={`flex items-center gap-2 text-sm ${className ?? ''}`}>
            <Badge variant="default" className="gap-1.5 px-2.5 py-1 text-xs font-medium bg-primary/90">
                <Building className="h-3.5 w-3.5" />
                Property Mode
            </Badge>
            <span className="font-medium text-foreground">{propertyName ?? 'Đang tải...'}</span>
        </div>
    );
}
