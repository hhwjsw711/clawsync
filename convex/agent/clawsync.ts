import { Agent } from '@convex-dev/agent';
import { components, internal } from '../_generated/api';
import { ActionCtx } from '../_generated/server';
import { Id } from '../_generated/dataModel';
import { anthropic } from '@ai-sdk/anthropic';
import { resolveModel, resolveModelFromConfig } from './modelRouter';
import { loadTools } from './toolLoader';

/**
 * ClawSync Agent Definition
 *
 * Default static agent used as a fallback. For dynamic model/tool
 * selection based on SyncBoard config, use createDynamicAgent().
 *
 * Multi-agent support: pass an agentId to load per-agent config,
 * or omit to use the default agent / legacy agentConfig.
 */
export const clawsyncAgent = new Agent(components.agent, {
  name: 'ClawSync Agent',
  languageModel: anthropic('claude-sonnet-4-20250514'),
  instructions: `You are a helpful AI assistant.

When conducting research or searching for information, ALWAYS include:
1. Source URLs/links for any information you find
2. Reference the specific websites or sources you used
3. Include relevant links that the user can click to verify or learn more

Example format:
"According to [Source Name](URL), the key findings are..."

This helps users verify information and explore topics further.`,
  // Tools are loaded dynamically at call-site
  tools: {},
});

/**
 * Create a dynamic agent using the model and tools from SyncBoard config.
 * Supports multi-agent: pass agentId to load that agent's config.
 * Without agentId, falls back to default agent or legacy agentConfig.
 */
export async function createDynamicAgent(
  ctx: ActionCtx,
  agentId?: Id<'agents'>
): Promise<Agent> {
  // Try to load from agents table first
  if (agentId) {
    const agentConfig: any = await ctx.runQuery(
      internal.agents.getInternal,
      { agentId }
    );
    if (agentConfig) {
      return buildAgentFromConfig(ctx, agentConfig, agentId);
    }
  }

  // Try default agent from agents table
  const defaultAgent: any = await ctx.runQuery(internal.agents.getDefault);
  if (defaultAgent) {
    return buildAgentFromConfig(ctx, defaultAgent, defaultAgent._id);
  }

  // Fall back to legacy agentConfig + global tools
  const resolved = await resolveModel(ctx);
  const tools = await loadTools(ctx);

  return new Agent(components.agent, {
    name: 'ClawSync Agent',
    languageModel: resolved.model,
    instructions: `You are a helpful AI assistant.

When conducting research or searching for information, ALWAYS include:
1. Source URLs/links for any information you find
2. Reference the specific websites or sources you used
3. Include relevant links that the user can click to verify or learn more

Example format:
"According to [Source Name](URL), the key findings are..."

This helps users verify information and explore topics further.`,
    tools,
  });
}

/**
 * Build an Agent instance from a multi-agent config record
 */
async function buildAgentFromConfig(
  ctx: ActionCtx,
  agentConfig: {
    _id: Id<'agents'>;
    name: string;
    soulId?: Id<'souls'>;
    soulDocument?: string;
    systemPrompt?: string;
    model: string;
    modelProvider: string;
    fallbackModel?: string;
    fallbackProvider?: string;
  },
  agentId: Id<'agents'>
): Promise<Agent> {
  // Resolve model from the agent's config
  const resolved = await resolveModelFromConfig(ctx, {
    provider: agentConfig.modelProvider,
    model: agentConfig.model,
    fallbackProvider: agentConfig.fallbackProvider,
    fallbackModel: agentConfig.fallbackModel,
  });

  // Load tools scoped to this agent's assignments
  const tools = await loadTools(ctx, agentId);

  // Resolve soul document (shared soul or inline)
  let instructions = 'You are a helpful AI assistant.';
  if (agentConfig.soulId) {
    try {
      const soul: any = await ctx.runQuery(internal.souls.getInternal, {
        soulId: agentConfig.soulId,
      });
      if (soul) {
        instructions = soul.document;
        if (soul.systemPrompt) {
          instructions += '\n\n' + soul.systemPrompt;
        }
      }
    } catch {
      // Soul not found; use inline or default
    }
  }
  if (agentConfig.soulDocument) {
    instructions = agentConfig.soulDocument;
  }
  if (agentConfig.systemPrompt) {
    instructions += '\n\n' + agentConfig.systemPrompt;
  }

  return new Agent(components.agent, {
    name: agentConfig.name,
    languageModel: resolved.model,
    instructions,
    tools,
  });
}

// Export the static agent as default
export default clawsyncAgent;
