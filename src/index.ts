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
  },
  // 新增：浏览器自动化控制工具
  {
    name: 'chrome_navigate_to_url',
    description: 'Navigate the current browser tab to a specific URL',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to'
        },
        waitForLoad: {
          type: 'boolean',
          description: 'Whether to wait for page load completion',
          default: true
        }
      },
      required: ['url']
    }
  },
  {
    name: 'chrome_click_element',
    description: 'Click on a DOM element using CSS selector',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector of the element to click'
        },
        waitTime: {
          type: 'number',
          description: 'Time to wait after click (ms)',
          default: 1000
        }
      },
      required: ['selector']
    }
  },
  {
    name: 'chrome_fill_input',
    description: 'Fill text into an input field',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector of the input element'
        },
        text: {
          type: 'string',
          description: 'Text to input'
        },
        clearFirst: {
          type: 'boolean',
          description: 'Whether to clear the input first',
          default: true
        }
      },
      required: ['selector', 'text']
    }
  },
  {
    name: 'chrome_execute_script',
    description: 'Execute JavaScript code in the current page',
    inputSchema: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'JavaScript code to execute'
        },
        returnResult: {
          type: 'boolean',
          description: 'Whether to return the script result',
          default: true
        }
      },
      required: ['script']
    }
  },
  {
    name: 'chrome_get_page_info',
    description: 'Get current page information (title, URL, DOM elements)',
    inputSchema: {
      type: 'object',
      properties: {
        includeElements: {
          type: 'boolean',
          description: 'Whether to include interactive elements info',
          default: false
        },
        elementSelector: {
          type: 'string',
          description: 'CSS selector to filter elements (optional)'
        }
      }
    }
  },
  {
    name: 'chrome_take_screenshot',
    description: 'Take a screenshot of the current page',
    inputSchema: {
      type: 'object',
      properties: {
        fullPage: {
          type: 'boolean',
          description: 'Whether to capture the full page',
          default: false
        },
        quality: {
          type: 'number',
          description: 'Image quality (1-100)',
          default: 80
        }
      }
    }
  },
  {
    name: 'chrome_wait_for_element',
    description: 'Wait for an element to appear on the page',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector of the element to wait for'
        },
        timeout: {
          type: 'number',
          description: 'Maximum wait time in milliseconds',
          default: 10000
        }
      },
      required: ['selector']
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

      // 新增：浏览器自动化控制工具处理
      case 'chrome_navigate_to_url':
        return await feedbackManager.navigateToUrl(args);

      case 'chrome_click_element':
        return await feedbackManager.clickElement(args);

      case 'chrome_fill_input':
        return await feedbackManager.fillInput(args);

      case 'chrome_execute_script':
        return await feedbackManager.executeScript(args);

      case 'chrome_get_page_info':
        return await feedbackManager.getPageInfo(args);

      case 'chrome_take_screenshot':
        return await feedbackManager.takeScreenshot(args);

      case 'chrome_wait_for_element':
        return await feedbackManager.waitForElement(args);

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