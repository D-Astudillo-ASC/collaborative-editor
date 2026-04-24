import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Camera,
  Mail,
  Calendar,
  FileCode,
  Users,
  Clock,
  ExternalLink,
  Edit2,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const Profile = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);

  // Editable fields
  const [displayName, setDisplayName] = useState(user?.name || 'Demo User');
  const [bio, setBio] = useState('Full-stack developer passionate about collaborative tools and developer experience.');
  const [website, setWebsite] = useState('https://example.com');
  const [location, setLocation] = useState('San Francisco, CA');

  // Mock stats
  const stats = [
    { label: 'Documents', value: 12, icon: FileCode },
    { label: 'Collaborators', value: 8, icon: Users },
    { label: 'Hours Coded', value: 156, icon: Clock },
  ];

  // Mock recent activity
  const recentActivity = [
    { id: 1, action: 'Created', document: 'React App', time: '2 hours ago' },
    { id: 2, action: 'Edited', document: 'API Server', time: '5 hours ago' },
    { id: 3, action: 'Shared', document: 'Main Class', time: '1 day ago' },
  ];

  const handleSave = () => {
    // TODO: Save profile changes
    setIsEditing(false);
  };

  const handleCancel = () => {
    // Reset to original values
    setDisplayName(user?.name || 'Demo User');
    setIsEditing(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-lg font-semibold">Profile</h1>
          </div>

          {!isEditing ? (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="gap-2">
              <Edit2 className="h-3.5 w-3.5" />
              Edit Profile
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancel} className="gap-2">
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} className="gap-2">
                <Check className="h-3.5 w-3.5" />
                Save
              </Button>
            </div>
          )}
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 max-w-4xl">
        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row gap-6 items-start md:items-center mb-8"
        >
          <div className="relative group">
            <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
              <AvatarImage src={user?.imageUrl} alt={displayName} />
              <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                {displayName.split(' ').map(n => n[0]).join('').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {isEditing && (
              <button className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="h-6 w-6 text-white" />
              </button>
            )}
          </div>

          <div className="flex-1">
            {isEditing ? (
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="text-2xl font-bold h-auto py-1 px-2 mb-2"
              />
            ) : (
              <h2 className="text-2xl font-bold mb-1">{displayName}</h2>
            )}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {user?.email || 'demo@example.com'}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Joined Jan 2024
              </span>
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-4 mb-8"
        >
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="p-4 rounded-xl bg-card border border-border text-center"
            >
              <stat.icon className="h-5 w-5 text-primary mx-auto mb-2" />
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Bio & Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6"
          >
            <div className="p-6 rounded-xl bg-card border border-border">
              <h3 className="font-semibold mb-4">About</h3>

              <div className="space-y-4">
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Bio</Label>
                  {isEditing ? (
                    <Textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      className="mt-1.5 min-h-[80px]"
                    />
                  ) : (
                    <p className="text-sm mt-1">{bio}</p>
                  )}
                </div>

                <Separator />

                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Location</Label>
                  {isEditing ? (
                    <Input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="mt-1.5"
                    />
                  ) : (
                    <p className="text-sm mt-1">{location}</p>
                  )}
                </div>

                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Website</Label>
                  {isEditing ? (
                    <Input
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      className="mt-1.5"
                    />
                  ) : (
                    <a
                      href={website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1 mt-1"
                    >
                      {website}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Recent Activity */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="p-6 rounded-xl bg-card border border-border">
              <h3 className="font-semibold mb-4">Recent Activity</h3>

              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileCode className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="text-muted-foreground">{activity.action}</span>{' '}
                        <span className="font-medium">{activity.document}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>

              <Button variant="ghost" className="w-full mt-4 text-muted-foreground">
                View all activity
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
