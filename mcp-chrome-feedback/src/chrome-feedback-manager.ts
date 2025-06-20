import { createServer, Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { promises as fs } from 'fs';
import { join } from 'path';

export interface FeedbackData {
  id: string;
  timestamp: string;
  text: string;
  images?: Array<{
    id: string;
    name: string;
    data: string; // base64格式的图片数据，包含data:image/...前缀
    size?: number;
  }>;
  metadata?: {
    url?: string;
    title?: string;
    userAgent?: string;
  };
  source: 'chrome-extension';
}

// 新增：完整对话记录接口
export interface ConversationRecord {
  id: string;
  timestamp: string;
  request: {
    summary: string;
    timestamp: string;
  };
  response: FeedbackData;
  type: 'mcp-interaction';
}

export interface FeedbackRequest {
  id: string;
  summary: string;
  timeout: number;
  timestamp: string;
}

// 新增客户端类型接口
export interface ClientInfo {
  ws: WebSocket;
  type: 'chrome-extension' | 'web-ui' | 'unknown';
  id: string;
  connectedAt: string;
}

export class ChromeFeedbackManager {
  private httpServer: HttpServer | null = null;
  private wsServer: WebSocketServer | null = null;
  private clients: Map<string, ClientInfo> = new Map(); // 改用 Map 存储客户端信息
  private feedbackHistory: FeedbackData[] = [];
  private conversationHistory: ConversationRecord[] = []; // 新增：对话历史记录
  private pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    summary?: string; // 新增：保存请求摘要
  }> = new Map();
  
  private readonly port = process.env.MCP_CHROME_PORT ? parseInt(process.env.MCP_CHROME_PORT) : 8797;
  private actualPort: number = 8797; // 实际使用的端口
  private projectDirectory: string = process.cwd(); // 当前项目目录
  private actualProjectDirectory: string = process.cwd(); // 实际项目目录（通过MCP调用传入）
  
  // 根据项目目录生成历史记录文件路径
  private get historyFile(): string {
    // 获取项目目录名称作为标识符
    const projectName = this.actualProjectDirectory.split(/[/\\]/).pop() || 'default';
    // 使用实际项目目录
    return join(this.actualProjectDirectory, `feedback-history-${projectName}.json`);
  }

  // 设置实际项目目录
  setActualProjectDirectory(projectPath: string): void {
    this.actualProjectDirectory = projectPath;
    console.error(`设置项目目录为: ${this.actualProjectDirectory}`);
    console.error(`历史记录文件: ${this.historyFile}`);
  }

  async initialize(): Promise<void> {
    await this.loadHistory();
    await this.startServer();
    console.error(`Chrome Feedback Manager initialized on port ${this.actualPort}`);
  }

  async cleanup(): Promise<void> {
    await this.saveHistory();
    
    if (this.wsServer) {
      this.wsServer.close();
    }
    
    if (this.httpServer) {
      this.httpServer.close();
    }
    
    // 清理所有待处理的请求
    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new Error('Server shutting down'));
    }
    this.pendingRequests.clear();
  }

  private async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      // 设置HTTP服务器超时以支持长连接
      this.httpServer.timeout = 0; // 禁用HTTP服务器的默认超时
      this.httpServer.headersTimeout = 0; // 禁用headers超时
      this.httpServer.requestTimeout = 0; // 禁用请求超时

      this.wsServer = new WebSocketServer({ 
        server: this.httpServer,
        maxPayload: 100 * 1024 * 1024, // 100MB最大payload用于图片传输
        perMessageDeflate: false // 关闭压缩以提高性能
      });
      
      this.wsServer.on('connection', (ws) => {
        this.handleWebSocketConnection(ws);
      });

      // 尝试启动服务器，如果端口被占用则自动选择下一个可用端口
      this.tryListen(this.port, resolve, reject);
    });
  }

  private tryListen(port: number, resolve: Function, reject: Function, maxAttempts: number = 10): void {
    if (maxAttempts <= 0) {
      reject(new Error('No available ports found'));
      return;
    }

    // 清理之前的监听器
    this.httpServer!.removeAllListeners('error');
    this.httpServer!.removeAllListeners('listening');

    // 设置新的错误处理器
    const errorHandler = (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is in use, trying port ${port + 1}`);
        this.tryListen(port + 1, resolve, reject, maxAttempts - 1);
      } else {
        reject(error);
      }
    };

    // 设置成功监听处理器
    const listeningHandler = () => {
      this.actualPort = port;
      console.error(`Server successfully started on port ${this.actualPort}`);
      resolve();
    };

    this.httpServer!.once('error', errorHandler);
    this.httpServer!.once('listening', listeningHandler);
    
    this.httpServer!.listen(port, '127.0.0.1');
  }

  private handleHttpRequest(req: any, res: any): void {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/feedback') {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const feedbackData = JSON.parse(body);
          await this.handleFeedbackSubmission(feedbackData);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          console.error('Error processing feedback:', error);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
    } else if (req.method === 'GET' && req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'running',
        clients: this.clients.size,
        feedbackCount: this.feedbackHistory.length
      }));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  }

  private handleWebSocketConnection(ws: WebSocket): void {
    const clientId = Date.now().toString();
    const clientInfo: ClientInfo = {
      ws,
      type: 'unknown', // 初始状态，等待客户端标识
      id: clientId,
      connectedAt: new Date().toISOString()
    };

    this.clients.set(clientId, clientInfo);
    console.error(`Chrome extension connected. Total clients: ${this.clients.size}`);

    // 设置心跳机制以保持长连接
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(heartbeat);
      }
    }, 30000); // 每30秒发送一次心跳

    // 处理心跳响应
    ws.on('pong', () => {
      console.error(`Heartbeat received from client ${clientId}`);
    });

    // 发送连接确认
    ws.send(JSON.stringify({
      type: 'connectionEstablished',
      message: 'Connected to MCP Chrome Feedback server',
      timestamp: new Date().toISOString(),
      clientId: clientId
    }));

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleWebSocketMessage(clientId, message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      this.clients.delete(clientId);
      console.error(`Chrome extension disconnected. Remaining clients: ${this.clients.size}`);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clearInterval(heartbeat);
      this.clients.delete(clientId);
    });
  }

  private async handleWebSocketMessage(clientId: string, message: any): Promise<void> {
    const clientInfo = this.clients.get(clientId);
    if (!clientInfo) {
      console.error('Unknown WebSocket client:', clientId);
      return;
    }

    try {
      // 验证消息格式
      if (!message || typeof message !== 'object') {
        console.error('Invalid message format from client:', clientId);
      return;
      }

    // 根据消息类型识别客户端类型
    if (message.action === 'init' && message.clientType) {
      clientInfo.type = message.clientType === 'chrome-extension' ? 'chrome-extension' : 'web-ui';
      console.error(`Client ${clientId} identified as: ${clientInfo.type}`);
    }

    switch (message.action) {
      case 'init':
        clientInfo.ws.send(JSON.stringify({
          type: 'initConfirmed',
          message: 'Initialization confirmed',
          timestamp: new Date().toISOString()
        }));
        break;

      case 'submitFeedback':
          if (message.data) {
            await this.handleFeedbackSubmission(message.data);
          } else {
            console.error('Missing data in submitFeedback message from client:', clientId);
          }
          break;

        case 'getHistory':
          try {
            // 获取对话历史记录
            const recentConversations = this.conversationHistory.slice(-10).reverse();
            
            // 发送响应
            clientInfo.ws.send(JSON.stringify({
              type: 'historyResponse',
              requestId: message.requestId,
              success: true,
              data: recentConversations,
              timestamp: new Date().toISOString()
            }));
            
            console.error(`Sent ${recentConversations.length} conversation records to client ${clientId}`);
          } catch (error) {
            console.error('Error getting history for client:', clientId, error);
            clientInfo.ws.send(JSON.stringify({
              type: 'historyResponse',
              requestId: message.requestId,
              success: false,
              error: (error as Error).message,
              timestamp: new Date().toISOString()
            }));
          }
          break;

        case 'automationResponse':
          // 处理自动化命令的响应
          if (message.requestId && this.pendingRequests.has(message.requestId)) {
            const request = this.pendingRequests.get(message.requestId)!;
            this.pendingRequests.delete(message.requestId);
            
            if (message.success) {
              request.resolve(message.data || 'Command executed successfully');
            } else {
              request.reject(new Error(message.error || 'Automation command failed'));
            }
          } else {
            console.error('Received automation response for unknown request:', message.requestId);
          }
        break;

      default:
          console.error('Unknown WebSocket message action:', message.action, 'from client:', clientId);
      }
    } catch (error) {
      console.error('Error handling WebSocket message from client:', clientId, error);
    }
  }

  private async handleFeedbackSubmission(data: any): Promise<void> {
    try {
      // 验证基本数据
      if (!data || typeof data !== 'object') {
        console.error('Invalid feedback data format');
        return;
      }

    const feedbackData: FeedbackData = {
      id: data.feedbackId || Date.now().toString(),
      timestamp: data.timestamp || new Date().toISOString(),
      text: data.text || '',
        images: Array.isArray(data.images) ? data.images : [],
      metadata: data.metadata || {},
      source: 'chrome-extension'
    };

      // 验证图片数据
      if (feedbackData.images && feedbackData.images.length > 0) {
        feedbackData.images = feedbackData.images.filter((image, index) => {
          if (!image || typeof image !== 'object') {
            console.error(`Invalid image object at index ${index}`);
            return false;
          }
          
          if (!image.data || typeof image.data !== 'string') {
            console.error(`Invalid image data at index ${index}: missing or non-string data`);
            return false;
          }
          
          if (!image.data.startsWith('data:image/')) {
            console.error(`Invalid image data format at index ${index}: not a data URL`);
            return false;
          }
          
          return true;
        });
        
        console.error(`Processed ${feedbackData.images.length} valid images out of ${data.images?.length || 0} submitted`);
      }

      // 检查是否为普通反馈（不保存到历史记录）
      const isDirectFeedback = data.isDirectFeedback === true;
      
      if (!isDirectFeedback) {
        // 只有MCP交互反馈才保存到历史记录
    this.feedbackHistory.push(feedbackData);
        await this.saveHistory();
        console.error('MCP交互反馈已保存到历史记录:', feedbackData.id);
      } else {
        console.error('普通反馈已处理，未保存到历史记录:', feedbackData.id);
      }

      // 如果有待处理的请求，解决它（这通常是MCP交互）
    if (data.feedbackId && this.pendingRequests.has(data.feedbackId)) {
      const request = this.pendingRequests.get(data.feedbackId)!;
      clearTimeout(request.timeout);
      this.pendingRequests.delete(data.feedbackId);

        // 如果这是MCP交互，保存完整对话记录
        if (!isDirectFeedback && request.summary) {
          const conversationRecord: ConversationRecord = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            request: {
              summary: request.summary,
              timestamp: new Date().toISOString()
            },
            response: feedbackData,
            type: 'mcp-interaction'
          };

          this.conversationHistory.push(conversationRecord);
          await this.saveConversationHistory();
          console.error('完整对话记录已保存:', conversationRecord.id);
        }

        try {
          const content = this.formatFeedbackResult(feedbackData);
      request.resolve({
            content: content
          });
        } catch (formatError) {
          console.error('Error formatting feedback result:', formatError);
          request.reject(new Error('Failed to format feedback result'));
        }
    }

      console.error('Feedback received and processed:', feedbackData.id);
    } catch (error) {
      console.error('Error processing feedback submission:', error);
    }
  }

  async requestInteractiveFeedback(args: any): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const { summary = '請提供您的反饋', timeout = 600000, project_directory = '.' } = args;
    const feedbackId = Date.now().toString();
    
      // 设置实际项目目录
      if (project_directory !== '.') {
        // 如果传入的是绝对路径，直接使用；否则相对于当前目录
        const projectPath = project_directory.includes(':') ? project_directory : join(process.cwd(), project_directory);
        this.setActualProjectDirectory(projectPath);
      } else {
        this.setActualProjectDirectory(process.cwd());
      }

      // 重新加载该项目的历史记录
      await this.loadConversationHistory();

      console.error(`Requesting feedback for project: ${this.actualProjectDirectory}`);
      console.error(`History file: ${this.historyFile}`);

      // 查找 Chrome 扩展客户端
    const chromeExtensionClients = Array.from(this.clients.values()).filter(
      client => client.type === 'chrome-extension'
    );

    if (chromeExtensionClients.length === 0) {
      throw new Error('No Chrome extension clients connected. Please ensure the Chrome extension is installed and connected.');
    }

      // 设置超时
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(feedbackId);
        reject(new Error('Feedback request timed out'));
      }, timeout * 1000);

      // 存储请求
      this.pendingRequests.set(feedbackId, {
        resolve,
        reject,
        timeout: timeoutHandle,
        summary
      });

      // 向 Chrome 扩展客户端发送反馈请求
      const requestMessage = {
        type: 'requestFeedback',
        data: {
          feedbackId,
          summary,
          timeout,
          timestamp: new Date().toISOString()
        }
      };

      chromeExtensionClients.forEach(clientInfo => {
        if (clientInfo.ws.readyState === WebSocket.OPEN) {
          clientInfo.ws.send(JSON.stringify(requestMessage));
        }
      });

      console.error(`Feedback request sent to ${chromeExtensionClients.length} Chrome extension clients`);
    });
  }

  async getFeedbackHistory(args: any): Promise<any> {
    const { limit = 10, project_directory = '.' } = args;
    
    // 更新项目目录
    if (project_directory !== '.') {
      // 如果传入的是绝对路径，直接使用；否则相对于当前目录
      const projectPath = project_directory.includes(':') ? project_directory : join(process.cwd(), project_directory);
      this.setActualProjectDirectory(projectPath);
    } else {
      this.setActualProjectDirectory(process.cwd());
    }

    // 重新加载该项目的历史记录
    await this.loadHistory();
    
    const recentFeedback = this.feedbackHistory
      .slice(-limit)
      .reverse();

    const content: any[] = [{
      type: 'text',
      text: `项目反馈历史记录 (${recentFeedback.length} 条记录):\n项目路径: ${this.actualProjectDirectory}\n历史文件: ${this.historyFile}\n\n`
    }];

    recentFeedback.forEach(feedback => {
      const feedbackContent = this.formatFeedbackResult(feedback);
      content.push(...feedbackContent);
    });

    return { content };
  }

  async clearFeedbackHistory(args: any = {}): Promise<any> {
    const { project_directory = '.' } = args;
    
    // 更新项目目录
    if (project_directory !== '.') {
      // 如果传入的是绝对路径，直接使用；否则相对于当前目录
      const projectPath = project_directory.includes(':') ? project_directory : join(process.cwd(), project_directory);
      this.setActualProjectDirectory(projectPath);
    } else {
      this.setActualProjectDirectory(process.cwd());
    }

    // 重新加载该项目的历史记录
    await this.loadHistory();
    
    const count = this.feedbackHistory.length;
    this.feedbackHistory = [];
    await this.saveHistory();

    return {
      content: [
        {
          type: 'text',
          text: `已清除项目 "${this.actualProjectDirectory}" 的 ${count} 条反馈记录。`
        }
      ]
    };
  }

  async getExtensionStatus(): Promise<any> {
    const chromeExtensionClients = Array.from(this.clients.values()).filter(
      client => client.type === 'chrome-extension'
    );
    const webUIClients = Array.from(this.clients.values()).filter(
      client => client.type === 'web-ui'
    );
    const unknownClients = Array.from(this.clients.values()).filter(
      client => client.type === 'unknown'
    );

    return {
      content: [
        {
          type: 'text',
          text: `Chrome Extension Status:
- Connected clients: ${this.clients.size} (Chrome Extension: ${chromeExtensionClients.length}, Web UI: ${webUIClients.length}, Unknown: ${unknownClients.length})
- Server port: ${this.port}
- Total feedback collected: ${this.feedbackHistory.length}
- Pending requests: ${this.pendingRequests.size}
- Server status: ${this.httpServer ? 'Running' : 'Stopped'}`
        }
      ]
    };
  }

  private formatFeedbackResult(feedback: FeedbackData): any {
    const content: any[] = [];
    
    // 构建文本内容
    let textContent = `=== 用戶回饋 ===\n`;
    textContent += `時間: ${feedback.timestamp}\n`;
    if (feedback.text) {
      textContent += `文字內容: ${feedback.text}\n`;
    }
    
    if (feedback.metadata?.url) {
      textContent += `頁面URL: ${feedback.metadata.url}\n`;
    }
    
    if (feedback.metadata?.title) {
      textContent += `頁面標題: ${feedback.metadata.title}\n`;
    }
    
    // 如果有图片，添加图片概要信息
    if (feedback.images && feedback.images.length > 0) {
      textContent += `\n=== 圖片附件概要 ===\n`;
      textContent += `用戶提供了 ${feedback.images.length} 張圖片：\n\n`;
      
      feedback.images.forEach((image, index) => {
        const fileName = image.name || `image-${index + 1}.png`;
        let fileSize = 0;
        let hasValidData = false;
        
        try {
          if (image.data && typeof image.data === 'string') {
            fileSize = Math.round(image.data.length / 1024);
            hasValidData = image.data.startsWith('data:image/');
          }
        } catch (error) {
          console.error(`Error processing image ${index}:`, error);
        }
        
        textContent += `  ${index + 1}. ${fileName} (${fileSize} KB)\n`;
        
        if (hasValidData) {
          textContent += `     ✅ 圖片數據完整\n`;
        } else {
          textContent += `     ❌ 圖片數據格式錯誤或缺失\n`;
        }
      });
    }
    
    // 添加文本内容到结果
    content.push({
      type: 'text',
      text: textContent
    });
    
    // 处理图片内容 - 使用正确的MCP格式
    if (feedback.images && feedback.images.length > 0) {
      feedback.images.forEach((image, index) => {
        try {
          if (image.data && typeof image.data === 'string' && image.data.startsWith('data:image/')) {
            // 解析图片数据
            const dataParts = image.data.split(',');
            if (dataParts.length === 2) {
              const mimeTypePart = image.data.split(';')[0];
              const mediaType = mimeTypePart.split(':')[1];
              const base64Data = dataParts[1];
              
              if (mediaType && base64Data) {
                // 使用MCP协议标准的图片格式
          content.push({
            type: 'image',
                  data: base64Data,
                  mimeType: mediaType
                });
              } else {
                console.error(`Invalid image format for image ${index}: missing media type or data`);
            }
            } else {
              console.error(`Invalid image format for image ${index}: malformed data URL`);
            }
        } else {
            console.error(`Invalid image data for image ${index}: not a valid data URL`);
          }
        } catch (error) {
          console.error(`Error processing image ${index}:`, error);
        }
      });
    }
    
    return content;
  }

  private async loadHistory(): Promise<void> {
    try {
      const data = await fs.readFile(this.historyFile, 'utf-8');
      this.feedbackHistory = JSON.parse(data);
      console.error(`Loaded ${this.feedbackHistory.length} feedback records from history`);
    } catch (error) {
      // 文件不存在或无法读取，使用空历史
      this.feedbackHistory = [];
      console.error('No existing feedback history found, starting fresh');
    }
  }

  private async saveHistory(): Promise<void> {
    try {
      await fs.writeFile(this.historyFile, JSON.stringify(this.feedbackHistory, null, 2));
      console.error(`Saved ${this.feedbackHistory.length} feedback records to history`);
    } catch (error) {
      console.error('Error saving feedback history:', error);
    }
  }

  private async saveConversationHistory(): Promise<void> {
    try {
      await fs.writeFile(this.historyFile, JSON.stringify(this.conversationHistory, null, 2));
      console.error(`Saved ${this.conversationHistory.length} conversation records to history`);
    } catch (error) {
      console.error('Error saving conversation history:', error);
    }
  }

  private async loadConversationHistory(): Promise<void> {
    try {
      const data = await fs.readFile(this.historyFile, 'utf-8');
      this.conversationHistory = JSON.parse(data);
      console.error(`Loaded ${this.conversationHistory.length} conversation records from history`);
    } catch (error) {
      // 文件不存在或无法读取，使用空历史
      this.conversationHistory = [];
      console.error('No existing conversation history found, starting fresh');
    }
  }

  // 新增：浏览器自动化控制方法

  /**
   * 导航到指定URL
   */
  async navigateToUrl(args: any): Promise<any> {
    const { url, waitForLoad = true, timeout = 30000 } = args;
    
    return new Promise((resolve, reject) => {
      const requestId = Date.now().toString();
      const command = {
        action: 'automation',
        type: 'navigate',
        requestId,
        data: { url, waitForLoad },
        timestamp: new Date().toISOString()
      };

      // 给页面加载留出额外缓冲时间  +2 秒
      this.sendCommandToExtensions(command, requestId, resolve, reject, timeout + 2000);
    });
  }

  /**
   * 点击页面元素
   */
  async clickElement(args: any): Promise<any> {
    const { selector, waitTime = 1000 } = args;
    
    return new Promise((resolve, reject) => {
      const requestId = Date.now().toString();
      const command = {
        action: 'automation',
        type: 'click',
        requestId,
        data: { selector, waitTime },
        timestamp: new Date().toISOString()
      };

      this.sendCommandToExtensions(command, requestId, resolve, reject, 10000);
    });
  }

  /**
   * 填写输入框
   */
  async fillInput(args: any): Promise<any> {
    const { selector, text, clearFirst = true } = args;
    
    return new Promise((resolve, reject) => {
      const requestId = Date.now().toString();
      const command = {
        action: 'automation',
        type: 'fillInput',
        requestId,
        data: { selector, text, clearFirst },
        timestamp: new Date().toISOString()
      };

      this.sendCommandToExtensions(command, requestId, resolve, reject, 10000);
    });
  }

  /**
   * 执行JavaScript代码
   */
  async executeScript(args: any): Promise<any> {
    const { script, returnResult = true } = args;
    
    return new Promise((resolve, reject) => {
      const requestId = Date.now().toString();
      const command = {
        action: 'automation',
        type: 'executeScript',
        requestId,
        data: { script, returnResult },
        timestamp: new Date().toISOString()
      };

      this.sendCommandToExtensions(command, requestId, resolve, reject, 15000);
    });
  }

  /**
   * 获取页面信息
   */
  async getPageInfo(args: any): Promise<any> {
    const { includeElements = false, elementSelector } = args;
    
    return new Promise((resolve, reject) => {
      const requestId = Date.now().toString();
      const command = {
        action: 'automation',
        type: 'getPageInfo',
        requestId,
        data: { includeElements, elementSelector },
        timestamp: new Date().toISOString()
      };

      this.sendCommandToExtensions(command, requestId, resolve, reject, 10000);
    });
  }

  /**
   * 截取页面截图
   */
  async takeScreenshot(args: any): Promise<any> {
    const { fullPage = false, quality = 80, format = 'png' } = args;
    
    return new Promise((resolve, reject) => {
      const requestId = Date.now().toString();
      const command = {
        action: 'automation',
        type: 'takeScreenshot',
        requestId,
        data: { fullPage, quality, format },
        timestamp: new Date().toISOString()
      };

      this.sendCommandToExtensions(command, requestId, resolve, reject, 15000);
    });
  }

  /**
   * 等待元素出现
   */
  async waitForElement(args: any): Promise<any> {
    const { selector, timeout = 10000 } = args;
    
    return new Promise((resolve, reject) => {
      const requestId = Date.now().toString();
      const command = {
        action: 'automation',
        type: 'waitForElement',
        requestId,
        data: { selector, timeout },
        timestamp: new Date().toISOString()
      };

      this.sendCommandToExtensions(command, requestId, resolve, reject, timeout + 2000);
    });
  }

  /**
   * 向所有Chrome扩展发送命令
   */
  private sendCommandToExtensions(command: any, requestId: string, resolve: Function, reject: Function, timeoutMs: number): void {
    const chromeExtensions = Array.from(this.clients.values()).filter(client => 
      client.type === 'chrome-extension' && client.ws.readyState === WebSocket.OPEN
    );

    if (chromeExtensions.length === 0) {
      reject(new Error('No Chrome extension connected'));
      return;
    }

    // 设置超时
    const timeout = setTimeout(() => {
      this.pendingRequests.delete(requestId);
      reject(new Error(`Command timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    // 存储请求信息
    this.pendingRequests.set(requestId, {
      resolve: (result: any) => {
        clearTimeout(timeout);
        resolve({
          content: [{
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          }]
        });
      },
      reject: (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      },
      timeout
    });

    // 发送命令到第一个可用的Chrome扩展
    const targetExtension = chromeExtensions[0];
    try {
      targetExtension.ws.send(JSON.stringify(command));
      console.error(`Sent automation command ${command.type} to extension`);
    } catch (error) {
      this.pendingRequests.delete(requestId);
      clearTimeout(timeout);
      reject(new Error(`Failed to send command: ${error}`));
    }
  }

  /**
   * 智能填表单 - 兼容接口
   */
  async fillForm(args: any): Promise<any> {
    const { formData, submitAfter = false } = args;
    
    return new Promise((resolve, reject) => {
      const requestId = Date.now().toString();
      const command = {
        action: 'automation',
        type: 'fillForm',
        requestId,
        data: { formData, submitAfter },
        timestamp: new Date().toISOString()
      };

      this.sendCommandToExtensions(command, requestId, resolve, reject, 30000);
    });
  }

  /**
   * 智能表单填写 - 增强版
   */
  async smartFillForm(formData: Record<string, string>): Promise<any> {
    try {
      console.log('开始智能表单填写...', formData);
      
      // 显示操作提示
      await this.showAutomationStatus('开始自动化表单填写...', 'info');
      
      const result = await this.executeScript(`
        (async function() {
          // 操作状态显示函数
          function showStatus(message, type = 'info') {
            const statusDiv = document.createElement('div');
            statusDiv.style.cssText = \`
              position: fixed;
              top: 20px;
              right: 20px;
              background: \${type === 'success' ? '#67C23A' : type === 'error' ? '#F56C6C' : '#409EFF'};
              color: white;
              padding: 12px 20px;
              border-radius: 4px;
              z-index: 10000;
              font-size: 14px;
              box-shadow: 0 2px 12px rgba(0,0,0,0.1);
            \`;
            statusDiv.textContent = message;
            document.body.appendChild(statusDiv);
            
            setTimeout(() => {
              if (statusDiv.parentNode) {
                statusDiv.parentNode.removeChild(statusDiv);
              }
            }, 3000);
          }
          
          // 增强的Vue组件交互函数
          function triggerVueEvents(element, value) {
            const events = ['input', 'change', 'blur'];
            events.forEach(eventType => {
              const event = new Event(eventType, { bubbles: true, cancelable: true });
              Object.defineProperty(event, 'target', { value: element });
              element.dispatchEvent(event);
            });
            
            // Vue特定的数据更新
            if (element.__vue__) {
              element.__vue__.$emit('input', value);
              element.__vue__.$emit('change', value);
            }
          }
          
          // 多策略元素定位函数
          function findFieldElement(fieldName, value) {
            const strategies = [
              // 策略1: Vue label识别
              () => {
                const labels = Array.from(document.querySelectorAll('.el-form-item__label'));
                for (const label of labels) {
                  if (label.textContent.includes(fieldName)) {
                    const formItem = label.closest('.el-form-item');
                    if (formItem) {
                      return formItem.querySelector('input, textarea, .el-select .el-input input');
                    }
                  }
                }
                return null;
              },
              
              // 策略2: placeholder匹配
              () => document.querySelector(\`input[placeholder*="\${fieldName}"], textarea[placeholder*="\${fieldName}"]\`),
              
              // 策略3: name属性匹配
              () => document.querySelector(\`input[name*="\${fieldName}"], textarea[name*="\${fieldName}"]\`),
              
              // 策略4: 智能文本匹配
              () => {
                const allInputs = document.querySelectorAll('input, textarea, .el-select');
                for (const input of allInputs) {
                  const container = input.closest('.el-form-item');
                  if (container && container.textContent.includes(fieldName)) {
                    return input.tagName === 'INPUT' || input.tagName === 'TEXTAREA' ? 
                           input : input.querySelector('input');
                  }
                }
                return null;
              }
            ];
            
            for (const strategy of strategies) {
              const element = strategy();
              if (element) {
                showStatus(\`找到字段: \${fieldName}\`, 'info');
                return element;
              }
            }
            
            showStatus(\`未找到字段: \${fieldName}\`, 'error');
            return null;
          }
          
          // 处理不同类型的表单控件
          async function fillField(fieldName, value) {
            const element = findFieldElement(fieldName, value);
            if (!element) return false;
            
            try {
              // 检测控件类型并处理
              if (element.closest('.el-select')) {
                // 下拉选择框
                const selectElement = element.closest('.el-select');
                selectElement.click();
                
                await new Promise(resolve => setTimeout(resolve, 300));
                
                const options = document.querySelectorAll('.el-select-dropdown .el-option');
                for (const option of options) {
                  if (option.textContent.includes(value)) {
                    option.click();
                    showStatus(\`已选择: \${fieldName} = \${value}\`, 'success');
                    return true;
                  }
                }
              } else if (element.closest('.el-date-editor')) {
                // 日期选择器
                element.focus();
                element.value = value;
                triggerVueEvents(element, value);
                showStatus(\`已填写日期: \${fieldName} = \${value}\`, 'success');
                return true;
              } else if (element.closest('.el-time-picker')) {
                // 时间选择器
                element.focus();
                element.value = value;
                triggerVueEvents(element, value);
                showStatus(\`已填写时间: \${fieldName} = \${value}\`, 'success');
                return true;
              } else if (element.type === 'checkbox') {
                // 复选框
                if (element.checked !== (value === 'true' || value === true)) {
                  element.click();
                  showStatus(\`已设置复选框: \${fieldName} = \${value}\`, 'success');
                }
                return true;
              } else if (element.type === 'radio') {
                // 单选框
                const radioGroup = document.querySelectorAll(\`input[name="\${element.name}"]\`);
                for (const radio of radioGroup) {
                  const label = radio.closest('label') || radio.nextElementSibling;
                  if (label && label.textContent.includes(value)) {
                    radio.click();
                    showStatus(\`已选择单选项: \${fieldName} = \${value}\`, 'success');
                    return true;
                  }
                }
              } else {
                // 普通输入框和文本域
                element.focus();
                element.value = value;
                triggerVueEvents(element, value);
                showStatus(\`已填写: \${fieldName} = \${value}\`, 'success');
                return true;
              }
              
              await new Promise(resolve => setTimeout(resolve, 200));
              return true;
              
            } catch (error) {
              showStatus(\`填写失败: \${fieldName} - \${error.message}\`, 'error');
              return false;
            }
          }
          
          // 执行表单填写
          const results = {};
          const formData = ${JSON.stringify(formData)};
          
          showStatus('开始自动填写表单...', 'info');
          
          for (const [fieldName, value] of Object.entries(formData)) {
            const success = await fillField(fieldName, value);
            results[fieldName] = success;
            
            // 添加延迟确保Vue组件状态更新
            await new Promise(resolve => setTimeout(resolve, 300));
          }
          
          // 显示最终结果
          const successCount = Object.values(results).filter(Boolean).length;
          const totalCount = Object.keys(results).length;
          
          showStatus(\`表单填写完成: \${successCount}/\${totalCount} 字段成功\`, 
                    successCount === totalCount ? 'success' : 'error');
          
          return {
            success: successCount === totalCount,
            results: results,
            message: \`填写完成: \${successCount}/\${totalCount} 字段成功\`
          };
        })();
      `);

      return result;
      
    } catch (error) {
      await this.showAutomationStatus(`表单填写失败: ${error instanceof Error ? error.message : String(error)}`, 'error');
      throw error;
    }
  }

  /**
   * 显示自动化操作状态
   */
  private async showAutomationStatus(message: string, type: 'info' | 'success' | 'error' = 'info'): Promise<void> {
    try {
      await this.executeScript(`
        (function() {
          const statusDiv = document.createElement('div');
          statusDiv.style.cssText = \`
            position: fixed;
            top: 20px;
            left: 20px;
            background: \${type === 'success' ? '#67C23A' : type === 'error' ? '#F56C6C' : '#409EFF'};
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            z-index: 10000;
            font-size: 14px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.1);
            max-width: 300px;
          \`;
          statusDiv.textContent = '${message}';
          document.body.appendChild(statusDiv);
          
          setTimeout(() => {
            if (statusDiv.parentNode) {
              statusDiv.parentNode.removeChild(statusDiv);
            }
          }, 3000);
        })();
      `);
    } catch (error: any) {
      console.error('显示状态失败:', error);
    }
  }

  /**
   * 元素交互功能
   */
  async interactElement(args: any): Promise<any> {
    const { selector, action = 'click', value, options = {} } = args;
    
    return new Promise((resolve, reject) => {
      const requestId = Date.now().toString();
      const command = {
        action: 'automation',
        type: 'interactElement',
        requestId,
        data: { selector, action, value, options },
        timestamp: new Date().toISOString()
      };

      this.sendCommandToExtensions(command, requestId, resolve, reject, 15000);
    });
  }

  /**
   * 内容提取功能
   */
  async extractContent(args: any): Promise<any> {
    const { selectors = [], type = 'text', options = {} } = args;
    const requestId = Date.now().toString();

    return new Promise((resolve, reject) => {
      this.sendCommandToExtensions(
        {
          action: 'extractContent',
          data: { selectors, type, options }
        },
        requestId,
        resolve,
        reject,
        30000
      );
    });
  }

  // 新增：智能元素定位系统
  async smartLocateElement(args: any): Promise<any> {
    const { selector, action = 'locate', context = {} } = args;
    const requestId = Date.now().toString();

    return new Promise((resolve, reject) => {
      this.sendCommandToExtensions(
        {
          action: 'smartElementLocator',
          data: { selector, action, context }
        },
        requestId,
        resolve,
        reject,
        30000
      );
    });
  }

  // 新增：智能表单分析
  async analyzeFormStructure(args: any): Promise<any> {
    const { formSelector = 'form', includeHiddenFields = false, framework = 'auto' } = args;
    const requestId = Date.now().toString();

    return new Promise((resolve, reject) => {
      this.sendCommandToExtensions(
        {
          action: 'analyzeFormStructure',
          data: { formSelector, includeHiddenFields, framework }
        },
        requestId,
        resolve,
        reject,
        30000
      );
    });
  }
} 