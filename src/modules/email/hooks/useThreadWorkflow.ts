import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateThreadWorkflow, addThreadNote } from '../api';
import { toast } from 'sonner';

export function useThreadWorkflow(threadId: string | undefined) {
    const queryClient = useQueryClient();

    const workflowMutation = useMutation({
        mutationFn: (params: {
            status?: string;
            assignedTo?: string | null;
            bookingUnifiedId?: string | null;
        }) => updateThreadWorkflow({ threadId: threadId!, ...params }),
        onSuccess: (_data, variables) => {
            if (variables.status) toast.success(`Trạng thái cập nhật: ${variables.status}`);
            if (variables.assignedTo !== undefined) toast.success('Đã cập nhật người phụ trách');
            if (variables.bookingUnifiedId !== undefined) toast.success('Đã cập nhật liên kết booking');
            queryClient.invalidateQueries({ queryKey: ['email-thread-detail', threadId] });
            queryClient.invalidateQueries({ queryKey: ['email-threads'] });
        },
        onError: (err: Error) => {
            toast.error(`Lỗi: ${err.message}`);
        },
    });

    const noteMutation = useMutation({
        mutationFn: (note: string) => addThreadNote({ threadId: threadId!, note }),
        onSuccess: () => {
            toast.success('Đã thêm ghi chú');
            queryClient.invalidateQueries({ queryKey: ['email-thread-detail', threadId] });
        },
        onError: (err: Error) => {
            toast.error(`Lỗi: ${err.message}`);
        },
    });

    return {
        updateWorkflow: workflowMutation.mutate,
        isUpdatingWorkflow: workflowMutation.isPending,
        addNote: noteMutation.mutate,
        isAddingNote: noteMutation.isPending,
    };
}
