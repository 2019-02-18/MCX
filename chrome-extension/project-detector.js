/**
 * Chrome扩展项目识别器
 * 基于当前标签页URL和内容检测项目类型和名称
 */
class ProjectDetector {
    constructor() {
        this.detectors = [
            { 
                name: 'nodejs',
                patterns: ['/package.json'],
                keyField: 'name',
                description: 'Node.js项目'
            },
            { 
                name: 'python',
                patterns: ['/requirements.txt', '/pyproject.toml', '/setup.py'],
                keyField: 'name',
                description: 'Python项目'
            },
            { 
                name: 'rust',
                patterns: ['/Cargo.toml'],
                keyField: 'package.name',
                description: 'Rust项目'
            },
            { 
                name: 'java',
                patterns: ['/pom.xml', '/build.gradle'],
                keyField: 'artifactId',
                description: 'Java项目'
            },
            { 
                name: 'go',
                patterns: ['/go.mod'],
                keyField: 'module',
                description: 'Go项目'
            },
            { 
                name: 'php',
                patterns: ['/composer.json'],
                keyField: 'name',
                description: 'PHP项目'
            }
        ];
    }

    /**
     * 检测当前项目
     * @returns {Promise<Object>} 项目信息
     */
    async detectCurrentProject() {
        try {
            console.log('🔍 开始检测当前项目...');
            
            // 获取当前标签页信息
            const tab = await this.getCurrentTab();
            if (!tab) {
                return this.createDefaultProject();
            }

            console.log('📍 当前标签页:', tab.url);

            // 尝试从URL检测项目
            let projectInfo = await this.detectFromUrl(tab.url);
            
            // 如果URL检测失败，尝试从页面内容检测
            if (!projectInfo) {
                projectInfo = await this.detectFromPageContent(tab);
            }
            
            // 如果都失败，使用默认项目
            if (!projectInfo) {
                projectInfo = this.createDefaultProject(tab.url);
            }

            console.log('✅ 项目检测完成:', projectInfo);
            return projectInfo;
        } catch (error) {
            console.error('❌ 项目检测失败:', error);
            return this.createDefaultProject();
        }
    }

