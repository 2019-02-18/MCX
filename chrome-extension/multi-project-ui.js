/**
 * 多项目UI管理器
 * 负责多项目界面显示、项目切换和状态管理
 */
class MultiProjectUI {
    constructor(connectionManager) {
        this.connectionManager = connectionManager;
        this.container = null;
        this.projectTabs = null;
        this.currentProjectDisplay = null;
        this.projectSelector = null;
        this.statusIndicator = null;
        
        // UI元素引用
        this.elements = {};
        
        // 项目颜色方案
        this.projectColors = [
            '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
            '#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#16a085'
        ];
        
        console.log('🎨 多项目UI管理器初始化');
    }

    /**
     * 初始化UI
     */
    async initialize() {
        try {
            console.log('🎨 初始化多项目UI...');
            
            // 创建UI容器
            this.createUIContainer();
            
            // 监听连接管理器事件
            this.setupEventListeners();
            
            // 初始化项目显示
            await this.refreshProjectDisplay();
            
            console.log('✅ 多项目UI初始化完成');
        } catch (error) {
            console.error('❌ 多项目UI初始化失败:', error);
        }
    }

    /**
     * 创建UI容器
     */
    createUIContainer() {
        // 查找插入点（连接控制区域之后）
        const connectionControls = document.querySelector('.connection-controls');
        if (!connectionControls) {
            console.warn('⚠️ 找不到连接控制区域，使用body作为容器');
            this.container = document.body;
        } else {
            // 在连接控制之后插入多项目UI
            this.container = document.createElement('div');
            this.container.className = 'multi-project-container';
            this.container.innerHTML = this.getUITemplate();
            
            connectionControls.parentNode.insertBefore(this.container, connectionControls.nextSibling);
        }

        // 缓存UI元素
        this.cacheUIElements();
        
        // 设置样式
        this.injectStyles();
    }

