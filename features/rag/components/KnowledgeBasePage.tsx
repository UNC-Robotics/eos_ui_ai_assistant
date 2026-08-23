'use client';

import * as React from 'react';
import { BookOpen, Upload, FolderOpen, FileText, Download, Search, Trash2 } from 'lucide-react';
import { DataTable, DataTableColumnDef } from '@/components/data-table/DataTable';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { useServerTable } from '@/hooks/useServerTable';
import { getRagDocuments, listCollections, deleteDocument } from '../api/collections';
import type { RagDocumentWithCollections, RagCollection } from '@/lib/types/api';
import type { PaginatedResult } from '@/lib/db/queries';
import { StatusBadge } from './StatusBadge';
import { DocumentDetailPanel } from './DocumentDetailPanel';
import { UploadDocumentsDialog } from './UploadDocumentsDialog';
import { CollectionsManagementDialog } from './CollectionsManagementDialog';
import { SearchDrawer } from './SearchDrawer';

function downloadDocument(doc: RagDocumentWithCollections) {
  const a = document.createElement('a');
  a.href = `/api/files/download/${encodeURIComponent(doc.file_path)}`;
  a.download = doc.name;
  a.click();
}

const COLUMN_ID_MAP: Record<string, string> = {
  chunk_count: 'chunkCount',
  created_at: 'createdAt',
};

interface KnowledgeBasePageProps {
  initialData: PaginatedResult<RagDocumentWithCollections>;
  initialCollections: RagCollection[];
}

