'use client';

import { MessageSquare } from 'lucide-react';

interface AiChatButtonProps {
  onClick: () => void;
  isOpen: boolean;
}

export function AiChatButton({ onClick, isOpen }: AiChatButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1 rounded-md transition-colors text-sm font-medium ${
        isOpen
          ? 'bg-blue-500 dark:bg-yellow-500 text-white dark:text-slate-900'
          : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'
      }`}
    >
      <MessageSquare className="w-4 h-4" />
      <span>EOS AI</span>
    </button>
  );
}
