#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { MultiProjectChromeFeedbackManager } from './multi-project-chrome-feedback-manager.js';

/**
 * MCP Chrome Feedback Tool - Multi-Project Version
 * 
 * 提供与Chrome扩展交互的多项目反馈收集功能
 */

const server = new Server(
  {
    name: 'mcp-chrome-feedback',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 创建多项目Chrome反馈管理器
const feedbackManager = new MultiProjectChromeFeedbackManager();

// 挂载到 global，供 router 调用
(global as any).feedbackManagerOnConnectionChange = feedbackManager.onConnectionChange.bind(feedbackManager);

// 定义可用工具
const tools: Tool[] = [
  {
    name: 'chrome_interactive_feedback',
    description: 'Request interactive feedback from user through Chrome extension interface for specific project',
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
          description: 'Project directory path for project identification',
          default: '.'
        }
      }
    }
  },
  {
    name: 'chrome_get_feedback_history',
    description: 'Get history of collected feedback from Chrome extension for specific project',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of records to return',
          default: 10
        },
        project_directory: {
          type: 'string',
          description: 'Project directory path for project identification',
          default: '.'
        }
      }
    }
  },
  {
    name: 'chrome_clear_feedback_history',
    description: 'Clear Chrome extension feedback history for specific project',
    inputSchema: {
      type: 'object',
      properties: {
        project_directory: {
          type: 'string',
          description: 'Project directory path for project identification',
          default: '.'
        }
      }
    }
  },
  {
    name: 'chrome_get_extension_status',
    description: 'Get Chrome extension connection status and multi-project information',
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
        return await feedbackManager.clearFeedbackHistory(args);

      case 'chrome_get_extension_status':
        return await feedbackManager.getExtensionStatus();

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    console.error(`Error executing tool ${name}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString()
    };
  }
});

// 错误处理
server.onerror = (error) => {
  console.error('MCP Chrome Feedback Server Error:', error);
};

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await feedbackManager.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await feedbackManager.cleanup();
  process.exit(0);
});

async function main() {
  try {
    console.error('Starting MCP Chrome Feedback Server (Multi-Project Version)...');
    
    // 初始化反馈管理器
    await feedbackManager.initialize();
    
    // 启动MCP服务器
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error('MCP Chrome Feedback Server is running...');
    console.error('Server supports multi-project feedback collection');
    console.error('Project identification is automatic based on directory structure');
    
  } catch (error) {
    console.error('Failed to start MCP Chrome Feedback Server:', error);
    process.exit(1);
  }
}

// 运行主函数
main().catch((error) => {
  console.error('Unhandled error in main:', error);
  process.exit(1);
}); 