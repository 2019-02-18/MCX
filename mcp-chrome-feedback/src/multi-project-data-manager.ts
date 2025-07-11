import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { ProjectMetadata } from './project-utils.js';

/**
 * 单个项目的反馈数据
 */
export interface ProjectFeedbackData {
  id: string;
  timestamp: string;
  text: string;
  images?: Array<{
    id: string;
    name: string;
    data: string;
    size?: number;
  }>;
  metadata?: {
    url?: string;
    title?: string;
    userAgent?: string;
  };
  source: 'chrome-extension';
}

/**
 * 单个项目的对话记录
 */
export interface ProjectConversationRecord {
  id: string;
  timestamp: string;
  request: {
    summary: string;
    timestamp: string;
  };
  response: ProjectFeedbackData;
  type: 'mcp-interaction';
}

/**
 * 项目数据结构
 */
export interface ProjectData {
  projectInfo: ProjectMetadata;
  feedbackHistory: ProjectFeedbackData[];
  conversationHistory: ProjectConversationRecord[];
  lastAccessed: string;
  settings?: {
    maxHistorySize?: number;
    autoCleanup?: boolean;
  };
}

/**
 * 多项目数据存储结构
 */
export interface MultiProjectData {
  version: string;
  globalSettings: {
    maxProjects: number;
    defaultHistorySize: number;
    autoCleanupDays: number;
  };
  projects: {
    [projectId: string]: ProjectData;
  };
  metadata: {
    createdAt: string;
    lastUpdated: string;
    totalProjects: number;
  };
}

/**
 * 多项目数据管理器
 */
export class MultiProjectDataManager {
  private data: MultiProjectData;
  private readonly dataDirectory: string;
  private readonly dataFile: string;
  private readonly backupDirectory: string;
  
  constructor(dataDirectory: string = process.cwd()) {
    this.dataDirectory = dataDirectory;
    this.dataFile = join(dataDirectory, 'mcp-chrome-feedback-data.json');
    this.backupDirectory = join(dataDirectory, '.mcp-backups');
    
    // 初始化默认数据结构
    this.data = this.createDefaultData();
  }

  /**
   * 创建默认的数据结构
   */
  private createDefaultData(): MultiProjectData {
    return {
      version: '2.0.0',
      globalSettings: {
        maxProjects: 50,
        defaultHistorySize: 100,
        autoCleanupDays: 30
      },
      projects: {},
      metadata: {
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        totalProjects: 0
      }
    };
  }

  /**
   * 初始化数据管理器
   */
  async initialize(): Promise<void> {
    try {
      // 确保数据目录存在
      await this.ensureDirectoryExists(this.dataDirectory);
      await this.ensureDirectoryExists(this.backupDirectory);
      
      // 加载现有数据
      await this.loadData();
      
      console.log(`MultiProjectDataManager initialized with ${this.data.metadata.totalProjects} projects`);
    } catch (error) {
      console.error('Failed to initialize MultiProjectDataManager:', error);
      this.data = this.createDefaultData();
    }
  }

