#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { ChromeFeedbackManager } from './chrome-feedback-manager.js';

/**
 * MCP Chrome Feedback Tool
 * 
 * 提供与Chrome扩展交互的反馈收集功能，类似mcp-feedback-enhanced
 */

const server = new Server(
  {
    name: 'mcp-chrome-feedback',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 创建Chrome反馈管理器
const feedbackManager = new ChromeFeedbackManager();

// 定义可用工具
const tools: Tool[] = [
  {
    name: 'chrome_interactive_feedback',
    description: 'Request interactive feedback from user through Chrome extension interface',
    inputSchema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Summary of AI work completed',
          default: '我已完成了您请求的任务。'
        },
        timeout: {
          type: 'number', 
          description: 'Timeout for user feedback in seconds',
          default: 600
        },
        project_directory: {
          type: 'string',
          description: 'Project directory path',
          default: '.'
        }
      }
    }
  },
  {
    name: 'chrome_get_feedback_history',
    description: 'Get history of collected feedback from Chrome extension',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of records to return',
          default: 10
        }
      }
    }
  },
  {
    name: 'chrome_clear_feedback_history',
    description: 'Clear all Chrome extension feedback history',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'chrome_get_extension_status',
    description: 'Get Chrome extension connection status',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// 注册工具列表处理器
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// 注册工具调用处理器
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'chrome_interactive_feedback':
        return await feedbackManager.requestInteractiveFeedback(args);

      case 'chrome_get_feedback_history':
        return await feedbackManager.getFeedbackHistory(args);

      case 'chrome_clear_feedback_history':
        return await feedbackManager.clearFeedbackHistory();

      case 'chrome_get_extension_status':
        return await feedbackManager.getExtensionStatus();

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`
        }
      ],
      isError: true
    };
  }
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // 启动Chrome扩展通信服务
  await feedbackManager.initialize();
  
  console.error('MCP Chrome Feedback server running on stdio');
}

// 错误处理
process.on('SIGINT', async () => {
  await feedbackManager.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await feedbackManager.cleanup();
  process.exit(0);
});

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
}); 