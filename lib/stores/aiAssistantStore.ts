import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UIMessage } from 'ai';
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  type EffortLevel,
  type ProviderId,
} from '@/lib/ai/providers';

export type { EffortLevel, ProviderId };
export { EFFORT_LEVELS } from '@/lib/ai/providers';

/** Per-provider connection settings, kept independently so switching is lossless. */
export interface ProviderSettings {
  /** Model id. For Ollama this is whatever the user has pulled locally. */
  model: string;
  /** Anthropic API key. Unused by Ollama. */
  apiKey: string;
  /** Ollama server URL. Unused by Anthropic. */
  baseUrl: string;
  /** Reasoning effort. Only Anthropic acts on this. */
  effort: EffortLevel;
}

export interface AiSettings {
  provider: ProviderId;
  providers: Record<ProviderId, ProviderSettings>;
}

const defaultSettings: AiSettings = {
  provider: 'anthropic',
  providers: {
    anthropic: {
      model: DEFAULT_ANTHROPIC_MODEL,
      apiKey: '',
      baseUrl: '',
      effort: 'medium',
    },
    ollama: {
      model: DEFAULT_OLLAMA_MODEL,
      apiKey: '',
      baseUrl: DEFAULT_OLLAMA_BASE_URL,
      effort: 'medium',
    },
  },
};

interface AiAssistantStore {
  isOpen: boolean;
  settings: AiSettings;
  messages: UIMessage[];
  /** Input text, preserved across panel close/open. */
  inputText: string;

  setIsOpen: (isOpen: boolean) => void;
  setProvider: (provider: ProviderId) => void;
  setProviderSettings: (provider: ProviderId, settings: Partial<ProviderSettings>) => void;
  setMessages: (messages: UIMessage[]) => void;
  setInputText: (text: string) => void;
  clearMessages: () => void;
  resetSettings: () => void;
}

/** The settings the chat request needs, flattened for the active provider. */
export function activeProviderSettings(settings: AiSettings): ProviderSettings & { provider: ProviderId } {
  const provider = settings.provider;
  const providerSettings = settings.providers[provider] ?? defaultSettings.providers[provider];
  return { provider, ...providerSettings };
}

export const useAiAssistantStore = create<AiAssistantStore>()(
  persist(
    (set) => ({
      isOpen: false,
      settings: defaultSettings,
      messages: [],
      inputText: '',

      setIsOpen: (isOpen) => set({ isOpen }),

      setProvider: (provider) =>
        set((state) => ({
          settings: { ...state.settings, provider },
        })),

      setProviderSettings: (provider, newSettings) =>
        set((state) => ({
          settings: {
            ...state.settings,
            providers: {
              ...state.settings.providers,
              [provider]: {
                ...(state.settings.providers[provider] ?? defaultSettings.providers[provider]),
                ...newSettings,
              },
            },
          },
        })),

      setMessages: (messages) => set({ messages }),

      setInputText: (text) => set({ inputText: text }),

      clearMessages: () => set({ messages: [], inputText: '' }),

      resetSettings: () => set({ settings: defaultSettings }),
    }),
    {
      name: 'eos-ai-assistant-storage',
      // v4 replaced the Claude Agent SDK harness. The old shape (model
      // aliases, per-model settings, SDK session ids) no longer applies.
      version: 4,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        settings: state.settings,
        messages: state.messages,
      }),
      migrate: () => ({ settings: defaultSettings, messages: [] }),
    }
  )
);
