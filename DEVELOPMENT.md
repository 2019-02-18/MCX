# 🛠️ 开发指南

## 📋 项目结构

```
MCX/
├── mcp-chrome-feedback/     # MCP服务端
│   ├── src/                 # TypeScript源码
│   ├── build/               # 编译输出
│   └── package.json         # npm包配置
├── chrome-extension/        # Chrome浏览器扩展
│   ├── manifest.json        # 扩展配置
│   ├── background.js        # 后台脚本
│   ├── content.js          # 内容脚本
│   └── sidepanel.html      # 侧边面板
└── README.md               # 项目说明
```

## 🚀 快速开始

### 1. 环境准备

```bash
# 克隆项目
git clone https://github.com/2019-02-18/MCX.git
cd MCX

# 安装依赖
npm run install:all
```

### 2. 开发模式

```bash
# 启动MCP服务开发模式
npm run dev

# 构建项目
npm run build

# 清理构建文件
npm run clean
```

### 3. Chrome扩展开发

1. 打开Chrome浏览器
2. 访问 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `chrome-extension` 文件夹

## 🔧 技术栈

### MCP服务
- **语言**: TypeScript
- **运行时**: Node.js 18+
- **协议**: Model Context Protocol (MCP)
- **通信**: WebSocket
- **构建**: TypeScript Compiler

### Chrome扩展
- **版本**: Manifest V3
- **语言**: JavaScript
- **API**: Chrome Extensions API
- **UI**: HTML + CSS
- **通信**: WebSocket + Chrome Runtime API

## 📦 构建流程

### MCP服务构建
```bash
cd mcp-chrome-feedback
npm run build
```

### 版本同步
```bash
# 同步所有组件版本号
npm run version:sync
```

## 🧪 测试

### MCP服务测试
```bash
cd mcp-chrome-feedback
npm test
```

### Chrome扩展测试
1. 在Chrome中加载扩展
2. 打开开发者工具
3. 检查控制台输出
4. 测试与MCP服务的连接

## 🐛 调试

### MCP服务调试
- 查看控制台输出
- 检查WebSocket连接状态
- 使用Chrome DevTools的Network面板

### Chrome扩展调试
- 右键扩展图标 → "检查弹出内容"
- 在扩展管理页面点击"错误"查看错误日志
- 使用`console.log()`输出调试信息

## 📝 代码规范

### TypeScript
- 使用严格模式
- 遵循ESLint规则
- 添加类型注解
- 编写JSDoc注释

### JavaScript
- 使用ES6+语法
- 遵循Chrome扩展最佳实践
- 添加错误处理
- 保持代码简洁

## 🔗 相关资源

- [MCP协议文档](https://modelcontextprotocol.io/)
- [Chrome扩展开发文档](https://developer.chrome.com/docs/extensions/)
- [TypeScript文档](https://www.typescriptlang.org/docs/)
- [Node.js文档](https://nodejs.org/docs/)

## 🤝 贡献指南

1. Fork项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建Pull Request

## 📄 许可证

MIT License - 详见 [LICENSE](./LICENSE) 文件