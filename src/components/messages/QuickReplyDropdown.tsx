import { useState } from 'react';
import { ChevronDown, FileText, Settings, Plus, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Conversation } from '@/hooks/useConversations';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

interface QuickReplyDropdownProps {
  conversation: Conversation | null;
  onSelectTemplate: (content: string) => void;
  disabled?: boolean;
}

interface ReplyTemplate {
  id: string;
  label: string;
  category: string;
  content: string;
}

const REPLY_TEMPLATES: ReplyTemplate[] = [
  // Check-in
  {
    id: 'checkin-confirm',
    label: 'Xác nhận check-in',
    category: 'Nhận phòng',
    content: `Dear {guest_name},

Thank you for choosing {property_name} for your stay.

Your check-in date is {check_in_date}. Standard check-in time is from 14:00.

We will send you the detailed check-in instructions 24 hours before your arrival.

If you have any questions, please don't hesitate to contact us.

Best regards,
{property_name}`,
  },
  {
    id: 'early-checkin',
    label: 'Early check-in',
    category: 'Nhận phòng',
    content: `Dear {guest_name},

Thank you for your early check-in request.

We will do our best to accommodate your request, subject to room availability. Please note that early check-in may incur an additional charge.

We will confirm the availability closer to your check-in date ({check_in_date}).

Best regards,
{property_name}`,
  },
  // Address & Directions
  {
    id: 'address-directions',
    label: 'Địa chỉ & hướng dẫn',
    category: 'Hướng dẫn',
    content: `Dear {guest_name},

Here are the directions to {property_name}:

[Address details will be provided]

For taxi/Grab, please show the driver this address. The reception is located at [location].

If you need any assistance upon arrival, please contact us.

Best regards,
{property_name}`,
  },
  // Payment & Deposit
  {
    id: 'deposit-request',
    label: 'Yêu cầu đặt cọc',
    category: 'Thanh toán',
    content: `Dear {guest_name},

Thank you for your reservation at {property_name} from {check_in_date} to {check_out_date}.

To secure your booking, we kindly request a deposit of [AMOUNT]. This deposit will be fully refunded upon check-out.

Payment link: [PAYMENT_LINK]

If you have any questions, please let us know.

Best regards,
{property_name}`,
  },
  {
    id: 'payment-received',
    label: 'Xác nhận thanh toán',
    category: 'Thanh toán',
    content: `Dear {guest_name},

We have received your payment. Thank you!

Your reservation at {property_name} from {check_in_date} to {check_out_date} is now confirmed.

We look forward to welcoming you.

Best regards,
{property_name}`,
  },
  // WiFi & House Rules
  {
    id: 'wifi-info',
    label: 'Thông tin WiFi',
    category: 'Tiện ích',
    content: `Dear {guest_name},

Here is the WiFi information for your room:

Network Name: [WIFI_NAME]
Password: [WIFI_PASSWORD]

If you experience any connectivity issues, please contact us.

Best regards,
{property_name}`,
  },
  {
    id: 'house-rules',
    label: 'Nội quy',
    category: 'Tiện ích',
    content: `Dear {guest_name},

Welcome to {property_name}! Here are some important house rules:

- Check-out time: 12:00 PM
- Quiet hours: 10:00 PM - 8:00 AM
- No smoking inside the apartment
- No parties or events

Thank you for your cooperation.

Best regards,
{property_name}`,
  },
  // Late checkout
  {
    id: 'late-checkout',
    label: 'Late check-out',
    category: 'Trả phòng',
    content: `Dear {guest_name},

Thank you for your late check-out request.

We will try to accommodate your request based on room availability. Late check-out until 14:00 may be available for a small fee.

Please let us know your preferred check-out time and we will confirm.

Best regards,
{property_name}`,
  },
];

const CATEGORIES = ['Nhận phòng', 'Trả phòng', 'Hướng dẫn', 'Thanh toán', 'Tiện ích'];

