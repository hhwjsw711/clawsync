import { ActionCtx } from '../_generated/server';
import { api, internal } from '../_generated/api';
import { Doc, Id } from '../_generated/dataModel';
import { createTool } from '@convex-dev/agent';
import { jsonSchema } from 'ai';
import { checkSecurity, truncateForLog } from './security';
import { createGeneratePDFTool } from './tools/generatePDF';
import { createSendTelegramMessageTool } from './tools/sendTelegram';
import { createSendEmailTool } from './tools/sendEmail';
import { createPostTweetTool } from './tools/postTweet';
import { createScheduleTaskTool } from './tools/scheduleTask';
import { createListToolsTool } from './tools/listTools';
import { createManageScheduleTools } from './tools/manageSchedule';
import { createWebFetchTool } from './tools/webFetch';

/**
 * Tool Loader
 *
 * Assembles the agent's tools at invocation time from:
 * 1. Skills from skillRegistry (approved + active)
 * 2. Tools from connected MCP servers (approved + enabled)
 * 3. Agent-to-agent interaction tools (multi-agent)
 *
 * Multi-agent support: pass agentId to load only that agent's
 * assigned skills/MCP servers. Without agentId loads all (backward compat).
 *
 * All tools pass through the security checker before execution.
 */

export type ToolSet = Record<string, any>;

/**
 * Load tools for an agent (scoped by agentId or all if not provided)
 */
