import { Badge } from '@/components/ui/badge';
import { 
  MessageSquare, 
  Mail, 
  MessageCircle, 
  Globe 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChannelType } from '@/hooks/useConversations';

interface ChannelBadgeProps {
  channelType: ChannelType;
  provider?: string;
  showProvider?: boolean;
  className?: string;
}

const CHANNEL_CONFIG: Record<ChannelType, {
  label: string;
  icon: React.ElementType | null;
  className: string;
  customIcon?: string;
}> = {
  OTA: {
    label: 'OTA',
    icon: MessageSquare,
    className: 'bg-info/10 text-info border-info/20',
  },
  EMAIL: {
    label: 'Email',
    icon: Mail,
    className: 'bg-success/10 text-success border-success/20',
  },
  WHATSAPP: {
    label: 'WhatsApp',
    icon: null,
    className: 'bg-success/10 text-success border-success/20',
    customIcon: '/channel-icons/whatsapp.png',
  },
  WEB_CHAT: {
    label: 'Web Chat',
    icon: Globe,
    className: 'bg-primary/10 text-primary border-primary/20',
  },
};

const PROVIDER_LABELS: Record<string, string> = {
  channex: 'Channex',
  gmail: 'Gmail',
  meta: 'Meta',
  internal: 'Internal',
};

export function ChannelBadge({ 
  channelType, 
  provider, 
  showProvider = false,
  className 
}: ChannelBadgeProps) {
  const config = CHANNEL_CONFIG[channelType] || CHANNEL_CONFIG.OTA;
  const Icon = config.icon;
  const providerLabel = provider ? PROVIDER_LABELS[provider] || provider : '';

  return (
    <Badge 
      variant="outline" 
      className={cn(
        'text-xs font-medium gap-1',
        config.className,
        className
      )}
    >
      {config.customIcon ? (
        <img src={config.customIcon} alt={config.label} className="h-3 w-3 rounded-sm" />
      ) : Icon ? (
        <Icon className="h-3 w-3" />
      ) : null}
      <span>{config.label}</span>
      {showProvider && providerLabel && (
        <span className="opacity-70">• {providerLabel}</span>
      )}
    </Badge>
  );
}
