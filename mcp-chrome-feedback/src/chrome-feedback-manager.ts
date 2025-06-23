// 导入必要的Node.js模块
import { createServer, Server as HttpServer } from 'http'; // HTTP服务器
import { WebSocketServer, WebSocket } from 'ws'; // WebSocket服务器和客户端
import { promises as fs } from 'fs'; // 文件系统操作（Promise版本）
import { join } from 'path'; // 路径处理工具

/**
 * 用户反馈数据接口
 * 定义从Chrome扩展接收到的反馈数据结构
 */
export interface FeedbackData {
  id: string; // 反馈唯一标识符
  timestamp: string; // 反馈提交时间戳
  text: string; // 用户输入的文本反馈内容
  images?: Array<{ // 可选的图片附件数组
    id: string; // 图片唯一标识符
    name: string; // 图片文件名
    data: string; // base64格式的图片数据，包含data:image/...前缀
    size?: number; // 图片文件大小（字节）
  }>;
  metadata?: { // 可选的元数据信息
    url?: string; // 用户当前页面URL
    title?: string; // 页面标题
    userAgent?: string; // 用户浏览器信息
  };
  source: 'chrome-extension'; // 反馈来源标识
}

/**
 * 完整对话记录接口
 * 用于保存MCP交互的完整对话历史
 */
export interface ConversationRecord {
  id: string; // 对话记录唯一标识符
  timestamp: string; // 对话时间戳
  request: { // AI发起的请求信息
    summary: string; // 请求摘要（AI工作内容描述）
    timestamp: string; // 请求时间戳
  };
  response: FeedbackData; // 用户的反馈响应
  type: 'mcp-interaction'; // 交互类型标识
}

/**
 * 反馈请求接口
 * 定义向Chrome扩展发送的反馈请求结构
 */
export interface FeedbackRequest {
  id: string; // 请求唯一标识符
  summary: string; // 请求摘要（显示给用户的工作描述）
  timeout: number; // 超时时间（毫秒）
  timestamp: string; // 请求时间戳
}

/**
 * 客户端信息接口
 * 存储连接到服务器的客户端详细信息
 */
export interface ClientInfo {
  ws: WebSocket; // WebSocket连接对象
  type: 'chrome-extension' | 'web-ui' | 'unknown'; // 客户端类型
  id: string; // 客户端唯一标识符
  connectedAt: string; // 连接建立时间
}

/**
 * Chrome反馈管理器主类
 * 负责管理与Chrome扩展的通信、反馈收集和历史记录管理
 */
export class ChromeFeedbackManager {
  // 服务器相关属性
  private httpServer: HttpServer | null = null; // HTTP服务器实例
  private wsServer: WebSocketServer | null = null; // WebSocket服务器实例
  
  // 客户端管理
  private clients: Map<string, ClientInfo> = new Map(); // 存储所有连接的客户端信息
  
  // 数据存储
  private feedbackHistory: FeedbackData[] = []; // 反馈历史记录数组
  private conversationHistory: ConversationRecord[] = []; // 完整对话历史记录
  
  // 请求管理
  private pendingRequests: Map<string, {
    resolve: (value: any) => void; // Promise解决函数
    reject: (error: Error) => void; // Promise拒绝函数
    timeout: NodeJS.Timeout; // 超时定时器
    summary?: string; // 请求摘要（用于保存对话记录）
  }> = new Map();
  
  // 端口配置
  private readonly port = process.env.MCP_CHROME_PORT ? parseInt(process.env.MCP_CHROME_PORT) : 8797; // 默认端口
  private actualPort: number = 8797; // 实际使用的端口（可能因端口占用而变化）
  
  // 项目目录管理
  private projectDirectory: string = process.cwd(); // 当前工作目录
  private actualProjectDirectory: string = process.cwd(); // 实际项目目录（通过MCP调用传入）
  
  /**
   * 根据项目目录生成历史记录文件路径
   * 每个项目都有独立的历史记录文件，避免不同项目间的数据混淆
   */
  private get historyFile(): string {
    // 从完整路径中提取项目目录名称作为文件标识符
    const projectName = this.actualProjectDirectory.split(/[/\\]/).pop() || 'default';
    // 在项目根目录下创建以项目名命名的历史记录文件
    return join(this.actualProjectDirectory, `feedback-history-${projectName}.json`);
  }

  /**
   * 设置实际项目目录
   * 当MCP调用传入新的项目路径时，更新内部项目目录设置
   * @param projectPath 新的项目目录路径
   */
  setActualProjectDirectory(projectPath: string): void {
    this.actualProjectDirectory = projectPath;
    console.error(`设置项目目录为: ${this.actualProjectDirectory}`);
    console.error(`历史记录文件: ${this.historyFile}`);
  }

