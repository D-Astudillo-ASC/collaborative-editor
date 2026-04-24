import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Plus, FolderOpen } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DocumentCard } from './DocumentCard';
// import type { DocumentCard as DocumentCardType } from '@/types';
import type { Document } from '@/types';

interface DocumentGridProps {
  // documents: DocumentCardType[]
  documents: Document[];
  selectedDocumentId?: string;
  onSelectDocument: (id: string) => void;
  onCreateDocument: () => void;
}

export function DocumentGrid({
  documents,
  selectedDocumentId,
  onSelectDocument,
  onCreateDocument,
}: DocumentGridProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredDocuments = documents.filter((doc) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <div className="flex flex-col h-full p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-muted-foreground text-sm">
            {documents.length} document{documents.length !== 1 ? 's' : ''}
          </p>
        </div>

        <Button onClick={onCreateDocument} className="gap-2">
          <Plus className="h-4 w-4" />
          New Document
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Grid */}
      {filteredDocuments.length > 0 ? (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto"
        >
          {filteredDocuments.map((doc) => (
            <motion.div key={doc.id} variants={itemVariants}>
              <DocumentCard
                document={doc}
                isSelected={selectedDocumentId === doc.id}
                onClick={() => onSelectDocument(doc.id)}
              />
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center"
          >
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            {searchQuery ? (
              <>
                <h3 className="font-medium mb-1">No results found</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Try a different search term
                </p>
              </>
            ) : (
              <>
                <h3 className="font-medium mb-1">No documents yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create your first document to get started
                </p>
                <Button onClick={onCreateDocument} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Document
                </Button>
              </>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
