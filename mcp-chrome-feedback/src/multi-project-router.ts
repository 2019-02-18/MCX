import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import { getProjectId, getProjectInfo, ProjectMetadata } from './project-utils.js';

/**
 * 客户端连接信息
 */
export interface ClientConnection {
  ws: WebSocket;
  projectId: string;
  projectInfo: ProjectMetadata;
  clientId: string;
  connectedAt: string;
  lastActivity: string;
  metadata: {
    userAgent?: string;
    origin?: string;
    ip?: string;
  };
}

/**
 * 路由消息接口
 */
export interface RoutedMessage {
  type: string;
  projectId: string;
  data: any;
  timestamp: string;
  messageId: string;
}

/**
 * 多项目路由管理器
 */
export class MultiProjectRouter {
  private connections: Map<string, ClientConnection> = new Map();
  private projectConnections: Map<string, Set<string>> = new Map();
  private messageHandlers: Map<string, (message: RoutedMessage, connection: ClientConnection) => Promise<void>> = new Map();

  /**
   * 解析WebSocket连接的路径，提取项目ID
   */
  parseConnectionPath(request: IncomingMessage): { projectId: string | null; isValid: boolean } {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const pathParts = url.pathname.split('/').filter(part => part.length > 0);
      
      if (pathParts.length >= 1 && pathParts[0] === 'ws') {
        if (pathParts.length >= 2) {
          const projectId = pathParts[1];
          if (this.isValidProjectId(projectId)) {
            return { projectId, isValid: true };
          } else {
            return { projectId: null, isValid: false };
          }
        } else {
          return { projectId: 'default-project', isValid: true };
        }
      }
      
      return { projectId: 'default-project', isValid: true };
      
    } catch (error) {
      console.error('Failed to parse connection path:', error);
      return { projectId: null, isValid: false };
    }
  }

  /**
   * 验证项目ID格式
   */
  private isValidProjectId(projectId: string): boolean {
    return /^[a-z0-9][a-z0-9\-_]*[a-z0-9]$|^[a-z0-9]$/.test(projectId);
  }

  /**
   * 处理新的WebSocket连接
   */
  async handleConnection(ws: WebSocket, request: IncomingMessage): Promise<ClientConnection | null> {
    try {
      const { projectId, isValid } = this.parseConnectionPath(request);
      
      if (!isValid || !projectId) {
        ws.close(1008, 'Invalid project path');
        return null;
      }

      const clientId = this.generateClientId();
      
      let projectInfo: ProjectMetadata;
      try {
        projectInfo = await getProjectInfo(process.cwd());
        if (projectInfo.id !== projectId) {
          projectInfo = {
            ...projectInfo,
            id: projectId,
            name: projectId
          };
        }
      } catch (error) {
        projectInfo = {
          id: projectId,
          name: projectId,
          type: 'general',
          directory: process.cwd(),
          detectedAt: new Date().toISOString()
        };
      }

      const connection: ClientConnection = {
        ws,
        projectId,
        projectInfo,
        clientId,
        connectedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        metadata: {
          userAgent: request.headers['user-agent'],
          origin: request.headers['origin'],
          ip: request.socket.remoteAddress
        }
      };

      this.connections.set(clientId, connection);
      
      if (!this.projectConnections.has(projectId)) {
        this.projectConnections.set(projectId, new Set());
      }
      this.projectConnections.get(projectId)!.add(clientId);

      this.setupWebSocketHandlers(connection);

      console.log(`New connection: ${clientId} for project: ${projectId}`);
      
      this.sendToConnection(clientId, {
        type: 'connection-established',
        projectId,
        data: {
          clientId,
          projectInfo,
          serverTime: new Date().toISOString()
        }
      });

      return connection;

    } catch (error) {
      console.error('Failed to handle connection:', error);
      ws.close(1011, 'Internal server error');
      return null;
    }
  }

  private setupWebSocketHandlers(connection: ClientConnection): void {
    const { ws, clientId } = connection;

    ws.on('message', (data) => {
      this.handleMessage(clientId, data);
    });

    ws.on('close', () => {
      this.removeConnection(clientId);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for ${clientId}:`, error);
      this.removeConnection(clientId);
    });
  }

  private async handleMessage(clientId: string, data: any): Promise<void> {
    const connection = this.connections.get(clientId);
    if (!connection) return;

    connection.lastActivity = new Date().toISOString();

    try {
      const rawMessage = typeof data === 'string' ? data : data.toString();
      const message = JSON.parse(rawMessage);

      const routedMessage: RoutedMessage = {
        type: message.type || 'unknown',
        projectId: connection.projectId,
        data: message.data || message,
        timestamp: new Date().toISOString(),
        messageId: this.generateMessageId()
      };

      const handler = this.messageHandlers.get(routedMessage.type);
      if (handler) {
        await handler(routedMessage, connection);
      }

    } catch (error) {
      console.error(`Failed to handle message from ${clientId}:`, error);
    }
  }

  /**
   * 注册消息处理器
   */
  registerMessageHandler(messageType: string, handler: (message: RoutedMessage, connection: ClientConnection) => Promise<void>): void {
    this.messageHandlers.set(messageType, handler);
  }

  /**
   * 发送消息到指定连接
   */
  sendToConnection(clientId: string, message: any): boolean {
    const connection = this.connections.get(clientId);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      connection.ws.send(JSON.stringify(message));
      connection.lastActivity = new Date().toISOString();
      return true;
    } catch (error) {
      this.removeConnection(clientId);
      return false;
    }
  }

  /**
   * 广播消息到项目的所有连接
   */
  broadcastToProject(projectId: string, message: any): number {
    const projectConnections = this.projectConnections.get(projectId);
    if (!projectConnections) return 0;

    let sentCount = 0;
    for (const clientId of projectConnections) {
      if (this.sendToConnection(clientId, message)) {
        sentCount++;
      }
    }
    return sentCount;
  }

  private removeConnection(clientId: string): void {
    const connection = this.connections.get(clientId);
    if (!connection) return;

    this.connections.delete(clientId);

    const projectConnections = this.projectConnections.get(connection.projectId);
    if (projectConnections) {
      projectConnections.delete(clientId);
      if (projectConnections.size === 0) {
        this.projectConnections.delete(connection.projectId);
      }
    }
    // 通知主管理器有连接断开
    if (typeof (global as any).feedbackManagerOnConnectionChange === 'function') {
      (global as any).feedbackManagerOnConnectionChange();
    }
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取项目连接列表
   */
  getProjectConnections(projectId: string): ClientConnection[] {
    const connectionIds = this.projectConnections.get(projectId);
    if (!connectionIds) return [];

    const connections: ClientConnection[] = [];
    for (const clientId of connectionIds) {
      const connection = this.connections.get(clientId);
      if (connection) {
        connections.push(connection);
      }
    }

    return connections;
  }

  /**
   * 获取所有连接
   */
  getAllConnections(): ClientConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    for (const connection of this.connections.values()) {
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.close(1001, 'Server shutting down');
      }
    }
    this.connections.clear();
    this.projectConnections.clear();
    this.messageHandlers.clear();
  }
}