import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AppLayout } from '@/components/layout/AppLayout';
import { Sidebar } from '@/components/layout/Sidebar';
import { DocumentGrid } from '@/components/dashboard/DocumentGrid';
import { NewDocumentModal } from '@/components/dashboard/NewDocumentModal';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { PanelRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Document, Language } from '@/types';
import { apiUrl } from '@/config/backend';
import { useAuth } from '@/contexts/AuthContext';
// TODO: Template imports - commented out since NewDocumentModal handles template selection
// Uncomment when template content integration is needed in handleCreateDocument
// import { CODE_TEMPLATES, type CodeTemplateKey } from '@/templates/codeTemplates';

// Mock documents for development
// const MOCK_DOCUMENTS: DocumentCard[] = [
//   {
//     id: '1',
//     title: 'React App',
//     language: 'typescriptreact',
//     updatedAt: new Date(Date.now() - 1000 * 60 * 30),
//     activeUsers: [
//       { id: 'u1', name: 'Alice', email: 'alice@example.com', color: '#10b981', imageUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice' },
//     ],
//   },
//   {
//     id: '2',
//     title: 'API Server',
//     language: 'javascript',
//     updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
//     activeUsers: [],
//   },
//   {
//     id: '3',
//     title: 'Main Class',
//     language: 'java',
//     updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
//     activeUsers: [
//       { id: 'u2', name: 'Bob', email: 'bob@example.com', color: '#f59e0b', imageUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob' },
//       { id: 'u3', name: 'Charlie', email: 'charlie@example.com', color: '#ef4444', imageUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=charlie' },
//     ],
//   },
// ];

const Dashboard = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const navigate = useNavigate();
  const { isLoaded, isAuthenticated, getAccessToken } = useAuth();
  const [showSidebar, setShowSidebar] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNewDocModalOpen, setIsNewDocModalOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | undefined>();

  // Template selection is handled by NewDocumentModal component
  // No local template state needed here


  useEffect(() => {
    // PREVIOUS IMPLEMENTATION (commented out):
    // - Fetched documents once on mount, even if `token` was not yet available.
    //
    // Reason for change:
    // - Clerk tokens are fetched/rotated asynchronously; we wait until we have a token before calling the backend.
    // - Use `getAccessToken()` on demand to avoid sending an expired JWT (which caused 403s).
    if (isLoaded && isAuthenticated) {
      fetchDocuments();
    }
  }, [isLoaded, isAuthenticated]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessToken();
      if (!token) return;
      const response = await fetch(apiUrl('/api/documents'), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      setError('Failed to fetch documents. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // TODO: Template helper function - commented out since NewDocumentModal handles template selection
  // Uncomment if template-to-language mapping is needed here in the future
  // const getLanguageFromTemplate = (templateKey: CodeTemplateKey): string => {
  //   // ... template mapping logic ...
  // };

  // Handle document creation - called by NewDocumentModal
  // NewDocumentModal handles template selection and passes title, language, and optional templateId
  // TODO: Integrate template content (templateId) when backend supports initialContent
  const handleCreateDocument = async (title: string, language: Language, templateId?: string) => {
    // templateId is passed by NewDocumentModal but not used yet - will be integrated when template content is needed
    void templateId;
    if (!title.trim()) return;

    try {
      const token = await getAccessToken();
      if (!token) return;

      // TODO: Get template content when templateId is provided
      // NewDocumentModal passes templateId, but we need to fetch template content from CODE_TEMPLATES
      // Uncomment when template content integration is needed:
      // import { CODE_TEMPLATES, type CodeTemplateKey } from '@/templates/codeTemplates';
      // const template = templateId ? CODE_TEMPLATES[templateId as CodeTemplateKey] : null;
      // const templateContent = template?.content || '';

      const response = await fetch(apiUrl('/api/documents'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          editorLanguage: language,
          // PREVIOUS IMPLEMENTATION (commented out):
          // - Created a document with just a title (blank Yjs state).
          //
          // Reason for change:
          // - We create the document with an initial Yjs update derived from the selected template content.
          //   Backend encodes + persists the update bytes so all clients load the same initial content.
          //
          // TODO: Uncomment when template content integration is complete
          // initialContent: templateContent,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create document');
      }

      const newDoc = await response.json();

      // Add the new document to the local state
      setDocuments([...documents, newDoc]);
      setIsNewDocModalOpen(false);

      // Navigate to the new document with language parameter
      // TODO: Update route when editor route is finalized (/editor/:id vs /document/:id)
      navigate(`/editor/${newDoc.id}?language=${language}`);
    } catch (error) {
      console.error('Failed to create document:', error);
      setError('Failed to create document. Please try again.');
      // TODO: Add better error handling (show toast notification)
    }
  };

  const handleSelectDocument = (id: string) => {
    setSelectedDocId(id);
    // TODO: Update route when editor route is finalized (/editor/:id vs /document/:id)
    navigate(`/editor/${id}`);
  };


  return (
    <>
      <AppLayout
        showSidebar={showSidebar}
        sidebar={
          <Sidebar
            documents={documents}
            selectedDocumentId={selectedDocId}
            onSelectDocument={handleSelectDocument}
            onCreateDocument={() => setIsNewDocModalOpen(true)}
            onToggleSidebar={() => setShowSidebar(false)}
          />
        }
      >
        {/* Floating sidebar toggle button - always visible in same position */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="fixed left-3 top-1/2 -translate-y-1/2 z-50"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-full shadow-lg bg-card hover:bg-accent"
                onClick={() => setShowSidebar(!showSidebar)}
              >
                <PanelRight className={cn("h-4 w-4 transition-transform", showSidebar && "rotate-180")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {showSidebar ? 'Collapse sidebar' : 'Expand sidebar'}
            </TooltipContent>
          </Tooltip>
        </motion.div>

        {/* Floating theme toggle - top right */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed right-4 top-4 z-50"
        >
          <ThemeToggle className="h-10 w-10 rounded-full shadow-lg bg-card hover:bg-accent border border-border" />
        </motion.div>
        {/* Document Grid - displays documents with new theme styling */}
        {loading ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading documents...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={fetchDocuments} variant="outline">
                Retry
              </Button>
            </div>
          </div>
        ) : (
          <DocumentGrid
            documents={documents}
            selectedDocumentId={selectedDocId}
            onSelectDocument={handleSelectDocument}
            onCreateDocument={() => setIsNewDocModalOpen(true)}
          />
        )}
      </AppLayout>

      <NewDocumentModal
        isOpen={isNewDocModalOpen}
        onClose={() => setIsNewDocModalOpen(false)}
        onCreate={handleCreateDocument}
      />
    </>
  );
};

export default Dashboard;
