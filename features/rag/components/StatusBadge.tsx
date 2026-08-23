import { CheckCircle, Loader2, XCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { RagDocumentWithCollections } from '@/lib/types/api';

const STATUS_CONFIG = {
  READY: { icon: CheckCircle, label: 'Indexed', variant: 'success' as const },
  PROCESSING: { icon: Loader2, label: 'Processing', variant: 'info' as const },
  PENDING: { icon: Clock, label: 'Pending', variant: 'warning' as const },
  FAILED: { icon: XCircle, label: 'Failed', variant: 'error' as const },
};

export function StatusBadge({ status }: { status: RagDocumentWithCollections['status'] }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.FAILED;
  const Icon = config.icon;
  return (
    <Badge variant={config.variant}>
      <Icon className={`h-3 w-3 mr-1 ${status === 'PROCESSING' ? 'animate-spin' : ''}`} />
      {config.label}
    </Badge>
  );
}
