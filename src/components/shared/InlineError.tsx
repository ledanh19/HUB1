import { AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface InlineErrorProps {
    message?: string;
    onRetry?: () => void;
    className?: string;
}

export function InlineError({ message = "Đã có lỗi xảy ra", onRetry, className }: InlineErrorProps) {
    return (
        <div className={cn("flex flex-col items-center gap-2 py-8 text-destructive", className)}>
            <AlertCircle className="h-6 w-6 shrink-0" />
            <span className="text-sm font-medium">{message}</span>
            {onRetry && (
                <Button variant="outline" size="sm" className="mt-2 h-8" onClick={onRetry}>
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    Thử lại
                </Button>
            )}
        </div>
    );
}