export async function loadTools(
  ctx: ActionCtx,
  agentId?: Id<'agents'>
): Promise<ToolSet> {
  const tools: ToolSet = {};

  // Determine which skill IDs to load
  let allowedSkillIds: Set<string> | null = null;
  let allowedMcpIds: Set<string> | null = null;

  if (agentId) {
    // Per-agent scoped: only load assigned skills/MCP servers
    const skillIds: Id<'skillRegistry'>[] = await ctx.runQuery(
      internal.agentAssignments.getAgentSkillIds,
      { agentId }
    );
    allowedSkillIds = new Set(skillIds as string[]);

    const mcpIds: Id<'mcpServers'>[] = await ctx.runQuery(
      internal.agentAssignments.getAgentMcpIds,
      { agentId }
    );
    allowedMcpIds = new Set(mcpIds as string[]);
  }

  // Load skills from skillRegistry
  const skills = await ctx.runQuery(internal.skillRegistry.getActiveApproved);

  for (const skill of skills) {
    // If scoped, only include assigned skills
    if (allowedSkillIds && !allowedSkillIds.has(skill._id as string)) {
      continue;
    }

    const toolFn = createToolFromSkill(ctx, skill);
    if (toolFn) {
      // Sanitize name to match Anthropic's pattern: ^[a-zA-Z0-9_-]{1,128}
      const safeName = skill.name
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 128);
      tools[safeName] = toolFn;
    }
  }

  // Load tools from enabled MCP servers
  try {
    const mcpServers: Array<{ name: string; url?: string; _id: any; apiKeyEnvVar?: string }> =
      await ctx.runQuery(api.mcpServers.getEnabledApproved);
    console.log(`[MCP] Found ${mcpServers.length} enabled MCP servers`);

    for (const server of mcpServers) {
      if (!server.url) {
        console.log(`[MCP] Server ${server.name} has no URL, skipping`);
        continue;
      }

      // If scoped, only include assigned MCP servers
      if (allowedMcpIds && !allowedMcpIds.has(server._id as string)) {
        continue;
      }

      try {
        console.log(`[MCP] Fetching tools from ${server.name} at ${server.url}`);
        
        // Resolve API key for this server (for discovery phase)
        const discoveryHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream, */*',
          'User-Agent': 'ClawSync-MCP-Client/1.0',
        };
        
        if (server.apiKeyEnvVar) {
          const apiKey = process.env[server.apiKeyEnvVar];
          if (apiKey) {
            discoveryHeaders['Authorization'] = `Bearer ${apiKey}`;
            console.log(`[MCP] Using API key for ${server.name} discovery from ${server.apiKeyEnvVar}`);
          } else {
            console.warn(`[MCP] API key env var ${server.apiKeyEnvVar} not set for ${server.name}`);
          }
        }
        
        // Try both regular POST and GET for tools/list
        let response;
        let responseText;
        
        // Try POST first (MCP standard) with proper JSON-RPC 2.0 format
        try {
          response = await fetch(server.url, {
            method: 'POST',
            headers: discoveryHeaders,
            body: JSON.stringify({ 
              jsonrpc: '2.0',
              method: 'tools/list', 
              params: {},
              id: 1
            }),
          });
          responseText = await response.text();
        } catch (e) {
          // Try GET as fallback (with same headers minus Content-Type)
          const getHeaders = { ...discoveryHeaders };
          delete getHeaders['Content-Type'];
          response = await fetch(server.url, {
            method: 'GET',
            headers: getHeaders,
          });
          responseText = await response.text();
        }

        if (!response.ok) {
          console.error(`[MCP] ${server.name} returned status ${response.status}`);
          console.error(`[MCP] Response body:`, responseText.slice(0, 500));
          continue;
        }

        // Parse response - handle both JSON and SSE formats
        let data;
        try {
          // Try parsing as regular JSON first
          data = JSON.parse(responseText);
        } catch (e) {
          // Might be SSE format - try to extract JSON from data: lines
          const jsonMatch = responseText.match(/data: ({.+})/);
          if (jsonMatch) {
            try {
              data = JSON.parse(jsonMatch[1]);
            } catch {
              data = { tools: [] };
            }
          } else {
            console.error(`[MCP] ${server.name} returned non-JSON:`, responseText.slice(0, 200));
            continue;
          }
        }
        
        console.log(`[MCP] ${server.name} response:`, JSON.stringify(data).slice(0, 500));
        
        const mcpTools = data.result?.tools || data.tools || [];
        console.log(`[MCP] ${server.name} has ${mcpTools.length} tools`);

        for (const mcpTool of mcpTools) {
          const toolName = mcpTool.name as string;
          const safeName = toolName
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .replace(/_+/g, '_')
            .slice(0, 128);

          console.log(`[MCP] Registering tool: ${toolName} (safe: ${safeName})`);
          
          // Check if this overwrites an existing skill
          if (tools[safeName]) {
            console.log(`[MCP] Tool "${safeName}" conflicts with existing skill, keeping MCP version`);
          }
          
          // Resolve API key at tool creation time (not execution time)
          let apiKey: string | undefined;
          if (server.apiKeyEnvVar) {
            apiKey = process.env[server.apiKeyEnvVar];
            if (apiKey) {
              console.log(`[MCP] Loaded API key for ${server.name} from ${server.apiKeyEnvVar}`);
            } else {
              console.warn(`[MCP] API key env var ${server.apiKeyEnvVar} not set for ${server.name}`);
            }
          }
          
          tools[safeName] = createMcpTool(server.url, mcpTool, server.name, apiKey);
        }
      } catch (e) {
        console.error(`[MCP] Failed to load tools from ${server.name}:`, e);
      }
    }
  } catch (e) {
    console.error('[MCP] Failed to load MCP servers:', e);
  }

  // Add model switching tools (always available)
  tools['list_available_models'] = createListModelsTool(ctx);
  tools['switch_model'] = createSwitchModelTool(ctx);
  tools['get_current_model'] = createGetCurrentModelTool(ctx);

  // Add image generation tool (always available)
  tools['generate_image'] = createGenerateImageTool();

  // Add PDF generation tool (always available)
  tools['generate_pdf'] = createGeneratePDFTool(ctx);

  // Add Telegram send message tool (always available)
  tools['send_telegram_message'] = createSendTelegramMessageTool(ctx);

  // Add send email tool (uses AgentMail)
  tools['send_email'] = createSendEmailTool(ctx);

  // Add post tweet tool (uses X/Twitter)
  tools['post_tweet'] = createPostTweetTool(ctx);

  // Add schedule task tool (uses Convex cron jobs)
  tools['schedule_task'] = createScheduleTaskTool(ctx);

  // Add list tools utility
  tools['list_tools'] = createListToolsTool(ctx);

  // Add schedule management tools (not shown in UI but available to AI)
  const scheduleManagementTools = createManageScheduleTools(ctx);
  tools['list_scheduled_tasks'] = scheduleManagementTools.list_scheduled_tasks;
  tools['delete_scheduled_task'] = scheduleManagementTools.delete_scheduled_task;
  tools['toggle_scheduled_task'] = scheduleManagementTools.toggle_scheduled_task;

  // Add web fetch tool
  tools['web_fetch'] = createWebFetchTool();

  // Add utility tools
  tools['get_current_date'] = createTool({
    description: 'Get the current date and time. Use this when the user asks what day it is, what time it is, or what the current date is.',
    args: jsonSchema<{ format?: 'short' | 'long' | 'iso' }>({
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['short', 'long', 'iso'],
          description: 'Format of the date: short (MM/DD/YYYY), long (Month DD, YYYY), or iso (ISO 8601). Default is long.',
        },
      },
    }),
    handler: async () => {
      const now = new Date();
      return {
        date: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        time: now.toLocaleTimeString('en-US'),
        iso: now.toISOString(),
        timestamp: now.getTime(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    },
  });

  // Add agent-to-agent interaction tools if multi-agent
  if (agentId) {
    try {
      const allAgents: Array<{ _id: any; name: string; status: string }> =
        await ctx.runQuery(api.agents.list);
      const peerAgents = allAgents.filter(
        (a) => (a._id as string) !== (agentId as string) && a.status !== 'error'
      );

      for (const peer of peerAgents) {
        const safeName = `ask_agent_${peer.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100)}`;
        tools[safeName] = createAgentTool(ctx, agentId, peer._id, peer.name);
      }
    } catch {
      // Agent listing failed; skip peer tools
    }
  }

  return tools;
}

/**
 * Create a tool that invokes another agent (agent-to-agent interaction)
 */
function createAgentTool(
  ctx: ActionCtx,
  fromAgentId: Id<'agents'>,
  toAgentId: Id<'agents'>,
  toAgentName: string
) {
  return createTool({
    description: `Ask agent "${toAgentName}" a question and get their response`,
    args: jsonSchema<{ question: string }>({
      type: 'object' as const,
      properties: {
        question: { type: 'string', description: 'The question to ask the other agent' },
      },
      required: ['question'],
    }),
    handler: async (_toolCtx: any, { question }: { question: string }) => {
      try {
        // Import dynamically to avoid circular deps
        const { createDynamicAgent } = await import('./clawsync');
        const peer = await createDynamicAgent(ctx, toAgentId);
        const { thread, threadId } = await peer.createThread(ctx, {});
        const result = await thread.generateText({ prompt: question });

        // Log the interaction
        await ctx.runMutation(internal.agentInteractions.log, {
          fromAgentId,
          toAgentId,
          content: question,
          response: result.text.slice(0, 2000),
          threadId,
        });

        return result.text;
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Agent interaction failed',
        };
      }
    },
  });
}

/**
 * Create a tool that proxies to an MCP server
 */
function createMcpTool(serverUrl: string, mcpTool: any, serverName: string, apiKey?: string) {
  const schema = mcpTool.inputSchema || mcpTool.input_schema || { type: 'object', properties: {} };
  const toolName = mcpTool.name || mcpTool.id || 'unknown';

  return createTool({
    description: `[${serverName}] ${mcpTool.description || mcpTool.name}`,
    args: jsonSchema(schema),
    handler: async (_toolCtx: any, args: any) => {
      try {
        console.log(`[MCP] Calling tool "${toolName}" on ${serverUrl}`, JSON.stringify(args).slice(0, 200));
        
        // Try multiple formats - some MCP servers use different endpoints
        const urlsToTry = [
          serverUrl,
          serverUrl.replace(/\/?$/, '/tools/call'),
        ];
        
        let lastError: Error | null = null;
        
        // Prepare headers with optional API key
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream, */*',
          'User-Agent': 'ClawSync-MCP-Client/1.0',
        };
        
        // Add API key if configured
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
          console.log(`[MCP] Using API key for ${serverName}`);
        }
        
        for (const url of urlsToTry) {
          try {
            const response = await fetch(url, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'tools/call',
                params: {
                  name: toolName,
                  arguments: args,
                },
                id: 1,
              }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.log(`[MCP] ${url} returned ${response.status}:`, errorText.slice(0, 500));
              lastError = new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
              continue;
            }

            const responseText = await response.text();
            
            // Parse response - handle both JSON and SSE formats
            let data;
            try {
              // Try parsing as regular JSON first
              data = JSON.parse(responseText);
            } catch (e) {
              // Might be SSE format - try to extract JSON from data: lines
              const jsonMatch = responseText.match(/data: ({.+})/);
              if (jsonMatch) {
                try {
                  data = JSON.parse(jsonMatch[1]);
                } catch {
                  console.error(`[MCP] Could not parse SSE response from ${url}:`, responseText.slice(0, 200));
                  lastError = new Error('Invalid SSE format');
                  continue;
                }
              } else {
                console.error(`[MCP] ${url} returned non-JSON:`, responseText.slice(0, 200));
                lastError = new Error('Non-JSON response');
                continue;
              }
            }
            
            console.log(`[MCP] Response from ${url}:`, JSON.stringify(data).slice(0, 500));
            
            // Handle different response formats
            if (data.result !== undefined) {
              return data.result;
            } else if (data.output !== undefined) {
              return data.output;
            } else if (data.content !== undefined) {
              return data.content;
            } else {
              return data;
            }
          } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
            console.log(`[MCP] Failed to call ${url}:`, lastError.message);
          }
        }
        
        throw lastError || new Error('All MCP endpoints failed');
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'MCP tool call failed';
        console.error(`[MCP] Tool "${toolName}" failed:`, errorMsg);
        return { error: errorMsg };
      }
    },
  });
}

const inputSchema = jsonSchema<{ input: string }>({
  type: 'object' as const,
  properties: {
    input: { type: 'string', description: 'Input for the skill' },
  },
  required: ['input'],
});

/**
 * Create an AI SDK tool from a skill registry entry
 */
function createToolFromSkill(
  ctx: ActionCtx,
  skill: Doc<'skillRegistry'>
): any | null {
  switch (skill.skillType) {
    case 'template':
      return createTemplateSkillTool(ctx, skill);
    case 'webhook':
      return createWebhookSkillTool(ctx, skill);
    case 'code':
      return createCodeSkillTool(ctx, skill);
    default:
      return null;
  }
}

/**
 * Create a tool from a template skill
 */
function createTemplateSkillTool(ctx: ActionCtx, skill: Doc<'skillRegistry'>) {
  return createTool({
    description: skill.description,
    args: inputSchema,
    handler: async (_toolCtx, { input }: { input: string }) => {
      const startTime = Date.now();

      const securityResult = await checkSecurity(ctx, skill, input);
      if (!securityResult.allowed) {
        await logInvocation(ctx, skill, input, null, false, securityResult, startTime);
        return { error: securityResult.reason };
      }

      try {
        const result = await ctx.runAction(
          internal.agent.skills.templates.execute.execute,
          {
            templateId: skill.templateId!,
            config: skill.config || '{}',
            input,
          }
        );

        await logInvocation(ctx, skill, input, result, true, securityResult, startTime);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await logInvocation(ctx, skill, input, null, false, securityResult, startTime, errorMessage);
        return { error: errorMessage };
      }
    },
  });
}

/**
 * Create a tool from a webhook skill
 */
function createWebhookSkillTool(ctx: ActionCtx, skill: Doc<'skillRegistry'>) {
  return createTool({
    description: skill.description,
    args: inputSchema,
    handler: async (_toolCtx, { input }: { input: string }) => {
      const startTime = Date.now();

      const config = skill.config ? JSON.parse(skill.config) : {};
      const domain = config.url ? new URL(config.url).hostname : undefined;

      const securityResult = await checkSecurity(ctx, skill, input, { domain });
      if (!securityResult.allowed) {
        await logInvocation(ctx, skill, input, null, false, securityResult, startTime);
        return { error: securityResult.reason };
      }

      try {
        const result = await ctx.runAction(
          internal.agent.skills.templates.execute.webhookCaller,
          {
            config: skill.config || '{}',
            input,
            skillId: skill._id,
          }
        );

        await logInvocation(ctx, skill, input, result, true, securityResult, startTime);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await logInvocation(ctx, skill, input, null, false, securityResult, startTime, errorMessage);
        return { error: errorMessage };
      }
    },
  });
}

/**
 * Create a tool from a code-defined skill
 */
function createCodeSkillTool(ctx: ActionCtx, skill: Doc<'skillRegistry'>) {
  return createTool({
    description: skill.description,
    args: jsonSchema<{ query: string }>({
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Query input' },
      },
      required: ['query'],
    }),
    handler: async (_toolCtx, { query }: { query: string }) => {
      const startTime = Date.now();

      const securityResult = await checkSecurity(ctx, skill, query);
      if (!securityResult.allowed) {
        await logInvocation(ctx, skill, query, null, false, securityResult, startTime);
        return { error: securityResult.reason };
      }

      try {
        const result = `Code skill "${skill.name}" executed with query: ${query}`;
        await logInvocation(ctx, skill, query, result, true, securityResult, startTime);
        return { result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await logInvocation(ctx, skill, query, null, false, securityResult, startTime, errorMessage);
        return { error: errorMessage };
      }
    },
  });
}

/**
 * Log skill invocation to the audit log
 */
async function logInvocation(
  ctx: ActionCtx,
  skill: Doc<'skillRegistry'>,
  input: unknown,
  output: unknown,
  success: boolean,
  securityResult: { code: string },
  startTime: number,
  errorMessage?: string
): Promise<void> {
  const durationMs = Date.now() - startTime;

  await ctx.runMutation(internal.skillInvocations.log, {
    skillName: skill.name,
    skillType: skill.skillType,
    input: truncateForLog(input),
    output: output ? truncateForLog(output) : undefined,
    success,
    errorMessage,
    securityCheckResult: securityResult.code,
    durationMs,
    timestamp: Date.now(),
  });
}

/**
 * Create tool to list available models
 */
function createListModelsTool(ctx: ActionCtx) {
  return createTool({
    description: 'List available AI models that can be switched to. Returns top 50 models. Use the "provider" parameter to filter by provider (e.g., "openai", "anthropic", "google"), or "search" to find specific models by name.',
    args: jsonSchema<{ provider?: string; search?: string; limit?: number }>({
      type: 'object' as const,
      properties: {
        provider: { 
          type: 'string', 
          description: 'Filter by provider. Examples: "openai", "anthropic", "google", "meta-llama", "deepseek", "x-ai"'
        },
        search: {
          type: 'string',
          description: 'Search for models by name. Examples: "gpt", "claude", "llama", "gemini"'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of models to return (default: 50, max: 100)'
        }
      },
    }),
    handler: async (_toolCtx, args: { provider?: string; search?: string; limit?: number }) => {
      const result = await ctx.runAction(internal.agent.modelSwitching.listAvailableModels, {
        provider: args.provider,
        search: args.search,
        limit: args.limit,
      });
      return {
        models: result.models,
        count: result.count,
        total: result.total,
        message: `Showing ${result.count} of ${result.total} models:\n\n${result.models.map((m: any) => `- ${m.name} - ID: "${m.id}"`).join('\n')}\n\nTo switch models: use switch_model with provider="openrouter" and model="<ID>"`,
      };
    },
  });
}

/**
 * Create tool to switch models
 */
function createSwitchModelTool(ctx: ActionCtx) {
  return createTool({
    description: 'Switch to a different AI model. Use this when the user asks to change models, switch providers, or use a specific model like GPT-5, Claude 4, o3, etc. Available providers: openrouter (for 300+ models), anthropic, openai, xai.',
    args: jsonSchema<{ provider: string; model: string }>({
      type: 'object' as const,
      properties: {
        provider: {
          type: 'string',
          description: 'The provider to use. Options: openrouter (recommended for variety), anthropic, openai, xai'
        },
        model: {
          type: 'string',
          description: 'The model ID. Examples for openrouter: "openai/gpt-4.5", "openai/gpt-5", "openai/o3", "anthropic/claude-sonnet-4", "anthropic/claude-opus-4.5", "google/gemini-2.5-pro", "meta-llama/llama-4"'
        },
      },
      required: ['provider', 'model'],
    }),
    handler: async (_toolCtx, { provider, model }: { provider: string; model: string }) => {
      const result = await ctx.runAction(internal.agent.modelSwitching.switchModel, {
        provider,
        model,
      });
      return result;
    },
  });
}

/**
 * Create tool to get current model info
 */
function createGetCurrentModelTool(ctx: ActionCtx) {
  return createTool({
    description: 'Get information about the currently active AI model. Use this when the user asks what model is being used.',
    args: jsonSchema<{}>({
      type: 'object' as const,
      properties: {},
    }),
    handler: async () => {
      const result = await ctx.runAction(internal.agent.modelSwitching.getCurrentModel, {});
      return {
        provider: result.provider,
        model: result.model,
        message: `Currently using: ${result.provider}/${result.model}`,
      };
    },
  });
}

/**
 * Create tool for generating images using OpenAI's DALL-E 3
 */
function createGenerateImageTool() {
  return createTool({
    description: 'Generate an image using AI. Provide a detailed prompt describing the image you want to create. Supports various sizes and quality levels.',
    args: jsonSchema<{ prompt: string; size?: string; quality?: string }>({
      type: 'object' as const,
      properties: {
        prompt: {
          type: 'string',
          description: 'A detailed description of the image you want to generate. Be specific about subjects, styles, lighting, mood, and composition.',
        },
        size: {
          type: 'string',
          description: 'Image size. Options: 1024x1024 (square, default), 1792x1024 (wide), 1024x1792 (tall)',
          enum: ['1024x1024', '1792x1024', '1024x1792'],
        },
        quality: {
          type: 'string',
          description: 'Image quality. Options: standard (default, faster), hd (higher detail, slower)',
          enum: ['standard', 'hd'],
        },
      },
      required: ['prompt'],
    }),
    handler: async (_toolCtx, args: { prompt: string; size?: string; quality?: string }) => {
      const apiKey = process.env.OPENAI_API_KEY;

      if (!apiKey) {
        return {
          error: 'OPENAI_API_KEY environment variable is not configured. Please set it in the Convex dashboard to use image generation.',
        };
      }

      const size = args.size || '1024x1024';
      const quality = args.quality || 'standard';

      try {
        console.log(`[ImageGen] Generating image with size=${size}, quality=${quality}`);

        const response = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'dall-e-3',
            prompt: args.prompt,
            n: 1,
            size: size,
            quality: quality,
            response_format: 'url',
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
          console.error(`[ImageGen] API error: ${errorMessage}`);
          return {
            error: `Image generation failed: ${errorMessage}`,
          };
        }

        const data = await response.json();

        if (!data.data || !data.data[0] || !data.data[0].url) {
          console.error('[ImageGen] Invalid response structure:', data);
          return {
            error: 'Image generation returned an invalid response. Please try again.',
          };
        }

        const imageUrl = data.data[0].url;
        const revisedPrompt = data.data[0].revised_prompt;

        console.log(`[ImageGen] Successfully generated image`);

        return {
          success: true,
          imageUrl: imageUrl,
          revisedPrompt: revisedPrompt,
          message: `Image generated successfully!\n\nURL: ${imageUrl}${revisedPrompt ? `\n\nRevised prompt: "${revisedPrompt}"` : ''}`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('[ImageGen] Error:', errorMessage);
        return {
          error: `Image generation failed: ${errorMessage}`,
        };
      }
    },
  });
}
