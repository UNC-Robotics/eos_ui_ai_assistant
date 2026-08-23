'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart, getToolName, type UIMessage } from 'ai';
import { usePathname } from 'next/navigation';
import { X, Send, StopCircle, Settings, Trash2, Loader2 } from 'lucide-react';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import * as Dialog from '@radix-ui/react-dialog';
import * as yaml from 'js-yaml';
import { extractHoldsFromRawTasks } from '@/lib/utils/editor-utils';
import { AiMessage } from './AiMessage';
import { AiSettings, modelDisplayName } from './AiSettings';
import { useAiAssistantStore, activeProviderSettings } from '@/lib/stores/aiAssistantStore';
import { useEditorStore } from '@/lib/stores/editorStore';
import { serializeCurrentProtocol } from '@/lib/utils/protocolSerializer';
import { getPageContext } from '../utils/pageContext';
import { formatScientistAnswers, type AskScientistArgs } from '../utils/askScientistUtils';
import type { TaskNode } from '@/lib/types/protocol';

interface SaveProtocolResult {
  success: boolean;
  mtime?: number;
  error?: string;
  nothingToSave?: boolean;
  conflict?: boolean;
}

async function runSaveProtocol(): Promise<SaveProtocolResult> {
  const state = useEditorStore.getState();
  const { selectedPackage, selectedEntityType, selectedEntityName, isDirty, editorMode } = state;

  if (!selectedPackage || !selectedEntityType || !selectedEntityName) {
    return { success: false, error: 'No entity selected in the editor' };
  }
  if (!isDirty) {
    return { success: true, nothingToSave: true };
  }

  if (editorMode === 'visual' && selectedEntityType === 'protocols') {
    const { yaml: serializedYaml, layoutJson: serializedLayout } = serializeCurrentProtocol();
    state.updateYaml(serializedYaml);
    state.updateLayout(serializedLayout);
  }

  const fresh = useEditorStore.getState();
  const body: Record<string, unknown> = { yaml: fresh.yaml, python: fresh.python };
  if (selectedEntityType === 'protocols' && fresh.layout) {
    body.json = fresh.layout;
  }
  if (fresh.diskMtime != null) {
    body.expectedMtime = fresh.diskMtime;
  }

  try {
    const response = await fetch(
      `/api/filesystem/packages/${encodeURIComponent(selectedPackage)}/${selectedEntityType}/${selectedEntityName}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (response.status === 409) {
      const data = await response.json();
      useEditorStore.getState().setConflictMtime(data.mtime);
      return { success: false, conflict: true };
    }
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as { mtime: number };
    useEditorStore.getState().markSaved(data.mtime);
    return { success: true, mtime: data.mtime };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Turn a save outcome into the sentence the model should read. */
function describeSaveResult(result: SaveProtocolResult): string {
  if (result.nothingToSave) return 'Nothing to save (no unsaved changes).';
  if (result.conflict) {
    return 'Save failed: the file changed on disk since the editor loaded it. Ask the user to reload and re-apply changes.';
  }
  if (!result.success) return `Save failed: ${result.error || 'unknown error'}`;
  return 'Protocol saved to disk.';
}

/** Tools the browser is responsible for resolving. */
const CLIENT_TOOL_NAMES = new Set(['save_protocol', 'ask_scientist']);

/**
 * Decide whether to resume the agent loop after the user acted.
 *
 * The server already loops over its own tools within a single response, so the
 * only reason to send again is that the user just supplied something the server
 * was waiting on: an approval decision, or the result of a client-side tool.
 * Resubmitting on *any* completed tool call would also fire when the agent hits
 * its step limit mid-work, which could loop indefinitely.
 */
function shouldResumeAfterUserAction({ messages }: { messages: UIMessage[] }): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return false;

  const lastStepStart = last.parts.reduce((acc, part, i) => (part.type === 'step-start' ? i : acc), -1);
  const invocations = last.parts.slice(lastStepStart + 1).filter(isToolUIPart);
  if (invocations.length === 0) return false;

  const settled = (state: string) =>
    state === 'output-available' ||
    state === 'output-error' ||
    state === 'output-denied' ||
    state === 'approval-responded';

  // Every call in this step must be settled before we send.
  if (!invocations.every((part) => settled(part.state))) return false;

  // ...and at least one of them must have been settled by the user.
  return invocations.some(
    (part) =>
      part.state === 'approval-responded' ||
      part.state === 'output-denied' ||
      (CLIENT_TOOL_NAMES.has(getToolName(part)) && (part.state === 'output-available' || part.state === 'output-error'))
  );
}

/** Keep a ref in sync with a reactive value. */
function useSyncRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export function AiChatPanel() {
  const inputText = useAiAssistantStore((state) => state.inputText);
  const setInputText = useAiAssistantStore((state) => state.setInputText);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hasLoadedFromStorageRef = useRef(false);

  const pathname = usePathname();
  const pageContext = useMemo(() => getPageContext(pathname), [pathname]);

  // AI Assistant store (global)
  const settings = useAiAssistantStore((state) => state.settings);
  const storedMessages = useAiAssistantStore((state) => state.messages);
  const setStoredMessages = useAiAssistantStore((state) => state.setMessages);
  const clearStoredMessages = useAiAssistantStore((state) => state.clearMessages);
  const setIsOpen = useAiAssistantStore((state) => state.setIsOpen);

  // Protocol + editor state (merged store, only used when on /editor page)
  const protocolType = useEditorStore((state) => state.protocolType);
  const protocolDesc = useEditorStore((state) => state.protocolDesc);
  const labs = useEditorStore((state) => state.labs);
  const tasks = useEditorStore((state) => state.tasks);
  const taskTemplates = useEditorStore((state) => state.taskTemplates);
  const labSpecs = useEditorStore((state) => state.labSpecs);
  const loadProtocol = useEditorStore((state) => state.loadProtocol);
  const selectedEntityName = useEditorStore((state) => state.selectedEntityName);

  // Keep refs in sync for use inside closures
  const settingsRef = useSyncRef(settings);
  const pageContextRef = useSyncRef(pageContext);
  const protocolContextRef = useSyncRef({
    protocolType,
    protocolDesc,
    labs,
    tasks,
    taskTemplates,
    labSpecs,
  });

  const active = activeProviderSettings(settings);
  const modelLabel = modelDisplayName(active.provider, active.model);

  /** Parse YAML and apply protocol to canvas. */
  const applyProtocolYaml = useCallback(
    (yamlString: string) => {
      const parsed = yaml.load(yamlString) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid YAML structure');

      const tasksWithHolds = extractHoldsFromRawTasks(
        (parsed.tasks as Record<string, unknown>[]) || []
      ) as unknown as TaskNode[];
      const rawTasks = tasksWithHolds.map((t, i) => ({
        ...t,
        position: t.position || { x: i * 300, y: 0 },
      }));

      // Enforce type matches the entity name in the package tree
      const type = selectedEntityName || (parsed.type as string) || protocolType;

      loadProtocol({
        type,
        desc: (parsed.desc as string) || protocolDesc,
        labs: (parsed.labs as string[]) || labs,
        tasks: rawTasks,
      });

      // Update YAML so code view and save work correctly
      useEditorStore.getState().updateYaml(yamlString);

      // Mark as dirty and request overlap resolution
      useEditorStore.setState({ isDirty: true, overlapResolutionRequested: true });
    },
    [loadProtocol, protocolType, protocolDesc, labs, selectedEntityName]
  );

  const { messages, sendMessage, status, stop, setMessages, addToolResult, addToolApprovalResponse } = useChat({
    id: 'eos-global-assistant',
    transport: new DefaultChatTransport({
      api: '/api/ai/chat',
      prepareSendMessagesRequest: ({ messages }) => {
        const currentSettings = activeProviderSettings(settingsRef.current);
        const currentPageContext = pageContextRef.current;

        // Build protocol context only when on editor page
        let protocolContext;
        if (currentPageContext.pageId === 'editor') {
          const ctx = protocolContextRef.current;
          protocolContext = {
            protocolType: ctx.protocolType,
            protocolDesc: ctx.protocolDesc,
            labs: ctx.labs,
            tasks: ctx.tasks.map((t) => ({
              name: t.name,
              type: t.type,
              position: t.position,
              dependencies: t.dependencies,
              devices: t.devices,
              resources: t.resources,
              parameters: t.parameters,
            })),
            taskTemplates: ctx.taskTemplates,
            labSpecs: ctx.labSpecs,
          };
        }

        return {
          body: {
            messages,
            pageContext: currentPageContext,
            protocolContext,
            settings: {
              provider: currentSettings.provider,
              selectedModel: currentSettings.model,
              effort: currentSettings.effort,
              apiKey: currentSettings.apiKey || undefined,
              baseUrl: currentSettings.baseUrl || undefined,
            },
          },
        };
      },
    }),
    // Resume the loop once the user has approved a tool or answered one.
    sendAutomaticallyWhen: shouldResumeAfterUserAction,
    onFinish: ({ finishReason }) => {
      if (finishReason === 'stop' || finishReason === 'length') {
        setErrorMessage(null);
      }
    },
    onError: (error) => {
      console.error('AI chat error:', error);
      const errorObj = error as Error & { lastError?: { message?: string }; cause?: { message?: string } };
      const msg = error.message || errorObj.lastError?.message || errorObj.cause?.message || 'Unknown error';
      const truncated = msg.length > 200 ? msg.slice(0, 200) + '...' : msg;
      setErrorMessage(truncated);
    },
  });

  /** Approve or reject a state-changing server tool. */
  const handleApproval = useCallback(
    (approvalId: string, approved: boolean) => {
      addToolApprovalResponse({ id: approvalId, approved });
    },
    [addToolApprovalResponse]
  );

  /** Run (or decline) the client-side save_protocol tool. */
  const handleSaveProtocol = useCallback(
    async (toolCallId: string, approved: boolean) => {
      if (!approved) {
        addToolResult({
          tool: 'save_protocol',
          toolCallId,
          output: 'The user declined to save the protocol.',
        });
        return;
      }
      const result = await runSaveProtocol();
      addToolResult({ tool: 'save_protocol', toolCallId, output: describeSaveResult(result) });
    },
    [addToolResult]
  );

  /** Send the scientist's answers back as the ask_scientist result. */
  const handleSubmitAnswers = useCallback(
    (toolCallId: string, answers: Record<string, string>) => {
      let questions: AskScientistArgs['questions'] = [];
      for (const msg of messages) {
        for (const part of msg.parts) {
          if (isToolUIPart(part) && part.toolCallId === toolCallId) {
            questions = ((part.input as Record<string, unknown>)?.questions as AskScientistArgs['questions']) || [];
            break;
          }
        }
        if (questions.length > 0) break;
      }

      addToolResult({
        tool: 'ask_scientist',
        toolCallId,
        output: formatScientistAnswers(questions, answers),
      });
    },
    [messages, addToolResult]
  );

  // Auto-scroll only when user is pinned near bottom.
  const isAtBottomRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (scrollRef.current && isAtBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Load messages from store on mount
  useEffect(() => {
    if (hasLoadedFromStorageRef.current) return;
    hasLoadedFromStorageRef.current = true;
    if (storedMessages.length > 0) {
      // Pre-seed applied tool calls so restored messages don't re-apply to canvas
      for (const msg of storedMessages) {
        if (msg.role !== 'assistant') continue;
        for (const part of msg.parts) {
          if (isToolUIPart(part)) {
            const name = getToolName(part);
            if (name === 'update_protocol_yaml' || name === 'update_optimizer_python') {
              appliedToolCallsRef.current.add(part.toolCallId);
            }
          }
        }
      }
      setMessages(storedMessages);
    }
  }, [setMessages, storedMessages]);

  // Save messages to store with debounce
  useEffect(() => {
    if (!hasLoadedFromStorageRef.current) return;
    const timer = setTimeout(() => {
      setStoredMessages(messages);
    }, 1000);
    return () => clearTimeout(timer);
  }, [messages, setStoredMessages]);

  // Focus input when panel opens
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Apply protocol editor tool calls to the canvas as soon as they arrive.
  const appliedToolCallsRef = useRef(new Set<string>());
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      for (const part of msg.parts) {
        if (!isToolUIPart(part) || part.state !== 'output-available') continue;
        const toolCallId = part.toolCallId;
        if (appliedToolCallsRef.current.has(toolCallId)) continue;
        const toolName = getToolName(part);

        if (toolName === 'update_protocol_yaml') {
          appliedToolCallsRef.current.add(toolCallId);
          try {
            const output = part.output as { yaml?: string };
            if (output?.yaml) applyProtocolYaml(output.yaml);
          } catch (error) {
            console.error('Failed to apply protocol update:', error);
          }
        } else if (toolName === 'update_optimizer_python') {
          appliedToolCallsRef.current.add(toolCallId);
          try {
            const output = part.output as { python?: string };
            if (output?.python) useEditorStore.getState().updatePython(output.python);
          } catch (error) {
            console.error('Failed to apply optimizer update:', error);
          }
        }
      }
    }
  }, [messages, applyProtocolYaml]);

  const handleSend = () => {
    if (!inputText.trim() || status === 'streaming' || status === 'submitted') return;
    setErrorMessage(null);
    sendMessage({ text: inputText.trim() });
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea to fit content, capped at 40% of panel height
  const autoResizeTextarea = useCallback(() => {
    const textarea = inputRef.current;
    const panel = panelRef.current;
    if (!textarea || !panel) return;
    textarea.style.height = 'auto';
    if (textarea.value) {
      const maxHeight = panel.clientHeight * 0.4;
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    }
  }, []);

  // Resize when inputText changes (including after send clears it)
  useEffect(() => {
    autoResizeTextarea();
  }, [inputText, autoResizeTextarea]);

  const confirmClearChat = () => {
    setMessages([]);
    clearStoredMessages();
    appliedToolCallsRef.current.clear();
    setErrorMessage(null);
    setIsClearDialogOpen(false);
  };

  return (
    <>
      <div ref={panelRef} className="h-full bg-white dark:bg-slate-900 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between bg-white dark:bg-slate-900 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">EOS AI</h2>
            <span className="text-xs bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 px-2 py-1 rounded">
              {modelLabel}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsClearDialogOpen(true)}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Clear chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea.Root className="flex-1 min-h-0">
          <ScrollArea.Viewport className="ai-chat-scroll w-full h-full" ref={scrollRef}>
            <div className="p-4 space-y-4 min-w-0">
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <div className="text-gray-400 dark:text-gray-500 mb-2">
                    <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Start a conversation with EOS AI</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Ask me to manage protocols, query data, control devices, or help with EOS workflows.
                  </p>
                </div>
              )}

              {messages.map((message) => (
                <AiMessage
                  key={message.id}
                  message={message}
                  onApproval={handleApproval}
                  onSaveProtocol={handleSaveProtocol}
                  onSubmitAnswers={handleSubmitAnswers}
                />
              ))}

              {status === 'submitted' && (
                <div className="flex justify-start">
                  <div className="inline-block bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Thinking</span>
                      <div className="flex gap-0.5">
                        <div
                          className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"
                          style={{ animationDelay: '0ms' }}
                        />
                        <div
                          className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"
                          style={{ animationDelay: '150ms' }}
                        />
                        <div
                          className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"
                          style={{ animationDelay: '300ms' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {status === 'streaming' && (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-3">
                    <span className="text-sm">Working</span>
                    <Loader2 className="w-4 h-4 text-gray-500 dark:text-gray-400 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar
            className="flex select-none touch-none p-0.5 bg-gray-100 dark:bg-slate-800 transition-colors duration-150 ease-out hover:bg-gray-200 dark:hover:bg-slate-700"
            orientation="vertical"
          >
            <ScrollArea.Thumb className="flex-1 bg-gray-400 dark:bg-slate-600 rounded-full relative before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:w-full before:h-full before:min-w-[44px] before:min-h-[44px]" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>

        {/* Input */}
        <div className="p-4 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-shrink-0">
          {errorMessage && (
            <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-sm text-red-800 dark:text-red-200">{errorMessage}</p>
              </div>
              <button
                onClick={() => setErrorMessage(null)}
                className="flex-shrink-0 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="border border-gray-300 dark:border-slate-600 rounded-md focus-within:ring-2 focus-within:ring-blue-500 dark:focus-within:ring-yellow-500 bg-white dark:bg-slate-800">
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything about EOS..."
              disabled={status === 'streaming' || status === 'submitted'}
              className="w-full px-3 py-2 text-sm bg-transparent text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none overflow-y-auto focus:outline-none border-none"
              rows={1}
            />
            <div className="flex justify-end px-2 pb-2">
              {status === 'streaming' || status === 'submitted' ? (
                <button
                  onClick={stop}
                  className="p-2 bg-red-500 dark:bg-red-600 text-white rounded-md hover:bg-red-600 dark:hover:bg-red-700 transition-colors"
                  title="Stop generation"
                >
                  <StopCircle className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!inputText.trim()}
                  className="p-2 bg-blue-500 dark:bg-yellow-500 text-white dark:text-slate-900 rounded-md hover:bg-blue-600 dark:hover:bg-yellow-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Send message (Enter)"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Press Enter to send, Shift+Enter for new line</p>
        </div>
      </div>

      <AiSettings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {/* Clear Chat Confirmation Dialog */}
      <Dialog.Root open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[60] animate-in fade-in" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-900 rounded-lg shadow-xl w-[400px] z-[60] animate-in fade-in zoom-in-95">
            <div className="p-6">
              <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Clear Chat History
              </Dialog.Title>
              <Dialog.Description className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Are you sure you want to clear all chat messages? This action cannot be undone.
              </Dialog.Description>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setIsClearDialogOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-md hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmClearChat}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
