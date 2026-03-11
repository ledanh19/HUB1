/**
 * CommentsTab - Task discussion and attachments
 * 
 * FEATURES:
 * - Comment list with author info and real-time data
 * - Edit and delete own comments
 * - Add new comment with Ctrl+Enter shortcut
 * - Edited indicator for modified comments
 * - Image attachment support in comments
 */

import React, { useState, useRef, useCallback } from 'react';
import { Send, MoreHorizontal, Loader2, Pencil, Trash2, MessageSquare, AlertCircle, X, Check, ImagePlus, Image as ImageIcon, Clipboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { 
  useTaskComments, 
  useAddTaskComment, 
  useEditTaskComment, 
  useDeleteTaskComment,
  TaskComment 
} from '@/hooks/useOtaOperations';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface CommentsTabProps {
  taskId: string;
  compact?: boolean;
}

// Format relative time
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays < 7) return `${diffDays} ngày trước`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Get initials from name
function getInitials(name: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function CommentsTab({ taskId, compact = false }: CommentsTabProps) {
  const { user } = useAuth();
  const [newComment, setNewComment] = useState('');
  const [attachedImages, setAttachedImages] = useState<{ file: File; preview: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Hooks
  const { data: commentsData, isLoading, error } = useTaskComments(taskId);
  const addMutation = useAddTaskComment();
  
  const comments = commentsData?.comments || [];
  
  // Handle image selection
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
      toast.error('Chỉ hỗ trợ file ảnh');
      return;
    }
    
    // Create previews
    const newImages = imageFiles.map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    
    setAttachedImages(prev => [...prev, ...newImages].slice(0, 4)); // Max 4 images
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  // Remove attached image
  const removeAttachedImage = (index: number) => {
    setAttachedImages(prev => {
      const newImages = [...prev];
      URL.revokeObjectURL(newImages[index].preview);
      newImages.splice(index, 1);
      return newImages;
    });
  };
  
  // Handle Ctrl+V paste for images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          if (file.size > 10 * 1024 * 1024) {
            toast.error('File quá lớn. Tối đa 10MB');
            return;
          }
          const preview = URL.createObjectURL(file);
          setAttachedImages(prev => [...prev, { file, preview }].slice(0, 4));
          toast.info('Đã dán ảnh từ clipboard');
        }
        break;
      }
    }
  }, []);
  
  // Upload images to Supabase Storage
  const uploadImages = async (): Promise<string[]> => {
    if (attachedImages.length === 0) return [];
    
    const uploadedUrls: string[] = [];
    
    for (const { file } of attachedImages) {
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `comment-${taskId}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const filePath = `comments/${fileName}`;
      
      const { error } = await supabase.storage
        .from('ota-evidence')
        .upload(filePath, file);
      
      if (error) {
        console.error('Upload error:', error);
        throw new Error('Lỗi tải ảnh lên');
      }
      
      const { data: urlData } = supabase.storage
        .from('ota-evidence')
        .getPublicUrl(filePath);
      
      uploadedUrls.push(urlData.publicUrl);
    }
    
    return uploadedUrls;
  };
  
  // Send comment with optional images
  const handleSend = async () => {
    if ((!newComment.trim() && attachedImages.length === 0) || addMutation.isPending || isUploading) return;
    
    try {
      setIsUploading(true);
      
      // Upload images first if any
      const imageUrls = await uploadImages();
      
      // Build comment content with image references
      let content = newComment.trim();
      if (imageUrls.length > 0) {
        const imageMarkdown = imageUrls.map(url => `![image](${url})`).join('\n');
        content = content ? `${content}\n\n${imageMarkdown}` : imageMarkdown;
      }
      
      await addMutation.mutateAsync({
        taskId,
        content,
      });
      
      // Cleanup
      attachedImages.forEach(img => URL.revokeObjectURL(img.preview));
      setAttachedImages([]);
      setNewComment('');
      textareaRef.current?.focus();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi gửi bình luận');
    } finally {
      setIsUploading(false);
    }
  };
  
  // Keyboard shortcut
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  // Parse comment content for images
  const parseCommentContent = (content: string) => {
    const imageRegex = /!\[image\]\((https?:\/\/[^\)]+)\)/g;
    const images: string[] = [];
    let match;
    
    while ((match = imageRegex.exec(content)) !== null) {
      images.push(match[1]);
    }
    
    const textContent = content.replace(imageRegex, '').trim();
    
    return { textContent, images };
  };

  return (
    <div 
      id="panel-comments" 
      role="tabpanel" 
      aria-labelledby="tab-comments"
      className={cn("flex flex-col", compact ? "h-full" : "h-full")}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleImageSelect}
      />
      
      {/* Comments list */}
      <div className={cn("flex-1 overflow-y-auto space-y-3", compact ? "p-0" : "p-4")}>
        {!compact && (
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Bình luận ({comments.length})
          </h3>
        )}
        
        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        
        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <AlertCircle className="h-8 w-8 mb-2 text-destructive" />
            <p className="text-sm">Lỗi tải bình luận</p>
            <p className="text-xs">{(error as Error).message}</p>
          </div>
        )}
        
        {/* Comments */}
        {!isLoading && !error && comments.map((comment) => {
          const { textContent, images } = parseCommentContent(comment.content);
          
          return (
            <div key={comment.id} className="group">
              <div className="flex gap-3">
                {/* Avatar */}
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {getInitials(comment.author_name)}
                  </AvatarFallback>
                </Avatar>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{comment.author_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(comment.created_at)}
                    </span>
                    {comment.is_edited && (
                      <span className="text-xs text-muted-foreground italic">(đã sửa)</span>
                    )}
                    
                    {/* More menu - only for owner */}
                    {comment.author_id === user?.id && (
                      <CommentActions 
                        comment={comment} 
                        taskId={taskId}
                      />
                    )}
                  </div>
                  
                  {/* Text content */}
                  {textContent && (
                    <p className="text-sm mt-1 whitespace-pre-wrap">
                      {textContent}
                    </p>
                  )}
                  
                  {/* Image attachments */}
                  {images.length > 0 && (
                    <div className={cn(
                      "mt-2 grid gap-2",
                      images.length === 1 ? "grid-cols-1" : "grid-cols-2"
                    )}>
                      {images.map((url, idx) => (
                        <a 
                          key={idx}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-lg overflow-hidden border hover:opacity-90 transition-opacity"
                        >
                          <img 
                            src={url} 
                            alt="Attachment" 
                            className="w-full h-32 object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        
        {/* Empty state */}
        {!isLoading && !error && comments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mb-2" />
            <p className="text-sm">Chưa có bình luận nào</p>
            <p className="text-xs">Hãy là người đầu tiên bình luận</p>
          </div>
        )}
      </div>
      
      {/* Input area - fixed at bottom */}
      <div className={cn("border-t bg-white dark:bg-muted", compact ? "p-2 mt-2" : "p-3")}>
        {/* Attached images preview */}
        {attachedImages.length > 0 && (
          <div className={cn("flex gap-2 flex-wrap", compact ? "mb-2" : "mb-3")}>
            {attachedImages.map((img, idx) => (
              <div key={idx} className="relative">
                <img 
                  src={img.preview} 
                  alt="Preview" 
                  className={cn("object-cover rounded-lg border", compact ? "h-12 w-12" : "h-16 w-16")}
                />
                <button
                  type="button"
                  onClick={() => removeAttachedImage(idx)}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive/100 text-white flex items-center justify-center hover:bg-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className={cn(compact ? "space-y-1.5" : "space-y-2")}>
          <Textarea
            ref={textareaRef}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={compact ? "Viết bình luận..." : "Viết bình luận... (Ctrl+Enter gửi, Ctrl+V dán ảnh)"}
            className={cn("resize-none bg-muted dark:bg-muted border-border", compact ? "min-h-[50px] text-sm" : "min-h-[70px]")}
            disabled={addMutation.isPending || isUploading}
          />
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={attachedImages.length >= 4 || isUploading}
              className={cn("gap-1.5 text-muted-foreground hover:text-foreground", compact && "h-7 px-2")}
            >
              <ImagePlus className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
              {!compact && "Thêm ảnh"}
            </Button>
            
            <Button 
              size="sm" 
              onClick={handleSend}
              disabled={(!newComment.trim() && attachedImages.length === 0) || addMutation.isPending || isUploading}
              className={compact ? "h-7 px-3 text-xs" : ""}
            >
              {(addMutation.isPending || isUploading) ? (
                <Loader2 className={cn("animate-spin", compact ? "h-3.5 w-3.5 mr-1" : "h-4 w-4 mr-1.5")} />
              ) : (
                <Send className={cn(compact ? "h-3.5 w-3.5 mr-1" : "h-4 w-4 mr-1.5")} />
              )}
              Gửi
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Comment actions component (edit/delete)
function CommentActions({ comment, taskId }: { comment: TaskComment; taskId: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  const editMutation = useEditTaskComment();
  const deleteMutation = useDeleteTaskComment();
  
  const handleSaveEdit = async () => {
    if (!editContent.trim() || editContent === comment.content) {
      setIsEditing(false);
      return;
    }
    
    try {
      await editMutation.mutateAsync({
        commentId: comment.id,
        taskId,
        content: editContent.trim(),
      });
      toast.success('Đã cập nhật bình luận');
      setIsEditing(false);
    } catch (err: any) {
      toast.error(err.message || 'Lỗi cập nhật bình luận');
    }
  };
  
  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({
        commentId: comment.id,
        taskId,
      });
      toast.success('Đã xóa bình luận');
      setShowDeleteDialog(false);
    } catch (err: any) {
      toast.error(err.message || 'Lỗi xóa bình luận');
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
          >
            <MoreHorizontal className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setIsEditing(true)}>
            <Pencil className="h-3.5 w-3.5 mr-2" />
            Sửa
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            className="text-destructive focus:text-destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" />
            Xóa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      
      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa bình luận?</AlertDialogTitle>
            <AlertDialogDescription>
              Bình luận sẽ bị xóa vĩnh viễn và không thể khôi phục.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default CommentsTab;
