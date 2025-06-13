# MCP Chrome Feedback

一个专为Cursor设计的MCP工具，提供与Chrome扩展交互的反馈收集功能，类似于mcp-feedback-enhanced。

## 功能特性

- 🤖 **交互式反馈收集**: 通过Chrome扩展界面收集用户反馈
- 📝 **文本和图片支持**: 支持文本反馈和图片附件
- 🔄 **实时通信**: WebSocket实时通信机制
- 📊 **反馈历史**: 自动保存和管理反馈历史
- 🎯 **元素捕获**: 支持页面元素捕获和截图
- ⚡ **即插即用**: 标准MCP协议，可直接配置到Cursor

## 安装

### 1. 安装MCP工具

```bash
npm install -g mcp-chrome-feedback
```

或者从源码构建：

```bash
git clone <repository-url>
cd mcp-chrome-feedback
npm install
npm run build
```

### 2. 安装Chrome扩展

1. 打开Chrome浏览器
2. 进入 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目中的 `chrome-extension` 文件夹

## 配置到Cursor

### 方法1: 通过Cursor设置界面

1. 打开Cursor
2. 进入设置 (Cmd/Ctrl + ,)
3. 搜索 "MCP" 或进入 "Extensions" > "Model Context Protocol"
4. 添加新的MCP服务器：
   - **名称**: `chrome-feedback`
   - **命令**: `mcp-chrome-feedback`
   - **参数**: (留空)

### 方法2: 手动编辑配置文件

编辑Cursor的MCP配置文件 (通常在 `~/.cursor/mcp_servers.json`):

```json
{
  "mcpServers": {
    "chrome-feedback": {
      "command": "mcp-chrome-feedback",
      "args": []
    }
  }
}
```

### 方法3: 使用本地路径 (开发模式)

如果从源码运行：

```json
{
  "mcpServers": {
    "chrome-feedback": {
      "command": "node",
      "args": ["/path/to/mcp-chrome-feedback/build/index.js"]
    }
  }
}
```

## 使用方法

### 1. 启动Chrome扩展

1. 确保Chrome扩展已安装并启用
2. 打开扩展的侧边栏
3. 点击"连接"按钮连接到MCP服务

### 2. 在Cursor中使用

配置完成后，在Cursor中可以使用以下工具：

#### `interactive_feedback`
请求用户通过Chrome扩展提供反馈

```
请使用interactive_feedback工具收集用户对当前代码的反馈
```

参数：
- `summary`: AI工作摘要 (默认: "我已完成了您请求的任务。")
- `timeout`: 超时时间(秒) (默认: 600)
- `project_directory`: 项目目录 (默认: ".")

#### `get_feedback_history`
获取反馈历史记录

```
请显示最近的反馈历史
```

参数：
- `limit`: 返回记录数量 (默认: 10)

#### `get_extension_status`
检查Chrome扩展连接状态

```
请检查Chrome扩展的连接状态
```

#### `clear_feedback_history`
清空反馈历史

```
请清空所有反馈历史记录
```

## Chrome扩展功能

### 反馈收集
- 文本反馈输入
- 图片拖拽上传
- 图片粘贴支持
- 页面元素捕获
- 全页面截图

### 元素检查
- 点击页面元素进行捕获
- 自动截图和元素信息提取
- 支持复杂页面结构

### 实时通信
- WebSocket连接状态显示
- 自动重连机制
- 连接状态指示器

## 工作流程

1. **AI请求反馈**: 在Cursor中调用 `interactive_feedback` 工具
2. **扩展显示界面**: Chrome扩展自动显示反馈收集界面
3. **用户提供反馈**: 用户输入文本、上传图片或捕获页面元素
4. **反馈传回AI**: 反馈数据通过MCP协议传回Cursor
5. **AI处理反馈**: AI根据反馈调整后续行为

## 配置选项

### 环境变量

- `MCP_CHROME_PORT`: Chrome扩展通信端口 (默认: 8797)

### Chrome扩展设置

在扩展的设置中可以配置：
- 服务器地址
- 自动连接
- 反馈历史限制

## 故障排除

### 连接问题

1. **检查扩展状态**:
   ```
   请使用get_extension_status工具检查连接状态
   ```

2. **确认端口可用**: 默认端口8797是否被占用

3. **重启服务**: 重启Cursor或重新加载扩展

### 反馈收集问题

1. **超时设置**: 增加timeout参数值
2. **网络连接**: 检查本地网络连接
3. **扩展权限**: 确认扩展有必要的权限

## 开发

### 构建项目

```bash
npm run build
```

### 开发模式

```bash
npm run dev
```

### 测试

```bash
npm test
```

## 与mcp-feedback-enhanced的对比

| 功能 | mcp-chrome-feedback | mcp-feedback-enhanced |
|------|-------------------|---------------------|
| 交互界面 | Chrome扩展 | 系统GUI/Web界面 |
| 图片支持 | ✅ | ✅ |
| 元素捕获 | ✅ | ❌ |
| 页面截图 | ✅ | ❌ |
| 跨平台 | ✅ (需Chrome) | ✅ |
| 配置复杂度 | 中等 | 简单 |
| 功能丰富度 | 高 | 中等 |

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！

## 更新日志

### v1.0.0
- 初始版本
- 基础反馈收集功能
- Chrome扩展集成
- MCP协议支持 