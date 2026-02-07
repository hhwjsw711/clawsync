import { v } from 'convex/values';
import { query, mutation, action } from './_generated/server';
import { api } from './_generated/api';

// AgentMail API base URL
const AGENTMAIL_API_URL = 'https://api.agentmail.to/v1';

// ============================================
// Queries
// ============================================

// Get AgentMail configuration
export const getConfig = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('agentMailConfig').first();
  },
});

// List all inboxes
export const listInboxes = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('agentMailInboxes').collect();
  },
});

// Get default inbox
export const getDefaultInbox = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('agentMailInboxes')
      .withIndex('by_default', (q) => q.eq('isDefault', true))
      .first();
  },
});

// List recent messages
export const listMessages = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query('agentMailMessages')
      .withIndex('by_timestamp')
      .order('desc')
      .take(limit);
  },
});

// Get messages by inbox
export const getMessagesByInbox = query({
  args: { inboxId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query('agentMailMessages')
      .withIndex('by_inboxId', (q) => q.eq('inboxId', args.inboxId))
      .order('desc')
      .take(limit);
  },
});

// ============================================
// Mutations
// ============================================

// Initialize or update AgentMail config
export const updateConfig = mutation({
  args: {
    enabled: v.boolean(),
    defaultInboxId: v.optional(v.string()),
    autoReply: v.boolean(),
    forwardToAgent: v.boolean(),
    rateLimitPerHour: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('agentMailConfig').first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        defaultInboxId: args.defaultInboxId,
        autoReply: args.autoReply,
        forwardToAgent: args.forwardToAgent,
        rateLimitPerHour: args.rateLimitPerHour,
        updatedAt: Date.now(),
      });
      return existing._id;
    } else {
      return await ctx.db.insert('agentMailConfig', {
        enabled: args.enabled,
        defaultInboxId: args.defaultInboxId,
        autoReply: args.autoReply,
        forwardToAgent: args.forwardToAgent,
        rateLimitPerHour: args.rateLimitPerHour,
        updatedAt: Date.now(),
      });
    }
  },
});

// Toggle AgentMail enabled state
export const toggleEnabled = mutation({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query('agentMailConfig').first();
    if (config) {
      await ctx.db.patch(config._id, {
        enabled: !config.enabled,
        updatedAt: Date.now(),
      });
      return !config.enabled;
    }
    // Create default config if none exists
    await ctx.db.insert('agentMailConfig', {
      enabled: true,
      autoReply: false,
      forwardToAgent: true,
      rateLimitPerHour: 100,
      updatedAt: Date.now(),
    });
    return true;
  },
});

