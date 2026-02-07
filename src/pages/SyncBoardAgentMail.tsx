import { useState } from 'react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { SyncBoardLayout } from '../components/syncboard/SyncBoardLayout';
import {
  EnvelopeSimple,
  Plus,
  Trash,
  Star,
  PaperPlaneTilt,
  ArrowsClockwise,
} from '@phosphor-icons/react';

export function SyncBoardAgentMail() {
  const config = useQuery(api.agentMail.getConfig);
  const inboxes = useQuery(api.agentMail.listInboxes);
  const messages = useQuery(api.agentMail.listMessages, { limit: 20 });

  const updateConfig = useMutation(api.agentMail.updateConfig);
  const toggleEnabled = useMutation(api.agentMail.toggleEnabled);
  const setDefaultInbox = useMutation(api.agentMail.setDefaultInbox);
  const removeInbox = useMutation(api.agentMail.removeInbox);
  const createInbox = useAction(api.agentMail.createInbox);
  const deleteInboxApi = useAction(api.agentMail.deleteInbox);

  const [isCreating, setIsCreating] = useState(false);
  const [newInboxName, setNewInboxName] = useState('');
  const [newInboxUsername, setNewInboxUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Handle creating new inbox
  const handleCreateInbox = async () => {
    if (!newInboxUsername.trim()) {
      setError('Username is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await createInbox({
        username: newInboxUsername.trim(),
        displayName: newInboxName.trim() || undefined,
      });
      setNewInboxUsername('');
      setNewInboxName('');
      setIsCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create inbox');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle deleting inbox
  const handleDeleteInbox = async (inboxId: string, id: string) => {
    if (!confirm('Delete this inbox? This cannot be undone.')) return;

    setIsLoading(true);
    try {
      await deleteInboxApi({ inboxId });
    } catch {
      // If API delete fails, still remove from local DB
      await removeInbox({ id: id as unknown as Parameters<typeof removeInbox>[0]['id'] });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle config updates
  const handleConfigUpdate = async (updates: Partial<{
    enabled: boolean;
    autoReply: boolean;
    forwardToAgent: boolean;
    rateLimitPerHour: number;
  }>) => {
    await updateConfig({
      enabled: updates.enabled ?? config?.enabled ?? false,
      autoReply: updates.autoReply ?? config?.autoReply ?? false,
      forwardToAgent: updates.forwardToAgent ?? config?.forwardToAgent ?? true,
      rateLimitPerHour: updates.rateLimitPerHour ?? config?.rateLimitPerHour ?? 100,
      defaultInboxId: config?.defaultInboxId,
    });
  };

  return (
    <SyncBoardLayout title="AgentMail">
      <div className="agentmail-page">
        {/* Enable/Disable Toggle */}
        <section className="config-section">
          <div className="section-header">
            <h3>AgentMail Integration</h3>
            <button
              className={`toggle-btn ${config?.enabled ? 'active' : ''}`}
              onClick={() => toggleEnabled()}
            >
              {config?.enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
          <p className="section-description">
            AgentMail provides email inboxes for your AI agent. Send, receive, and
            process emails programmatically.
          </p>

          {/* API Key Info */}
          <div className="api-info">
            <h4>Setup</h4>
            <p>
              Set <code>AGENTMAIL_API_KEY</code> in your Convex environment variables.
            </p>
            <p className="hint">
              Get your API key from{' '}
              <a href="https://console.agentmail.to" target="_blank" rel="noopener noreferrer">
                console.agentmail.to
              </a>
            </p>
          </div>
        </section>

        {/* Configuration Options */}
        {config?.enabled && (
          <section className="config-section">
            <h3>Settings</h3>
            <div className="config-grid">
              <label className="config-item">
                <input
                  type="checkbox"
                  checked={config?.autoReply ?? false}
                  onChange={(e) => handleConfigUpdate({ autoReply: e.target.checked })}
                />
                <span>Auto-reply to emails</span>
                <span className="hint">Agent automatically responds to incoming emails</span>
              </label>

              <label className="config-item">
                <input
                  type="checkbox"
                  checked={config?.forwardToAgent ?? true}
                  onChange={(e) => handleConfigUpdate({ forwardToAgent: e.target.checked })}
                />
                <span>Forward to agent</span>
                <span className="hint">Pass incoming emails to agent for processing</span>
              </label>

              <div className="config-item">
                <label htmlFor="rateLimit">Rate limit (per hour)</label>
                <input
                  id="rateLimit"
                  type="number"
                  min="1"
                  max="1000"
                  value={config?.rateLimitPerHour ?? 100}
                  onChange={(e) => handleConfigUpdate({ rateLimitPerHour: parseInt(e.target.value) || 100 })}
                  className="input input-sm"
                  style={{ width: '100px' }}
                />
              </div>
            </div>
          </section>
        )}

        {/* Inboxes */}
        {config?.enabled && (
          <section className="config-section">
            <div className="section-header">
              <h3>Inboxes</h3>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setIsCreating(true)}
                disabled={isCreating}
              >
                <Plus size={16} /> New Inbox
              </button>
            </div>

            {/* Create Inbox Form */}
            {isCreating && (
              <div className="create-inbox-form">
                {error && <div className="error-message">{error}</div>}
                <div className="form-row">
                  <input
                    type="text"
                    placeholder="username (before @)"
                    value={newInboxUsername}
                    onChange={(e) => setNewInboxUsername(e.target.value)}
                    className="input"
                  />
                  <input
                    type="text"
                    placeholder="Display name (optional)"
                    value={newInboxName}
                    onChange={(e) => setNewInboxName(e.target.value)}
                    className="input"
                  />
                </div>
                <div className="form-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setIsCreating(false);
                      setError(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleCreateInbox}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </div>
            )}

            {/* Inbox List */}
            <div className="inbox-list">
              {inboxes && inboxes.length > 0 ? (
                inboxes.map((inbox) => (
                  <div key={inbox._id} className="inbox-card">
                    <div className="inbox-icon">
                      <EnvelopeSimple size={24} weight="regular" />
                    </div>
                    <div className="inbox-info">
                      <div className="inbox-email">
                        {inbox.email}
                        {inbox.isDefault && (
                          <span className="badge badge-primary">Default</span>
                        )}
                      </div>
                      {inbox.displayName && (
                        <div className="inbox-name">{inbox.displayName}</div>
                      )}
                    </div>
                    <div className="inbox-actions">
                      {!inbox.isDefault && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setDefaultInbox({ id: inbox._id })}
                          title="Set as default"
                        >
                          <Star size={16} />
                        </button>
                      )}
                      <button
                        className="btn btn-ghost btn-sm btn-danger"
                        onClick={() => handleDeleteInbox(inbox.inboxId, inbox._id)}
                        title="Delete inbox"
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <EnvelopeSimple size={48} weight="light" />
                  <p>No inboxes yet. Create one to get started.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Recent Messages */}
        {config?.enabled && messages && messages.length > 0 && (
          <section className="config-section">
            <div className="section-header">
              <h3>Recent Messages</h3>
              <span className="badge">{messages.length}</span>
            </div>
            <div className="message-list">
              {messages.map((msg) => (
                <div key={msg._id} className="message-card">
                  <div className="message-icon">
                    {msg.direction === 'inbound' ? (
                      <EnvelopeSimple size={18} weight="regular" />
                    ) : (
                      <PaperPlaneTilt size={18} weight="regular" />
                    )}
                  </div>
                  <div className="message-info">
                    <div className="message-header">
                      <span className={`direction ${msg.direction}`}>
                        {msg.direction === 'inbound' ? 'From' : 'To'}:{' '}
                        {msg.direction === 'inbound' ? msg.fromEmail : msg.toEmail}
                      </span>
                      <span className="message-time">
                        {new Date(msg.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="message-subject">{msg.subject}</div>
                    {msg.bodyPreview && (
                      <div className="message-preview">{msg.bodyPreview}</div>
                    )}
                    {msg.processedByAgent && (
                      <span className="badge badge-success">Processed</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* MCP Info */}
        {config?.enabled && (
          <section className="config-section">
            <h3>MCP Integration</h3>
            <p className="section-description">
              AgentMail tools are available to the agent via MCP. The agent can:
            </p>
            <ul className="feature-list">
              <li>Send emails on behalf of the user</li>
              <li>Read and summarize incoming emails</li>
              <li>Reply to email threads</li>
              <li>Search emails by content</li>
            </ul>
          </section>
        )}
      </div>

      <style>{`
        .agentmail-page {
          max-width: 800px;
        }

        .config-section {
          background: var(--bg-secondary);
          border-radius: var(--radius-xl);
          padding: var(--space-4);
          margin-bottom: var(--space-4);
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-3);
        }

        .section-header h3 {
          margin: 0;
        }

        .section-description {
          color: var(--text-secondary);
          margin-bottom: var(--space-4);
        }

        .toggle-btn {
          padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-full);
          border: 1px solid var(--border);
          background: var(--bg-primary);
          cursor: pointer;
          font-weight: 500;
          transition: all var(--transition-fast);
        }

        .toggle-btn.active {
          background: var(--success);
          color: white;
          border-color: var(--success);
        }

        .api-info {
          background: var(--bg-primary);
          padding: var(--space-3);
          border-radius: var(--radius-lg);
          margin-top: var(--space-4);
        }

        .api-info h4 {
          margin-bottom: var(--space-2);
        }

        .api-info code {
          background: var(--bg-secondary);
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-sm);
          font-size: var(--text-sm);
        }

        .config-grid {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }

        .config-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex-wrap: wrap;
        }

        .config-item input[type="checkbox"] {
          width: 18px;
          height: 18px;
        }

        .config-item .hint {
          flex-basis: 100%;
          font-size: var(--text-xs);
          color: var(--text-secondary);
          margin-left: 26px;
        }

        .create-inbox-form {
          background: var(--bg-primary);
          padding: var(--space-3);
          border-radius: var(--radius-lg);
          margin-bottom: var(--space-4);
        }

        .form-row {
          display: flex;
          gap: var(--space-2);
          margin-bottom: var(--space-3);
        }

        .form-row .input {
          flex: 1;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-2);
        }

        .inbox-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .inbox-card {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3);
          background: var(--bg-primary);
          border-radius: var(--radius-lg);
        }

        .inbox-icon {
          color: var(--interactive);
        }

        .inbox-info {
          flex: 1;
        }

        .inbox-email {
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .inbox-name {
          font-size: var(--text-sm);
          color: var(--text-secondary);
        }

        .inbox-actions {
          display: flex;
          gap: var(--space-1);
        }

        .btn-danger:hover {
          color: var(--error);
        }

        .empty-state {
          text-align: center;
          padding: var(--space-8);
          color: var(--text-secondary);
        }

        .empty-state svg {
          margin-bottom: var(--space-2);
        }

        .message-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .message-card {
          display: flex;
          gap: var(--space-3);
          padding: var(--space-3);
          background: var(--bg-primary);
          border-radius: var(--radius-lg);
        }

        .message-icon {
          color: var(--text-secondary);
        }

        .message-info {
          flex: 1;
          min-width: 0;
        }

        .message-header {
          display: flex;
          justify-content: space-between;
          font-size: var(--text-sm);
          margin-bottom: var(--space-1);
        }

        .direction.inbound {
          color: var(--interactive);
        }

        .direction.outbound {
          color: var(--success);
        }

        .message-time {
          color: var(--text-secondary);
          font-size: var(--text-xs);
        }

        .message-subject {
          font-weight: 500;
          margin-bottom: var(--space-1);
        }

        .message-preview {
          font-size: var(--text-sm);
          color: var(--text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .feature-list {
          margin: 0;
          padding-left: var(--space-4);
          color: var(--text-secondary);
        }

        .feature-list li {
          margin-bottom: var(--space-2);
        }

        .error-message {
          background: rgba(239, 68, 68, 0.1);
          color: var(--error);
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-3);
          font-size: var(--text-sm);
        }

        .hint {
          font-size: var(--text-sm);
          color: var(--text-secondary);
        }

        .hint a {
          color: var(--interactive);
        }

        .badge-primary {
          background: var(--interactive);
          color: white;
        }

        .badge-success {
          background: var(--success);
          color: white;
        }

        .btn-sm {
          padding: var(--space-1) var(--space-2);
          font-size: var(--text-sm);
        }

        .input-sm {
          padding: var(--space-1) var(--space-2);
          font-size: var(--text-sm);
        }
      `}</style>
    </SyncBoardLayout>
  );
}
