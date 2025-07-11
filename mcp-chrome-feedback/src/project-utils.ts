import { promises as fs } from 'fs';
import { join, dirname, basename } from 'path';

/**
 * 项目类型定义
 */
export type ProjectType = 'nodejs' | 'python' | 'rust' | 'java' | 'go' | 'php' | 'general';

/**
 * 项目检测器配置
 */
export interface ProjectDetector {
  file: string;           // 检测文件名
  key?: string;          // JSON配置文件中的项目名称键
  fallback?: 'dirname';  // 回退策略
  type: ProjectType;     // 项目类型
}

/**
 * 项目元数据
 */
export interface ProjectMetadata {
  id: string;                    // 项目唯一标识符
  name: string;                  // 项目显示名称
  type: ProjectType;            // 项目类型
  directory: string;            // 项目目录路径
  configFile?: string;          // 配置文件路径
  version?: string;             // 项目版本
  description?: string;         // 项目描述
  detectedAt: string;          // 检测时间
}

/**
 * 项目检测器数组
 * 按优先级排序，优先检测更具体的项目类型
 */
const PROJECT_DETECTORS: ProjectDetector[] = [
  { file: 'package.json', key: 'name', type: 'nodejs' },
  { file: 'Cargo.toml', key: 'package.name', type: 'rust' },
  { file: 'pom.xml', key: 'artifactId', type: 'java' },
  { file: 'go.mod', key: 'module', type: 'go' },
  { file: 'composer.json', key: 'name', type: 'php' },
  { file: 'requirements.txt', fallback: 'dirname', type: 'python' },
  { file: 'setup.py', fallback: 'dirname', type: 'python' },
  { file: 'pyproject.toml', key: 'project.name', type: 'python' },
];

/**
 * 项目名称标准化
 * 将项目名称转换为有效的标识符
 */
export function normalizeProjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, '-')  // 将非字母数字字符替换为连字符
    .replace(/-+/g, '-')             // 合并多个连字符
    .replace(/^-|-$/g, '');          // 移除首尾连字符
}

/**
 * 从配置文件中提取项目名称
 */
async function extractNameFromConfigFile(configPath: string, keyPath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    
    // 处理不同类型的配置文件
    if (configPath.endsWith('.json')) {
      const config = JSON.parse(content);
      return getNestedValue(config, keyPath);
    } else if (configPath.endsWith('.toml')) {
      // 简单的TOML解析（仅支持基本的key.subkey格式）
      const lines = content.split('\n');
      
      if (keyPath === 'package.name') {
        // Cargo.toml的特殊处理
        let inPackageSection = false;
        for (const line of lines) {
          if (line.trim() === '[package]') {
            inPackageSection = true;
            continue;
          }
          if (line.trim().startsWith('[') && line.trim() !== '[package]') {
            inPackageSection = false;
            continue;
          }
          if (inPackageSection && line.includes('name =')) {
            const match = line.match(/name\s*=\s*"([^"]+)"/);
            if (match) return match[1];
          }
        }
      } else if (keyPath === 'project.name') {
        // pyproject.toml的特殊处理
        let inProjectSection = false;
        for (const line of lines) {
          if (line.trim() === '[project]') {
            inProjectSection = true;
            continue;
          }
          if (line.trim().startsWith('[') && line.trim() !== '[project]') {
            inProjectSection = false;
            continue;
          }
          if (inProjectSection && line.includes('name =')) {
            const match = line.match(/name\s*=\s*"([^"]+)"/);
            if (match) return match[1];
          }
        }
      }
    } else if (configPath.endsWith('.xml')) {
      // 简单的XML解析（仅用于Maven pom.xml）
      const artifactIdMatch = content.match(/<artifactId>(.*?)<\/artifactId>/);
      if (artifactIdMatch) return artifactIdMatch[1];
    } else if (configPath.endsWith('.mod')) {
      // Go模块解析
      const moduleMatch = content.match(/module\s+(.+)/);
      if (moduleMatch) {
        // 提取模块路径的最后一部分作为项目名
        const modulePath = moduleMatch[1].trim();
        return modulePath.split('/').pop() || modulePath;
      }
    }
    
    return null;
  } catch (error) {
    console.warn(`Failed to parse config file ${configPath}:`, error);
    return null;
  }
}

