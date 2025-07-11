/**
 * 多项目连接管理器
 * 管理多个项目的WebSocket连接，支持项目切换和并发连接
 */
class MultiProjectConnectionManager {
    constructor() {
        this.connections = new Map(); // projectId -> connection info
        this.currentProjectId = null;
        this.serverBaseUrl = 'ws://127.0.0.1:8797';
        this.reconnectAttempts = new Map(); // projectId -> attempt count
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        
        // 事件监听器
        this.eventListeners = {
            projectChanged: [],
            connectionStatusChanged: [],
            messageReceived: []
        };
        
        // 项目检测器
        this.projectDetector = new ProjectDetector();
        
        console.log('🔄 多项目连接管理器初始化完成');
    }

    /**
     * 初始化管理器
     */
    async initialize() {
        try {
            console.log('🚀 初始化多项目连接管理器...');
            
            // 检测当前项目
            const currentProject = await this.projectDetector.detectCurrentProject();
            await this.setCurrentProject(currentProject);
            
            // 加载已保存的项目连接
            await this.loadSavedProjects();
            
            console.log('✅ 多项目连接管理器初始化完成');
        } catch (error) {
            console.error('❌ 多项目连接管理器初始化失败:', error);
        }
    }

    /**
     * 设置当前项目
     */
    async setCurrentProject(projectInfo) {
        if (!projectInfo || !projectInfo.id) {
            console.warn('⚠️ 无效的项目信息');
            return;
        }

        const oldProjectId = this.currentProjectId;
        this.currentProjectId = projectInfo.id;
        
        // 如果项目已存在，更新信息；否则添加新项目
        if (!this.connections.has(projectInfo.id)) {
            this.connections.set(projectInfo.id, {
                info: projectInfo,
                socket: null,
                status: 'disconnected',
                lastActivity: new Date(),
                autoConnect: true
            });
        } else {
            // 更新项目信息
            const existing = this.connections.get(projectInfo.id);
            existing.info = { ...existing.info, ...projectInfo };
        }

        console.log(`📍 当前项目设置为: ${projectInfo.name} (${projectInfo.id})`);
        
        // 触发项目切换事件
        this.emit('projectChanged', {
            oldProjectId,
            newProjectId: projectInfo.id,
            projectInfo
        });

        // 保存项目信息
        await this.saveProjectsInfo();
    }

    /**
     * 连接到指定项目
     */
    async connectToProject(projectId = null) {
        const targetProjectId = projectId || this.currentProjectId;
        if (!targetProjectId) {
            throw new Error('没有指定项目ID');
        }

        const connection = this.connections.get(targetProjectId);
        if (!connection) {
            throw new Error(`项目不存在: ${targetProjectId}`);
        }

        if (connection.status === 'connected' || connection.status === 'connecting') {
            console.log(`📡 项目 ${targetProjectId} 已连接或正在连接中`);
            return;
        }

        try {
            console.log(`🔗 正在连接到项目: ${connection.info.name} (${targetProjectId})`);
            
            connection.status = 'connecting';
            this.emit('connectionStatusChanged', { projectId: targetProjectId, status: 'connecting' });

            // 构建WebSocket URL，包含项目ID
            const wsUrl = `${this.serverBaseUrl}/ws/${targetProjectId}`;
            console.log(`📡 WebSocket URL: ${wsUrl}`);

            const socket = new WebSocket(wsUrl);
            connection.socket = socket;

            // 设置WebSocket事件处理
            socket.onopen = () => {
                console.log(`✅ 项目 ${targetProjectId} 连接成功`);
                connection.status = 'connected';
                connection.lastActivity = new Date();
                this.reconnectAttempts.delete(targetProjectId);
                
                this.emit('connectionStatusChanged', { 
                    projectId: targetProjectId, 
                    status: 'connected' 
                });

                // 发送初始化消息
                this.sendMessage(targetProjectId, {
                    action: 'init',
                    clientType: 'chrome-extension-multi-project',
                    projectInfo: connection.info,
                    timestamp: new Date().toISOString()
                });
            };

            socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    console.log(`📨 收到项目 ${targetProjectId} 的消息:`, message.type || message.action);
                    
                    connection.lastActivity = new Date();
                    this.emit('messageReceived', {
                        projectId: targetProjectId,
                        message: message
                    });
                } catch (error) {
                    console.error(`❌ 解析项目 ${targetProjectId} 消息失败:`, error);
                }
            };

