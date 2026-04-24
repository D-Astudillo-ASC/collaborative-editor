import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Palette,
  Code2,
  User,
  Bell,
  Shield,
  Monitor,
  Moon,
  Sun,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

type SettingsSection = 'appearance' | 'editor' | 'account';

const Settings = () => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');

  // Editor settings state
  const [fontSize, setFontSize] = useState(14);
  const [tabSize, setTabSize] = useState(2);
  const [lineNumbers, setLineNumbers] = useState(true);
  const [wordWrap, setWordWrap] = useState(true);
  const [minimap, setMinimap] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [fontFamily, setFontFamily] = useState('jetbrains-mono');

  // Account settings state
  const [displayName, setDisplayName] = useState('Demo User');
  const [email, setEmail] = useState('demo@example.com');

  const sections = [
    { id: 'appearance' as const, label: 'Appearance', icon: Palette },
    { id: 'editor' as const, label: 'Editor', icon: Code2 },
    { id: 'account' as const, label: 'Account', icon: User },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto px-6 h-16 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8 max-w-5xl mx-auto">
          {/* Sidebar Navigation */}
          <nav className="lg:w-56 flex-shrink-0">
            <ul className="flex lg:flex-col gap-1">
              {sections.map((section) => (
                <li key={section.id}>
                  <button
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      activeSection === section.id
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <section.icon className="h-4 w-4" />
                    {section.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Settings Content */}
          <div className="flex-1 min-w-0">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              {/* Appearance Settings */}
              {activeSection === 'appearance' && (
                <>
                  <div>
                    <h2 className="text-xl font-semibold mb-1">Appearance</h2>
                    <p className="text-muted-foreground text-sm">
                      Customize how CodeSync looks on your device
                    </p>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-3">
                      <Label className="text-base">Theme</Label>
                      <RadioGroup
                        value={theme}
                        onValueChange={(value) => setTheme(value as 'light' | 'dark' | 'system')}
                        className="grid grid-cols-3 gap-4"
                      >
                        {[
                          { value: 'light', label: 'Light', icon: Sun },
                          { value: 'dark', label: 'Dark', icon: Moon },
                          { value: 'system', label: 'System', icon: Monitor },
                        ].map((option) => (
                          <Label
                            key={option.value}
                            className={cn(
                              'flex flex-col items-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-colors',
                              theme === option.value
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-muted-foreground/50'
                            )}
                          >
                            <RadioGroupItem value={option.value} className="sr-only" />
                            <option.icon className="h-5 w-5" />
                            <span className="text-sm font-medium">{option.label}</span>
                            {theme === option.value && (
                              <Check className="h-4 w-4 text-primary absolute top-2 right-2" />
                            )}
                          </Label>
                        ))}
                      </RadioGroup>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <Label className="text-base">Accent Color</Label>
                      <div className="flex gap-3">
                        {['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'].map((color) => (
                          <button
                            key={color}
                            className={cn(
                              'h-8 w-8 rounded-full border-2 transition-transform hover:scale-110',
                              color === '#6366f1' ? 'border-foreground' : 'border-transparent'
                            )}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Accent color customization coming soon
                      </p>
                    </div>
                  </div>
                </>
              )}

              {/* Editor Settings */}
              {activeSection === 'editor' && (
                <>
                  <div>
                    <h2 className="text-xl font-semibold mb-1">Editor</h2>
                    <p className="text-muted-foreground text-sm">
                      Configure your code editing experience
                    </p>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-base">Font Size</Label>
                        <span className="text-sm text-muted-foreground">{fontSize}px</span>
                      </div>
                      <Slider
                        value={[fontSize]}
                        onValueChange={(v) => setFontSize(v[0])}
                        min={10}
                        max={24}
                        step={1}
                        className="w-full"
                      />
                    </div>

                    <div className="space-y-3">
                      <Label className="text-base">Font Family</Label>
                      <Select value={fontFamily} onValueChange={setFontFamily}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="jetbrains-mono">JetBrains Mono</SelectItem>
                          <SelectItem value="fira-code">Fira Code</SelectItem>
                          <SelectItem value="source-code-pro">Source Code Pro</SelectItem>
                          <SelectItem value="monaco">Monaco</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-base">Tab Size</Label>
                      <Select value={String(tabSize)} onValueChange={(v) => setTabSize(Number(v))}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">2 spaces</SelectItem>
                          <SelectItem value="4">4 spaces</SelectItem>
                          <SelectItem value="8">8 spaces</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      {[
                        { id: 'lineNumbers', label: 'Line Numbers', description: 'Show line numbers in the gutter', checked: lineNumbers, onChange: setLineNumbers },
                        { id: 'wordWrap', label: 'Word Wrap', description: 'Wrap long lines instead of horizontal scrolling', checked: wordWrap, onChange: setWordWrap },
                        { id: 'minimap', label: 'Minimap', description: 'Show a minimap of the code on the right side', checked: minimap, onChange: setMinimap },
                        { id: 'autoSave', label: 'Auto Save', description: 'Automatically save changes as you type', checked: autoSave, onChange: setAutoSave },
                      ].map((setting) => (
                        <div key={setting.id} className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label htmlFor={setting.id} className="text-base cursor-pointer">
                              {setting.label}
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              {setting.description}
                            </p>
                          </div>
                          <Switch
                            id={setting.id}
                            checked={setting.checked}
                            onCheckedChange={setting.onChange}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Account Settings */}
              {activeSection === 'account' && (
                <>
                  <div>
                    <h2 className="text-xl font-semibold mb-1">Account</h2>
                    <p className="text-muted-foreground text-sm">
                      Manage your account settings and preferences
                    </p>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-3">
                      <Label htmlFor="displayName" className="text-base">Display Name</Label>
                      <Input
                        id="displayName"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="max-w-md"
                      />
                    </div>

                    <div className="space-y-3">
                      <Label htmlFor="email" className="text-base">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="max-w-md"
                      />
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <Label className="text-base">Password</Label>
                      <Button variant="outline">Change Password</Button>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <Label className="text-base text-destructive">Danger Zone</Label>
                      <p className="text-sm text-muted-foreground">
                        Permanently delete your account and all associated data
                      </p>
                      <Button variant="destructive">Delete Account</Button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
