import { createServer, Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { MultiProjectRouter, ClientConnection, RoutedMessage } from './multi-project-router.js';
import { MultiProjectDataManager, ProjectFeedbackData } from './multi-project-data-manager.js';
import { getProjectInfo, ProjectMetadata } from './project-utils.js';

/**
 * 多项目Chrome反馈管理器
 * 支持多项目并发连接和数据隔离
 */
export class MultiProjectChromeFeedbackManager {
  private httpServer: HttpServer | null = null;
  private wsServer: WebSocketServer | null = null;
  private router: MultiProjectRouter;
  private dataManager: MultiProjectDataManager;
  private pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    summary?: string;
    projectId: string;
  }> = new Map();
  private actualPort: number = 8797;
  private listenTimeouts: Set<NodeJS.Timeout> = new Set();
  private configuredPort: number;
  private idleTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.router = new MultiProjectRouter();
    this.dataManager = new MultiProjectDataManager();
    this.registerMessageHandlers();
    // 优先级：环境变量 > 配置文件 > 默认
    this.configuredPort = this.getConfiguredPort();
    
    // 启动时开启空闲计时器
    console.log('MCP Feedback Manager initialized. Starting initial idle timer.');
    this.resetIdleTimer();
  }

  /**
   * 获取端口配置，优先级：环境变量 > 配置文件 > 默认
   */
  private getConfiguredPort(): number {
    if (process.env.MCP_CHROME_PORT) {
      const envPort = parseInt(process.env.MCP_CHROME_PORT, 10);
      if (!isNaN(envPort) && envPort > 0 && envPort < 65536) return envPort;
    }
    // TODO: 可扩展为读取配置文件
    return 8797;
  }

  private registerMessageHandlers(): void {
    this.router.registerMessageHandler('feedback-submission', async (message: RoutedMessage, connection: ClientConnection) => {
      await this.handleFeedbackSubmission(message, connection);
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.dataManager.initialize();
      await this.startServer();
      console.log(`Multi-Project Chrome Feedback Manager initialized on port ${this.actualPort}`);
    } catch (error) {
      console.error('Failed to initialize Multi-Project Chrome Feedback Manager:', error);
      // 确保初始化失败时清理所有资源
      await this.cleanup();
      throw error;
    }
  }

  private async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.httpServer || this.wsServer) {
          console.warn('Previous servers detected, cleaning up...');
          this.forceCloseServers();
        }

        this.httpServer = createServer((req, res) => {
          this.handleHttpRequest(req, res);
        });
        this.httpServer.on('error', (error) => {
          console.error('HTTP Server error:', error);
        });

        this.wsServer = new WebSocketServer({ 
          server: this.httpServer,
          maxPayload: 100 * 1024 * 1024,
          perMessageDeflate: false
        });
        this.wsServer.on('error', (error) => {
          console.error('WebSocket Server error:', error);
        });
        this.wsServer.on('connection', async (ws, request) => {
          try {
            const connection = await this.router.handleConnection(ws, request);
            if (connection) {
              await this.onNewConnection(connection);
            }
          } catch (error) {
            console.error('Error handling new WebSocket connection:', error);
            ws.close(1011, 'Server error');
          }
        });

        // 只监听指定端口，被占用直接报错
        this.httpServer.once('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            reject(new Error(`Port ${this.configuredPort} is already in use. Please configure another port via MCP_CHROME_PORT or config file.`));
          } else {
            reject(error);
          }
        });
        this.httpServer.once('listening', () => {
          this.actualPort = this.configuredPort;
          console.error(`Server successfully started on port ${this.actualPort}`);
          resolve(undefined);
        });
        this.httpServer.listen(this.configuredPort);
      } catch (error) {
        console.error('Failed to create servers:', error);
        this.forceCloseServers();
        reject(error);
      }
    });
  }

  /**
   * 强制关闭服务器，不等待回调
   */
  private forceCloseServers(): void {
    // 清理监听定时器
    for (const timeout of this.listenTimeouts) {
      clearTimeout(timeout);
    }
    this.listenTimeouts.clear();

    if (this.wsServer) {
      try {
        this.wsServer.close();
      } catch (error) {
        console.error('Error force closing WebSocket server:', error);
      }
      this.wsServer = null;
    }

    if (this.httpServer) {
      try {
        this.httpServer.close();
      } catch (error) {
        console.error('Error force closing HTTP server:', error);
      }
      this.httpServer = null;
    }
  }

  private handleHttpRequest(req: any, res: any): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        connections: this.router.getAllConnections().length
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  private resetIdleTimer() {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
    }
    const fiveMinutes = 5 * 60 * 1000;
    this.idleTimeout = setTimeout(async () => {
      console.log(`Shutting down due to inactivity for ${fiveMinutes / 60000} minutes.`);
      await this.cleanup();
      console.log('Cleanup finished, exiting process.');
      process.exit(0);
    }, fiveMinutes);
    console.log(`Idle timer started. Server will exit in ${fiveMinutes / 60000} minutes if it remains idle.`);
  }

  public onConnectionChange() {
    const connectionCount = this.router.getAllConnections().length;
    console.log(`Connection change detected. Current connections: ${connectionCount}`);
    if (connectionCount === 0) {
      console.log('No active connections. Resetting idle timer.');
      this.resetIdleTimer();
    } else if (this.idleTimeout) {
      console.log(`Active connections present (${connectionCount}). Clearing idle timer.`);
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
  }

  private async onNewConnection(connection: ClientConnection): Promise<void> {
    try {
      await this.dataManager.addOrUpdateProject(connection.projectInfo);
      console.log(`Project ${connection.projectId} connected`);
      this.onConnectionChange();
    } catch (error) {
      console.error(`Failed to handle new connection:`, error);
    }
  }

  private async handleFeedbackSubmission(message: RoutedMessage, connection: ClientConnection): Promise<void> {
    try {
      const { data } = message;
      const { requestId, feedback } = data;

      if (!feedback || !feedback.text) {
        return;
      }

      const feedbackRecord: ProjectFeedbackData = {
        id: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        text: feedback.text,
        images: feedback.images || [],
        metadata: {
          url: feedback.metadata?.url,
          title: feedback.metadata?.title,
          userAgent: connection.metadata.userAgent
        },
        source: 'chrome-extension'
      };

      await this.dataManager.addFeedbackToProject(connection.projectId, feedbackRecord);

      const pendingRequest = this.pendingRequests.get(requestId);
      if (pendingRequest) {
        clearTimeout(pendingRequest.timeout);
        pendingRequest.resolve(this.formatFeedbackResult(feedbackRecord));
        this.pendingRequests.delete(requestId);
      }

    } catch (error) {
      console.error('Error handling feedback submission:', error);
    }
  }

  async requestInteractiveFeedback(args: any): Promise<any> {
    const {
      summary = '我已完成了您请求的任务。',
      timeout = 600,
      project_directory = '.'
    } = args;

    try {
      const projectInfo = await getProjectInfo(project_directory);
      const projectId = projectInfo.id;

      await this.dataManager.addOrUpdateProject(projectInfo);

      const projectConnections = this.router.getProjectConnections(projectId);
      if (projectConnections.length === 0) {
        throw new Error(`No active Chrome extension connections found for project: ${projectId}`);
      }

      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const timeoutMs = timeout * 1000;

      const feedbackPromise = new Promise((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Feedback request timeout after ${timeout} seconds`));
        }, timeoutMs);

        this.pendingRequests.set(requestId, {
          resolve,
          reject,
          timeout: timeoutHandle,
          summary,
          projectId
        });
      });

      const request = {
        id: requestId,
        projectId,
        summary,
        timeout: timeoutMs,
        timestamp: new Date().toISOString()
      };

      const sentCount = this.router.broadcastToProject(projectId, {
        type: 'feedback-request',
        projectId,
        data: request
      });

      if (sentCount === 0) {
        this.pendingRequests.delete(requestId);
        throw new Error(`Failed to send feedback request to project: ${projectId}`);
      }

      return await feedbackPromise;

    } catch (error) {
      console.error('Error requesting interactive feedback:', error);
      throw error;
    }
  }

  async getFeedbackHistory(args: any): Promise<any> {
    const { limit = 10, project_directory = '.' } = args;

    try {
      const projectInfo = await getProjectInfo(project_directory);
      const history = this.dataManager.getProjectFeedbackHistory(projectInfo.id, limit);

      return {
        success: true,
        projectId: projectInfo.id,
        data: history.map(item => this.formatFeedbackResult(item)),
        total: history.length
      };

    } catch (error) {
      console.error('Error getting feedback history:', error);
      throw error;
    }
  }

  async clearFeedbackHistory(args: any = {}): Promise<any> {
    const { project_directory = '.' } = args;

    try {
      const projectInfo = await getProjectInfo(project_directory);
      await this.dataManager.clearProjectHistory(projectInfo.id);

      return {
        success: true,
        projectId: projectInfo.id,
        message: 'Feedback history cleared successfully'
      };

    } catch (error) {
      console.error('Error clearing feedback history:', error);
      throw error;
    }
  }

  async getExtensionStatus(): Promise<any> {
    try {
      const allConnections = this.router.getAllConnections();
      const projectConnections: { [projectId: string]: number } = {};

      for (const connection of allConnections) {
        projectConnections[connection.projectId] = (projectConnections[connection.projectId] || 0) + 1;
      }

      return {
        success: true,
        status: allConnections.length > 0 ? 'connected' : 'disconnected',
        totalConnections: allConnections.length,
        activeProjects: Object.keys(projectConnections).length,
        projectConnections,
        serverPort: this.actualPort
      };

    } catch (error) {
      return {
        success: false,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private formatFeedbackResult(feedback: ProjectFeedbackData): any {
    const result: any = {
      type: 'text',
      content: [
        {
          type: 'text',
          text: feedback.text
        }
      ]
    };

    if (feedback.images && feedback.images.length > 0) {
      for (const image of feedback.images) {
        result.content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: this.extractMediaType(image.data),
            data: this.extractBase64Data(image.data)
          }
        });
      }
    }

    return result;
  }

  private extractMediaType(dataUrl: string): string {
    const match = dataUrl.match(/data:([^;]+);/);
    return match ? match[1] : 'image/png';
  }

  private extractBase64Data(dataUrl: string): string {
    const base64Index = dataUrl.indexOf(',');
    return base64Index !== -1 ? dataUrl.substring(base64Index + 1) : dataUrl;
  }

  async cleanup(): Promise<void> {
    console.log('Cleanup: Starting graceful shutdown...');
    
    if (this.idleTimeout) {
      console.log('Cleanup: Clearing idle timeout timer.');
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }

    console.log('Starting cleanup process...');
    
    // 清理待处理的请求
    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new Error('Server shutting down'));
    }
    this.pendingRequests.clear();

    // 清理监听定时器
    for (const timeout of this.listenTimeouts) {
      clearTimeout(timeout);
    }
    this.listenTimeouts.clear();

    // 清理路由器
    this.router.cleanup();
    this.onConnectionChange();

    try {
      await this.dataManager.saveData();
    } catch (error) {
      console.error('Error saving data during cleanup:', error);
    }

    // 使用 Promise 等待服务器完全关闭
    const closePromises: Promise<void>[] = [];

    if (this.wsServer) {
      closePromises.push(new Promise<void>((resolve) => {
        this.wsServer!.close((error) => {
          if (error) {
            console.error('Error closing WebSocket server:', error);
          } else {
            console.log('WebSocket server closed successfully');
          }
          resolve();
        });
      }));
    }

    if (this.httpServer) {
      closePromises.push(new Promise<void>((resolve) => {
        this.httpServer!.close((error) => {
          if (error) {
            console.error('Error closing HTTP server:', error);
          } else {
            console.log('HTTP server closed successfully');
          }
          resolve();
        });
      }));
    }

    // 等待所有服务器关闭
    await Promise.all(closePromises);
    
    // 确保服务器引用被清空
    this.httpServer = null;
    this.wsServer = null;
    
    console.log('Cleanup completed successfully');
  }
}