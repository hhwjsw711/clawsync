import ReactMarkdown from 'react-markdown';
import './MessageBubble.css';
import { Image, FileText, Download } from '@phosphor-icons/react';

interface ToolCall {
  name: string;
  args: string;
  result: string;
}

interface Attachment {
  uploadToken: string;
  url: string;
  fileName: string;
  fileType: string;
}

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  attachments?: Attachment[];
}

export function MessageBubble({ role, content, timestamp, toolCalls, attachments }: MessageBubbleProps) {
  const formattedTime = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isImageFile = (fileType: string) => fileType.startsWith('image/');
  const isPDFFile = (fileType: string) => fileType === 'application/pdf' || fileType.endsWith('/pdf');

  return (
    <div className={`message-bubble ${role}`}>
      {/* Attachments */}
      {attachments && attachments.length > 0 && (
        <div className="message-attachments">
          {attachments.map((attachment) => (
            <div key={attachment.uploadToken} className="attachment-wrapper">
              {isImageFile(attachment.fileType) ? (
                <div className="message-image-attachment">
                  <img 
                    src={attachment.url} 
                    alt={attachment.fileName}
                    className="attachment-image"
                    onClick={() => window.open(attachment.url, '_blank')}
                  />
                  <div className="image-overlay">
                    <Image size={16} />
                    <span className="image-name">{attachment.fileName}</span>
                  </div>
                </div>
              ) : (
                <a 
                  href={attachment.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="message-file-attachment"
                  download={attachment.fileName}
                >
                  <div className={`file-icon ${isPDFFile(attachment.fileType) ? 'pdf-icon' : ''}`}>
                    <FileText size={24} />
                    {isPDFFile(attachment.fileType) && <span className="pdf-badge">PDF</span>}
                  </div>
                  <div className="file-info">
                    <span className="file-name">{attachment.fileName}</span>
                    <span className="file-type">{isPDFFile(attachment.fileType) ? 'PDF Document' : attachment.fileType}</span>
                  </div>
                  <div className="file-download">
                    <Download size={18} />
                  </div>
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tool calls */}
      {toolCalls && toolCalls.length > 0 && (
        <div className="tool-calls">
          {toolCalls.map((tc, i) => {
            // Parse result to check for imageUrl
            let resultData: any = null;
            try {
              resultData = JSON.parse(tc.result);
            } catch {}
            
            const isImageGeneration = tc.name === 'generate_image' && resultData?.imageUrl;
            
            return (
              <details key={i} className="tool-call">
                <summary className="tool-call-summary">
                  <span className="tool-call-icon">&#9881;</span>
                  <span className="tool-call-name">{tc.name}</span>
                  <span className="tool-call-badge">tool call</span>
                </summary>
                <div className="tool-call-details">
                  <div className="tool-call-section">
                    <strong>Input:</strong>
                    <pre className="tool-call-json">{tc.args}</pre>
                  </div>
                  {tc.result && (
                    <div className="tool-call-section">
                      <strong>Output:</strong>
                      {isImageGeneration ? (
                        <div className="generated-image-preview">
                          <img 
                            src={resultData.imageUrl} 
                            alt="Generated image"
                            className="generated-image"
                            onClick={() => window.open(resultData.imageUrl, '_blank')}
                          />
                          <div className="image-actions">
                            <a 
                              href={resultData.imageUrl} 
                              download 
                              className="image-download-btn"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Download size={16} />
                              Download
                            </a>
                          </div>
                        </div>
                      ) : (
                        <pre className="tool-call-json">{tc.result}</pre>
                      )}
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}

      {/* Message content */}
      {content.trim() && (
        <div className="message-content">
          {role === 'assistant' ? (
            <ReactMarkdown
              components={{
                // Custom renderers for markdown elements
                code: ({ children, className }) => {
                  const isInline = !className;
                  return isInline ? (
                    <code className="inline-code">{children}</code>
                  ) : (
                    <pre className="code-block">
                      <code>{children}</code>
                    </pre>
                  );
                },
              }}
            >
              {content}
            </ReactMarkdown>
          ) : (
            <p>{content}</p>
          )}
        </div>
      )}

      {/* Timestamp */}
      <span className="message-time">{formattedTime}</span>
    </div>
  );
}