'use client';

import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Settings, Info, ChevronDown } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  useAiAssistantStore,
  type AiSettings as AiSettingsType,
  type ProviderId,
  type ProviderSettings,
  type EffortLevel,
} from '@/lib/stores/aiAssistantStore';
import { ANTHROPIC_MODELS, DEFAULT_OLLAMA_BASE_URL, EFFORT_LEVELS, PROVIDER_IDS } from '@/lib/ai/providers';

const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  ollama: 'Ollama (local)',
};

/**
 * Label for the model currently selected. Anthropic ids get a friendly name.
 * Ollama ids are shown verbatim, since the exact `name:tag` is what identifies
 * the model on the server.
 */
export function modelDisplayName(provider: ProviderId, modelId: string): string {
  if (provider !== 'anthropic') return modelId || 'no model set';
  return ANTHROPIC_MODELS.find((m) => m.id === modelId)?.name ?? modelId;
}

/** Ask the server which models the Ollama instance at `baseUrl` has installed. */
async function fetchOllamaModels(baseUrl: string): Promise<string[]> {
  const query = baseUrl ? `?baseUrl=${encodeURIComponent(baseUrl)}` : '';
  const response = await fetch(`/api/ai/ollama/models${query}`);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  const body = (await response.json()) as { models?: string[] };
  return body.models ?? [];
}

