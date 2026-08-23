'use client';

import { memo, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import type { UIMessage, ToolUIPart, DynamicToolUIPart } from 'ai';
import { isToolUIPart, getToolName } from 'ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import yaml from 'react-syntax-highlighter/dist/cjs/languages/prism/yaml';
import python from 'react-syntax-highlighter/dist/cjs/languages/prism/python';
import json from 'react-syntax-highlighter/dist/cjs/languages/prism/json';
import bash from 'react-syntax-highlighter/dist/cjs/languages/prism/bash';
import typescript from 'react-syntax-highlighter/dist/cjs/languages/prism/typescript';
import javascript from 'react-syntax-highlighter/dist/cjs/languages/prism/javascript';
import markdown from 'react-syntax-highlighter/dist/cjs/languages/prism/markdown';

SyntaxHighlighter.registerLanguage('yaml', yaml);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('shell', bash);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('tsx', typescript);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('jsx', javascript);
SyntaxHighlighter.registerLanguage('markdown', markdown);
import { ToolCallDisplay, type ToolCallStatus } from './ToolCallDisplay';
import { AskScientistDisplay } from './AskScientistDisplay';
import type { AskScientistArgs } from '../utils/askScientistUtils';

/**
 * Map an AI SDK tool part state onto the display status.
 *
 * The SDK tracks the whole lifecycle for us, approvals included, so the panel
 * no longer needs to keep a parallel record of what it has approved.
 */
type AnyToolPart = ToolUIPart | DynamicToolUIPart;

function statusFromState(state: AnyToolPart['state']): ToolCallStatus {
  switch (state) {
    case 'input-streaming':
    case 'input-available':
      return 'executing';
    case 'approval-requested':
      return 'pending';
    case 'approval-responded':
      return 'approved';
    case 'output-available':
      return 'completed';
    case 'output-denied':
      return 'rejected';
    case 'output-error':
      return 'error';
  }
}

/** Render a tool output for the expandable details pane. */
function outputToText(part: AnyToolPart): string | null {
  if (part.state === 'output-error') return part.errorText;
  if (part.state === 'output-denied') return 'Tool call rejected by user';
  if (part.state !== 'output-available') return null;
  const { output } = part;
  if (output == null) return null;
  return typeof output === 'string' ? output : JSON.stringify(output, null, 2);
}

function extractCodeText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractCodeText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return extractCodeText((node as { props: { children?: React.ReactNode } }).props.children);
  }
  return '';
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  };
  return (
    <div className="relative group/code my-2">
      <button
        onClick={handleCopy}
        className="absolute top-1.5 right-1.5 z-10 p-1 rounded text-gray-300 hover:text-white hover:bg-white/10 transition-opacity opacity-0 group-hover/code:opacity-80 hover:!opacity-100"
        title={copied ? 'Copied!' : 'Copy code'}
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      </button>
      {language && (
        <div className="absolute top-1.5 left-3 z-10 text-[10px] text-gray-400 uppercase font-mono pointer-events-none">
          {language}
        </div>
      )}
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: '0.375rem',
          fontSize: '0.75rem',
          paddingTop: language ? '1.5rem' : '0.75rem',
        }}
        codeTagProps={{ style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }}
      >
        {code.replace(/\n$/, '')}
      </SyntaxHighlighter>
    </div>
  );
}

interface AiMessageProps {
  message: UIMessage;
  /** Answer an approval request for a state-changing tool. */
  onApproval?: (approvalId: string, approved: boolean) => void;
  /** Run (or decline) the client-side save_protocol tool. */
  onSaveProtocol?: (toolCallId: string, approved: boolean) => void;
  onSubmitAnswers?: (toolCallId: string, answers: Record<string, string>) => void;
}