// Add inbox from AgentMail
export const addInbox = mutation({
  args: {
    inboxId: v.string(),
    email: v.string(),
    displayName: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Check if inbox already exists
    const existing = await ctx.db
      .query('agentMailInboxes')
      .withIndex('by_inboxId', (q) => q.eq('inboxId', args.inboxId))
      .first();

    if (existing) {
      throw new Error('Inbox already exists');
    }

    // If this is the first inbox or marked as default, set it as default
    const inboxCount = await ctx.db.query('agentMailInboxes').collect();
    const isDefault = args.isDefault ?? inboxCount.length === 0;

    // If setting as default, unset other defaults
    if (isDefault) {
      const currentDefault = await ctx.db
        .query('agentMailInboxes')
        .withIndex('by_default', (q) => q.eq('isDefault', true))
        .first();
      if (currentDefault) {
        await ctx.db.patch(currentDefault._id, { isDefault: false });
      }
    }

    return await ctx.db.insert('agentMailInboxes', {
      inboxId: args.inboxId,
      email: args.email,
      displayName: args.displayName,
      isDefault,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// Remove inbox
export const removeInbox = mutation({
  args: { id: v.id('agentMailInboxes') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Set default inbox
export const setDefaultInbox = mutation({
  args: { id: v.id('agentMailInboxes') },
  handler: async (ctx, args) => {
    // Unset current default
    const currentDefault = await ctx.db
      .query('agentMailInboxes')
      .withIndex('by_default', (q) => q.eq('isDefault', true))
      .first();
    if (currentDefault) {
      await ctx.db.patch(currentDefault._id, { isDefault: false });
    }

    // Set new default
    await ctx.db.patch(args.id, { isDefault: true, updatedAt: Date.now() });
  },
});

// Log incoming message
export const logMessage = mutation({
  args: {
    messageId: v.string(),
    inboxId: v.string(),
    direction: v.union(v.literal('inbound'), v.literal('outbound')),
    fromEmail: v.string(),
    toEmail: v.string(),
    subject: v.string(),
    bodyPreview: v.optional(v.string()),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('agentMailMessages', {
      messageId: args.messageId,
      inboxId: args.inboxId,
      direction: args.direction,
      fromEmail: args.fromEmail,
      toEmail: args.toEmail,
      subject: args.subject,
      bodyPreview: args.bodyPreview,
      threadId: args.threadId,
      processedByAgent: false,
      timestamp: Date.now(),
    });
  },
});

// Mark message as processed by agent
export const markProcessed = mutation({
  args: {
    id: v.id('agentMailMessages'),
    agentResponse: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      processedByAgent: true,
      agentResponse: args.agentResponse,
    });
  },
});

// ============================================
// Actions (API calls to AgentMail)
// ============================================

// Create a new inbox via AgentMail API
export const createInbox = action({
  args: {
    username: v.optional(v.string()), // Local part of email
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.AGENTMAIL_API_KEY;
    if (!apiKey) {
      throw new Error('AGENTMAIL_API_KEY environment variable not set');
    }

    const response = await fetch(`${AGENTMAIL_API_URL}/inboxes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: args.username,
        display_name: args.displayName,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create inbox: ${error}`);
    }

    const data = await response.json();

    // Store inbox in database
    await ctx.runMutation(api.agentMail.addInbox, {
      inboxId: data.id,
      email: data.email,
      displayName: args.displayName,
    });

    // Log activity
    await ctx.runMutation(api.activityLog.log, {
      actionType: 'agentmail_inbox_created',
      summary: `Created AgentMail inbox: ${data.email}`,
      visibility: 'private',
    });

    return data;
  },
});

// List inboxes from AgentMail API
export const fetchInboxes = action({
  args: {},
  handler: async (ctx) => {
    const apiKey = process.env.AGENTMAIL_API_KEY;
    if (!apiKey) {
      throw new Error('AGENTMAIL_API_KEY environment variable not set');
    }

    const response = await fetch(`${AGENTMAIL_API_URL}/inboxes`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch inboxes: ${error}`);
    }

    return await response.json();
  },
});

// Send email via AgentMail API
export const sendEmail = action({
  args: {
    inboxId: v.string(),
    to: v.string(),
    subject: v.string(),
    body: v.string(),
    replyToMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.AGENTMAIL_API_KEY;
    if (!apiKey) {
      throw new Error('AGENTMAIL_API_KEY environment variable not set');
    }

    // Check rate limit
    const config = await ctx.runQuery(api.agentMail.getConfig);
    if (!config?.enabled) {
      throw new Error('AgentMail is not enabled');
    }

    const response = await fetch(`${AGENTMAIL_API_URL}/inboxes/${args.inboxId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: args.to,
        subject: args.subject,
        body: args.body,
        reply_to_message_id: args.replyToMessageId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send email: ${error}`);
    }

    const data = await response.json();

    // Log outbound message
    await ctx.runMutation(api.agentMail.logMessage, {
      messageId: data.id,
      inboxId: args.inboxId,
      direction: 'outbound',
      fromEmail: data.from || 'agent',
      toEmail: args.to,
      subject: args.subject,
      bodyPreview: args.body.substring(0, 200),
    });

    // Log activity
    await ctx.runMutation(api.activityLog.log, {
      actionType: 'agentmail_sent',
      summary: `Sent email to ${args.to}: ${args.subject}`,
      visibility: 'private',
    });

    return data;
  },
});

// Fetch messages from AgentMail API
export const fetchMessages = action({
  args: { inboxId: v.string() },
  handler: async (ctx, args) => {
    const apiKey = process.env.AGENTMAIL_API_KEY;
    if (!apiKey) {
      throw new Error('AGENTMAIL_API_KEY environment variable not set');
    }

    const response = await fetch(`${AGENTMAIL_API_URL}/inboxes/${args.inboxId}/messages`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch messages: ${error}`);
    }

    return await response.json();
  },
});

// Delete inbox via AgentMail API
export const deleteInbox = action({
  args: { inboxId: v.string() },
  handler: async (ctx, args) => {
    const apiKey = process.env.AGENTMAIL_API_KEY;
    if (!apiKey) {
      throw new Error('AGENTMAIL_API_KEY environment variable not set');
    }

    const response = await fetch(`${AGENTMAIL_API_URL}/inboxes/${args.inboxId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete inbox: ${error}`);
    }

    // Remove from database
    const inbox = await ctx.runQuery(api.agentMail.listInboxes);
    const found = inbox.find((i: { inboxId: string }) => i.inboxId === args.inboxId);
    if (found) {
      await ctx.runMutation(api.agentMail.removeInbox, { id: found._id });
    }

    // Log activity
    await ctx.runMutation(api.activityLog.log, {
      actionType: 'agentmail_inbox_deleted',
      summary: `Deleted AgentMail inbox: ${args.inboxId}`,
      visibility: 'private',
    });

    return { success: true };
  },
});
