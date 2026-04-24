import { useEffect, useState } from 'react';
// import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileCode } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { languageConfigs, languages } from '@/constants/languages';
import { getTemplatesByLanguage, getTemplateCategories } from '@/constants/templates';
import type { Language } from '@/types';

interface NewDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, language: Language, templateId?: string) => void;
}

export function NewDocumentModal({
  isOpen,
  onClose,
  onCreate,
}: NewDocumentModalProps) {
  const [title, setTitle] = useState('Untitled');
  const [language, setLanguage] = useState<Language>('javascript');
  useEffect(() => {
    // setLanguage('javascript');
    console.log("language: " + language)
  }, [language]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');

  const templates = getTemplatesByLanguage(language);
  // const categories = getTemplateCategories();

  const filteredTemplates = templates.filter((t) =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
    t.description.toLowerCase().includes(templateSearch.toLowerCase())
  );

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const handleCreate = () => {
    onCreate(title || 'Untitled', language, selectedTemplateId || undefined);
    // Reset form
    setTitle('Untitled');
    setLanguage('javascript');
    setSelectedTemplateId(null);
    setTemplateSearch('');
  };

  const langConfig = languageConfigs[language];
  const LangIcon = langConfig.icon;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <FileCode className="h-5 w-5 text-primary" />
            Create New Document
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col md:flex-row h-[500px]">
          {/* Left: Form */}
          <div className="flex-1 p-6 border-r space-y-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Document Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter document title..."
              />
            </div>

            {/* Language */}
            <div className="space-y-2">
              <Label>Language</Label>
              <Select value={language} onValueChange={(v) => {
                setLanguage(v as Language);
                setSelectedTemplateId(null);
              }}>
                <SelectTrigger>
                  <div className="flex items-center gap-2">
                    <LangIcon className="h-4 w-4" style={{ color: langConfig.color }} />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {languages.map((lang) => {
                    const config = languageConfigs[lang];
                    const Icon = config.icon;
                    return (
                      <SelectItem key={lang} value={lang}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" style={{ color: config.color }} />
                          <span>{config.name}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Template Search */}
            <div className="space-y-2">
              <Label>Template (Optional)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  placeholder="Search templates..."
                  className="pl-9"
                />
              </div>
            </div>

            {/* Template List */}
            <ScrollArea className="h-48 rounded-md border">
              <div className="p-2 space-y-1">
                {/* Blank option */}
                <button
                  onClick={() => setSelectedTemplateId(null)}
                  className={`w-full flex items-center gap-2 p-2 rounded-md text-sm text-left transition-colors ${selectedTemplateId === null
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent'
                    }`}
                >
                  <FileCode className="h-4 w-4" />
                  <span>Blank Document</span>
                </button>

                {filteredTemplates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`w-full flex items-center justify-between gap-2 p-2 rounded-md text-sm text-left transition-colors ${selectedTemplateId === template.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent'
                      }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCode className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{template.name}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {template.category}
                    </Badge>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Right: Preview */}
          <div className="flex-1 flex flex-col bg-muted/30">
            <div className="p-4 border-b bg-muted/50">
              <h3 className="font-medium text-sm">
                {selectedTemplate ? selectedTemplate.name : 'Preview'}
              </h3>
              {selectedTemplate && (
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedTemplate.description}
                </p>
              )}
            </div>
            <ScrollArea className="flex-1">
              <pre className="p-4 text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                {selectedTemplate
                  ? selectedTemplate.code || '// Empty template'
                  : '// Blank document - start coding!'}
              </pre>
            </ScrollArea>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t bg-muted/30">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate}>
            Create Document
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
