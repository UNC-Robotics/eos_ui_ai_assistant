'use client';

import { MessageSquare } from 'lucide-react';
import { useAiAssistantStore } from '@/lib/stores/aiAssistantStore';

export function GlobalAiChatButton() {
  const isOpen = useAiAssistantStore((state) => state.isOpen);
  const setIsOpen = useAiAssistantStore((state) => state.setIsOpen);

  if (isOpen) return null;

  return (
    <button
      onClick={() => setIsOpen(true)}
      className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-blue-500 dark:bg-yellow-500 text-white dark:text-slate-900 shadow-lg hover:bg-blue-600 dark:hover:bg-yellow-600 transition-all hover:scale-105 flex items-center justify-center"
      title="Open EOS AI"
    >
      <MessageSquare className="w-5 h-5" />
    </button>
  );
}
