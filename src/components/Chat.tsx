import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getSocket } from '../services/socket';
import {
  Box,
  Paper,
  TextField,
  IconButton,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Divider,
  Chip,
  Fade,
  Zoom
} from '@mui/material';
import {
  Send as SendIcon,
  Chat as ChatIcon,
  Close as CloseIcon,
  Person as PersonIcon
} from '@mui/icons-material';

interface ChatMessage {
  id: string;
  message: string;
  userId: string;
  userName: string;
  timestamp: number;
  isOwn: boolean;
}

interface ChatProps {
  isOpen: boolean;
  onClose: () => void;
}

const Chat: React.FC<ChatProps> = ({ isOpen, onClose }) => {
  // PREVIOUS IMPLEMENTATION (commented out):
  // - Attempted to create the socket before `token` was available in scope.
  //
  // Reason for change:
  // - We must read the auth token first, then create/reuse the authenticated socket.
  // const socket = getSocket(token);

  const { id: documentId } = useParams<{ id: string }>();
  const { token } = useAuth();
  const socket = useMemo(() => getSocket(token), [token]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Socket event handlers
  useEffect(() => {
    if (!isOpen || !documentId) return;
    if (!socket.connected) socket.connect();

    const handleMessageReceived = (data: any) => {
      if (data.documentId === documentId) {
        const newChatMessage: ChatMessage = {
          id: `${data.userId}-${data.timestamp}`,
          message: data.message,
          userId: data.userId,
          userName: data.userName || `User ${data.userId.slice(0, 6)}`,
          timestamp: data.timestamp,
          isOwn: false
        };
        
        setMessages(prev => [...prev, newChatMessage]);
      }
    };

    const handleTypingStart = (data: any) => {
      if (data.documentId === documentId && data.userId !== socket.id) {
        setTypingUsers(prev => {
          if (!prev.includes(data.userName)) {
            return [...prev, data.userName];
          }
          return prev;
        });
      }
    };

    const handleTypingStop = (data: any) => {
      if (data.documentId === documentId && data.userId !== socket.id) {
        setTypingUsers(prev => prev.filter(name => name !== data.userName));
      }
    };

    // Listen for incoming messages and typing indicators
    socket.on('message-received', handleMessageReceived);
    socket.on('typing-start', handleTypingStart);
    socket.on('typing-stop', handleTypingStop);

    return () => {
      socket.off('message-received', handleMessageReceived);
      socket.off('typing-start', handleTypingStart);
      socket.off('typing-stop', handleTypingStop);
    };
    // PREVIOUS IMPLEMENTATION (commented out):
    // }, [isOpen, documentId]);
    //
    // Reason for change:
    // - `socket` is derived from the current auth token and should be in the dependency list.
  }, [isOpen, documentId, socket]);

  // Handle typing indicator
  const handleTyping = (value: string) => {
    setNewMessage(value);
    
    if (!isTyping && value.length > 0 && socket.id) {
      setIsTyping(true);
      socket.emit('typing-start', {
        documentId,
        userName: `User ${socket.id.slice(0, 6)}`
      });
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing indicator after 1 second of no input
    typingTimeoutRef.current = setTimeout(() => {
      if (isTyping && socket.id) {
        setIsTyping(false);
        socket.emit('typing-stop', {
          documentId,
          userName: `User ${socket.id.slice(0, 6)}`
        });
      }
    }, 1000);
  };

  // Send message
  const handleSendMessage = () => {
    if (!newMessage.trim() || !documentId || !socket.id) return;

    const messageData = {
      documentId,
      message: newMessage.trim(),
      userId: socket.id,
      userName: `User ${socket.id.slice(0, 6)}`
    };

    // Add message to local state immediately (optimistic update)
    const ownMessage: ChatMessage = {
      id: `${socket.id}-${Date.now()}`,
      message: newMessage.trim(),
      userId: socket.id,
      userName: `You`,
      timestamp: Date.now(),
      isOwn: true
    };

    setMessages(prev => [...prev, ownMessage]);
    setNewMessage('');

    // Stop typing indicator
    setIsTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    socket.emit('typing-stop', {
      documentId,
      userName: `User ${socket.id.slice(0, 6)}`
    });

    // Send message to server
    socket.emit('send-message', messageData);
  };

  // Handle Enter key
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Format timestamp
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (!isOpen) return null;

  return (
    <Fade in={isOpen}>
      <Paper
        elevation={8}
        sx={{
          position: 'fixed',
          right: 20,
          top: 20,
          width: 350,
          height: 'calc(100vh - 40px)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1300,
          overflow: 'hidden'
        }}
      >
        {/* Chat Header */}
        <Box
          sx={{
            p: 2,
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            bgcolor: 'primary.main',
            color: 'primary.contrastText'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ChatIcon sx={{ mr: 1 }} />
            <Typography variant="h6">Document Chat</Typography>
          </Box>
          <IconButton onClick={onClose} color="inherit" size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Messages Area */}
        <Box
          sx={{
            flexGrow: 1,
            overflow: 'auto',
            p: 2,
            bgcolor: 'grey.50'
          }}
        >
          {messages.length === 0 ? (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'text.secondary'
              }}
            >
              <ChatIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
              <Typography variant="body2" align="center">
                Start the conversation!<br />
                Messages are only visible to users in this document.
              </Typography>
            </Box>
          ) : (
            <List sx={{ p: 0 }}>
              {messages.map((message, index) => (
                <ListItem
                  key={message.id}
                  sx={{
                    flexDirection: 'column',
                    alignItems: message.isOwn ? 'flex-end' : 'flex-start',
                    p: 0,
                    mb: 2
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      maxWidth: '80%',
                      flexDirection: message.isOwn ? 'row-reverse' : 'row'
                    }}
                  >
                    {!message.isOwn && (
                      <Avatar
                        sx={{
                          width: 32,
                          height: 32,
                          mr: 1,
                          bgcolor: 'primary.main',
                          fontSize: '0.75rem'
                        }}
                      >
                        {message.userName.charAt(0).toUpperCase()}
                      </Avatar>
                    )}
                    
                    <Box
                      sx={{
                        bgcolor: message.isOwn ? 'primary.main' : 'white',
                        color: message.isOwn ? 'primary.contrastText' : 'text.primary',
                        borderRadius: 2,
                        px: 2,
                        py: 1,
                        boxShadow: 1,
                        maxWidth: '100%',
                        wordBreak: 'break-word'
                      }}
                    >
                      {!message.isOwn && (
                        <Typography
                          variant="caption"
                          sx={{
                            display: 'block',
                            mb: 0.5,
                            color: message.isOwn ? 'inherit' : 'text.secondary',
                            opacity: 0.8
                          }}
                        >
                          {message.userName}
                        </Typography>
                      )}
                      
                      <Typography variant="body2">
                        {message.message}
                      </Typography>
                      
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block',
                          mt: 0.5,
                          opacity: 0.7,
                          textAlign: message.isOwn ? 'right' : 'left'
                        }}
                      >
                        {formatTime(message.timestamp)}
                      </Typography>
                    </Box>
                  </Box>
                </ListItem>
              ))}
              
              {/* Typing indicators */}
              {typingUsers.length > 0 && (
                <ListItem sx={{ p: 0, mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Avatar
                      sx={{
                        width: 24,
                        height: 24,
                        mr: 1,
                        bgcolor: 'grey.400',
                        fontSize: '0.6rem'
                      }}
                    >
                      <PersonIcon sx={{ fontSize: 16 }} />
                    </Avatar>
                    <Typography variant="caption" color="text.secondary">
                      {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                    </Typography>
                  </Box>
                </ListItem>
              )}
              
              <div ref={messagesEndRef} />
            </List>
          )}
        </Box>

        {/* Input Area */}
        <Box
          sx={{
            p: 2,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
            <TextField
              fullWidth
              multiline
              maxRows={3}
              value={newMessage}
              onChange={(e) => handleTyping(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              variant="outlined"
              size="small"
              sx={{ mr: 1 }}
            />
            <IconButton
              onClick={handleSendMessage}
              disabled={!newMessage.trim()}
              color="primary"
              sx={{ 
                bgcolor: newMessage.trim() ? 'primary.main' : 'grey.300',
                color: newMessage.trim() ? 'white' : 'grey.600',
                '&:hover': {
                  bgcolor: newMessage.trim() ? 'primary.dark' : 'grey.400'
                }
              }}
            >
              <SendIcon />
            </IconButton>
          </Box>
          
          {/* Typing indicator for current user */}
          {isTyping && (
            <Zoom in={isTyping}>
              <Chip
                label="typing..."
                size="small"
                sx={{ mt: 1, opacity: 0.7 }}
              />
            </Zoom>
          )}
        </Box>
      </Paper>
    </Fade>
  );
};

export default Chat;