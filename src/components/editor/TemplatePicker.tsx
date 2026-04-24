import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, FileCode, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { templates, getTemplatesByLanguage } from '@/constants/templates';
import { languageConfigs, languages } from '@/constants/languages';
import type { Language, Template } from '@/types';
import { cn } from '@/lib/utils';

interface TemplatePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: Template) => void;
  currentLanguage: Language;
}

export function TemplatePicker({
  isOpen,
  onClose,
  onSelectTemplate,
  currentLanguage,
}: TemplatePickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<Language | 'all'>(currentLanguage);
  const [hoveredTemplate, setHoveredTemplate] = useState<Template | null>(null);
  const [recentTemplates] = useState<string[]>([]); // Would be persisted in localStorage

  // Filter templates based on search and language
  const filteredTemplates = useMemo(() => {
    let result = selectedLanguage === 'all'
      ? templates
      : getTemplatesByLanguage(selectedLanguage);

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          t.category.toLowerCase().includes(query)
      );
    }

    return result;
  }, [selectedLanguage, searchQuery]);

  // Group templates by category
  const groupedTemplates = useMemo(() => {
    const groups: Record<string, Template[]> = {};
    filteredTemplates.forEach((template) => {
      if (!groups[template.category]) {
        groups[template.category] = [];
      }
      groups[template.category].push(template);
    });
    return groups;
  }, [filteredTemplates]);

  const handleSelectTemplate = (template: Template) => {
    onSelectTemplate(template);
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:w-[540px] sm:max-w-[540px] p-0">
        <div className="flex h-full flex-col">
          {/* Header */}
          <SheetHeader className="border-b border-border p-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5 text-primary" />
                Code Templates
              </SheetTitle>
              <Badge variant="secondary">{templates.length} templates</Badge>
            </div>

            {/* Search */}
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {/* Language Filter */}
            <Tabs
              value={selectedLanguage}
              onValueChange={(v) => setSelectedLanguage(v as Language | 'all')}
              className="mt-3"
            >
              <TabsList className="h-8 w-full justify-start gap-1 overflow-x-auto bg-transparent p-0">
                <TabsTrigger
                  value="all"
                  className="h-7 rounded-full px-3 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  All
                </TabsTrigger>
                {languages.map((lang) => {
                  const config = languageConfigs[lang];
                  const Icon = config.icon;
                  const count = getTemplatesByLanguage(lang).length;
                  return (
                    <TabsTrigger
                      key={lang}
                      value={lang}
                      className="h-7 gap-1.5 rounded-full px-3 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    >
                      <Icon className="h-3 w-3" style={{ color: config.color }} />
                      <span>{config.name}</span>
                      <span className="text-muted-foreground">({count})</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
          </SheetHeader>

          {/* Content */}
          <div className="flex flex-1 overflow-hidden">
            {/* Template List */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-6">
                {/* Recent Templates */}
                {recentTemplates.length > 0 && !searchQuery && (
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      Recently Used
                    </h3>
                    <div className="grid gap-2">
                      {/* Would map recent templates here */}
                    </div>
                  </div>
                )}

                {/* Grouped Templates */}
                {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
                  <div key={category}>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      {category}
                    </h3>
                    <div className="grid gap-2">
                      {categoryTemplates.map((template) => {
                        const langConfig = languageConfigs[template.language];
                        const LangIcon = langConfig?.icon || FileCode;
                        return (
                          <motion.button
                            key={template.id}
                            onClick={() => handleSelectTemplate(template)}
                            onMouseEnter={() => setHoveredTemplate(template)}
                            onMouseLeave={() => setHoveredTemplate(null)}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            className={cn(
                              "flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent",
                              hoveredTemplate?.id === template.id && "border-primary/50 bg-accent"
                            )}
                          >
                            <div
                              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                              style={{ backgroundColor: `${langConfig?.color}20` }}
                            >
                              <LangIcon className="h-4 w-4" style={{ color: langConfig?.color }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{template.name}</p>
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                {template.description}
                              </p>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {filteredTemplates.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Search className="h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-4 text-sm font-medium">No templates found</p>
                    <p className="text-xs text-muted-foreground">
                      Try a different search term or language filter
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Preview Panel */}
            <AnimatePresence mode="wait">
              {hoveredTemplate && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.15 }}
                  className="hidden lg:block w-64 border-l border-border bg-muted/30 p-4"
                >
                  <div className="mb-3">
                    <p className="font-medium text-sm">{hoveredTemplate.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {hoveredTemplate.description}
                    </p>
                  </div>
                  <div className="rounded-md bg-editor-bg border border-border overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-1.5">
                      <div className="flex gap-1">
                        <div className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                        <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
                        <div className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
                      </div>
                      <span className="text-[10px] text-muted-foreground">Preview</span>
                    </div>
                    <pre className="p-3 text-[10px] leading-relaxed overflow-hidden max-h-48">
                      <code className="text-muted-foreground">
                        {hoveredTemplate.code.slice(0, 500)}
                        {hoveredTemplate.code.length > 500 && '...'}
                      </code>
                    </pre>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
