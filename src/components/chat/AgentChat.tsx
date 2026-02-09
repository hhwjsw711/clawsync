import { useState, useRef, useEffect, useMemo } from 'react';
import { useAction, useMutation } from 'convex/react';
import { useThreadMessages } from '@convex-dev/agent/react';
import { api } from '../../../convex/_generated/api';
import { MessageBubble } from './MessageBubble';
import './AgentChat.css';
import { Paperclip, X, Image, FileText, Sparkle } from '@phosphor-icons/react';

interface Attachment {
  uploadToken: string;
  url: string;
  fileName: string;
  fileType: string;
}

interface ToolCall {
  name: string;
  args: string;
  result: string;
}

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  streaming?: boolean;
  attachments?: Attachment[];
}

interface AgentChatProps {
  sessionId: string;
  threadId: string | null;
  onThreadChange: (threadId: string) => void;
  placeholder?: string;
  maxLength?: number;
}

export function AgentChat({
  sessionId,
  threadId,
  onThreadChange,
  placeholder = 'Ask me anything...',
  maxLength = 4000,
}: AgentChatProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sendMessage = useAction(api.chat.send);
  const generateUploadUrl = useMutation(api.fileUploads.generateUploadUrl);
  const markComplete = useMutation(api.fileUploads.markComplete);
  const getFileUrlByToken = useMutation(api.fileUploads.getFileUrlByToken);

  // Reactively subscribe to thread messages (streams as agent saves per step)
  const { results: threadMessages } = useThreadMessages(
    api.messages.list,
    threadId ? { threadId } : 'skip',
    { initialNumItems: 100, stream: true },
  );

  // Build a map of toolCallId -> result from tool-role messages
  const toolResultMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!threadMessages) return map;
    for (const msg of threadMessages) {
      if (msg.message?.role === 'tool' && Array.isArray(msg.message.content)) {
        for (const part of msg.message.content) {
          if (part.type === 'tool-result' && part.toolCallId) {
            const result = part.result
              ? typeof part.result === 'string'
                ? part.result.slice(0, 1000)
                : JSON.stringify(part.result, null, 2).slice(0, 1000)
              : '';
            map.set(part.toolCallId, result);
          }
        }
      }
    }
    return map;
  }, [threadMessages]);

  // Convert thread messages to display format
  const messages: DisplayMessage[] = useMemo(() => {
    const result: DisplayMessage[] = [];
    if (!threadMessages) {
      // Show optimistic user message when subscription hasn't activated yet
      if (pendingUserMessage) {
        result.push({
          id: 'pending-user',
          role: 'user',
          content: pendingUserMessage,
          timestamp: Date.now(),
          attachments: attachments.length > 0 ? attachments : undefined,
        });
      }
      return result;
    }

    for (const msg of threadMessages) {
      const role = msg.message?.role;
      if (role !== 'user' && role !== 'assistant') continue;

      const text = msg.text ?? '';
      
      // Extract attachments from message metadata
      let msgAttachments: Attachment[] | undefined;
      if (role === 'user' && msg.message?.metadata?.attachments) {
        try {
          msgAttachments = JSON.parse(msg.message.metadata.attachments);
        } catch {
          // Ignore parse error
        }
      }

      // Extract tool calls from assistant message content
      let toolCalls: ToolCall[] | undefined;
      if (role === 'assistant' && Array.isArray(msg.message?.content)) {
        const calls = (msg.message!.content as any[])
          .filter((part) => part.type === 'tool-call')
          .map((part) => ({
            name: part.toolName ?? 'unknown',
            args: JSON.stringify(part.args ?? {}, null, 2),
            result: toolResultMap.get(part.toolCallId) ?? '',
          }));
        if (calls.length > 0) toolCalls = calls;
      }

      // Skip empty assistant messages (intermediate steps with no text or tool calls)
      if (role === 'assistant' && !text.trim() && !toolCalls) continue;

      result.push({
        id: (msg as any).key ?? (msg as any)._id ?? `${msg.order}-${msg.stepOrder}`,
        role,
        content: text,
        timestamp: (msg as any)._creationTime ?? Date.now(),
        toolCalls,
        attachments: msgAttachments,
        streaming: (msg as any).streaming,
      });
    }

    // Clear pending message once subscription has the user's message
    if (pendingUserMessage && result.some((m) => m.role === 'user' && m.content === pendingUserMessage)) {
      // Will clear on next render cycle
    } else if (pendingUserMessage) {
      // Subscription active but user message not yet saved — show optimistic
      result.push({
        id: 'pending-user',
        role: 'user',
        content: pendingUserMessage,
        timestamp: Date.now(),
        attachments: attachments.length > 0 ? attachments : undefined,
      });
    }

    return result;
  }, [threadMessages, toolResultMap, pendingUserMessage, attachments]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      for (const file of Array.from(files)) {
        // Validate file type (images and PDFs only)
        const isImage = file.type.startsWith('image/');
        const isPDF = file.type === 'application/pdf';
        
        if (!isImage && !isPDF) {
          throw new Error(`File type "${file.type}" not supported. Please upload images (PNG, JPG, etc.) or PDF files.`);
        }
        
        // Check file size (limit to 10MB for PDFs, 5MB for images)
        const maxSize = isPDF ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
        if (file.size > maxSize) {
          const maxSizeMB = maxSize / (1024 * 1024);
          throw new Error(`File "${file.name}" is too large. Maximum size is ${maxSizeMB}MB for ${isPDF ? 'PDFs' : 'images'}.`);
        }
        
        // Generate upload URL
        const { uploadUrl, uploadToken } = await generateUploadUrl({
          fileType: file.type,
          fileName: file.name,
        });

        // Upload file to Convex storage
        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': file.type },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        // Extract storageId from upload response
        const uploadResult = await uploadResponse.json();
        const storageId = uploadResult.storageId;

        // Mark upload as complete (using token as identifier)
        await markComplete({ uploadToken: uploadToken, storageId: storageId });

        // Get the actual file URL
        const fileUrl = await getFileUrlByToken({ uploadToken });
        
        if (!fileUrl) {
          throw new Error(`Could not get file URL for ${file.name}`);
        }

        // Add to attachments
        setAttachments((prev) => [...prev, {
          uploadToken: uploadToken,
          url: fileUrl,
          fileName: file.name,
          fileType: file.type,
        }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file');
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeAttachment = (uploadToken: string) => {
    setAttachments((prev) => prev.filter((a) => a.uploadToken !== uploadToken));
  };

  const sendMessageDirectly = async (messageText: string) => {
    if (isLoading) return;

    if (messageText.length > maxLength) {
      setError(`Message too long. Maximum ${maxLength} characters.`);
      return;
    }

    setError(null);
    setInput('');
    setIsLoading(true);
    setPendingUserMessage(messageText);

    try {
      const result = await sendMessage({
        threadId: threadId ?? undefined,
        message: messageText,
        sessionId,
        attachments: undefined,
      });

      if (result.error) {
        setError(result.error);
      }

      // Set threadId so subscription activates (important for first message)
      if (result.threadId && result.threadId !== threadId) {
        onThreadChange(result.threadId);
      }
    } catch (err) {
      setError('Failed to send message. Please try again.');
      console.error('Send error:', err);
    } finally {
      setIsLoading(false);
      setPendingUserMessage(null);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedInput = input.trim();
    if ((!trimmedInput && attachments.length === 0) || isLoading) return;

    if (trimmedInput.length > maxLength) {
      setError(`Message too long. Maximum ${maxLength} characters.`);
      return;
    }

    setError(null);
    setInput('');
    setIsLoading(true);
    setPendingUserMessage(trimmedInput || '(Image attached)');

    try {
      const result = await sendMessage({
        threadId: threadId ?? undefined,
        message: trimmedInput,
        sessionId,
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      if (result.error) {
        setError(result.error);
      }

      // Set threadId so subscription activates (important for first message)
      if (result.threadId && result.threadId !== threadId) {
        onThreadChange(result.threadId);
      }
      
      // Clear attachments after successful send
      setAttachments([]);
    } catch (err) {
      setError('Failed to send message. Please try again.');
      console.error('Send error:', err);
    } finally {
      setIsLoading(false);
      setPendingUserMessage(null);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleClearChat = () => {
    localStorage.removeItem('clawsync_thread_id');
    onThreadChange('');
    setAttachments([]);
  };

  // Show typing indicator if loading or any message is still streaming
  const hasStreamingMessage = messages.some((m) => m.streaming);
  const showTyping = isLoading || hasStreamingMessage;

  const isImageFile = (fileType: string) => fileType.startsWith('image/');

  return (
    <div className="agent-chat">
      <div className="messages-container">
        {messages.length === 0 && !isLoading ? (
          <div className="empty-state">
            <div className="empty-state-card">
              <div className="empty-state-icon">
                <Sparkle size={20} />
              </div>
              <h3 className="empty-state-title">Kick off your first message</h3>
              <p className="empty-state-hint">
                Ask anything, or drop an image for analysis. I can help with research, writing,
                and I can work with skills when you need tools or integrations.
              </p>
              <div className="empty-state-actions">
                {[
                  'Research top productivity apps and compile findings into a PDF',
                  "Search the web for latest AI SDK updates using Exa",
                  "Send me a summary of today's AI news via email",
                  "Post a tweet about AI news",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="empty-state-chip"
                    disabled={isLoading}
                    onClick={() => {
                      sendMessageDirectly(prompt);
                    }}
                  >
                    {isLoading ? 'Sending...' : prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              role={message.role}
              content={message.content}
              timestamp={message.timestamp}
              toolCalls={message.toolCalls}
              attachments={message.attachments}
            />
          ))
        )}

        {showTyping && (
          <div className="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="attachments-preview">
          {attachments.map((attachment) => (
            <div key={attachment.uploadToken} className="attachment-item">
              {isImageFile(attachment.fileType) ? (
                <div className="attachment-image">
                  <img src={attachment.url} alt={attachment.fileName} />
                  <div className="attachment-overlay">
                    <Image size={16} />
                    <span className="attachment-name">{attachment.fileName}</span>
                  </div>
                </div>
              ) : (
                <div className="attachment-file">
                  <FileText size={24} />
                  <span className="attachment-name">{attachment.fileName}</span>
                </div>
              )}
              <button
                className="attachment-remove"
                onClick={() => removeAttachment(attachment.uploadToken)}
                disabled={isLoading}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <form className="input-form" onSubmit={handleSubmit}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          multiple
          accept="image/*,.pdf,.txt,.doc,.docx"
          disabled={isLoading || isUploading}
        />
        
        <button
          type="button"
          className="attachment-button btn btn-ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || isUploading}
          title="Attach files"
        >
          {isUploading ? (
            <span className="upload-spinner" />
          ) : (
            <Paperclip size={20} />
          )}
        </button>
        
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={attachments.length > 0 ? 'Add a message about these files...' : placeholder}
          rows={1}
          className="chat-input"
          disabled={isLoading}
          maxLength={maxLength}
        />
        <button
          type="submit"
          className="send-button btn btn-primary"
          disabled={(!input.trim() && attachments.length === 0) || isLoading}
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </form>

      {messages.length > 0 && (
        <button className="clear-button btn btn-ghost" onClick={handleClearChat}>
          Clear conversation
        </button>
      )}
    </div>
  );
}
