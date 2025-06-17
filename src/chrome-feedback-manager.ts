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
    data: string;
  }>;
  metadata?: {
    url?: string;
    title?: string;
    userAgent?: string;
  };
  source: 'chrome-extension';
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
  private pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  
  private readonly port = process.env.MCP_CHROME_PORT ? parseInt(process.env.MCP_CHROME_PORT) : 8797;
  private readonly historyFile = join(process.cwd(), 'feedback-history.json');

  async initialize(): Promise<void> {
    await this.loadHistory();
    await this.startServer();
    console.error(`Chrome Feedback Manager initialized on port ${this.port}`);
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

      this.wsServer = new WebSocketServer({ server: this.httpServer });
      
      this.wsServer.on('connection', (ws) => {
        this.handleWebSocketConnection(ws);
      });

      this.httpServer.listen(this.port, '127.0.0.1', () => {
        resolve();
      });

      this.httpServer.on('error', (error) => {
        reject(error);
      });
    });
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

      req.on('end', () => {
        try {
          const feedbackData = JSON.parse(body);
          this.handleFeedbackSubmission(feedbackData);
          
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

    // 发送连接确认
    ws.send(JSON.stringify({
      type: 'connectionEstablished',
      message: 'Connected to MCP Chrome Feedback server',
      timestamp: new Date().toISOString(),
      clientId: clientId
    }));

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleWebSocketMessage(clientId, message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      this.clients.delete(clientId);
      console.error(`Chrome extension disconnected. Remaining clients: ${this.clients.size}`);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.clients.delete(clientId);
    });
  }

  private handleWebSocketMessage(clientId: string, message: any): void {
    const clientInfo = this.clients.get(clientId);
    if (!clientInfo) {
      console.error('Unknown WebSocket client:', clientId);
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
        this.handleFeedbackSubmission(message.data);
        break;

      default:
        console.error('Unknown WebSocket message action:', message.action);
    }
  }

  private handleFeedbackSubmission(data: any): void {
    const feedbackData: FeedbackData = {
      id: data.feedbackId || Date.now().toString(),
      timestamp: data.timestamp || new Date().toISOString(),
      text: data.text || '',
      images: data.images || [],
      metadata: data.metadata || {},
      source: 'chrome-extension'
    };

    this.feedbackHistory.push(feedbackData);

    // 如果有待处理的请求，解决它
    if (data.feedbackId && this.pendingRequests.has(data.feedbackId)) {
      const request = this.pendingRequests.get(data.feedbackId)!;
      clearTimeout(request.timeout);
      this.pendingRequests.delete(data.feedbackId);

      request.resolve({
        content: [
          {
            type: 'text',
            text: this.formatFeedbackResult(feedbackData)
          }
        ]
      });
    }

    console.error('Feedback received:', feedbackData.id);
  }

  async requestInteractiveFeedback(args: any): Promise<any> {
    const {
      summary = '我已完成了您请求的任务。',
      timeout = 600,
      project_directory = '.'
    } = args;

    const feedbackId = Date.now().toString();
    
    console.error('Requesting interactive feedback...');
    console.error('Summary:', summary);
    console.error('Timeout:', timeout, 'seconds');

    // 只计算 Chrome 扩展客户端数量
    const chromeExtensionClients = Array.from(this.clients.values()).filter(
      client => client.type === 'chrome-extension'
    );

    if (chromeExtensionClients.length === 0) {
      throw new Error('No Chrome extension clients connected. Please ensure the Chrome extension is installed and connected.');
    }

    return new Promise((resolve, reject) => {
      // 设置超时
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(feedbackId);
        reject(new Error('Feedback request timed out'));
      }, timeout * 1000);

      // 存储请求
      this.pendingRequests.set(feedbackId, {
        resolve,
        reject,
        timeout: timeoutHandle
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
    const { limit = 10 } = args;
    
    const recentFeedback = this.feedbackHistory
      .slice(-limit)
      .reverse();

    return {
      content: [
        {
          type: 'text',
          text: `Feedback History (${recentFeedback.length} items):\n\n` +
                recentFeedback.map(feedback => this.formatFeedbackResult(feedback)).join('\n\n')
        }
      ]
    };
  }

  async clearFeedbackHistory(): Promise<any> {
    const count = this.feedbackHistory.length;
    this.feedbackHistory = [];
    await this.saveHistory();

    return {
      content: [
        {
          type: 'text',
          text: `Cleared ${count} feedback records from history.`
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

  private formatFeedbackResult(feedback: FeedbackData): string {
    let result = `=== Feedback ${feedback.id} ===\n`;
    result += `Time: ${feedback.timestamp}\n`;
    result += `Text: ${feedback.text || '(No text provided)'}\n`;
    
    if (feedback.images && feedback.images.length > 0) {
      result += `Images: ${feedback.images.length} attached\n`;
    }
    
    if (feedback.metadata?.url) {
      result += `URL: ${feedback.metadata.url}\n`;
    }
    
    if (feedback.metadata?.title) {
      result += `Page Title: ${feedback.metadata.title}\n`;
    }
    
    return result;
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
} 