export function QuickReplyDropdown({
  conversation,
  onSelectTemplate,
  disabled = false
}: QuickReplyDropdownProps) {
  const [templates, setTemplates] = useState<ReplyTemplate[]>(REPLY_TEMPLATES);
  const [showSettings, setShowSettings] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ReplyTemplate | null>(null);
  const [newTemplate, setNewTemplate] = useState<Partial<ReplyTemplate>>({
    label: '',
    category: 'Nhận phòng',
    content: '',
  });

  // Replace template variables with actual values
  const processTemplate = (template: string): string => {
    if (!conversation) return template;

    const guestName = conversation.booking_guest_name || conversation.guest_name || 'Guest';
    const propertyName = conversation.pms_property_name || 'Our Property';
    const checkInDate = conversation.check_in_date
      ? format(parseISO(conversation.check_in_date), 'dd/MM/yyyy')
      : '[CHECK_IN_DATE]';
    const checkOutDate = conversation.check_out_date
      ? format(parseISO(conversation.check_out_date), 'dd/MM/yyyy')
      : '[CHECK_OUT_DATE]';

    return template
      .replace(/{guest_name}/g, guestName)
      .replace(/{property_name}/g, propertyName)
      .replace(/{check_in_date}/g, checkInDate)
      .replace(/{check_out_date}/g, checkOutDate);
  };

  const handleSelectTemplate = (template: ReplyTemplate) => {
    const processedContent = processTemplate(template.content);
    onSelectTemplate(processedContent);
  };

  const addTemplate = () => {
    if (!newTemplate.label || !newTemplate.content) {
      toast.error('Vui lòng nhập đủ thông tin');
      return;
    }

    const template: ReplyTemplate = {
      id: `custom-${Date.now()}`,
      label: newTemplate.label!,
      category: newTemplate.category!,
      content: newTemplate.content!,
    };

    setTemplates(prev => [...prev, template]);
    setNewTemplate({ label: '', category: 'Nhận phòng', content: '' });
    toast.success('Đã thêm mẫu tin nhắn');
  };

  const updateTemplate = () => {
    if (!editingTemplate) return;

    setTemplates(prev => prev.map(t =>
      t.id === editingTemplate.id ? editingTemplate : t
    ));
    setEditingTemplate(null);
    toast.success('Đã cập nhật mẫu tin nhắn');
  };

  const deleteTemplate = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
    toast.success('Đã xóa mẫu tin nhắn');
  };

  // Group templates by category
  const groupedTemplates = templates.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {} as Record<string, ReplyTemplate[]>);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className="gap-1.5"
          >
            <FileText className="h-4 w-4" />
            Mẫu trả lời
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 bg-background">
          {Object.entries(groupedTemplates).map(([category, temps], index) => (
            <div key={category}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {category}
              </DropdownMenuLabel>
              {temps.map((template) => (
                <DropdownMenuItem
                  key={template.id}
                  onClick={() => handleSelectTemplate(template)}
                  className="cursor-pointer"
                >
                  {template.label}
                </DropdownMenuItem>
              ))}
            </div>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowSettings(true)}
            className="cursor-pointer text-muted-foreground"
          >
            <Settings className="h-3.5 w-3.5 mr-2" />
            Cài đặt mẫu tin nhắn
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Cài đặt mẫu tin nhắn</DialogTitle>
            <DialogDescription>
              Quản lý các mẫu trả lời nhanh. Sử dụng {'{guest_name}'}, {'{property_name}'}, {'{check_in_date}'}, {'{check_out_date}'} để tự động thay thế.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto space-y-4">
            {/* Add new template */}
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <Label className="font-medium">Thêm mẫu mới</Label>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="Tên mẫu (vd: Xác nhận check-in)"
                  value={newTemplate.label || ''}
                  onChange={e => setNewTemplate(prev => ({ ...prev, label: e.target.value }))}
                />
                <Select
                  value={newTemplate.category}
                  onValueChange={v => setNewTemplate(prev => ({ ...prev, category: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn nhóm" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                placeholder="Nội dung mẫu..."
                value={newTemplate.content || ''}
                onChange={e => setNewTemplate(prev => ({ ...prev, content: e.target.value }))}
                className="min-h-[100px]"
              />
              <Button onClick={addTemplate} disabled={!newTemplate.label || !newTemplate.content}>
                <Plus className="h-4 w-4 mr-1" />
                Thêm mẫu
              </Button>
            </div>

            {/* Existing templates */}
            <div className="space-y-2">
              <Label className="font-medium">Mẫu hiện có ({templates.length})</Label>
              <div className="border rounded-lg divide-y max-h-[300px] overflow-auto">
                {templates.map(template => (
                  <div key={template.id} className="p-3 hover:bg-muted/30">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{template.label}</span>
                          <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                            {template.category}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {template.content.slice(0, 80)}...
                        </p>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setEditingTemplate(template)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteTemplate(template.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={() => setEditingTemplate(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa mẫu tin nhắn</DialogTitle>
          </DialogHeader>

          {editingTemplate && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tên mẫu</Label>
                  <Input
                    value={editingTemplate.label}
                    onChange={e => setEditingTemplate({ ...editingTemplate, label: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Nhóm</Label>
                  <Select
                    value={editingTemplate.category}
                    onValueChange={v => setEditingTemplate({ ...editingTemplate, category: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Nội dung</Label>
                <Textarea
                  value={editingTemplate.content}
                  onChange={e => setEditingTemplate({ ...editingTemplate, content: e.target.value })}
                  className="min-h-[200px]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingTemplate(null)}>
                  Hủy
                </Button>
                <Button onClick={updateTemplate}>
                  Lưu thay đổi
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}