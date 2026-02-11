import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { SyncBoardLayout } from '../components/syncboard/SyncBoardLayout';

// Preset MCP servers with default env vars
const MCP_PRESETS: Record<string, { name: string; url: string; envVar: string; description: string }> = {
  github: {
    name: 'GitHub Copilot MCP',
    url: 'https://api.githubcopilot.com/mcp',
    envVar: 'GITHUB_PAT',
    description: 'GitHub Copilot MCP Server',
  },
};

export function SyncBoardMcp() {
  const servers = useQuery(api.mcpServers.list);
  const createServer = useMutation(api.mcpServers.create);
  const approveServer = useMutation(api.mcpServers.approve);
  const updateServer = useMutation(api.mcpServers.update);
  const removeServer = useMutation(api.mcpServers.remove);

  const [showForm, setShowForm] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [apiKeyEnvVar, setApiKeyEnvVar] = useState('');

  const handlePresetChange = (presetKey: string) => {
    setSelectedPreset(presetKey);
    if (presetKey && MCP_PRESETS[presetKey]) {
      const preset = MCP_PRESETS[presetKey];
      setName(preset.name);
      setUrl(preset.url);
      setApiKeyEnvVar(preset.envVar);
    } else {
      setName('');
      setUrl('');
      setApiKeyEnvVar('');
    }
  };

  const handleCreate = async () => {
    if (!name || !url) return;

    await createServer({
      name,
      url,
      apiKeyEnvVar: apiKeyEnvVar || undefined,
    });
    setName('');
    setUrl('');
    setApiKeyEnvVar('');
    setShowForm(false);
  };

  return (
    <SyncBoardLayout title="MCP Servers">
      <div className="mcp-page">
        <div className="page-description">
          <p>
            Connect to external MCP servers to give your agent access to additional tools.
            MCP servers require approval before their tools can be used.
          </p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            + Add MCP Server
          </button>
        </div>

        {showForm && (
          <div className="add-form card">
            <h3>Add MCP Server</h3>
            <div className="form-group">
              <label>Preset (Optional)</label>
              <select
                value={selectedPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="input"
              >
                <option value="">Custom (manual configuration)</option>
                {Object.entries(MCP_PRESETS).map(([key, preset]) => (
                  <option key={key} value={key}>{preset.description}</option>
                ))}
              </select>
              <small style={{ display: 'block', marginTop: '4px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                Select a preset to auto-fill server details, or choose "Custom" to configure manually.
              </small>
            </div>
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="e.g., GitHub MCP"
              />
            </div>
            <div className="form-group">
              <label>URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="input"
                placeholder="https://mcp.example.com"
              />
            </div>
            <div className="form-group">
              <label>API Key Environment Variable (Optional)</label>
              <input
                type="text"
                value={apiKeyEnvVar}
                onChange={(e) => setApiKeyEnvVar(e.target.value)}
                className="input"
                placeholder="e.g., GITHUB_PAT_TOKEN"
              />
              <small style={{ display: 'block', marginTop: '4px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                Environment variable name containing the API key/token. The value will be sent as "Authorization: Bearer {'{value}'}" header.
              </small>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCreate}>
                Add Server
              </button>
            </div>
          </div>
        )}

        <div className="servers-list">
          {servers && servers.length > 0 ? (
            servers.map((server: { _id: string; name: string; url: string; approved: boolean; enabled: boolean; healthStatus?: string; rateLimitPerMinute: number; lastHealthCheck?: number }) => (
              <div key={server._id} className="server-card card">
                <div className="server-header">
                  <h3>{server.name}</h3>
                  <div className="server-badges">
                    <span className={`badge ${server.approved ? 'badge-success' : 'badge-warning'}`}>
                      {server.approved ? 'Approved' : 'Pending'}
                    </span>
                    <span className={`badge ${server.enabled ? 'badge-success' : ''}`}>
                      {server.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    {server.healthStatus && (
                      <span className={`badge ${server.healthStatus === 'healthy' ? 'badge-success' : 'badge-error'}`}>
                        {server.healthStatus}
                      </span>
                    )}
                  </div>
                </div>

                <p className="server-url">{server.url}</p>

                <div className="server-meta">
                  <span>Rate limit: {server.rateLimitPerMinute}/min</span>
                  {(server as any).apiKeyEnvVar && (
                    <span style={{ color: 'var(--success)' }}>
                      Auth: {(server as any).apiKeyEnvVar}
                    </span>
                  )}
                  {server.lastHealthCheck && (
                    <span>
                      Last checked: {new Date(server.lastHealthCheck).toLocaleString()}
                    </span>
                  )}
                </div>

                <div className="server-actions">
                  {!server.approved && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => approveServer({ id: server._id })}
                    >
                      Approve
                    </button>
                  )}
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => updateServer({
                      id: server._id,
                      enabled: !server.enabled,
                    })}
                  >
                    {server.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => removeServer({ id: server._id })}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <p>No MCP servers configured.</p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .mcp-page {
          max-width: 800px;
        }

        .page-description {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: var(--space-6);
        }

        .page-description p {
          color: var(--text-secondary);
          max-width: 500px;
        }

        .add-form {
          margin-bottom: var(--space-6);
        }

        .add-form h3 {
          margin-bottom: var(--space-4);
        }

        .form-group {
          margin-bottom: var(--space-4);
        }

        .form-group label {
          display: block;
          font-weight: 500;
          margin-bottom: var(--space-2);
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-2);
        }

        .servers-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .server-card {
          padding: var(--space-4);
        }

        .server-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-2);
        }

        .server-badges {
          display: flex;
          gap: var(--space-2);
        }

        .server-url {
          color: var(--text-secondary);
          font-size: var(--text-sm);
          font-family: var(--font-mono);
          margin-bottom: var(--space-3);
        }

        .server-meta {
          display: flex;
          gap: var(--space-4);
          font-size: var(--text-xs);
          color: var(--text-secondary);
          margin-bottom: var(--space-4);
        }

        .server-actions {
          display: flex;
          gap: var(--space-2);
        }

        .btn-sm {
          padding: var(--space-1) var(--space-3);
          font-size: var(--text-xs);
        }

        .empty-state {
          text-align: center;
          padding: var(--space-8);
          color: var(--text-secondary);
        }
      `}</style>
    </SyncBoardLayout>
  );
}