function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800/50 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
      >
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        <ChevronDown
          className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      <div
        className={`transition-all duration-200 ease-in-out overflow-hidden ${
          isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="p-4 pt-2 space-y-4 bg-gray-50 dark:bg-slate-800/50">{children}</div>
      </div>
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button type="button" className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
          <Info className="w-4 h-4" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-3 py-2 rounded-md text-xs max-w-xs shadow-lg z-[100]"
          sideOffset={5}
        >
          {text}
          <Tooltip.Arrow className="fill-gray-900 dark:fill-gray-100" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-yellow-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100';

interface AiSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AiSettings({ isOpen, onClose }: AiSettingsProps) {
  const storeSettings = useAiAssistantStore((state) => state.settings);
  const setProvider = useAiAssistantStore((state) => state.setProvider);
  const setProviderSettings = useAiAssistantStore((state) => state.setProviderSettings);

  const [draft, setDraft] = useState<AiSettingsType>(storeSettings);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isModelSettingsOpen, setIsModelSettingsOpen] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaModelsError, setOllamaModelsError] = useState<string | null>(null);

  // Sync local state when the dialog opens
  useEffect(() => {
    if (isOpen) setDraft(storeSettings);
  }, [isOpen, storeSettings]);

  const provider = draft.provider;
  const current = draft.providers[provider];

  // Enumerate installed Ollama models so the suggestions are the real tags on
  // the server rather than a guessed list.
  const ollamaBaseUrl = draft.providers.ollama.baseUrl;
  useEffect(() => {
    if (!isOpen || provider !== 'ollama') return;
    let cancelled = false;
    setOllamaModelsError(null);
    fetchOllamaModels(ollamaBaseUrl)
      .then((models) => {
        if (cancelled) return;
        setOllamaModels(models);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setOllamaModels([]);
        setOllamaModelsError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, provider, ollamaBaseUrl]);

  const updateCurrent = (patch: Partial<ProviderSettings>) =>
    setDraft((prev) => ({
      ...prev,
      providers: { ...prev.providers, [prev.provider]: { ...prev.providers[prev.provider], ...patch } },
    }));

  const handleSave = () => {
    setProvider(draft.provider);
    (Object.keys(draft.providers) as ProviderId[]).forEach((id) => {
      setProviderSettings(id, draft.providers[id]);
    });
    onClose();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 animate-in fade-in" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-900 rounded-lg shadow-xl w-[500px] max-h-[80vh] overflow-y-auto z-50 animate-in fade-in zoom-in-95">
          <Tooltip.Provider delayDuration={300}>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                  EOS AI Settings
                </Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </Dialog.Close>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6">
              {/* Provider */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Provider</label>
                <select
                  value={provider}
                  onChange={(e) => setDraft({ ...draft, provider: e.target.value as ProviderId })}
                  className={inputClass}
                >
                  {PROVIDER_IDS.map((id) => (
                    <option key={id} value={id}>
                      {PROVIDER_LABELS[id]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Model */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Model</label>
                {provider === 'anthropic' ? (
                  <select
                    value={current.model}
                    onChange={(e) => updateCurrent({ model: e.target.value })}
                    className={inputClass}
                  >
                    {ANTHROPIC_MODELS.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      type="text"
                      value={current.model}
                      onChange={(e) => updateCurrent({ model: e.target.value })}
                      placeholder="name:tag, e.g. qwen3.8:27b"
                      list="ollama-model-suggestions"
                      className={inputClass}
                    />
                    <datalist id="ollama-model-suggestions">
                      {ollamaModels.map((id) => (
                        <option key={id} value={id} />
                      ))}
                    </datalist>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {ollamaModelsError
                        ? ollamaModelsError
                        : ollamaModels.length > 0
                          ? `${ollamaModels.length} model(s) installed on this server. Type any other name:tag to use it.`
                          : 'Type any Ollama name:tag. It must support tool calling.'}
                    </p>
                  </>
                )}
              </div>

              {/* Effort, Anthropic only */}
              {provider === 'anthropic' && (
                <CollapsibleSection
                  title="Model Settings"
                  isOpen={isModelSettingsOpen}
                  onToggle={() => setIsModelSettingsOpen(!isModelSettingsOpen)}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Effort</label>
                      <InfoTooltip text="Controls how much effort the model puts into reasoning. Higher effort means deeper thinking but slower, more expensive responses." />
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={EFFORT_LEVELS.length - 1}
                        step={1}
                        value={Math.max(0, EFFORT_LEVELS.indexOf(current.effort))}
                        onChange={(e) =>
                          updateCurrent({ effort: EFFORT_LEVELS[parseInt(e.target.value)] as EffortLevel })
                        }
                        className="flex-1 h-2 rounded-lg appearance-none cursor-pointer bg-gray-200 dark:bg-slate-600"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-400 w-20 text-right capitalize">
                        {current.effort}
                      </span>
                    </div>
                  </div>
                </CollapsibleSection>
              )}

              {/* Connection */}
              {provider === 'anthropic' ? (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">API Key</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Stored locally in your browser and sent only to this EOS server, which forwards it to Anthropic. If
                    left empty, the server&apos;s <code>ANTHROPIC_API_KEY</code> is used when configured.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Anthropic API Key
                    </label>
                    <div className="flex gap-2">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={current.apiKey}
                        onChange={(e) => updateCurrent({ apiKey: e.target.value })}
                        placeholder="sk-ant-..."
                        className={inputClass}
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-md hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-gray-700 dark:text-gray-300"
                      >
                        {showApiKey ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Get your API key from{' '}
                      <a
                        href="https://console.anthropic.com/settings/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 dark:text-yellow-500 hover:underline"
                      >
                        Anthropic Console
                      </a>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Ollama Server</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Base URL</label>
                    <input
                      type="text"
                      value={current.baseUrl}
                      onChange={(e) => updateCurrent({ baseUrl: e.target.value })}
                      placeholder={DEFAULT_OLLAMA_BASE_URL}
                      className={inputClass}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Ollama&apos;s OpenAI-compatible endpoint, including the <code>/v1</code> suffix. The EOS server
                      connects to this, so use an address reachable from the server, not just your laptop.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-md hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 text-sm font-medium text-white dark:text-slate-900 bg-blue-600 dark:bg-yellow-500 rounded-md hover:bg-blue-700 dark:hover:bg-yellow-600 transition-colors"
              >
                Save Settings
              </button>
            </div>
          </Tooltip.Provider>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
