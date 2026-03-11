import { useState } from 'react';
import { Tag, Plus, X, Settings, Star, AlertTriangle, Shield, MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ConversationTag {
  id: string;
  label: string;
  color: string;
  icon: 'star' | 'alert' | 'shield' | 'message' | 'tag';
}

// Default available tags - in production, this would come from settings/database
const DEFAULT_TAGS: ConversationTag[] = [
  { id: 'vip', label: 'VIP', color: 'bg-warning/10 text-warning border-warning/20', icon: 'star' },
  { id: 'urgent', label: 'Cần xử lý gấp', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: 'alert' },
  { id: 'dispute', label: 'Tranh chấp', color: 'bg-primary/10 text-primary border-primary/20', icon: 'shield' },
  { id: 'followup', label: 'Theo dõi', color: 'bg-info/10 text-info border-info/20', icon: 'message' },
];

const ICON_MAP = {
  star: Star,
  alert: AlertTriangle,
  shield: Shield,
  message: MessageCircle,
  tag: Tag,
};

interface ConversationTagsProps {
  conversationId: string;
}

export function ConversationTags({ conversationId }: ConversationTagsProps) {
  // In production, this would be fetched from database
  const [appliedTags, setAppliedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<ConversationTag[]>(DEFAULT_TAGS);
  const [showSettings, setShowSettings] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState('');

  const toggleTag = (tagId: string) => {
    setAppliedTags(prev => {
      if (prev.includes(tagId)) {
        toast.success('Đã xóa tag');
        return prev.filter(id => id !== tagId);
      } else {
        toast.success('Đã gắn tag');
        return [...prev, tagId];
      }
    });
  };

  const removeTag = (tagId: string) => {
    setAppliedTags(prev => prev.filter(id => id !== tagId));
    toast.success('Đã xóa tag');
  };

  const addNewTag = () => {
    if (!newTagLabel.trim()) return;
    
    const newTag: ConversationTag = {
      id: `custom-${Date.now()}`,
      label: newTagLabel.trim(),
      color: 'bg-muted text-muted-foreground border-border',
      icon: 'tag',
    };
    
    setAvailableTags(prev => [...prev, newTag]);
    setNewTagLabel('');
    toast.success('Đã thêm tag mới');
  };

  const removeTagFromSettings = (tagId: string) => {
    // Don't allow removing default tags
    if (['vip', 'urgent', 'dispute', 'followup'].includes(tagId)) {
      toast.error('Không thể xóa tag mặc định');
      return;
    }
    setAvailableTags(prev => prev.filter(t => t.id !== tagId));
    setAppliedTags(prev => prev.filter(id => id !== tagId));
    toast.success('Đã xóa tag');
  };

  const appliedTagObjects = availableTags.filter(t => appliedTags.includes(t.id));
  const unappliedTags = availableTags.filter(t => !appliedTags.includes(t.id));

  return (
    <>
      {/* Applied Tags */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {appliedTagObjects.map(tag => {
          const IconComponent = ICON_MAP[tag.icon];
          return (
            <Badge 
              key={tag.id} 
              variant="outline" 
              className={cn("text-xs group cursor-pointer", tag.color)}
              onClick={() => removeTag(tag.id)}
            >
              <IconComponent className="h-3 w-3 mr-1" />
              {tag.label}
              <X className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Badge>
          );
        })}

        {/* Add Tag Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground">
              <Plus className="h-3 w-3 mr-1" />
              Thêm tag
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48 bg-background">
            <DropdownMenuLabel className="text-xs">Chọn tag</DropdownMenuLabel>
            <DropdownMenuSeparator />
            
            {unappliedTags.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                Đã gắn tất cả tags
              </div>
            ) : (
              unappliedTags.map(tag => {
                const IconComponent = ICON_MAP[tag.icon];
                return (
                  <DropdownMenuItem 
                    key={tag.id} 
                    onClick={() => toggleTag(tag.id)}
                    className="cursor-pointer"
                  >
                    <IconComponent className="h-3.5 w-3.5 mr-2" />
                    {tag.label}
                  </DropdownMenuItem>
                );
              })
            )}
            
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => setShowSettings(true)}
              className="cursor-pointer text-muted-foreground"
            >
              <Settings className="h-3.5 w-3.5 mr-2" />
              Cài đặt tags
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cài đặt Tags</DialogTitle>
            <DialogDescription>
              Quản lý danh sách tags có thể gắn cho hội thoại
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add new tag */}
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="new-tag" className="sr-only">Tag mới</Label>
                <Input
                  id="new-tag"
                  placeholder="Nhập tên tag mới..."
                  value={newTagLabel}
                  onChange={e => setNewTagLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addNewTag()}
                />
              </div>
              <Button onClick={addNewTag} disabled={!newTagLabel.trim()}>
                <Plus className="h-4 w-4 mr-1" />
                Thêm
              </Button>
            </div>

            {/* Existing tags */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Tags hiện có</Label>
              <div className="border rounded-lg divide-y max-h-[300px] overflow-auto">
                {availableTags.map(tag => {
                  const IconComponent = ICON_MAP[tag.icon];
                  const isDefault = ['vip', 'urgent', 'dispute', 'followup'].includes(tag.id);
                  
                  return (
                    <div key={tag.id} className="flex items-center justify-between p-2.5">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("text-xs", tag.color)}>
                          <IconComponent className="h-3 w-3 mr-1" />
                          {tag.label}
                        </Badge>
                        {isDefault && (
                          <span className="text-xs text-muted-foreground">(Mặc định)</span>
                        )}
                      </div>
                      {!isDefault && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeTagFromSettings(tag.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
