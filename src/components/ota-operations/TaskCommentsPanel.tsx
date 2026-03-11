/**
 * OTA Operations - Task Comments Panel
 * 
 * Phase D: Comments/discussion on tasks
 * - View all comments
 * - Add new comments
 * - Reply to comments
 * - Edit/delete own comments
 */

import React, { useState } from 'react';
import { 
  MessageSquare, 
  Send, 
  Edit2, 
  Trash2, 
  Reply,
  Loader2,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import { Alert, AlertDescription } from '@/components/ui/alert';

import { 
  useTaskComments, 
  useAddTaskComment, 
  useEditTaskComment,
  useDeleteTaskComment,
  TaskComment,
} from '@/hooks/useOtaOperations';
import { useAuth } from '@/hooks/useAuth';
import { toast } from "sonner";

// ============================================================
// HELPERS
// ============================================================

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatCommentTime(date: string): string {
  const d = new Date(date);
  const now = new Date();
  const diffHours = (now.getTime() - d.getTime()) / (1000 * 60 * 60);
  
  if (diffHours < 24) {
    return formatDistanceToNow(d, { addSuffix: true, locale: vi });
  }
  return format(d, 'dd/MM/yyyy HH:mm', { locale: vi });
}

// ============================================================
// COMPONENTS
// ============================================================

interface CommentItemProps {
  comment: TaskComment;
  taskId: string;
  isOwnComment: boolean;
  onReply: (comment: TaskComment) => void;
  level?: number;
}

function CommentItem({ comment, taskId, isOwnComment, onReply, level = 0 }: CommentItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  const editComment = useEditTaskComment();
  const deleteComment = useDeleteTaskComment();
  
  const handleEdit = async () => {
    if (!editContent.trim()) return;
    
    try {
      await editComment.mutateAsync({
        commentId: comment.id,
        taskId,
        content: editContent,
      });
      setIsEditing(false);
      toast.success("Đã cập nhật comment");
    } catch (err: any) {
      toast.error("Lỗi", { description: err.message });
    }
  };
  
  const handleDelete = async () => {
    try {
      await deleteComment.mutateAsync({
        commentId: comment.id,
        taskId,
      });
      toast.success("Đã xóa comment");
    } catch (err: any) {
      toast.error("Lỗi", { description: err.message });
    }
  };
  
  return (
    <div className={`flex gap-3 ${level > 0 ? 'ml-8 mt-3' : ''}`}>
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarFallback className="text-xs">
          {getInitials(comment.author_name)}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{comment.author_name}</span>
          <span className="text-xs text-muted-foreground">
            {formatCommentTime(comment.created_at)}
          </span>
          {comment.is_edited && (
            <span className="text-xs text-muted-foreground italic">(đã chỉnh sửa)</span>
          )}
        </div>
        
        {isEditing ? (
          <div className="mt-2 space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={2}
              className="resize-none"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleEdit} disabled={editComment.isPending}>
                {editComment.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                Lưu
              </Button>
              <Button size="sm" variant="ghost" onClick={() => {
                setIsEditing(false);
                setEditContent(comment.content);
              }}>
                Hủy
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm mt-1 whitespace-pre-wrap">{comment.content}</p>
            
            <div className="flex items-center gap-2 mt-2">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 text-xs text-muted-foreground"
                onClick={() => onReply(comment)}
              >
                <Reply className="h-3 w-3 mr-1" />
                Trả lời
              </Button>
              
              {isOwnComment && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <MoreHorizontal className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => setIsEditing(true)}>
                      <Edit2 className="h-3 w-3 mr-2" />
                      Chỉnh sửa
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setDeleteDialogOpen(true)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-3 w-3 mr-2" />
                      Xóa
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </>
        )}
      </div>
      
      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa comment</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa comment này? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              {deleteComment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

interface TaskCommentsPanelProps {
  taskId: string;
}

export function TaskCommentsPanel({ taskId }: TaskCommentsPanelProps) {
  const { user } = useAuth();
  
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<TaskComment | null>(null);
  
  const { data: commentsData, isLoading } = useTaskComments(taskId);
  const addComment = useAddTaskComment();
  
  // ============================================================
  // HANDLERS
  // ============================================================
  
  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    
    try {
      await addComment.mutateAsync({
        taskId,
        content: newComment,
        parentId: replyingTo?.id,
      });
      
      setNewComment('');
      setReplyingTo(null);
      toast.success("Đã thêm comment");
    } catch (err: any) {
      toast.error("Lỗi", { description: err.message });
    }
  };
  
  const handleReply = (comment: TaskComment) => {
    setReplyingTo(comment);
    // Focus textarea
    const textarea = document.getElementById('comment-textarea');
    textarea?.focus();
  };
  
  // ============================================================
  // RENDER
  // ============================================================
  
  // Build comment tree
  const buildCommentTree = (comments: TaskComment[]): (TaskComment & { replies: TaskComment[] })[] => {
    const rootComments: (TaskComment & { replies: TaskComment[] })[] = [];
    const commentMap = new Map<string, TaskComment & { replies: TaskComment[] }>();
    
    // First pass: create map
    comments.forEach(c => {
      commentMap.set(c.id, { ...c, replies: [] });
    });
    
    // Second pass: build tree
    comments.forEach(c => {
      const comment = commentMap.get(c.id)!;
      if (c.parent_id && commentMap.has(c.parent_id)) {
        commentMap.get(c.parent_id)!.replies.push(comment);
      } else {
        rootComments.push(comment);
      }
    });
    
    return rootComments;
  };
  
  const comments = commentsData?.comments || [];
  const commentTree = buildCommentTree(comments);
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Comments ({comments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Comment Input */}
        <div className="space-y-2">
          {replyingTo && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-2 rounded">
              <Reply className="h-3 w-3" />
              <span>Đang trả lời {replyingTo.author_name}</span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-5 w-5 p-0 ml-auto"
                onClick={() => setReplyingTo(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Textarea
              id="comment-textarea"
              placeholder={replyingTo ? "Viết trả lời..." : "Viết comment..."}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={2}
              className="resize-none flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  handleSubmit();
                }
              }}
            />
            <Button 
              size="icon" 
              className="shrink-0"
              onClick={handleSubmit}
              disabled={!newComment.trim() || addComment.isPending}
            >
              {addComment.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Nhấn Ctrl+Enter để gửi
          </p>
        </div>
        
        {/* Comments List */}
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : commentsData?.error === 'RPC_NOT_FOUND' ? (
          <Alert>
            <AlertDescription>
              {commentsData.message || 'Tính năng comments chưa được cài đặt.'}
            </AlertDescription>
          </Alert>
        ) : comments.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">
            Chưa có comment nào. Hãy là người đầu tiên!
          </p>
        ) : (
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {commentTree.map((comment) => (
              <div key={comment.id}>
                <CommentItem
                  comment={comment}
                  taskId={taskId}
                  isOwnComment={comment.author_id === user?.id}
                  onReply={handleReply}
                />
                {/* Replies */}
                {comment.replies.map((reply) => (
                  <CommentItem
                    key={reply.id}
                    comment={reply}
                    taskId={taskId}
                    isOwnComment={reply.author_id === user?.id}
                    onReply={handleReply}
                    level={1}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
