import { useState, useRef, useEffect, useMemo } from 'react';
import { useAction } from 'convex/react';
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

interface SendActionResult {
  response?: string;
  error?: string;
  threadId?: string;
  toolCalls?: ToolCall[];
}

type SendActionArgs = {
  threadId?: string;
  message: string;
  sessionId: string;
  attachments?: Attachment[];
};

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
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[] | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // @ts-expect-error Convex generated types cause deep instantiation in useAction
  const sendMessage = useAction(api.chat.send) as unknown as (
    args: SendActionArgs,
  ) => Promise<SendActionResult>;

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
          attachments: pendingAttachments ?? undefined,
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
      const metadataCarrier = msg as unknown as {
        message?: {
          metadata?: { attachments?: string };
          providerOptions?: { metadata?: { attachments?: string } };
        };
        providerOptions?: { metadata?: { attachments?: string } };
      };
      const attachmentsJson =
        metadataCarrier.message?.metadata?.attachments ??
        metadataCarrier.message?.providerOptions?.metadata?.attachments ??
        metadataCarrier.providerOptions?.metadata?.attachments;
      if (role === 'user' && attachmentsJson) {
        try {
          msgAttachments = JSON.parse(attachmentsJson);
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
        attachments: pendingAttachments ?? undefined,
      });
    }

    return result;
  }, [threadMessages, toolResultMap, pendingUserMessage, pendingAttachments, attachments]);

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
        
        // Convert file to base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Add to attachments with base64 data
        setAttachments((prev) => [...prev, {
          uploadToken: `local-${Date.now()}-${Math.random()}`,
          url: base64,
          fileName: file.name,
          fileType: file.type,
        }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process file');
      console.error('File processing error:', err);
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
    setPendingAttachments(null);
    // Clear any existing attachments in input
    setAttachments([]);

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
      setPendingAttachments(null);
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
    
    // Capture attachments before clearing
    const currentAttachments = [...attachments];
    setPendingUserMessage(trimmedInput || '(Image attached)');
    setPendingAttachments(currentAttachments.length > 0 ? currentAttachments : null);
    setAttachments([]);

    try {
      const result = await sendMessage({
        threadId: threadId ?? undefined,
        message: trimmedInput,
        sessionId,
        attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
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
      setPendingAttachments(null);
      setAttachments([]);
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