    /**
     * 获取UI模板
     */
    getUITemplate() {
        return `
            <div class="multi-project-ui">
                <!-- 项目标签栏 -->
                <div class="project-tabs-container">
                    <div class="project-tabs" id="projectTabs">
                        <!-- 项目标签将在这里动态生成 -->
                    </div>
                    <div class="project-controls">
                        <button class="btn-icon" id="detectProjectBtn" title="检测当前项目">
                            🔍
                        </button>
                        <button class="btn-icon" id="addProjectBtn" title="添加项目">
                            ➕
                        </button>
                        <button class="btn-icon" id="projectSettingsBtn" title="项目设置">
                            ⚙️
                        </button>
                    </div>
                </div>

                <!-- 当前项目信息栏 -->
                <div class="current-project-info" id="currentProjectInfo">
                    <div class="project-info-left">
                        <div class="project-avatar" id="projectAvatar">📁</div>
                        <div class="project-details">
                            <div class="project-name" id="projectName">未选择项目</div>
                            <div class="project-type" id="projectType">-</div>
                        </div>
                    </div>
                    <div class="project-info-right">
                        <div class="project-status" id="projectStatus">
                            <span class="status-dot disconnected"></span>
                            <span class="status-text">未连接</span>
                        </div>
                        <div class="project-actions">
                            <button class="btn-small" id="connectCurrentBtn">连接</button>
                            <button class="btn-small" id="disconnectCurrentBtn" style="display:none;">断开</button>
                        </div>
                    </div>
                </div>

                <!-- 项目统计信息 -->
                <div class="project-stats" id="projectStats">
                    <div class="stat-item">
                        <span class="stat-label">总项目:</span>
                        <span class="stat-value" id="totalProjects">0</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">已连接:</span>
                        <span class="stat-value" id="connectedProjects">0</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">活跃:</span>
                        <span class="stat-value" id="activeProjects">0</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 缓存UI元素
     */
    cacheUIElements() {
        this.elements = {
            projectTabs: document.getElementById('projectTabs'),
            currentProjectInfo: document.getElementById('currentProjectInfo'),
            projectName: document.getElementById('projectName'),
            projectType: document.getElementById('projectType'),
            projectAvatar: document.getElementById('projectAvatar'),
            projectStatus: document.getElementById('projectStatus'),
            projectStats: document.getElementById('projectStats'),
            totalProjects: document.getElementById('totalProjects'),
            connectedProjects: document.getElementById('connectedProjects'),
            activeProjects: document.getElementById('activeProjects'),
            detectProjectBtn: document.getElementById('detectProjectBtn'),
            addProjectBtn: document.getElementById('addProjectBtn'),
            projectSettingsBtn: document.getElementById('projectSettingsBtn'),
            connectCurrentBtn: document.getElementById('connectCurrentBtn'),
            disconnectCurrentBtn: document.getElementById('disconnectCurrentBtn')
        };
    }

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 连接管理器事件
        this.connectionManager.on('projectChanged', (data) => {
            this.onProjectChanged(data);
        });

        this.connectionManager.on('connectionStatusChanged', (data) => {
            this.onConnectionStatusChanged(data);
        });

        // UI控制按钮事件
        if (this.elements.detectProjectBtn) {
            this.elements.detectProjectBtn.addEventListener('click', () => {
                this.detectCurrentProject();
            });
        }

        if (this.elements.connectCurrentBtn) {
            this.elements.connectCurrentBtn.addEventListener('click', () => {
                this.connectCurrentProject();
            });
        }

        if (this.elements.disconnectCurrentBtn) {
            this.elements.disconnectCurrentBtn.addEventListener('click', () => {
                this.disconnectCurrentProject();
            });
        }
    }

    /**
     * 刷新项目显示
     */
    async refreshProjectDisplay() {
        this.updateProjectTabs();
        this.updateCurrentProjectInfo();
        this.updateProjectStats();
    }

    /**
     * 更新项目标签页
     */
    updateProjectTabs() {
        if (!this.elements.projectTabs) return;

        const projects = this.connectionManager.getAllProjects();
        const currentProjectId = this.connectionManager.currentProjectId;

        // 清空现有标签
        this.elements.projectTabs.innerHTML = '';

        // 创建项目标签
        projects.forEach((project, index) => {
            const tab = this.createProjectTab(project, index, project.id === currentProjectId);
            this.elements.projectTabs.appendChild(tab);
        });

        // 如果没有项目，显示提示
        if (projects.length === 0) {
            this.elements.projectTabs.innerHTML = '<div class="no-projects">暂无项目</div>';
        }
    }

    /**
     * 创建项目标签
     */
    createProjectTab(project, index, isActive) {
        const tab = document.createElement('div');
        tab.className = `project-tab ${isActive ? 'active' : ''} status-${project.status}`;
        tab.dataset.projectId = project.id;
        
        const color = this.projectColors[index % this.projectColors.length];
        tab.style.setProperty('--project-color', color);

        tab.innerHTML = `
            <div class="tab-avatar" style="background-color: ${color}">
                ${this.getProjectIcon(project.type)}
            </div>
            <div class="tab-content">
                <div class="tab-name" title="${project.name}">${this.truncateText(project.name, 12)}</div>
                <div class="tab-status">
                    <span class="status-dot ${project.status}"></span>
                    ${this.getStatusText(project.status)}
                </div>
            </div>
        `;

        // 添加点击事件
        tab.addEventListener('click', (e) => {
            this.switchToProject(project.id);
        });

        return tab;
    }

    /**
     * 获取项目图标
     */
    getProjectIcon(type) {
        const icons = {
            'nodejs': '📦',
            'python': '🐍',
            'rust': '🦀',
            'java': '☕',
            'go': '🐹',
            'php': '🐘',
            'react': '⚛️',
            'vue': '🍃',
            'angular': '🅰️',
            'repository': '📚',
            'local-dev': '🏠',
            'vscode-workspace': '📝',
            'web-application': '🌐',
            'general': '📁'
        };
        return icons[type] || '📁';
    }

    /**
     * 获取状态文本
     */
    getStatusText(status) {
        const statusTexts = {
            'connected': '已连接',
            'connecting': '连接中',
            'disconnected': '未连接',
            'error': '错误'
        };
        return statusTexts[status] || status;
    }

    /**
     * 更新当前项目信息
     */
    updateCurrentProjectInfo() {
        const currentProject = this.connectionManager.getCurrentProject();
        
        if (!currentProject) {
            this.elements.projectName.textContent = '未选择项目';
            this.elements.projectType.textContent = '-';
            this.elements.projectAvatar.textContent = '📁';
            this.updateConnectionStatus('disconnected', '未连接');
            return;
        }

        this.elements.projectName.textContent = currentProject.name;
        this.elements.projectType.textContent = this.connectionManager.projectDetector.getProjectTypeDisplayName(currentProject.type);
        this.elements.projectAvatar.textContent = this.getProjectIcon(currentProject.type);
        
        this.updateConnectionStatus(currentProject.status, this.getStatusText(currentProject.status));
    }

    /**
     * 更新连接状态显示
     */
    updateConnectionStatus(status, text) {
        const statusElement = this.elements.projectStatus;
        const statusDot = statusElement.querySelector('.status-dot');
        const statusText = statusElement.querySelector('.status-text');
        
        // 更新状态点样式
        statusDot.className = `status-dot ${status}`;
        statusText.textContent = text;
        
        // 更新按钮显示
        const connectBtn = this.elements.connectCurrentBtn;
        const disconnectBtn = this.elements.disconnectCurrentBtn;
        
        if (status === 'connected') {
            connectBtn.style.display = 'none';
            disconnectBtn.style.display = 'inline-block';
        } else {
            connectBtn.style.display = 'inline-block';
            disconnectBtn.style.display = 'none';
        }
    }

    /**
     * 更新项目统计
     */
    updateProjectStats() {
        const stats = this.connectionManager.getConnectionStats();
        
        this.elements.totalProjects.textContent = stats.total;
        this.elements.connectedProjects.textContent = stats.connected;
        this.elements.activeProjects.textContent = stats.connected + stats.connecting;
    }

    /**
     * 项目切换事件处理
     */
    onProjectChanged(data) {
        console.log('🔄 UI: 项目切换', data.newProjectId);
        this.refreshProjectDisplay();
    }

    /**
     * 连接状态变化事件处理
     */
    onConnectionStatusChanged(data) {
        console.log('📡 UI: 连接状态变化', data.projectId, data.status);
        this.refreshProjectDisplay();
    }

    /**
     * 检测当前项目
     */
    async detectCurrentProject() {
        try {
            this.elements.detectProjectBtn.disabled = true;
            this.elements.detectProjectBtn.textContent = '🔄';
            
            const currentProject = await this.connectionManager.projectDetector.detectCurrentProject();
            await this.connectionManager.setCurrentProject(currentProject);
            
            this.showNotification(`检测到项目: ${currentProject.name}`, 'success');
        } catch (error) {
            console.error('❌ 检测项目失败:', error);
            this.showNotification('项目检测失败', 'error');
        } finally {
            this.elements.detectProjectBtn.disabled = false;
            this.elements.detectProjectBtn.textContent = '🔍';
        }
    }

    /**
     * 切换到指定项目
     */
    async switchToProject(projectId) {
        try {
            await this.connectionManager.switchToProject(projectId);
            this.showNotification('项目切换成功', 'success');
        } catch (error) {
            console.error('❌ 切换项目失败:', error);
            this.showNotification('项目切换失败', 'error');
        }
    }

    /**
     * 连接当前项目
     */
    async connectCurrentProject() {
        try {
            await this.connectionManager.connectToProject();
            this.showNotification('项目连接成功', 'success');
        } catch (error) {
            console.error('❌ 连接项目失败:', error);
            this.showNotification('项目连接失败', 'error');
        }
    }

    /**
     * 断开当前项目
     */
    async disconnectCurrentProject() {
        try {
            await this.connectionManager.disconnectFromProject();
            this.showNotification('项目已断开连接', 'info');
        } catch (error) {
            console.error('❌ 断开项目失败:', error);
            this.showNotification('断开项目失败', 'error');
        }
    }

    /**
     * 显示通知
     */
    showNotification(message, type = 'info') {
        // 尝试使用现有的通知系统
        if (typeof window.sidepanel !== 'undefined' && window.sidepanel.showNotification) {
            window.sidepanel.showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    /**
     * 截断文本
     */
    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    /**
     * 注入样式
     */
    injectStyles() {
        const styleId = 'multi-project-ui-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = this.getStyles();
        document.head.appendChild(style);
    }

    /**
     * 获取CSS样式
     */
    getStyles() {
        return `
            .multi-project-ui {
                background: #f8f9fa;
                border: 1px solid #e9ecef;
                border-radius: 8px;
                margin: 10px 0;
                overflow: hidden;
            }

            .project-tabs-container {
                display: flex;
                align-items: center;
                background: white;
                border-bottom: 1px solid #e9ecef;
                padding: 8px;
            }

            .project-tabs {
                flex: 1;
                display: flex;
                gap: 4px;
                overflow-x: auto;
                padding: 4px 0;
            }

            .project-tab {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                border-radius: 6px;
                background: #f8f9fa;
                cursor: pointer;
                transition: all 0.2s;
                min-width: 120px;
                border: 1px solid transparent;
            }

            .project-tab:hover {
                background: #e9ecef;
            }

            .project-tab.active {
                background: var(--project-color, #007bff);
                color: white;
                border-color: var(--project-color, #007bff);
            }

            .project-tab.status-connected {
                border-left: 3px solid #28a745;
            }

            .project-tab.status-connecting {
                border-left: 3px solid #ffc107;
            }

            .project-tab.status-error {
                border-left: 3px solid #dc3545;
            }

            .tab-avatar {
                width: 24px;
                height: 24px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                color: white;
            }

            .tab-content {
                flex: 1;
                min-width: 0;
            }

            .tab-name {
                font-weight: 500;
                font-size: 12px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .tab-status {
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 10px;
                opacity: 0.8;
            }

            .project-controls {
                display: flex;
                gap: 4px;
                margin-left: 8px;
            }

            .btn-icon {
                background: none;
                border: 1px solid #ddd;
                padding: 6px 8px;
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s;
                font-size: 12px;
            }

            .btn-icon:hover {
                background: #f0f0f0;
                border-color: #999;
            }

            .current-project-info {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px;
                background: white;
                border-bottom: 1px solid #e9ecef;
            }

            .project-info-left {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .project-avatar {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background: #007bff;
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
            }

            .project-details {
                min-width: 0;
            }

            .project-name {
                font-weight: 600;
                font-size: 14px;
                color: #333;
            }

            .project-type {
                font-size: 12px;
                color: #666;
            }

            .project-info-right {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .project-status {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
            }

            .status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #ccc;
            }

            .status-dot.connected {
                background: #28a745;
            }

            .status-dot.connecting {
                background: #ffc107;
                animation: pulse 1s infinite;
            }

            .status-dot.disconnected {
                background: #6c757d;
            }

            .status-dot.error {
                background: #dc3545;
            }

            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }

            .project-actions {
                display: flex;
                gap: 4px;
            }

            .btn-small {
                padding: 4px 8px;
                font-size: 11px;
                border: 1px solid #ddd;
                background: white;
                border-radius: 3px;
                cursor: pointer;
                transition: all 0.2s;
            }

            .btn-small:hover {
                background: #f0f0f0;
                border-color: #999;
            }

            .project-stats {
                display: flex;
                justify-content: space-around;
                padding: 8px 12px;
                background: #f8f9fa;
                font-size: 11px;
            }

            .stat-item {
                text-align: center;
            }

            .stat-label {
                color: #666;
                margin-right: 4px;
            }

            .stat-value {
                font-weight: 600;
                color: #333;
            }

            .no-projects {
                text-align: center;
                padding: 20px;
                color: #666;
                font-size: 12px;
            }
        `;
    }
}

// 全局导出
window.MultiProjectUI = MultiProjectUI; 