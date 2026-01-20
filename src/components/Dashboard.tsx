import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  List,
  ListItem,
  ListItemText,
  Button,
  Typography,
  Box,
  AppBar,
  Toolbar,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  Select,
  MenuItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useAuth } from '../contexts/AuthContext';
import { CODE_TEMPLATES, type CodeTemplateKey } from '../templates/codeTemplates';
import { apiUrl } from '../config/backend';

interface Document {
  id: string;
  title: string;
  lastModified: string | Date;
}

const Dashboard: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [openNewDoc, setOpenNewDoc] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<CodeTemplateKey>('blank');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { isLoaded, isAuthenticated, getAccessToken, logout } = useAuth();

  useEffect(() => {
    // PREVIOUS IMPLEMENTATION (commented out):
    // - Fetched documents once on mount, even if `token` was not yet available.
    //
    // Reason for change:
    // - Clerk tokens are fetched/rotated asynchronously; we wait until we have a token before calling the backend.
    // fetchDocuments();
    // if (token) fetchDocuments();
    //
    // Reason for change:
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

  // Helper function to determine language from template
  const getLanguageFromTemplate = (templateKey: CodeTemplateKey): string => {
    const template = CODE_TEMPLATES[templateKey];
    if (!template) {
      return 'tsx'; // Default
    }
    
    const languages = template.languages;
    if (!languages) {
      return 'tsx'; // Default
    }
    
    // Convert readonly array to regular array to check length
    const langArray = [...languages];
    if (langArray.length === 0) {
      return 'tsx'; // Default
    }
    
    // Prefer language-specific templates
    // Map template keys to their primary language
    const templateToLanguage: Record<string, string> = {
      javaClass: 'java',
      javaInterface: 'java',
      javaMain: 'java',
      javaMainSimple: 'java',
      pythonClass: 'python',
      pythonFunction: 'python',
      pythonMain: 'python',
      pythonMainSimple: 'python',
      reactTSXComponent: 'tsx',
      reactComponent: 'tsx', // Default to TSX for React
      reactHook: 'tsx',
      typescriptReact: 'tsx', // TypeScript React best practices
      expressRoute: 'typescript',
      nodeClass: 'typescript',
      typescriptInterface: 'typescript',
      asyncFunction: 'typescript',
      testFile: 'typescript',
      htmlTemplate: 'html', // HTML template maps to HTML language
    };
    
    // Check if template has a specific language mapping
    if (templateToLanguage[templateKey]) {
      return templateToLanguage[templateKey];
    }
    
    // Otherwise, use the first language from the template's languages array
    // Type assertion needed because template.languages is readonly array
    const firstLang = template.languages[0];
    return typeof firstLang === 'string' ? firstLang : 'tsx';
  };

  const handleCreateDocument = async () => {
    if (!newDocTitle.trim()) return;

    try {
      const token = await getAccessToken();
      if (!token) return;
      const template = CODE_TEMPLATES[selectedTemplate];
      
      // Determine the language from the selected template
      const language = getLanguageFromTemplate(selectedTemplate);
      
      const response = await fetch(apiUrl('/api/documents'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: newDocTitle.trim(),
          // PREVIOUS IMPLEMENTATION (commented out):
          // - Created a document with just a title (blank Yjs state).
          //
          // Reason for change:
          // - We create the document with an initial Yjs update derived from the selected template content.
          //   Backend encodes + persists the update bytes so all clients load the same initial content.
          //
          // title: newDocTitle.trim(),
          initialContent: template?.content || '',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create document');
      }

      const newDoc = await response.json();

      // Add the new document to the local state
      setDocuments([...documents, newDoc]);
      setOpenNewDoc(false);
      setNewDocTitle('');
      setSelectedTemplate('blank');

      // Navigate to the new document with language parameter
      navigate(`/document/${newDoc.id}?language=${language}`);
    } catch (error) {
      console.error('Failed to create document:', error);
      // You could add error handling here (show a snackbar, etc.)
    }
  };

  const formatDate = (date: string | Date) => {
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      return dateObj.toLocaleDateString();
    } catch {
      return 'Invalid date';
    }
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            My Documents
          </Typography>
          <IconButton
            color="inherit"
            onClick={() => setOpenNewDoc(true)}
            sx={{ mr: 2 }}
          >
            <AddIcon />
          </IconButton>
          <Button color="inherit" onClick={logout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Paper elevation={3}>
          {loading ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography>Loading documents...</Typography>
            </Box>
          ) : error ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="error">{error}</Typography>
              <Button onClick={fetchDocuments} sx={{ mt: 2 }}>
                Retry
              </Button>
            </Box>
          ) : documents.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary">
                No documents yet. Create your first document to get started!
              </Typography>
            </Box>
          ) : (
            <List>
              {documents.map((doc) => (
                <ListItem
                  key={doc.id}
                  component="button"
                  onClick={() => navigate(`/document/${doc.id}`)}
                  sx={{
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    '&:hover': {
                      backgroundColor: 'action.hover',
                    },
                  }}
                >
                  <ListItemText
                    primary={doc.title}
                    secondary={formatDate(doc.lastModified)}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Paper>
      </Container>

      <Dialog open={openNewDoc} onClose={() => setOpenNewDoc(false)}>
        <DialogTitle>Create New Document</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Document Title"
            fullWidth
            value={newDocTitle}
            onChange={(e) => { setNewDocTitle(e.target.value); }}
          // onKeyDown={(e) => {
          //   if (e.key === 'Enter') {
          //     handleCreateDocument();
          //   }
          // }}
          />

          <FormControl fullWidth margin="dense">
            <Select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value as CodeTemplateKey)}
              displayEmpty
            >
              {Object.entries(CODE_TEMPLATES).map(([key, tpl]) => (
                <MenuItem key={key} value={key}>
                  {tpl.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {CODE_TEMPLATES[selectedTemplate]?.description}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenNewDoc(false)}>Cancel</Button>
          <Button
            onClick={handleCreateDocument}
            variant="contained"
            disabled={!newDocTitle.trim()}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Dashboard;