const AiMessageComponent = ({ message, onApproval, onSaveProtocol, onSubmitAnswers }: AiMessageProps) => {
  const [copied, setCopied] = useState(false);

  // Get non-empty text content
  const textContent = message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part as { text: string }).text)
    .filter((text) => text.trim().length > 0)
    .join('\n');

  // Check for tool calls
  const toolCalls = message.parts.filter((part) => isToolUIPart(part));

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };

  const isUser = message.role === 'user';

  // Don't render if there's no text content and no tool calls
  if (!textContent && toolCalls.length === 0) {
    return null;
  }

  return (
    <div className={`flex min-w-0 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* Message Content */}
      <div className="min-w-0 max-w-[95%]">
        <div
          className={`group relative overflow-x-auto rounded-lg pl-3 pr-3 py-2 text-sm ${
            isUser
              ? 'bg-blue-500 dark:bg-yellow-500 text-white dark:text-slate-900'
              : 'bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-gray-100'
          }`}
        >
          {/* Copy Button - Top Right (for both user and assistant messages with text content) */}
          {textContent && (
            <button
              onClick={handleCopy}
              className={`absolute top-1.5 right-1.5 p-1 rounded transition-colors opacity-0 group-hover:opacity-60 hover:!opacity-100 ${
                isUser
                  ? 'hover:bg-blue-400 dark:hover:bg-yellow-400 text-white dark:text-slate-900'
                  : 'hover:bg-gray-200 dark:hover:bg-slate-700'
              }`}
              title={copied ? 'Copied!' : 'Copy message'}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
          )}

          {message.parts.map((part, index) => {
            if (isToolUIPart(part)) {
              const toolName = getToolName(part);
              const toolCallId = part.toolCallId;
              const args = (part.input as Record<string, unknown>) || {};
              const toolStatus = statusFromState(part.state);
              const toolResult = outputToText(part);

              // ask_scientist is resolved in the browser: render the Q&A form
              // until the scientist submits, then show their answers.
              if (toolName === 'ask_scientist') {
                return (
                  <AskScientistDisplay
                    key={toolCallId || index}
                    toolCallId={toolCallId}
                    args={args as unknown as AskScientistArgs}
                    status={toolStatus}
                    result={toolResult}
                    onSubmitAnswers={onSubmitAnswers ?? (() => {})}
                  />
                );
              }

              // save_protocol is also resolved in the browser, but the only
              // decision is whether to go ahead, so it gets approval buttons
              // while it waits for input.
              if (toolName === 'save_protocol') {
                const awaitingUser = part.state === 'input-available' || part.state === 'input-streaming';
                return (
                  <ToolCallDisplay
                    key={toolCallId || index}
                    toolName={toolName}
                    args={args}
                    status={awaitingUser ? 'pending' : toolStatus}
                    result={toolResult}
                    onApprove={() => onSaveProtocol?.(toolCallId, true)}
                    onReject={() => onSaveProtocol?.(toolCallId, false)}
                  />
                );
              }

              // Everything else runs on the server. State-changing tools pause
              // in `approval-requested` until answered here.
              const approvalId = part.state === 'approval-requested' ? part.approval.id : undefined;
              return (
                <ToolCallDisplay
                  key={toolCallId || index}
                  toolName={toolName}
                  args={args}
                  status={toolStatus}
                  result={toolResult}
                  onApprove={approvalId ? () => onApproval?.(approvalId, true) : undefined}
                  onReject={approvalId ? () => onApproval?.(approvalId, false) : undefined}
                />
              );
            }

            if (part.type === 'text') {
              const textPart = part as { text: string };

              // Skip empty text parts
              if (!textPart.text.trim()) {
                return null;
              }

              if (isUser) {
                // Simple text for user messages
                return (
                  <div key={index} className="whitespace-pre-wrap">
                    {textPart.text}
                  </div>
                );
              }

              // Markdown rendering for assistant messages
              return (
                <div key={index} className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ node: _node, ...props }) => (
                        <h1 className="text-base font-bold mb-2 mt-3 first:mt-0" {...props} />
                      ),
                      h2: ({ node: _node, ...props }) => (
                        <h2 className="text-sm font-bold mb-2 mt-3 first:mt-0" {...props} />
                      ),
                      h3: ({ node: _node, ...props }) => (
                        <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0" {...props} />
                      ),
                      h4: ({ node: _node, ...props }) => (
                        <h4 className="text-xs font-semibold mb-1 mt-2 first:mt-0" {...props} />
                      ),
                      ul: ({ node: _node, ...props }) => <ul className="list-disc ml-4 mb-2 space-y-1" {...props} />,
                      ol: ({ node: _node, ...props }) => <ol className="list-decimal ml-4 mb-2 space-y-1" {...props} />,
                      li: ({ node: _node, ...props }) => <li className="text-sm pl-1" {...props} />,
                      pre: ({ children }) => <>{children}</>,
                      code: ({
                        className,
                        children,
                      }: {
                        node?: unknown;
                        className?: string;
                        children?: React.ReactNode;
                      }) => {
                        const match = /language-(\w+)/.exec(className || '');
                        if (!match) {
                          return (
                            <code
                              className="text-gray-100 px-1.5 py-0.5 rounded text-xs font-mono"
                              style={{ backgroundColor: '#282c34' }}
                            >
                              {children}
                            </code>
                          );
                        }
                        return <CodeBlock language={match[1]} code={extractCodeText(children)} />;
                      },
                      blockquote: ({ node: _node, ...props }) => (
                        <blockquote
                          className="border-l-2 border-gray-300 dark:border-gray-600 pl-3 my-2 italic text-sm"
                          {...props}
                        />
                      ),
                      a: ({ node: _node, ...props }) => (
                        <a
                          className="text-blue-600 dark:text-yellow-400 hover:underline text-sm"
                          target="_blank"
                          rel="noopener noreferrer"
                          {...props}
                        />
                      ),
                      table: ({ node: _node, ...props }) => (
                        <div className="overflow-x-auto my-2">
                          <table
                            className="min-w-full border border-gray-300 dark:border-gray-600 text-xs"
                            {...props}
                          />
                        </div>
                      ),
                      th: ({ node: _node, ...props }) => (
                        <th
                          className="border border-gray-300 dark:border-gray-600 px-2 py-1 bg-gray-50 dark:bg-slate-700 font-semibold"
                          {...props}
                        />
                      ),
                      td: ({ node: _node, ...props }) => (
                        <td className="border border-gray-300 dark:border-gray-600 px-2 py-1" {...props} />
                      ),
                      hr: ({ node: _node, ...props }) => (
                        <hr className="my-3 border-gray-300 dark:border-gray-600" {...props} />
                      ),
                    }}
                  >
                    {textPart.text}
                  </ReactMarkdown>
                </div>
              );
            }

            return null;
          })}
        </div>
      </div>
    </div>
  );
};

AiMessageComponent.displayName = 'AiMessage';

export const AiMessage = memo(AiMessageComponent);