  /**
   * 初始化反馈管理器
   * 加载历史记录并启动HTTP和WebSocket服务器
   */
  async initialize(): Promise<void> {
    await this.loadHistory(); // 从文件加载历史记录
    await this.startServer(); // 启动服务器
    console.error(`Chrome Feedback Manager initialized on port ${this.actualPort}`);
  }

  /**
   * 清理资源并关闭服务器
   * 在程序退出时调用，确保数据保存和连接正确关闭
   */
  async cleanup(): Promise<void> {
    await this.saveHistory(); // 保存历史记录到文件
    
    // 关闭WebSocket服务器
    if (this.wsServer) {
      this.wsServer.close();
    }
    
    // 关闭HTTP服务器
    if (this.httpServer) {
      this.httpServer.close();
    }
    
    // 清理所有待处理的请求，避免内存泄漏
    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timeout); // 清除超时定时器
      request.reject(new Error('Server shutting down')); // 拒绝未完成的Promise
    }
    this.pendingRequests.clear();
  }

  /**
   * 启动HTTP和WebSocket服务器
   * 创建服务器实例并配置相关参数
   */
  private async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 创建HTTP服务器，处理REST API请求
      this.httpServer = createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      // 配置HTTP服务器超时设置以支持长连接
      this.httpServer.timeout = 0; // 禁用HTTP服务器的默认超时
      this.httpServer.headersTimeout = 0; // 禁用headers超时
      this.httpServer.requestTimeout = 0; // 禁用请求超时

      // 创建WebSocket服务器，基于HTTP服务器
      this.wsServer = new WebSocketServer({ 
        server: this.httpServer, // 复用HTTP服务器
        maxPayload: 100 * 1024 * 1024, // 设置100MB最大payload用于图片传输
        perMessageDeflate: false // 关闭压缩以提高性能
      });
      
      // 监听WebSocket连接事件
      this.wsServer.on('connection', (ws) => {
        this.handleWebSocketConnection(ws);
      });

      // 尝试启动服务器，如果端口被占用则自动选择下一个可用端口
      this.tryListen(this.port, resolve, reject);
    });
  }

  /**
   * 尝试在指定端口启动服务器
   * 如果端口被占用，自动尝试下一个端口
   * @param port 尝试的端口号
   * @param resolve Promise解决函数
   * @param reject Promise拒绝函数
   * @param maxAttempts 最大尝试次数
   */
  private tryListen(port: number, resolve: Function, reject: Function, maxAttempts: number = 10): void {
    // 检查是否已达到最大尝试次数
    if (maxAttempts <= 0) {
      reject(new Error('No available ports found'));
      return;
    }

    // 清理之前的事件监听器，避免重复绑定
    this.httpServer!.removeAllListeners('error');
    this.httpServer!.removeAllListeners('listening');

    // 设置错误处理器
    const errorHandler = (error: any) => {
      if (error.code === 'EADDRINUSE') {
        // 端口被占用，尝试下一个端口
        console.error(`Port ${port} is in use, trying port ${port + 1}`);
        this.tryListen(port + 1, resolve, reject, maxAttempts - 1);
      } else {
        // 其他错误，直接拒绝
        reject(error);
      }
    };

    // 设置成功监听处理器
    const listeningHandler = () => {
      this.actualPort = port; // 记录实际使用的端口
      console.error(`Server successfully started on port ${this.actualPort}`);
      resolve(); // 解决Promise
    };

    // 绑定事件监听器（只触发一次）
    this.httpServer!.once('error', errorHandler);
    this.httpServer!.once('listening', listeningHandler);
    
    // 开始监听指定端口（仅本地访问）
    this.httpServer!.listen(port, '127.0.0.1');
  }

  /**
   * 处理HTTP请求
   * 支持CORS跨域请求和基本的REST API端点
   * @param req HTTP请求对象
   * @param res HTTP响应对象
   */
  private handleHttpRequest(req: any, res: any): void {
    // 设置CORS头，允许跨域访问
    res.setHeader('Access-Control-Allow-Origin', '*'); // 允许所有域名访问
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); // 允许的HTTP方法
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); // 允许的请求头

    // 处理预检请求（OPTIONS）
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // 处理反馈提交请求
    if (req.method === 'POST' && req.url === '/feedback') {
      let body = '';
      
      // 接收请求体数据
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });

      // 请求体接收完成后处理
      req.on('end', async () => {
        try {
          const feedbackData = JSON.parse(body); // 解析JSON数据
          await this.handleFeedbackSubmission(feedbackData); // 处理反馈提交
          
          // 返回成功响应
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          // 处理错误情况
          console.error('Error processing feedback:', error);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
    } else if (req.method === 'GET' && req.url === '/status') {
      // 处理状态查询请求
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