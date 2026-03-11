import { Save, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DraftChangesBarProps {
  changesCount: number;
  onSave: () => void;
  onReset: () => void;
  isSaving?: boolean;
}

export function DraftChangesBar({
  changesCount,
  onSave,
  onReset,
  isSaving,
}: DraftChangesBarProps) {
  if (changesCount === 0) return null;
  
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-4 bg-background border shadow-lg rounded-lg px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-warning/10 text-warning dark:bg-warning ">
            {changesCount} unsaved changes
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            disabled={isSaving}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}
