'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { MultiCombobox } from '@/components/ui/MultiCombobox';
import { searchCollections, type SearchResult } from '../api/collections';
import type { RagCollection } from '@/lib/types/api';

function SearchResultCard({ result: r }: { result: SearchResult }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-medium text-blue-600 dark:text-blue-400 truncate">{r.document_name}</span>
          {r.page_number != null && (
            <span className="text-xs text-gray-400 flex-shrink-0">
              {r.page_end != null && r.page_end !== r.page_number
                ? `pp. ${r.page_number}-${r.page_end}`
                : `p. ${r.page_number}`}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400 tabular-nums flex-shrink-0 ml-2">score: {r.score.toFixed(3)}</span>
      </div>
      <p className={`text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap ${expanded ? '' : 'line-clamp-6'}`}>
        {r.text}
      </p>
      {r.text.length > 400 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 mt-1"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

interface SearchDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: RagCollection[];
}

export function SearchDrawer({ open, onOpenChange, collections }: SearchDrawerProps) {
  const [query, setQuery] = React.useState('');
  const [selectedCollectionIds, setSelectedCollectionIds] = React.useState<string[]>([]);
  const [topK, setTopK] = React.useState(5);
  const [llmReranking, setLlmReranking] = React.useState(true);
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [searched, setSearched] = React.useState(false);

  const collectionOptions = collections.map((c) => ({ value: c.id, label: c.name }));

  const handleSearch = async () => {
    if (!query.trim()) return;
    const ids = selectedCollectionIds.length > 0 ? selectedCollectionIds : collections.map((c) => c.id);
    setSearching(true);
    setSearched(false);
    try {
      const data = await searchCollections(query.trim(), ids, topK, llmReranking);
      setResults(data);
      setSearched(true);
    } catch {
      setResults([]);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  };

  // Reset on open
  React.useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedCollectionIds([]);
      setResults([]);
      setSearched(false);
    }
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col overflow-hidden w-full max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Knowledge Base
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {/* Collection filter */}
          <MultiCombobox
            options={collectionOptions}
            value={selectedCollectionIds}
            onChange={setSelectedCollectionIds}
            placeholder="All collections"
            searchPlaceholder="Filter collections..."
          />

          {/* Top K and LLM Reranking */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">Max results</label>
              <Input
                type="number"
                min={1}
                max={50}
                value={topK}
                onChange={(e) => setTopK(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                className="text-sm h-8 w-16"
              />
            </div>
            <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={llmReranking}
                onChange={(e) => setLlmReranking(e.target.checked)}
                className="rounded border-gray-300 dark:border-slate-600"
              />
              LLM reranking
            </label>
          </div>

          {/* Query input */}
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Enter search query..."
              className="text-sm"
            />
            <Button
              variant="primary"
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              className="flex-shrink-0 h-10"
            >
              {searching ? 'Searching...' : 'Search'}
            </Button>
          </div>
        </div>

        {/* Results */}
        <div className="mt-4 flex-1 overflow-y-auto space-y-3">
          {searched && results.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">No results found.</p>
          )}
          {searched && results.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {results.length} chunk{results.length !== 1 ? 's' : ''} found
            </p>
          )}
          {results.map((r) => (
            <SearchResultCard key={`${r.document_name}:${r.page_number}:${r.score}`} result={r} />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
