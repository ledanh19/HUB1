import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageLoading({ className }: { className?: string }) {
    return (
        <div className={cn("flex min-h-[400px] flex-col items-center justify-center gap-3", className)}>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Đang tải...</p>
        </div>
    );
}