export function KnowledgeBasePage({ initialData, initialCollections }: KnowledgeBasePageProps) {
  const [collections, setCollections] = React.useState(initialCollections);
  const [selectedDoc, setSelectedDoc] = React.useState<RagDocumentWithCollections | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = React.useState(false);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [collectionsDialogOpen, setCollectionsDialogOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [selectedRows, setSelectedRows] = React.useState<RagDocumentWithCollections[]>([]);
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = React.useState(false);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [tableKey, setTableKey] = React.useState(0);

  const serverTable = useServerTable({
    fetchFn: getRagDocuments,
    initialData,
    columnIdMap: COLUMN_ID_MAP,
  });

  // Poll while any document on the current page is processing.
  // Derive a boolean and depend on that so the interval isn't recreated on every refresh.
  const hasProcessing = serverTable.data.some((d) => d.status === 'PENDING' || d.status === 'PROCESSING');
  React.useEffect(() => {
    if (!hasProcessing) return;
    const interval = setInterval(() => serverTable.refresh(), 3000);
    return () => clearInterval(interval);
  }, [hasProcessing, serverTable.refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep selected document in sync with refreshed data
  React.useEffect(() => {
    if (selectedDoc) {
      const updated = serverTable.data.find((d) => d.id === selectedDoc.id);
      if (updated) setSelectedDoc(updated);
    }
  }, [serverTable.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshCollections = React.useCallback(async () => {
    try {
      setCollections(await listCollections());
    } catch {
      // keep stale collections on error
    }
  }, []);

  const handleRefreshAll = React.useCallback(async () => {
    await Promise.all([serverTable.refresh(), refreshCollections()]);
  }, [serverTable.refresh, refreshCollections]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      await Promise.all(selectedRows.map((doc) => deleteDocument(doc.id)));
      setSelectedRows([]);
      setConfirmBulkDeleteOpen(false);
      setTableKey((k) => k + 1);
      await handleRefreshAll();
    } catch {
      // individual failures are swallowed; refresh shows current state
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleRowClick = (doc: RagDocumentWithCollections) => {
    setSelectedDoc(doc);
    setDetailPanelOpen(true);
  };

  const collectionNames = React.useMemo(() => collections.map((c) => c.name), [collections]);

  const columns: DataTableColumnDef<RagDocumentWithCollections>[] = React.useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <div className="flex items-center gap-2 max-w-md">
            <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span className="font-medium truncate" title={row.getValue('name')}>
              {row.getValue('name')}
            </span>
          </div>
        ),
        enableColumnFilter: true,
        filterType: 'text' as const,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.getValue('status')} />,
        enableColumnFilter: true,
        filterType: 'multiselect' as const,
        filterOptions: ['PENDING', 'PROCESSING', 'READY', 'FAILED'],
      },
      {
        id: 'collections',
        header: 'Collections',
        accessorFn: (row) => row.collections.map((c) => c.name),
        cell: ({ row }) => {
          const cols = row.original.collections;
          if (cols.length === 0) {
            return <span className="text-gray-400 text-xs">Unassigned</span>;
          }
          return (
            <div className="flex flex-wrap gap-1">
              {cols.map((c) => (
                <Badge key={c.id} variant="default" className="text-xs">
                  {c.name}
                </Badge>
              ))}
            </div>
          );
        },
        enableColumnFilter: true,
        filterType: 'multiselect' as const,
        filterOptions: collectionNames,
        filterFn: (row, columnId, filterValue: string[]) => {
          const names = row.getValue(columnId) as string[];
          return filterValue.some((v) => names.includes(v));
        },
      },
      {
        accessorKey: 'chunk_count',
        header: 'Chunks',
        cell: ({ row }) => (
          <span className="text-gray-700 dark:text-gray-300 tabular-nums">{row.getValue('chunk_count')}</span>
        ),
      },
      {
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ row }) => (
          <span className="text-gray-700 dark:text-gray-300 text-xs">
            {new Date(row.getValue('created_at')).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              downloadDocument(row.original);
            }}
            className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </button>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [collectionNames]
  );

  return (
    <div className="flex gap-4">
      <div className={`space-y-4 ${detailPanelOpen ? 'flex-1' : 'w-full'}`}>
        <div className="mb-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            Knowledge Base
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage documents for RAG</p>
        </div>

        {serverTable.data.length === 0 && initialData.total === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="mb-4">No documents yet. Upload files to get started.</p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCollectionsDialogOpen(true)}>
                <FolderOpen className="h-4 w-4 mr-1" />
                Collections
              </Button>
              <Button variant="primary" size="sm" onClick={() => setUploadOpen(true)}>
                <Upload className="h-4 w-4 mr-1" />
                Upload
              </Button>
            </div>
          </div>
        ) : (
          <DataTable
            key={tableKey}
            columns={columns}
            data={serverTable.data}
            searchPlaceholder="Search documents..."
            onRowClick={handleRowClick}
            enableRowSelection
            onSelectionChange={setSelectedRows}
            bulkActions={
              <Button variant="destructive" size="sm" onClick={() => setConfirmBulkDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 mr-1" />
                Delete ({selectedRows.length})
              </Button>
            }
            manualPagination
            totalRows={serverTable.totalRows}
            pageIndex={serverTable.pageIndex}
            pageSize={serverTable.pageSize}
            onPaginationChange={serverTable.onPaginationChange}
            onSortingChange={serverTable.onSortingChange}
            onColumnFiltersChange={serverTable.onColumnFiltersChange}
            onGlobalFilterChange={serverTable.onGlobalFilterChange}
            toolbarActions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSearchOpen(true)}>
                  <Search className="h-4 w-4 mr-1" />
                  Search
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCollectionsDialogOpen(true)}>
                  <FolderOpen className="h-4 w-4 mr-1" />
                  Collections
                </Button>
                <Button variant="primary" size="sm" onClick={() => setUploadOpen(true)}>
                  <Upload className="h-4 w-4 mr-1" />
                  Upload
                </Button>
              </div>
            }
          />
        )}
      </div>

      {detailPanelOpen && selectedDoc && (
        <DocumentDetailPanel
          document={selectedDoc}
          collections={collections}
          onClose={() => setDetailPanelOpen(false)}
          onRefresh={handleRefreshAll}
        />
      )}

      <UploadDocumentsDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        collections={collections}
        onSuccess={() => {
          setTableKey((k) => k + 1);
          handleRefreshAll();
        }}
      />

      <CollectionsManagementDialog
        open={collectionsDialogOpen}
        onOpenChange={setCollectionsDialogOpen}
        collections={collections}
        onRefresh={handleRefreshAll}
      />

      <SearchDrawer open={searchOpen} onOpenChange={setSearchOpen} collections={collections} />

      <ConfirmDialog
        isOpen={confirmBulkDeleteOpen}
        onClose={() => setConfirmBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title="Delete Documents"
        message={`Delete ${selectedRows.length} document${selectedRows.length !== 1 ? 's' : ''} and all their chunks? This cannot be undone.`}
        confirmText={bulkDeleting ? 'Deleting...' : 'Delete'}
        variant="danger"
      />
    </div>
  );
}
