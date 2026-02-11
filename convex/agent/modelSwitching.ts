import { action, internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { getAvailableProviders } from './modelRouter';

/**
 * Model Switching Tool
 *
 * Allows the agent to dynamically switch models during conversation.
 * Updates agentConfig with new model/provider and returns confirmation.
 */

const COMPANY_NAME_MAP: Record<string, string> = {
  'openai': 'OpenAI',
  'anthropic': 'Anthropic',
  'google': 'Google',
  'meta-llama': 'Meta',
  'mistralai': 'Mistral',
  'microsoft': 'Microsoft',
  'cohere': 'Cohere',
  'ai21': 'AI21',
  'perplexity': 'Perplexity',
  'x-ai': 'xAI',
  'deepseek': 'DeepSeek',
  'qwen': 'Qwen',
  'nvidia': 'NVIDIA',
  '01-ai': '01.AI',
  'amazon': 'Amazon',
  'snowflake': 'Snowflake',
  'databricks': 'Databricks',
  'fireworks': 'Fireworks',
  'together': 'Together',
  'octoai': 'OctoAI',
  'replicate': 'Replicate',
  'anyscale': 'Anyscale',
  'moonshotai': 'Kimi',
};

function formatCompanyName(companyId: string): string {
  return COMPANY_NAME_MAP[companyId.toLowerCase()] || companyId.charAt(0).toUpperCase() + companyId.slice(1);
}

// Switch to a specific model
export const switchModel: any = internalAction({
  args: {
    provider: v.string(),
    model: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    previousModel: v.optional(v.string()),
    newModel: v.optional(v.string()),
  }),
  handler: async (ctx: any, args: any): Promise<any> => {
    try {
      const config: any = await ctx.runQuery(internal.agentConfig.getConfig);
      const previousModel: string = config?.model ?? 'unknown';

      const providers = getAvailableProviders();
      const validProvider = providers.find(p => p.id === args.provider);
      if (!validProvider) {
        return {
          success: false,
          message: `Invalid provider: ${args.provider}. Available: ${providers.map(p => p.id).join(', ')}`,
        };
      }

      await ctx.runMutation(internal.agentConfig.update, {
        model: args.model,
        modelProvider: args.provider,
      });

      await ctx.runMutation(internal.activityLog.log, {
        actionType: 'model_switch',
        summary: `Switched from ${previousModel} to ${args.provider}/${args.model}`,
        visibility: 'private',
      });

      return {
        success: true,
        message: `Successfully switched to ${args.provider}/${args.model}. The next message will use the new model.`,
        previousModel,
        newModel: args.model,
      };
    } catch (error) {
      console.error('Model switch error:', error);
      return {
        success: false,
        message: `Failed to switch model: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
});

// List available models from OpenRouter API
export const listAvailableModels = action({
  args: {
    search: v.optional(v.string()),
    company: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    models: v.array(v.object({
      id: v.string(),
      name: v.string(),
      provider: v.string(),
      company: v.string(),
      description: v.optional(v.string()),
    })),
    companies: v.array(v.object({
      id: v.string(),
      name: v.string(),
      count: v.number(),
    })),
    count: v.number(),
    total: v.number(),
  }),
  handler: async (ctx, args) => {
    // Default fallback models in case API fails
    const fallbackModels = [
      { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'openrouter', company: 'openai' },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openrouter', company: 'openai' },
      { id: 'anthropic/claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'openrouter', company: 'anthropic' },
      { id: 'anthropic/claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'openrouter', company: 'anthropic' },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'openrouter', company: 'google' },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'openrouter', company: 'google' },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', provider: 'openrouter', company: 'deepseek' },
      { id: 'x-ai/grok-3', name: 'Grok 3', provider: 'openrouter', company: 'x-ai' },
    ];

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'HTTP-Referer': 'https://clawsync.dev',
          'X-Title': 'ClawSync',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error('OpenRouter API returned:', response.status);
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();
      const allModels = data.data.map((m: any) => {
        const company = m.id.includes('/') ? m.id.split('/')[0] : 'unknown';
        return {
          id: m.id,
          name: m.name || m.id,
          provider: 'openrouter',
          company,
          description: m.description,
        };
      });

      // Filter by company
      let filtered = allModels;
      if (args.company) {
        filtered = filtered.filter((m: any) => m.company === args.company);
      }

      // Filter by search
      if (args.search) {
        const query = args.search.toLowerCase();
        filtered = filtered.filter((m: any) =>
          m.name.toLowerCase().includes(query) ||
          m.id.toLowerCase().includes(query) ||
          m.company.toLowerCase().includes(query)
        );
      }

      // Sort alphabetically
      filtered.sort((a: any, b: any) => a.name.localeCompare(b.name));

      // Calculate company counts
      const companyCounts = new Map<string, number>();
      filtered.forEach((m: any) => {
        companyCounts.set(m.company, (companyCounts.get(m.company) || 0) + 1);
      });

      const companies = Array.from(companyCounts.entries())
        .map(([id, count]) => ({ id, name: formatCompanyName(id), count }))
        .sort((a, b) => b.count - a.count);

      const limit = Math.min(args.limit || 100, 300);
      const limitedModels = filtered.slice(0, limit);

      return {
        models: limitedModels,
        companies,
        count: limitedModels.length,
        total: filtered.length,
      };
    } catch (error) {
      console.error('Failed to fetch OpenRouter models:', error);
      // Return fallback models
      let filtered = fallbackModels;
      
      if (args.search) {
        const query = args.search.toLowerCase();
        filtered = filtered.filter((m: any) =>
          m.name.toLowerCase().includes(query) ||
          m.id.toLowerCase().includes(query)
        );
      }

      const companyCounts = new Map<string, number>();
      filtered.forEach((m: any) => {
        companyCounts.set(m.company, (companyCounts.get(m.company) || 0) + 1);
      });

      const companies = Array.from(companyCounts.entries())
        .map(([id, count]) => ({ id, name: formatCompanyName(id), count }))
        .sort((a, b) => b.count - a.count);

      return {
        models: filtered,
        companies,
        count: filtered.length,
        total: filtered.length,
      };
    }
  },
});

// Get current model info
export const getCurrentModel = internalAction({
  args: {},
  returns: v.object({
    provider: v.string(),
    model: v.string(),
  }),
  handler: async (ctx) => {
    const config = await ctx.runQuery(internal.agentConfig.getConfig);
    return {
      provider: config?.modelProvider ?? 'anthropic',
      model: config?.model ?? 'claude-sonnet-4-20250514',
    };
  },
});