/**
 * 获取嵌套对象的值
 */
function getNestedValue(obj: any, keyPath: string): string | null {
  const keys = keyPath.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return null;
    }
  }
  
  return typeof current === 'string' ? current : null;
}

/**
 * 检测项目类型和名称
 */
export async function detectProject(directory: string): Promise<ProjectMetadata | null> {
  try {
    // 确保目录存在
    const stats = await fs.stat(directory);
    if (!stats.isDirectory()) {
      return null;
    }

    // 遍历所有检测器，寻找匹配的项目类型
    for (const detector of PROJECT_DETECTORS) {
      const configPath = join(directory, detector.file);
      
      try {
        await fs.access(configPath);
        
        let projectName: string | null = null;
        let version: string | undefined;
        let description: string | undefined;
        
        // 尝试从配置文件中提取项目信息
        if (detector.key) {
          projectName = await extractNameFromConfigFile(configPath, detector.key);
          
          // 如果是package.json，尝试获取更多信息
          if (detector.file === 'package.json') {
            try {
              const packageContent = await fs.readFile(configPath, 'utf-8');
              const packageJson = JSON.parse(packageContent);
              version = packageJson.version;
              description = packageJson.description;
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
        
        // 如果没有从配置文件中获取到名称，使用回退策略
        if (!projectName && detector.fallback === 'dirname') {
          projectName = basename(directory);
        }
        
        // 如果仍然没有项目名称，跳过此检测器
        if (!projectName) {
          continue;
        }
        
        // 标准化项目名称作为ID
        const projectId = normalizeProjectName(projectName);
        
        return {
          id: projectId,
          name: projectName,
          type: detector.type,
          directory,
          configFile: configPath,
          version,
          description,
          detectedAt: new Date().toISOString()
        };
        
      } catch (error) {
        // 配置文件不存在或无法访问，继续下一个检测器
        continue;
      }
    }
    
    // 如果没有检测到任何已知类型，创建通用项目
    const dirName = basename(directory);
    const projectId = normalizeProjectName(dirName);
    
    return {
      id: projectId,
      name: dirName,
      type: 'general',
      directory,
      detectedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.warn(`Failed to detect project in ${directory}:`, error);
    return null;
  }
}

/**
 * 生成默认项目ID
 * 当无法检测到项目信息时使用
 */
export function generateDefaultProjectId(directory: string = process.cwd()): string {
  const dirName = basename(directory);
  return normalizeProjectName(dirName) || 'default-project';
}

/**
 * 验证项目ID的有效性
 */
export function isValidProjectId(projectId: string): boolean {
  return /^[a-z0-9][a-z0-9\-_]*[a-z0-9]$|^[a-z0-9]$/.test(projectId);
}

/**
 * 获取项目标识符
 * 这是主要的公共API，用于获取给定目录的项目ID
 */
export async function getProjectId(directory: string = process.cwd()): Promise<string> {
  try {
    const projectMetadata = await detectProject(directory);
    if (projectMetadata && isValidProjectId(projectMetadata.id)) {
      return projectMetadata.id;
    }
  } catch (error) {
    console.warn(`Error detecting project ID for ${directory}:`, error);
  }
  
  // 降级到默认ID生成
  return generateDefaultProjectId(directory);
}

/**
 * 获取完整项目信息
 */
export async function getProjectInfo(directory: string = process.cwd()): Promise<ProjectMetadata> {
  try {
    const projectMetadata = await detectProject(directory);
    if (projectMetadata) {
      return projectMetadata;
    }
  } catch (error) {
    console.warn(`Error detecting project info for ${directory}:`, error);
  }
  
  // 降级到默认项目信息
  const dirName = basename(directory);
  const projectId = generateDefaultProjectId(directory);
  
  return {
    id: projectId,
    name: dirName,
    type: 'general',
    directory,
    detectedAt: new Date().toISOString()
  };
} 