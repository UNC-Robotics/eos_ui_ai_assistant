import { getRagDocuments, listCollections } from '@/features/rag/api/collections';
import { KnowledgeBasePage } from '@/features/rag/components/KnowledgeBasePage';
import { RagServiceUnavailableError } from '@/lib/api/rag';
import { ServerOff } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function RagPage() {
  try {
    const [initialData, collections] = await Promise.all([getRagDocuments(), listCollections()]);
    return (
      <div className="container mx-auto p-6">
        <KnowledgeBasePage initialData={initialData} initialCollections={collections} />
      </div>
    );
  } catch (error) {
    if (error instanceof RagServiceUnavailableError) {
      return (
        <div className="container mx-auto p-6">
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <ServerOff className="h-12 w-12 text-gray-400 dark:text-gray-500 mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">RAG Server Offline</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
              The EOS RAG server is not running or unreachable. Start the RAG server and refresh this page.
            </p>
          </div>
        </div>
      );
    }
    throw error;
  }
}
