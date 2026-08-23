'use client';

import { useState, memo } from 'react';
import { Wrench, ChevronDown, ChevronRight, Check, X, Loader2 } from 'lucide-react';
/** Convert tool_name to Title Case. */
function formatToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export type ToolCallStatus = 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'error';

interface ToolCallDisplayProps {
  toolName: string;
  args: Record<string, unknown>;
  status: ToolCallStatus;
  result?: string | null;
  onApprove?: () => void;
  onReject?: () => void;
}

const ToolCallDisplayComponent = ({ toolName, args, status, result, onApprove, onReject }: ToolCallDisplayProps) => {
  // Auto-expand if content is short (< 100 chars), unless user has manually toggled
  const contentLength =
    (Object.keys(args).length > 0 ? JSON.stringify(args, null, 2).length : 0) + (result ? result.length : 0);
  const [manualExpand, setManualExpand] = useState<boolean | null>(null);
  const isExpanded = manualExpand ?? (contentLength > 0 && contentLength < 100);

  const statusColors: Record<ToolCallStatus, string> = {
    pending: 'border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950/30',
    approved: 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30',
    executing: 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30',
    completed: 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30',
    rejected: 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30',
    error: 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30',
  };

  const statusIcons: Record<ToolCallStatus, React.ReactNode> = {
    pending: <Wrench className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />,
    approved: <Loader2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-spin" />,
    executing: <Loader2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-spin" />,
    completed: <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />,
    rejected: <X className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />,
    error: <X className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />,
  };

  const statusLabels: Record<ToolCallStatus, string> = {
    pending: 'Needs approval',
    approved: 'Approved',
    executing: 'Executing...',
    completed: 'Completed',
    rejected: 'Rejected',
    error: 'Error',
  };

  const hasArgs = Object.keys(args).length > 0;
  const hasDetails = hasArgs || (result && (status === 'completed' || status === 'error' || status === 'rejected'));

  return (
    <div className={`border rounded-md my-2 text-xs ${statusColors[status]}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        {statusIcons[status]}
        <span className="font-medium text-gray-800 dark:text-gray-200">{formatToolName(toolName)}</span>
        <span className="text-gray-500 dark:text-gray-400">— {statusLabels[status]}</span>

        {hasDetails && (
          <button
            onClick={() => setManualExpand(!isExpanded)}
            className="ml-auto text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Expandable details (arguments + result) */}
      {isExpanded && (
        <div className="px-3 pb-2 border-t border-gray-200 dark:border-gray-700">
          {hasArgs && (
            <pre className="text-[11px] text-gray-600 dark:text-gray-400 whitespace-pre-wrap overflow-x-auto mt-1.5">
              {JSON.stringify(args, null, 2)}
            </pre>
          )}
          {result && (status === 'completed' || status === 'error' || status === 'rejected') && (
            <pre className="text-[11px] text-gray-600 dark:text-gray-400 whitespace-pre-wrap overflow-x-auto mt-1.5 max-h-48 overflow-y-auto">
              {result}
            </pre>
          )}
        </div>
      )}

      {/* Approval buttons */}
      {status === 'pending' && (
        <div className="flex gap-2 px-3 pb-2">
          <button
            onClick={onApprove}
            className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors"
          >
            <Check className="w-3 h-3" />
            Approve
          </button>
          <button
            onClick={onReject}
            className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
          >
            <X className="w-3 h-3" />
            Reject
          </button>
        </div>
      )}
    </div>
  );
};

ToolCallDisplayComponent.displayName = 'ToolCallDisplay';

export const ToolCallDisplay = memo(ToolCallDisplayComponent);
