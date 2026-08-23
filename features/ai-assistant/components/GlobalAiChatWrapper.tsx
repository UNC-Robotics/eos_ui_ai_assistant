'use client';

import { useState, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAiAssistantStore } from '@/lib/stores/aiAssistantStore';
import { AiChatPanel } from './AiChatPanel';

const MIN_WIDTH = 320;
const MAX_WIDTH_PERCENT = 0.5;
const DEFAULT_WIDTH = 420;

export function GlobalAiChatWrapper() {
  const isOpen = useAiAssistantStore((state) => state.isOpen);
  const pathname = usePathname();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (ev: MouseEvent) => {
      const maxWidth = window.innerWidth * MAX_WIDTH_PERCENT;
      const newWidth = Math.max(MIN_WIDTH, Math.min(maxWidth, window.innerWidth - ev.clientX));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  // On editor page, the AI panel is integrated into the editor's resizable panel layout
  if (!isOpen || pathname === '/editor') return null;

  return (
    <div
      ref={panelRef}
      className="h-full flex flex-shrink-0 border-l border-gray-200 dark:border-slate-700"
      style={{ width }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="w-1 cursor-col-resize bg-gray-200 dark:bg-gray-700 hover:bg-blue-500 dark:hover:bg-yellow-500 transition-colors flex-shrink-0"
      />

      {/* Chat panel */}
      <div className="flex-1 min-w-0">
        <AiChatPanel />
      </div>
    </div>
  );
}
