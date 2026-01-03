#!/usr/bin/env node
/**
 * Experience Layer MCP Server
 * Port 3031 (UDP), 8031 (HTTP), 9031 (WebSocket)
 *
 * The ecosystem's long-term memory - records, recalls, and learns from experiences
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { getDatabase, resetDatabase } from './database/schema.js';
import {
  tools,
  recordExperience,
  recallByType,
  recallByOutcome,
  getLessons,
  applyLesson,
  learnFromPattern
} from './tools/index.js';
import { startHttpServer } from './http/server.js';
import { startWebSocketServer, closeWebSocketServer } from './websocket/server.js';
import { startInterlock, closeInterlock } from './interlock/index.js';

// Initialize database
getDatabase();

// Create MCP server
const server = new Server(
  {
    name: 'experience-layer',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;

    switch (name) {
      case 'record_experience':
        result = recordExperience(args as unknown as Parameters<typeof recordExperience>[0]);
        break;
      case 'recall_by_type':
        result = recallByType(args as unknown as Parameters<typeof recallByType>[0]);
        break;
      case 'recall_by_outcome':
        result = recallByOutcome(args as unknown as Parameters<typeof recallByOutcome>[0]);
        break;
      case 'get_lessons':
        result = getLessons((args ?? {}) as Parameters<typeof getLessons>[0]);
        break;
      case 'apply_lesson':
        result = applyLesson(args as unknown as Parameters<typeof applyLesson>[0]);
        break;
      case 'learn_from_pattern':
        result = learnFromPattern(args as unknown as Parameters<typeof learnFromPattern>[0]);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
      isError: true,
    };
  }
});

// Start all servers
async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const mcpOnly = args.includes('--mcp-only');

  if (!mcpOnly) {
    // Start HTTP server
    try {
      startHttpServer(8031);
    } catch (error) {
      console.error('Failed to start HTTP server:', error);
    }

    // Start WebSocket server
    try {
      startWebSocketServer(9031);
    } catch (error) {
      console.error('Failed to start WebSocket server:', error);
    }

    // Start InterLock mesh
    try {
      startInterlock(3031);
    } catch (error) {
      console.error('Failed to start InterLock:', error);
    }
  }

  // Start MCP server on stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Experience Layer MCP server running on stdio');
}

// Handle shutdown
process.on('SIGINT', () => {
  console.error('Shutting down Experience Layer...');
  closeWebSocketServer();
  closeInterlock();
  resetDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('Shutting down Experience Layer...');
  closeWebSocketServer();
  closeInterlock();
  resetDatabase();
  process.exit(0);
});

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
