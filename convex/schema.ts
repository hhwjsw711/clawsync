import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  // Agent identity and config
  agentConfig: defineTable({
    name: v.string(),
    soulDocument: v.string(),
    systemPrompt: v.string(),
    model: v.string(),
    modelProvider: v.string(),
    fallbackModel: v.optional(v.string()),
    fallbackProvider: v.optional(v.string()),
    voiceEnabled: v.boolean(),
    voiceId: v.optional(v.string()),
    domainAllowlist: v.array(v.string()),
    uiConfig: v.string(), // JSON
    updatedAt: v.number(),
  }),

  // Model provider configs
  modelProviders: defineTable({
    providerId: v.string(),
    displayName: v.string(),
    baseUrl: v.string(),
    apiKeyEnvVar: v.string(),
    enabled: v.boolean(),
    rateLimitPerMinute: v.number(),
    updatedAt: v.number(),
  }).index('by_provider', ['providerId']),

  // Skills registry (all three types)
  skillRegistry: defineTable({
    name: v.string(),
    description: v.string(),
    skillType: v.union(
      v.literal('template'),
      v.literal('webhook'),
      v.literal('code')
    ),
    templateId: v.optional(v.string()),
    config: v.optional(v.string()), // JSON - no secrets here
    status: v.union(
      v.literal('active'),
      v.literal('inactive'),
      v.literal('pending')
    ),
    permissions: v.array(v.string()),
    rateLimitPerMinute: v.number(),
    timeoutMs: v.optional(v.number()),
    supportsImages: v.optional(v.boolean()),
    supportsStreaming: v.optional(v.boolean()),
    uiMeta: v.optional(v.string()), // JSON: icon, category, color, dependencies
    approved: v.boolean(),
    approvedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_status', ['status'])
    .index('by_type', ['skillType'])
    .index('by_name', ['name']),

  // Skill secrets (encrypted, separate from config)
  skillSecrets: defineTable({
    skillId: v.id('skillRegistry'),
    key: v.string(),
    encryptedValue: v.string(),
    createdAt: v.number(),
  }).index('by_skill', ['skillId']),

  // Skill template definitions
  skillTemplates: defineTable({
    templateId: v.string(),
    name: v.string(),
    description: v.string(),
    category: v.string(),
    configSchema: v.string(), // JSON Schema
    inputSchema: v.string(), // JSON Schema
    outputDescription: v.string(),
    supportsImages: v.boolean(),
    version: v.string(),
  })
    .index('by_templateId', ['templateId'])
    .index('by_category', ['category']),

  // Skill invocation audit log
  skillInvocationLog: defineTable({
    skillName: v.string(),
    skillType: v.string(),
    threadId: v.optional(v.string()),
    userId: v.optional(v.string()),
    channel: v.optional(v.string()),
    input: v.string(), // Truncated/redacted
    output: v.optional(v.string()), // Truncated
    success: v.boolean(),
    errorMessage: v.optional(v.string()),
    securityCheckResult: v.string(),
    durationMs: v.number(),
    timestamp: v.number(),
  })
    .index('by_skill', ['skillName'])
    .index('by_timestamp', ['timestamp'])
    .index('by_security_result', ['securityCheckResult']),

  // Summary table for dashboard reads (cold table pattern)
  skillInvocationSummary: defineTable({
    skillName: v.string(),
    totalInvocations: v.number(),
    successCount: v.number(),
    failureCount: v.number(),
    avgDurationMs: v.number(),
    lastInvokedAt: v.number(),
    updatedAt: v.number(),
  }).index('by_skill', ['skillName']),

  // MCP server connections
  mcpServers: defineTable({
    name: v.string(),
    url: v.optional(v.string()),
    command: v.optional(v.string()),
    args: v.optional(v.array(v.string())),
    apiKeyEnvVar: v.optional(v.string()),
    enabled: v.boolean(),
    rateLimitPerMinute: v.number(),
    approved: v.boolean(),
    lastHealthCheck: v.optional(v.number()),
    healthStatus: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_name', ['name']),

  // Activity log
  activityLog: defineTable({
    actionType: v.string(),
    summary: v.string(),
    channel: v.optional(v.string()),
    visibility: v.union(v.literal('public'), v.literal('private')),
    metadata: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index('by_visibility_timestamp', ['visibility', 'timestamp'])
    .index('by_channel', ['channel']),

  // Channel configs
  channelConfig: defineTable({
    channelType: v.string(),
    displayName: v.string(),
    enabled: v.boolean(),
    rateLimitPerMinute: v.number(),
    webhookUrl: v.optional(v.string()),
    metadata: v.optional(v.string()),
    updatedAt: v.number(),
  }).index('by_type', ['channelType']),

  // Channel secrets
  channelSecrets: defineTable({
    channelId: v.id('channelConfig'),
    key: v.string(),
    encryptedValue: v.string(),
    createdAt: v.number(),
  }).index('by_channel', ['channelId']),

  // Channel users
  channelUsers: defineTable({
    platformId: v.string(),
    channelType: v.string(),
    displayName: v.optional(v.string()),
    threadId: v.optional(v.string()),
    lastActiveAt: v.number(),
    createdAt: v.number(),
  }).index('by_platform', ['channelType', 'platformId']),

  // Rate limit configs
  rateLimitConfig: defineTable({
    scope: v.string(),
    maxRequests: v.number(),
    windowMs: v.number(),
    updatedAt: v.number(),
  }).index('by_scope', ['scope']),

  // OpenSync sessions
  syncSessions: defineTable({
    sessionToken: v.string(),
    userId: v.optional(v.string()),
    threadId: v.string(),
    deviceInfo: v.optional(v.string()),
    lastActiveAt: v.number(),
    createdAt: v.number(),
  })
    .index('by_token', ['sessionToken'])
    .index('by_user', ['userId']),

  // ============================================
  // API Management
  // ============================================

  // API Keys for external access
  apiKeys: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    keyHash: v.string(), // SHA-256 hash of the key (never store plaintext)
    keyPrefix: v.string(), // First 8 chars for identification (e.g., "cs_live_")
    keyType: v.union(
      v.literal('agent'), // Access to agent API (chat, threads)
      v.literal('data'), // Access to data API (read skills, activity)
      v.literal('admin') // Full access (manage everything)
    ),
    scopes: v.array(v.string()), // Fine-grained permissions
    rateLimitPerMinute: v.number(),
    rateLimitPerDay: v.optional(v.number()),
    allowedOrigins: v.optional(v.array(v.string())), // CORS origins
    allowedIps: v.optional(v.array(v.string())), // IP allowlist
    expiresAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
    usageCount: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_keyHash', ['keyHash'])
    .index('by_keyPrefix', ['keyPrefix'])
    .index('by_type', ['keyType'])
    .index('by_active', ['isActive']),

  // API usage tracking (token usage dashboard from OpenClaw)
  apiUsage: defineTable({
    apiKeyId: v.id('apiKeys'),
    endpoint: v.string(),
    method: v.string(),
    statusCode: v.number(),
    tokensUsed: v.optional(v.number()), // For LLM calls
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    durationMs: v.number(),
    requestSize: v.optional(v.number()),
    responseSize: v.optional(v.number()),
    userAgent: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index('by_apiKey', ['apiKeyId'])
    .index('by_timestamp', ['timestamp'])
    .index('by_endpoint', ['endpoint']),

  // API usage summary (cold table for dashboard)
  apiUsageSummary: defineTable({
    apiKeyId: v.id('apiKeys'),
    date: v.string(), // YYYY-MM-DD
    totalRequests: v.number(),
    successfulRequests: v.number(),
    failedRequests: v.number(),
    totalTokens: v.number(),
    totalInputTokens: v.number(),
    totalOutputTokens: v.number(),
    avgDurationMs: v.number(),
    updatedAt: v.number(),
  })
    .index('by_apiKey_date', ['apiKeyId', 'date'])
    .index('by_date', ['date']),

  // ============================================
  // Voice Configuration (Phase 5)
  // ============================================

  // Voice provider configs
  voiceProviders: defineTable({
    providerId: v.string(), // 'elevenlabs', 'personaplex'
    displayName: v.string(),
    enabled: v.boolean(),
    isDefault: v.boolean(),
    config: v.string(), // JSON - provider-specific settings
    apiKeyEnvVar: v.string(),
    rateLimitPerMinute: v.number(),
    maxSessionDurationSecs: v.number(),
    supportsTTS: v.boolean(),
    supportsSTT: v.boolean(),
    supportsRealtime: v.boolean(),
    updatedAt: v.number(),
  }).index('by_provider', ['providerId']),

  // Voice sessions
  voiceSessions: defineTable({
    sessionId: v.string(),
    threadId: v.optional(v.string()),
    providerId: v.string(),
    voiceId: v.optional(v.string()),
    status: v.union(
      v.literal('active'),
      v.literal('paused'),
      v.literal('ended')
    ),
    durationSecs: v.number(),
    tokensUsed: v.optional(v.number()),
    metadata: v.optional(v.string()),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index('by_sessionId', ['sessionId'])
    .index('by_status', ['status'])
    .index('by_threadId', ['threadId']),

  // ============================================
  // X/Twitter Integration
  // ============================================

  // X/Twitter config (stored separately for clarity)
  xConfig: defineTable({
    enabled: v.boolean(),
    username: v.optional(v.string()), // @handle
    showOnLanding: v.boolean(), // Show tweets on landing page
    autoReply: v.boolean(), // Auto-reply to mentions
    postFromAgent: v.boolean(), // Allow agent to post tweets
    rateLimitPerHour: v.number(),
    updatedAt: v.number(),
  }),

  // ============================================
  // AgentMail Integration
  // ============================================

  // AgentMail config
  agentMailConfig: defineTable({
    enabled: v.boolean(),
    defaultInboxId: v.optional(v.string()), // Default inbox for sending
    webhookSecret: v.optional(v.string()), // For verifying incoming webhooks
    autoReply: v.boolean(), // Auto-reply to incoming emails
    forwardToAgent: v.boolean(), // Forward emails to agent for processing
    rateLimitPerHour: v.number(),
    updatedAt: v.number(),
  }),

  // AgentMail inboxes
  agentMailInboxes: defineTable({
    inboxId: v.string(), // AgentMail inbox ID
    email: v.string(), // Full email address
    displayName: v.optional(v.string()),
    isDefault: v.boolean(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_inboxId', ['inboxId'])
    .index('by_email', ['email'])
    .index('by_default', ['isDefault']),

  // AgentMail message log (for tracking)
  agentMailMessages: defineTable({
    messageId: v.string(), // AgentMail message ID
    inboxId: v.string(),
    direction: v.union(v.literal('inbound'), v.literal('outbound')),
    fromEmail: v.string(),
    toEmail: v.string(),
    subject: v.string(),
    bodyPreview: v.optional(v.string()), // First 200 chars
    threadId: v.optional(v.string()), // ClawSync thread if linked
    processedByAgent: v.boolean(),
    agentResponse: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index('by_messageId', ['messageId'])
    .index('by_inboxId', ['inboxId'])
    .index('by_timestamp', ['timestamp']),

  // Cached tweets for landing page display
  xTweets: defineTable({
    tweetId: v.string(), // X/Twitter tweet ID
    text: v.string(),
    authorUsername: v.string(),
    authorDisplayName: v.optional(v.string()),
    authorProfileImageUrl: v.optional(v.string()),
    isAgentTweet: v.boolean(), // Posted by our agent
    isReply: v.boolean(),
    replyToTweetId: v.optional(v.string()),
    likeCount: v.optional(v.number()),
    retweetCount: v.optional(v.number()),
    replyCount: v.optional(v.number()),
    showOnLanding: v.boolean(), // Visible on landing page
    postedAt: v.number(),
    fetchedAt: v.number(),
  })
    .index('by_tweetId', ['tweetId'])
    .index('by_showOnLanding', ['showOnLanding', 'postedAt'])
    .index('by_postedAt', ['postedAt']),
});