  /**
   * 确保目录存在
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // 目录可能已存在，忽略错误
    }
  }

  /**
   * 加载数据
   */
  private async loadData(): Promise<void> {
    try {
      const content = await fs.readFile(this.dataFile, 'utf-8');
      const loadedData = JSON.parse(content);
      
      // 验证数据版本
      if (loadedData.version !== '2.0.0') {
        console.log('Data version mismatch, attempting migration...');
        this.data = await this.migrateFromOldVersion(loadedData);
      } else {
        this.data = loadedData;
      }
      
      this.data.metadata.lastUpdated = new Date().toISOString();
      
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        console.log('No existing data file found, checking for legacy data...');
        await this.migrateLegacyData();
      } else {
        console.warn('Failed to load data:', error);
        this.data = this.createDefaultData();
      }
    }
  }

  /**
   * 保存数据
   */
  async saveData(): Promise<void> {
    try {
      this.data.metadata.lastUpdated = new Date().toISOString();
      this.data.metadata.totalProjects = Object.keys(this.data.projects).length;
      
      await this.createBackup();
      
      const content = JSON.stringify(this.data, null, 2);
      await fs.writeFile(this.dataFile, content, 'utf-8');
      
    } catch (error) {
      console.error('Failed to save data:', error);
      throw error;
    }
  }

  /**
   * 创建数据备份
   */
  private async createBackup(): Promise<void> {
    try {
      if (await this.fileExists(this.dataFile)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = join(this.backupDirectory, `backup-${timestamp}.json`);
        const content = await fs.readFile(this.dataFile, 'utf-8');
        await fs.writeFile(backupFile, content, 'utf-8');
      }
    } catch (error) {
      console.warn('Failed to create backup:', error);
    }
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 迁移旧版本数据
   */
  private async migrateFromOldVersion(oldData: any): Promise<MultiProjectData> {
    console.log('Migrating data from old version...');
    const newData = this.createDefaultData();
    if (oldData.projects) {
      newData.projects = oldData.projects;
    }
    return newData;
  }

  /**
   * 迁移旧格式的数据（单项目模式）
   */
  async migrateLegacyData(): Promise<void> {
    try {
      const files = await fs.readdir(this.dataDirectory);
      const legacyFiles = files.filter(f => f.startsWith('feedback-history-') && f.endsWith('.json'));
      
      for (const file of legacyFiles) {
        await this.migrateSingleLegacyFile(join(this.dataDirectory, file));
      }
      
      if (legacyFiles.length > 0) {
        await this.saveData();
        console.log(`Migrated ${legacyFiles.length} legacy project files`);
      }
    } catch (error) {
      console.warn('Failed to migrate legacy data:', error);
    }
  }

  /**
   * 迁移单个旧格式文件
   */
  private async migrateSingleLegacyFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const oldData = JSON.parse(content);

      const fileName = filePath.split(/[/\\]/).pop() || '';
      const projectMatch = fileName.match(/feedback-history-(.+)\.json/);
      const projectId = projectMatch ? projectMatch[1] : 'migrated-project';

      const projectData: ProjectData = {
        projectInfo: {
          id: projectId,
          name: projectId,
          type: 'general',
          directory: this.dataDirectory,
          detectedAt: new Date().toISOString()
        },
        feedbackHistory: Array.isArray(oldData) ? oldData : [],
        conversationHistory: [],
        lastAccessed: new Date().toISOString()
      };

      this.data.projects[projectId] = projectData;
      console.log(`Migrated project ${projectId}`);

    } catch (error) {
      console.warn(`Failed to migrate file ${filePath}:`, error);
    }
  }

  /**
   * 添加或更新项目
   */
  async addOrUpdateProject(projectInfo: ProjectMetadata): Promise<void> {
    const projectId = projectInfo.id;
    
    if (!this.data.projects[projectId]) {
      this.data.projects[projectId] = {
        projectInfo,
        feedbackHistory: [],
        conversationHistory: [],
        lastAccessed: new Date().toISOString(),
        settings: {
          maxHistorySize: this.data.globalSettings.defaultHistorySize,
          autoCleanup: true
        }
      };
      console.log(`Added new project: ${projectId}`);
    } else {
      this.data.projects[projectId].projectInfo = projectInfo;
      this.data.projects[projectId].lastAccessed = new Date().toISOString();
    }
    
    await this.saveData();
  }

  /**
   * 获取项目数据
   */
  getProjectData(projectId: string): ProjectData | null {
    return this.data.projects[projectId] || null;
  }

  /**
   * 获取所有项目
   */
  getAllProjects(): { [projectId: string]: ProjectData } {
    return this.data.projects;
  }

  /**
   * 添加反馈到项目
   */
  async addFeedbackToProject(projectId: string, feedback: ProjectFeedbackData): Promise<void> {
    if (!this.data.projects[projectId]) {
      throw new Error(`Project ${projectId} not found`);
    }

    const project = this.data.projects[projectId];
    project.feedbackHistory.push(feedback);
    project.lastAccessed = new Date().toISOString();

    const maxSize = project.settings?.maxHistorySize || this.data.globalSettings.defaultHistorySize;
    if (project.feedbackHistory.length > maxSize) {
      project.feedbackHistory = project.feedbackHistory.slice(-maxSize);
    }

    await this.saveData();
  }

  /**
   * 获取项目反馈历史
   */
  getProjectFeedbackHistory(projectId: string, limit?: number): ProjectFeedbackData[] {
    const project = this.data.projects[projectId];
    if (!project) return [];

    const history = project.feedbackHistory;
    return limit ? history.slice(-limit) : history;
  }

  /**
   * 清空项目历史
   */
  async clearProjectHistory(projectId: string): Promise<void> {
    const project = this.data.projects[projectId];
    if (!project) return;

    project.feedbackHistory = [];
    project.conversationHistory = [];
    project.lastAccessed = new Date().toISOString();

    await this.saveData();
  }

  /**
   * 删除项目
   */
  async deleteProject(projectId: string): Promise<void> {
    delete this.data.projects[projectId];
    await this.saveData();
  }
}
