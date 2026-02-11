import { createTool } from '@convex-dev/agent';
import { jsonSchema } from 'ai';
import { ActionCtx } from '../../_generated/server';
import { internal } from '../../_generated/api';

/**
 * List Tools Tool
 * 
 * Shows all available tools the agent can use.
 */

export function createListToolsTool(ctx: ActionCtx) {
  return createTool({
    description: `List all available tools and capabilities the agent can use.
Use this when the user asks:
- "What tools do you have?"
- "What can you do?"
- "Show me your capabilities"
- "List available tools"

Returns a categorized list of all enabled tools.`,
    args: jsonSchema<{}>({
      type: 'object',
      properties: {},
    }),
    handler: async () => {
      const tools = {
        communication: [
          { name: 'send_email', description: 'Send emails via AgentMail' },
          { name: 'post_tweet', description: 'Post tweets to X/Twitter' },
          { name: 'send_telegram_message', description: 'Send messages via Telegram bot' },
        ],
        content_creation: [
          { name: 'generate_pdf', description: 'Generate PDF documents from content' },
          { name: 'generate_image', description: 'Generate images using AI' },
        ],
        research: [
          { name: 'web_fetch', description: 'Fetch data from URLs and APIs' },
          { name: 'web_search_exa', description: 'Search the web using Exa' },
          { name: 'company_research_exa', description: 'Research companies using Exa' },
          { name: 'get_code_context_exa', description: 'Get code examples and documentation' },
        ],
        ai_models: [
          { name: 'list_available_models', description: 'List available AI models' },
          { name: 'switch_model', description: 'Switch to a different AI model' },
          { name: 'get_current_model', description: 'Get currently active model' },
        ],
        automation: [
          { name: 'schedule_task', description: 'Create scheduled recurring tasks' },
        ],
        utilities: [
          { name: 'get_current_date', description: 'Get current date and time' },
        ],
      };



      return {
        success: true,
        message: 'Here are all the tools I can use:',
        tools,
        totalTools: Object.values(tools).flat().length,
      };
    },
  });
}
