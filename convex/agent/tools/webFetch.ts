import { createTool } from '@convex-dev/agent';
import { jsonSchema } from 'ai';

/**
 * Web Fetch Tool
 * 
 * Makes HTTP requests to fetch data from web APIs and URLs.
 * Supports GET and POST methods with custom headers and request bodies.
 */

export function createWebFetchTool() {
  return createTool({
    description: `Fetch data from a URL or API endpoint.
Use this when:
- The user asks you to fetch data from a URL
- The user needs to call a REST API
- You need to retrieve data from a web service
- The user says "get data from", "fetch", "call API", or "make request to"

Supports:
- GET and POST methods
- Custom headers (Authorization, Content-Type, etc.)
- Request body for POST requests (JSON, form data, etc.)
- Query parameters

IMPORTANT: 
- Response body is limited to 100KB to prevent memory issues
- URL must be accessible (no redirects allowed for security)
- Only HTTP/HTTPS URLs are supported`,
    args: jsonSchema<{
      url: string;
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
      headers?: Record<string, string>;
      body?: string;
      timeout?: number;
    }>({
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch. Must be a valid HTTP or HTTPS URL.',
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
          description: 'HTTP method. Default is GET.',
        },
        headers: {
          type: 'object',
          description: 'Optional: HTTP headers as key-value pairs. Common headers: Authorization, Content-Type, Accept.',
          additionalProperties: { type: 'string' },
        },
        body: {
          type: 'string',
          description: 'Optional: Request body for POST/PUT/PATCH requests. Can be JSON string or other format.',
        },
        timeout: {
          type: 'number',
          description: 'Optional: Request timeout in milliseconds. Default is 30000 (30 seconds). Max is 60000 (60 seconds).',
        },
      },
      required: ['url'],
    }),
    handler: async (_toolCtx, args: any) => {
      const { 
        url, 
        method = 'GET', 
        headers = {}, 
        body,
        timeout = 30000 
      } = args as { 
        url: string; 
        method?: string; 
        headers?: Record<string, string>; 
        body?: string;
        timeout?: number;
      };

      // Validate URL
      let urlObj: URL;
      try {
        urlObj = new URL(url);
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
          return {
            success: false,
            error: 'Invalid protocol',
            message: 'Only HTTP and HTTPS URLs are supported.',
          };
        }
      } catch (e) {
        return {
          success: false,
          error: 'Invalid URL',
          message: 'Please provide a valid URL.',
        };
      }

      // Enforce timeout limits
      const finalTimeout = Math.min(timeout, 60000);

      try {
        console.log(`[WebFetch] ${method} ${url}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), finalTimeout);

        const response = await fetch(url, {
          method,
          headers: {
            'User-Agent': 'ClawSync-HTTP-Client/1.0',
            ...headers,
          },
          body: body || undefined,
          redirect: 'error', // Prevent SSRF attacks via redirects
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Get response headers
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        // Get content type to determine how to parse response
        const contentType = response.headers.get('content-type') || '';
        
        // Read response text (limit to 100KB)
        const MAX_RESPONSE_SIZE = 100 * 1024;
        const text = await response.text();
        const truncatedText = text.length > MAX_RESPONSE_SIZE 
          ? text.slice(0, MAX_RESPONSE_SIZE) + '\n...[truncated: response exceeds 100KB]'
          : text;

        // Try to parse JSON if content type suggests JSON
        let data: any = null;
        if (contentType.includes('application/json')) {
          try {
            data = JSON.parse(truncatedText);
          } catch {
            // Not valid JSON, keep as string
          }
        }

        const result: any = {
          success: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          url: response.url,
          contentType,
          body: truncatedText,
          size: text.length,
          truncated: text.length > MAX_RESPONSE_SIZE,
        };

        if (data !== null) {
          result.data = data;
        }

        if (!response.ok) {
          result.error = `HTTP ${response.status}: ${response.statusText}`;
          result.message = `Request failed with status ${response.status}.`;
        } else {
          result.message = `Successfully fetched ${url}. Response size: ${text.length} bytes.`;
        }

        return result;

      } catch (error) {
        console.error('[WebFetch] Error:', error);
        
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            return {
              success: false,
              error: 'Request timeout',
              message: `The request timed out after ${finalTimeout}ms.`,
            };
          }
          
          if (error.message.includes('redirect')) {
            return {
              success: false,
              error: 'Redirect blocked',
              message: 'The URL redirects to another location. For security, redirects are not allowed.',
            };
          }
        }

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          message: 'Failed to fetch the URL. Please check the URL is valid and accessible.',
        };
      }
    },
  });
}