    /**
     * 获取当前活动标签页
     */
    async getCurrentTab() {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.tabs) {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    resolve(tabs[0] || null);
                });
            } else {
                resolve(null);
            }
        });
    }

    /**
     * 从URL检测项目
     */
    async detectFromUrl(url) {
        if (!url) return null;

        try {
            const urlObj = new URL(url);
            
            // GitHub/GitLab等代码托管平台
            if (this.isCodeHosting(urlObj.hostname)) {
                return this.detectFromCodeHosting(urlObj);
            }
            
            // 本地开发服务器
            if (this.isLocalDev(urlObj)) {
                return this.detectFromLocalDev(urlObj);
            }
            
            // VS Code Server / Cursor
            if (this.isVSCodeServer(urlObj)) {
                return this.detectFromVSCodeServer(urlObj);
            }

            return null;
        } catch (error) {
            console.warn('URL解析失败:', error);
            return null;
        }
    }

    /**
     * 检测是否为代码托管平台
     */
    isCodeHosting(hostname) {
        const platforms = [
            'github.com',
            'gitlab.com',
            'gitee.com',
            'bitbucket.org',
            'coding.net'
        ];
        return platforms.includes(hostname) || hostname.includes('gitlab');
    }

    /**
     * 从代码托管平台检测项目
     */
    detectFromCodeHosting(urlObj) {
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        
        if (pathParts.length >= 2) {
            const owner = pathParts[0];
            const repo = pathParts[1];
            
            return {
                id: this.sanitizeProjectId(`${owner}-${repo}`),
                name: repo,
                type: 'repository',
                source: 'code-hosting',
                platform: urlObj.hostname,
                owner: owner,
                repository: repo,
                url: urlObj.href
            };
        }
        
        return null;
    }

    /**
     * 检测是否为本地开发服务器
     */
    isLocalDev(urlObj) {
        const localHosts = ['localhost', '127.0.0.1', '0.0.0.0'];
        const devPorts = ['3000', '8080', '8000', '4200', '5173', '8797'];
        
        return localHosts.includes(urlObj.hostname) || 
               devPorts.includes(urlObj.port);
    }

    /**
     * 从本地开发服务器检测项目
     */
    detectFromLocalDev(urlObj) {
        const port = urlObj.port || '80';
        const projectName = this.extractProjectFromPort(port);
        
        return {
            id: this.sanitizeProjectId(`local-${projectName}-${port}`),
            name: projectName,
            type: 'local-dev',
            source: 'local-development',
            port: port,
            host: urlObj.hostname,
            url: urlObj.href
        };
    }

    /**
     * 检测是否为VS Code Server
     */
    isVSCodeServer(urlObj) {
        return urlObj.hostname.includes('vscode-server') ||
               urlObj.pathname.includes('vscode') ||
               urlObj.searchParams.has('workspace') ||
               urlObj.hostname.includes('cursor');
    }

    /**
     * 从VS Code Server检测项目
     */
    detectFromVSCodeServer(urlObj) {
        const workspace = urlObj.searchParams.get('workspace') || 
                         urlObj.searchParams.get('folder');
        
        if (workspace) {
            const projectName = workspace.split('/').pop() || workspace.split('\\').pop();
            return {
                id: this.sanitizeProjectId(`vscode-${projectName}`),
                name: projectName,
                type: 'vscode-workspace',
                source: 'vscode-server',
                workspace: workspace,
                url: urlObj.href
            };
        }
        
        return null;
    }

    /**
     * 从页面内容检测项目
     */
    async detectFromPageContent(tab) {
        try {
            console.log('🔍 尝试从页面内容检测项目...');
            
            // 注入检测脚本
            const results = await this.executeContentScript(tab.id);
            
            if (results && results.length > 0) {
                const projectData = results[0].result;
                if (projectData) {
                    return {
                        id: this.sanitizeProjectId(projectData.name || 'web-project'),
                        name: projectData.name || this.extractNameFromUrl(tab.url),
                        type: projectData.type || 'web-application',
                        source: 'page-content',
                        title: projectData.title,
                        url: tab.url,
                        detected: projectData
                    };
                }
            }
        } catch (error) {
            console.warn('页面内容检测失败:', error);
        }
        
        return null;
    }

    /**
     * 执行内容脚本检测项目信息
     */
    async executeContentScript(tabId) {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.scripting) {
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    function: this.contentDetectionFunction
                }, (results) => {
                    resolve(results);
                });
            } else {
                resolve(null);
            }
        });
    }

    /**
     * 在页面中执行的检测函数
     */
    contentDetectionFunction() {
        const projectInfo = {
            title: document.title,
            name: null,
            type: null
        };

        // 检测框架和库
        const frameworks = [];
        
        // React
        if (window.React || document.querySelector('[data-reactroot]') || 
            document.querySelector('script[src*="react"]')) {
            frameworks.push('React');
        }
        
        // Vue
        if (window.Vue || document.querySelector('[data-v-]') ||
            document.querySelector('script[src*="vue"]')) {
            frameworks.push('Vue');
        }
        
        // Angular
        if (window.ng || document.querySelector('[ng-app]') ||
            document.querySelector('script[src*="angular"]')) {
            frameworks.push('Angular');
        }
        
        // 检测meta信息
        const appName = document.querySelector('meta[name="application-name"]');
        if (appName) {
            projectInfo.name = appName.content;
        }
        
        // 检测title中的项目名称
        if (!projectInfo.name && document.title) {
            const titleParts = document.title.split(/[-|–]/);
            if (titleParts.length > 1) {
                projectInfo.name = titleParts[titleParts.length - 1].trim();
            }
        }
        
        if (frameworks.length > 0) {
            projectInfo.type = frameworks.join('+').toLowerCase();
        }
        
        return projectInfo;
    }

    /**
     * 创建默认项目
     */
    createDefaultProject(url = '') {
        const name = this.extractNameFromUrl(url) || 'default-project';
        
        return {
            id: this.sanitizeProjectId(name),
            name: name,
            type: 'general',
            source: 'default',
            url: url,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 从URL提取项目名称
     */
    extractNameFromUrl(url) {
        if (!url) return 'unnamed-project';
        
        try {
            const urlObj = new URL(url);
            
            // 从hostname提取
            let name = urlObj.hostname;
            
            // 移除常见前缀
            name = name.replace(/^(www\.|app\.|api\.|admin\.)/, '');
            
            // 移除域名后缀
            name = name.replace(/\.(com|org|net|io|dev|local)$/, '');
            
            // 如果有端口，包含端口信息
            if (urlObj.port && urlObj.port !== '80' && urlObj.port !== '443') {
                name += `-${urlObj.port}`;
            }
            
            return name || 'web-project';
        } catch (error) {
            return 'invalid-url-project';
        }
    }

    /**
     * 从端口号推断项目名称
     */
    extractProjectFromPort(port) {
        const portMappings = {
            '3000': 'react-app',
            '8080': 'spring-boot',
            '8000': 'django-app',
            '4200': 'angular-app',
            '5173': 'vite-app',
            '8797': 'mcp-service'
        };
        
        return portMappings[port] || `port-${port}`;
    }

    /**
     * 项目ID标准化处理
     */
    sanitizeProjectId(id) {
        if (!id) return 'default';
        
        return id
            .toLowerCase()
            .replace(/[^a-z0-9\-_]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 50) || 'default';
    }

    /**
     * 获取项目类型显示名称
     */
    getProjectTypeDisplayName(type) {
        const typeNames = {
            'nodejs': 'Node.js',
            'python': 'Python',
            'rust': 'Rust',
            'java': 'Java',
            'go': 'Go',
            'php': 'PHP',
            'react': 'React',
            'vue': 'Vue',
            'angular': 'Angular',
            'repository': 'Git Repository',
            'local-dev': 'Local Development',
            'vscode-workspace': 'VS Code Workspace',
            'web-application': 'Web Application',
            'general': 'General Project'
        };
        
        return typeNames[type] || type || 'Unknown';
    }

    /**
     * 生成项目摘要信息
     */
    generateProjectSummary(projectInfo) {
        const parts = [];
        
        parts.push(`📁 ${projectInfo.name}`);
        parts.push(`🏷️ ${this.getProjectTypeDisplayName(projectInfo.type)}`);
        
        if (projectInfo.owner) {
            parts.push(`👤 ${projectInfo.owner}`);
        }
        
        if (projectInfo.platform) {
            parts.push(`🌐 ${projectInfo.platform}`);
        }
        
        if (projectInfo.port) {
            parts.push(`🔌 :${projectInfo.port}`);
        }
        
        return parts.join(' • ');
    }
}

// 全局导出
window.ProjectDetector = ProjectDetector;
