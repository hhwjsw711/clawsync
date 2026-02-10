'use node';

import { action, internalAction } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { clawsyncAgent, createDynamicAgent } from './agent/clawsync';
import { rateLimiter } from './rateLimits';
import { loadTools } from './agent/toolLoader';
import { stepCountIs } from '@convex-dev/agent';
import { generateText as aiGenerateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { extractTextFromPDF, isPDFFile } from './utils/pdfExtractor';
import { resolveModel } from './agent/modelRouter';

/**
 * Chat Functions
 *
 * Handles sending messages to the agent and receiving responses.
 * Uses @convex-dev/agent for thread management and streaming.
 * Model and tools are resolved dynamically from SyncBoard config.
 */

// Send a message and get a response
export const send = action({
  args: {
    threadId: v.optional(v.string()),
    message: v.string(),
    sessionId: v.string(),
    attachments: v.optional(v.array(v.object({
      uploadToken: v.string(),
      url: v.string(),
      fileName: v.string(),
      fileType: v.string(),
    }))),
  },
  returns: v.object({
    response: v.optional(v.string()),
    error: v.optional(v.string()),
    threadId: v.optional(v.string()),
    toolCalls: v.optional(
      v.array(v.object({ name: v.string(), args: v.string(), result: v.string() }))
    ),
  }),
  handler: async (ctx, args) => {
    // Rate limit check
    const { ok } = await rateLimiter.limit(ctx, 'publicChat', {
      key: args.sessionId,
    });

    if (!ok) {
      return {
        error: 'Rate limit exceeded. Please wait before sending another message.',
        threadId: args.threadId,
      };
    }

    // Global rate limit
    const { ok: globalOk } = await rateLimiter.limit(ctx, 'globalMessages', {
      key: 'global',
    });

    if (!globalOk) {
      return {
        error: 'The agent is currently busy. Please try again in a moment.',
        threadId: args.threadId,
      };
    }

    // Validate message length
    const maxLength = 4000;
    if (args.message.length > maxLength) {
      return {
        error: `Message too long. Maximum ${maxLength} characters.`,
        threadId: args.threadId,
      };
    }

    try {
      // Resolve model for direct API calls
      const resolved = await resolveModel(ctx);

      // Use dynamic agent for SyncBoard-configured model + tools
      const agent = await createDynamicAgent(ctx);

      // Create or continue thread (destructure per @convex-dev/agent API)
      let threadId = args.threadId;
      let thread;
      if (threadId) {
        ({ thread } = await agent.continueThread(ctx, { threadId }));
      } else {
        const created = await agent.createThread(ctx, {});
        threadId = created.threadId;
        thread = created.thread;
      }

      // Load soul document from config for system prompt
      const config = await ctx.runQuery(internal.agentConfig.getConfig);
      const system = config
        ? `${config.soulDocument}\n\n${config.systemPrompt}`
        : undefined;

      // Load tools from skill registry + MCP servers
      const tools = await loadTools(ctx);

      // Prepare message content (multimodal if attachments present)
      const hasAttachments = args.attachments && args.attachments.length > 0;
      const isImageFile = (fileType: string) => fileType.startsWith('image/');
      
      // Build multimodal content if attachments are present
      let prompt: string | any[] = args.message;
      let metadata: Record<string, string> | undefined;
      
      if (hasAttachments) {
        // Store attachments in message metadata
        metadata = {
          attachments: JSON.stringify(args.attachments),
        };
        
        // Extract text from PDFs
        let pdfTexts: string[] = [];
        for (const attachment of args.attachments!) {
          if (isPDFFile(attachment.fileType)) {
            try {
              console.log('Extracting text from PDF:', attachment.fileName);
              // Fetch PDF content
              const pdfResponse = await fetch(attachment.url);
              if (pdfResponse.ok) {
                const pdfBuffer = await pdfResponse.arrayBuffer();
                const pdfText = await extractTextFromPDF(pdfBuffer);
                pdfTexts.push(`--- PDF: ${attachment.fileName} ---\n${pdfText.substring(0, 50000)}`); // Limit to 50k chars
                console.log('PDF text extracted, length:', pdfText.length);
              }
            } catch (error) {
              console.error('Error processing PDF:', error);
              pdfTexts.push(`--- PDF: ${attachment.fileName} ---\n[Error: Could not extract text]`);
            }
          }
        }
        
        // Add PDF content to prompt
        if (pdfTexts.length > 0) {
          prompt = `User uploaded ${pdfTexts.length} PDF document(s). Here is the extracted text:\n\n${pdfTexts.join('\n\n')}\n\nUser's question: ${args.message}`;
        }
        
        // For multimodal LLMs, we need to format the content properly
        // Check if the model supports vision by looking at model config
        const modelConfig = await ctx.runQuery(internal.agentConfig.getConfig);
        const visionModelTokens = [
          'vision',
          'claude-4',
          'claude-opus',
          'claude-sonnet',
          'gpt-4.5',
          'gpt-5',
          'gpt-4o',
          'gpt-4.1',
          'gpt-4.1-mini',
          'gpt-4.1-nano',
          'o3',
          'o4',
          'gemini',
          'flash',
        ];
        const supportsVision = visionModelTokens.some((token) =>
          modelConfig?.model?.includes(token),
        );
        
        if (supportsVision) {
          // Build multimodal content array for vision models
          const content: any[] = [];
          
          // Add text message with PDF content if any
          let messageText = args.message;
          if (pdfTexts.length > 0) {
            messageText = `User uploaded ${pdfTexts.length} PDF document(s). Here is the extracted text:\n\n${pdfTexts.join('\n\n')}\n\nUser's question: ${args.message}`;
          }
          
          if (messageText.trim()) {
            content.push({ type: 'text', text: messageText });
          }
          
          // Add image attachments
          let hasImages = false;
          for (const attachment of args.attachments!) {
            if (isImageFile(attachment.fileType)) {
              hasImages = true;
              try {
                console.log('Processing image:', attachment.fileName);
                
                // Check if already a data URL (base64)
                if (attachment.url.startsWith('data:')) {
                  // Already base64, use directly
                  content.push({
                    type: 'image',
                    image: attachment.url,
                  });
                  console.log('Using provided base64 image');
                } else {
                  // Fetch and convert to base64 (for URLs from storage)
                  const imageResponse = await fetch(attachment.url);
                  if (imageResponse.ok) {
                    const imageBuffer = await imageResponse.arrayBuffer();
                    const base64Image = Buffer.from(imageBuffer).toString('base64');
                    const mimeType = attachment.fileType || 'image/jpeg';
                    const dataUrl = `data:${mimeType};base64,${base64Image}`;
                    
                    content.push({
                      type: 'image',
                      image: dataUrl,
                    });
                    console.log('Image processed successfully');
                  } else {
                    console.error('Failed to fetch image:', attachment.url);
                  }
                }
              } catch (error) {
                console.error('Error processing image:', error);
              }
            }
          }
          
          // If we have images, use direct AI SDK instead of agent wrapper
          if (hasImages && content.length > 0) {
            console.log('Using direct AI SDK for vision');
            const { text: responseText } = await aiGenerateText({
              model: resolved.model,
              messages: [
                ...(system ? [{ role: 'system' as const, content: system }] : []),
                {
                  role: 'user' as const,
                  content,
                },
              ],
            });
            
            // Insert user message into agent component messages table
            try {
              await ctx.runMutation(internal.messages.insertMessage, {
                threadId,
                role: 'user',
                content: args.message,
                metadata,
              });
            } catch (e) {
              console.error('Failed to insert user message:', e);
            }
            
            // Insert assistant response
            try {
              await ctx.runMutation(internal.messages.insertMessage, {
                threadId,
                role: 'assistant',
                content: responseText,
              });
            } catch (e) {
              console.error('Failed to insert assistant message:', e);
            }
            
            // Log activity
            const logSummary = hasAttachments 
              ? `Responded to: "${args.message.slice(0, 50)}${args.message.length > 50 ? '...' : ''}" with ${args.attachments!.length} attachment(s)`
              : `Responded to: "${args.message.slice(0, 50)}${args.message.length > 50 ? '...' : ''}"`;
            
            await ctx.runMutation(internal.activityLog.log, {
              actionType: 'chat_message',
              summary: logSummary,
              visibility: 'private',
            });
            
            return {
              response: responseText,
              threadId,
              toolCalls: undefined,
            };
          }
        }
      }

      // Generate response with tools and multi-step support
      const hasTools = Object.keys(tools).length > 0;
      const result = await thread.generateText(
        {
          prompt,
          ...(system && { system }),
          ...(hasTools && { tools }),
          ...(hasTools && { stopWhen: stepCountIs(5) }),
          ...(metadata && { metadata }),
        },
        {
          // Save all messages (including tool call steps) so the
          // frontend subscription picks them up incrementally.
          storageOptions: { saveMessages: 'all' },
        },
      );

      // Log activity
      const logSummary = hasAttachments 
        ? `Responded to: "${args.message.slice(0, 50)}${args.message.length > 50 ? '...' : ''}" with ${args.attachments!.length} attachment(s)`
        : `Responded to: "${args.message.slice(0, 50)}${args.message.length > 50 ? '...' : ''}"`;
      
      await ctx.runMutation(internal.activityLog.log, {
        actionType: 'chat_message',
        summary: logSummary,
        visibility: 'private',
      });

      // Extract tool call info from steps
      const toolCalls: Array<{ name: string; args: string; result: string }> = [];
      const steps = (result as any).steps;
      if (Array.isArray(steps)) {
        for (const step of steps) {
          if (Array.isArray(step.toolCalls)) {
            for (const tc of step.toolCalls) {
              const toolResult = step.toolResults?.find(
                (tr: any) => tr.toolCallId === tc.toolCallId
              )?.result;
              toolCalls.push({
                name: tc.toolName ?? tc.name ?? 'unknown',
                args: JSON.stringify(tc.args ?? {}, null, 2),
                result: toolResult
                  ? typeof toolResult === 'string'
                    ? toolResult.slice(0, 1000)
                    : JSON.stringify(toolResult, null, 2).slice(0, 1000)
                  : '',
              });
            }
          }
        }
      }

      return {
        response: result.text,
        threadId,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    } catch (error) {
      console.error('Chat error:', error);
      return {
        error: 'Failed to generate response. Please try again.',
        threadId: args.threadId,
      };
    }
  },
});

// Stream a response (for real-time output)
export const stream = internalAction({
  args: {
    threadId: v.optional(v.string()),
    message: v.string(),
    sessionId: v.string(),
  },
  returns: v.object({
    response: v.string(),
    threadId: v.string(),
  }),
  handler: async (ctx, args) => {
    // Rate limit check
    const { ok } = await rateLimiter.limit(ctx, 'publicChat', {
      key: args.sessionId,
    });

    if (!ok) {
      throw new Error('Rate limit exceeded');
    }

    // Use dynamic agent for SyncBoard-configured model + tools
    const agent = await createDynamicAgent(ctx);

    let threadId = args.threadId;
    let thread;
    if (threadId) {
      ({ thread } = await agent.continueThread(ctx, { threadId }));
    } else {
      const created = await agent.createThread(ctx, {});
      threadId = created.threadId;
      thread = created.thread;
    }

    // Use streaming generation
    const result = await thread.generateText({
      prompt: args.message,
    });

    return {
      response: result.text,
      threadId,
    };
  },
});

// Get thread history
export const getHistory = action({
  args: {
    threadId: v.string(),
  },
  returns: v.object({
    messages: v.any(),
  }),
  handler: async (ctx, args) => {
    try {
      // Use static agent for read-only history lookup
      const result = await clawsyncAgent.listMessages(ctx, {
        threadId: args.threadId,
        paginationOpts: { numItems: 100, cursor: null },
      });

      return { messages: result.page };
    } catch {
      return { messages: [] };
    }
  },
});

// API Send - Internal action for HTTP API
export const apiSend = internalAction({
  args: {
    message: v.string(),
    threadId: v.optional(v.string()),
    sessionId: v.string(),
    apiKeyId: v.optional(v.id('apiKeys')),
    imageUrl: v.optional(v.string()),
  },
  returns: v.object({
    response: v.optional(v.string()),
    error: v.optional(v.string()),
    threadId: v.optional(v.string()),
    tokensUsed: v.optional(v.number()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    // Validate message length
    const maxLength = 4000;
    if (args.message.length > maxLength) {
      return {
        error: `Message too long. Maximum ${maxLength} characters.`,
        threadId: args.threadId,
      };
    }

    try {
      // Validate message is a string
      const message = String(args.message || '');

      // Use dynamic agent for SyncBoard-configured model + tools
      console.log('Creating dynamic agent...');
      const agent = await createDynamicAgent(ctx);
      console.log('Agent created successfully');

      // Create or continue thread
      let threadId = args.threadId;
      let thread;
      if (threadId) {
        console.log('Continuing existing thread:', threadId);
        ({ thread } = await agent.continueThread(ctx, { threadId }));
      } else {
        console.log('Creating new thread');
        const created = await agent.createThread(ctx, {});
        threadId = created.threadId;
        thread = created.thread;
        console.log('New thread created:', threadId);
      }

      // Load tools and config for multi-step generation
      const tools = await loadTools(ctx);
      const config = await ctx.runQuery(internal.agentConfig.getConfig);
      const system = config
        ? `${config.soulDocument}\n\n${config.systemPrompt}`
        : undefined;

      // Generate response with tools and multi-step support
      console.log('Generating response for message:', message);
      const hasTools = Object.keys(tools).length > 0;
      
      let result;
      
      // If image URL provided, make direct API call for vision
      if (args.imageUrl) {
        try {
          console.log('Downloading image from:', args.imageUrl);
          const imageResponse = await fetch(args.imageUrl);
          if (imageResponse.ok) {
            const imageBuffer = await imageResponse.arrayBuffer();
            const base64Image = Buffer.from(imageBuffer).toString('base64');
            const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
            
            console.log('Image downloaded, making vision API call with AI SDK');
            
            // Use Vercel AI SDK for vision
            const modelId = config?.model || 'gpt-4o';
            const visionModel = openai(modelId);
            
            const { text } = await aiGenerateText({
              model: visionModel,
              messages: [
                ...(system ? [{ role: 'system' as const, content: system }] : []),
                {
                  role: 'user' as const,
                  content: [
                    { type: 'text', text: message },
                    {
                      type: 'image',
                      image: `data:${mimeType};base64,${base64Image}`,
                    },
                  ],
                },
              ],
            });
            
            // Create a result object that matches the expected format
            result = {
              text: text,
              usage: {
                promptTokens: 0,
                completionTokens: 0,
              },
            };
            
            console.log('Vision analysis complete');
          } else {
            throw new Error(`Failed to download image: ${imageResponse.status}`);
          }
        } catch (error) {
          console.error('Vision analysis error:', error);
          // Fall back to regular text processing
          result = await thread.generateText(
            {
              prompt: `${message}\n\n[Note: An image was provided but could not be analyzed. Error: ${error instanceof Error ? error.message : 'Unknown error'}]`,
              ...(system && { system }),
              ...(hasTools && { tools }),
              ...(hasTools && { stopWhen: stepCountIs(5) }),
            },
            {
              storageOptions: { saveMessages: 'all' },
            }
          );
        }
      } else {
        // Regular text-only request
        result = await thread.generateText(
          {
            prompt: message,
            ...(system && { system }),
            ...(hasTools && { tools }),
            ...(hasTools && { stopWhen: stepCountIs(5) }),
          },
          {
            storageOptions: { saveMessages: 'all' },
          }
        );
      }
      console.log('Response generated successfully');

      // Log activity
      const summary = message.length > 50 ? message.slice(0, 50) + '...' : message;
      await ctx.runMutation(internal.activityLog.log, {
        actionType: 'api_chat',
        summary: `API: "${summary}"`,
        visibility: 'private',
        channel: 'api',
      });

      // Get token usage from result if available
      const usage = (result as unknown as Record<string, unknown>).usage as
        | { promptTokens?: number; completionTokens?: number }
        | undefined;

      // Handle different response formats safely
      let responseText = '';
      
      try {
        // Try to get text from result
        if (typeof result.text === 'string') {
          responseText = result.text;
        } else if (result && typeof result === 'object') {
          const resultObj = result as Record<string, unknown>;
          responseText = String(resultObj.text || resultObj.content || resultObj.message || resultObj.response || '');
        }
      } catch (e) {
        console.error('Error extracting response text:', e);
        responseText = '';
      }

      console.log('Extracted response text length:', responseText.length);

      return {
        response: responseText,
        threadId,
        tokensUsed: (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0),
        inputTokens: usage?.promptTokens ?? 0,
        outputTokens: usage?.completionTokens ?? 0,
      };
    } catch (error) {
      console.error('API Chat error:', error);
      return {
        error: 'Failed to generate response. Please try again.',
        threadId: args.threadId,
      };
    }
  },
});