            socket.onclose = (event) => {
                console.log(`🔌 项目 ${targetProjectId} 连接关闭:`, event.code, event.reason);
                connection.status = 'disconnected';
                connection.socket = null;
                
                this.emit('connectionStatusChanged', { 
                    projectId: targetProjectId, 
                    status: 'disconnected' 
                });

                // 如果是意外断开，尝试重连
                if (event.code !== 1000 && connection.autoConnect) {
                    this.scheduleReconnect(targetProjectId);
                }
            };

            socket.onerror = (error) => {
                console.error(`❌ 项目 ${targetProjectId} WebSocket错误:`, error);
                connection.status = 'error';
                
                this.emit('connectionStatusChanged', { 
                    projectId: targetProjectId, 
                    status: 'error' 
                });
            };

        } catch (error) {
            console.error(`❌ 连接项目 ${targetProjectId} 失败:`, error);
            connection.status = 'error';
            this.emit('connectionStatusChanged', { 
                projectId: targetProjectId, 
                status: 'error' 
            });
            throw error;
        }
    }

    /**
     * 断开项目连接
     */
    async disconnectFromProject(projectId = null) {
        const targetProjectId = projectId || this.currentProjectId;
        if (!targetProjectId) return;

        const connection = this.connections.get(targetProjectId);
        if (!connection || !connection.socket) return;

        console.log(`🔌 断开项目连接: ${targetProjectId}`);
        
        connection.autoConnect = false; // 阻止自动重连
        connection.socket.close(1000, 'User disconnected');
        connection.socket = null;
        connection.status = 'disconnected';
        
        this.emit('connectionStatusChanged', { 
            projectId: targetProjectId, 
            status: 'disconnected' 
        });
    }

    /**
     * 发送消息到指定项目
     */
    sendMessage(projectId, message) {
        const connection = this.connections.get(projectId);
        if (!connection || !connection.socket || connection.status !== 'connected') {
            console.warn(`⚠️ 无法发送消息到项目 ${projectId}: 连接不可用`);
            return false;
        }

        try {
            // 确保消息包含项目ID
            const messageWithProject = {
                ...message,
                projectId: projectId,
                timestamp: message.timestamp || new Date().toISOString()
            };

            connection.socket.send(JSON.stringify(messageWithProject));
            connection.lastActivity = new Date();
            return true;
        } catch (error) {
            console.error(`❌ 发送消息到项目 ${projectId} 失败:`, error);
            return false;
        }
    }

    /**
     * 发送消息到当前项目
     */
    sendToCurrentProject(message) {
        if (!this.currentProjectId) {
            console.warn('⚠️ 没有当前项目');
            return false;
        }
        return this.sendMessage(this.currentProjectId, message);
    }

    /**
     * 计划重连
     */
    scheduleReconnect(projectId) {
        const attempts = (this.reconnectAttempts.get(projectId) || 0) + 1;
        
        if (attempts > this.maxReconnectAttempts) {
            console.log(`❌ 项目 ${projectId} 重连次数已达上限`);
            this.reconnectAttempts.delete(projectId);
            return;
        }

        this.reconnectAttempts.set(projectId, attempts);
        const delay = this.reconnectDelay * Math.pow(2, attempts - 1); // 指数退避

        console.log(`🔄 计划在 ${delay}ms 后重连项目 ${projectId} (尝试 ${attempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
            const connection = this.connections.get(projectId);
            if (connection && connection.autoConnect && connection.status !== 'connected') {
                console.log(`🔄 重连项目 ${projectId}...`);
                this.connectToProject(projectId);
            }
        }, delay);
    }

    /**
     * 获取所有项目信息
     */
    getAllProjects() {
        const projects = [];
        for (const [projectId, connection] of this.connections) {
            projects.push({
                id: projectId,
                ...connection.info,
                status: connection.status,
                lastActivity: connection.lastActivity,
                autoConnect: connection.autoConnect
            });
        }
        return projects.sort((a, b) => b.lastActivity - a.lastActivity);
    }

    /**
     * 获取当前项目信息
     */
    getCurrentProject() {
        if (!this.currentProjectId) return null;
        const connection = this.connections.get(this.currentProjectId);
        return connection ? {
            id: this.currentProjectId,
            ...connection.info,
            status: connection.status,
            lastActivity: connection.lastActivity
        } : null;
    }

    /**
     * 切换到指定项目
     */
    async switchToProject(projectId) {
        const connection = this.connections.get(projectId);
        if (!connection) {
            throw new Error(`项目不存在: ${projectId}`);
        }

        const oldProjectId = this.currentProjectId;
        this.currentProjectId = projectId;
        
        console.log(`🔄 切换到项目: ${connection.info.name} (${projectId})`);
        
        // 触发项目切换事件
        this.emit('projectChanged', {
            oldProjectId,
            newProjectId: projectId,
            projectInfo: connection.info
        });

        // 如果项目未连接，自动连接
        if (connection.status === 'disconnected') {
            await this.connectToProject(projectId);
        }

        // 保存当前项目
        await this.saveCurrentProject();
    }

    /**
     * 移除项目
     */
    async removeProject(projectId) {
        if (projectId === this.currentProjectId) {
            throw new Error('不能移除当前项目');
        }

        const connection = this.connections.get(projectId);
        if (!connection) return;

        // 断开连接
        await this.disconnectFromProject(projectId);
        
        // 移除项目
        this.connections.delete(projectId);
        this.reconnectAttempts.delete(projectId);
        
        console.log(`🗑️ 项目已移除: ${projectId}`);
        
        // 保存项目列表
        await this.saveProjectsInfo();
    }

    /**
     * 连接所有项目
     */
    async connectAll() {
        console.log('🔗 连接所有项目...');
        const promises = [];
        
        for (const [projectId, connection] of this.connections) {
            if (connection.autoConnect && connection.status === 'disconnected') {
                promises.push(this.connectToProject(projectId));
            }
        }
        
        await Promise.allSettled(promises);
    }

    /**
     * 断开所有项目
     */
    async disconnectAll() {
        console.log('🔌 断开所有项目连接...');
        const promises = [];
        
        for (const projectId of this.connections.keys()) {
            promises.push(this.disconnectFromProject(projectId));
        }
        
        await Promise.allSettled(promises);
    }

    /**
     * 保存项目信息到存储
     */
    async saveProjectsInfo() {
        try {
            const projectsData = [];
            for (const [projectId, connection] of this.connections) {
                projectsData.push({
                    id: projectId,
                    info: connection.info,
                    autoConnect: connection.autoConnect,
                    lastActivity: connection.lastActivity.toISOString()
                });
            }
            
            if (typeof chrome !== 'undefined' && chrome.storage) {
                await chrome.storage.local.set({
                    'mcp-multi-projects': projectsData,
                    'mcp-current-project': this.currentProjectId
                });
            }
        } catch (error) {
            console.error('❌ 保存项目信息失败:', error);
        }
    }

    /**
     * 从存储加载项目信息
     */
    async loadSavedProjects() {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                const data = await chrome.storage.local.get(['mcp-multi-projects', 'mcp-current-project']);
                
                if (data['mcp-multi-projects']) {
                    for (const projectData of data['mcp-multi-projects']) {
                        this.connections.set(projectData.id, {
                            info: projectData.info,
                            socket: null,
                            status: 'disconnected',
                            lastActivity: new Date(projectData.lastActivity),
                            autoConnect: projectData.autoConnect !== false
                        });
                    }
                    console.log(`📚 加载了 ${data['mcp-multi-projects'].length} 个已保存的项目`);
                }
                
                if (data['mcp-current-project'] && this.connections.has(data['mcp-current-project'])) {
                    this.currentProjectId = data['mcp-current-project'];
                }
            }
        } catch (error) {
            console.error('❌ 加载项目信息失败:', error);
        }
    }

    /**
     * 保存当前项目
     */
    async saveCurrentProject() {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                await chrome.storage.local.set({
                    'mcp-current-project': this.currentProjectId
                });
            }
        } catch (error) {
            console.error('❌ 保存当前项目失败:', error);
        }
    }

    /**
     * 添加事件监听器
     */
    on(event, listener) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].push(listener);
        }
    }

    /**
     * 移除事件监听器
     */
    off(event, listener) {
        if (this.eventListeners[event]) {
            const index = this.eventListeners[event].indexOf(listener);
            if (index > -1) {
                this.eventListeners[event].splice(index, 1);
            }
        }
    }

    /**
     * 触发事件
     */
    emit(event, data) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].forEach(listener => {
                try {
                    listener(data);
                } catch (error) {
                    console.error(`❌ 事件监听器执行失败 (${event}):`, error);
                }
            });
        }
    }

    /**
     * 获取连接统计信息
     */
    getConnectionStats() {
        const stats = {
            total: this.connections.size,
            connected: 0,
            connecting: 0,
            disconnected: 0,
            error: 0
        };

        for (const connection of this.connections.values()) {
            stats[connection.status]++;
        }

        return stats;
    }

    /**
     * 清理断开的连接
     */
    cleanup() {
        console.log('🧹 清理断开的连接...');
        
        for (const [projectId, connection] of this.connections) {
            if (connection.socket && connection.socket.readyState === WebSocket.CLOSED) {
                connection.socket = null;
                connection.status = 'disconnected';
            }
        }
    }
}

// 全局导出
window.MultiProjectConnectionManager = MultiProjectConnectionManager;
