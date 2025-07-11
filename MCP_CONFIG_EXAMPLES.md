# MCP配置示例

本文档提供了在不同IDE中配置 `mcp-chrome-feedback` 的详细示例。

## 📋 前提条件

1. 已安装npm包：
   ```bash
   npm install -g mcp-chrome-feedback
   ```

2. 已安装Chrome扩展（从项目的 `chrome-extension` 文件夹）

---

## 🎯 Cursor IDE 配置

### 方法1: 使用npx (推荐)

编辑Cursor的MCP配置文件：

**位置**: `~/.cursor/mcp_servers.json` (macOS/Linux) 或 `%APPDATA%\Cursor\mcp_servers.json` (Windows)

```json
{
  "mcpServers": {
    "chrome-feedback": {
      "command": "npx",
      "args": ["mcp-chrome-feedback"]
    }
  }
}
```

### 方法2: 全局安装后使用

先安装：
```bash
npm install -g mcp-chrome-feedback
```

然后配置：
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

### 方法3: 通过设置界面

1. 打开Cursor IDE
2. 按 `Cmd/Ctrl + ,` 进入设置
3. 搜索 "MCP" 或导航到 "Extensions" > "Model Context Protocol"
4. 点击 "Add Server" 添加新服务器：
   - **Server Name**: `chrome-feedback`
   - **Command**: `npx`
   - **Arguments**: `mcp-chrome-feedback`

### 方法3: 开发模式配置

如果从源码运行：

```json
{
  "mcpServers": {
    "chrome-feedback": {
      "command": "node",
      "args": ["/absolute/path/to/MCX/mcp-chrome-feedback/build/index.js"]
    }
  }
}
```

---

## 🚀 Trae AI 配置

### 方法1: 使用npx (推荐)

编辑Trae的MCP配置文件：

**位置**: `~/.trae/mcp_config.json` (macOS/Linux) 或 `%APPDATA%\Trae\mcp_config.json` (Windows)

```json
{
  "servers": {
    "chrome-feedback": {
      "command": "npx",
      "args": ["mcp-chrome-feedback"],
      "env": {
        "MCP_CHROME_PORT": "8797"
      }
    }
  }
}
```

### 方法2: 全局安装后使用

先安装：
```bash
npm install -g mcp-chrome-feedback
```

然后配置：
```json
{
  "servers": {
    "chrome-feedback": {
      "command": "mcp-chrome-feedback",
      "args": [],
      "env": {
        "MCP_CHROME_PORT": "8797"
      }
    }
  }
}
```

### 方法3: 通过设置界面

1. 打开Trae AI
2. 进入 "Settings" > "MCP Servers"
3. 点击 "Add New Server"
4. 填写配置：
   - **Name**: `chrome-feedback`
   - **Command**: `npx`
   - **Args**: `mcp-chrome-feedback`
   - **Working Directory**: (可选)

### 方法4: 项目级配置

在项目根目录创建 `.trae/mcp.json`：

```json
{
  "servers": {
    "chrome-feedback": {
      "command": "npx",
      "args": ["mcp-chrome-feedback"]
    }
  }
}
```

---

## 🔧 高级配置选项

### 自定义端口

```json
{
  "mcpServers": {
    "chrome-feedback": {
      "command": "npx",
      "args": ["mcp-chrome-feedback"],
      "env": {
        "MCP_CHROME_PORT": "9999"
      }
    }
  }
}
```

### 调试模式

```json
{
  "mcpServers": {
    "chrome-feedback": {
      "command": "npx",
      "args": ["mcp-chrome-feedback", "--debug"],
      "env": {
        "DEBUG": "true",
        "MCP_CHROME_PORT": "8797"
      }
    }
  }
}
```

### 工作目录指定

```json
{
  "mcpServers": {
    "chrome-feedback": {
      "command": "npx",
      "args": ["mcp-chrome-feedback"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

---

## 🧪 验证配置

### 1. 检查MCP服务状态

在IDE中运行以下命令验证配置：

```
请使用get_extension_status工具检查Chrome扩展连接状态
```

### 2. 测试反馈功能

```
请使用interactive_feedback工具测试反馈收集功能
```

### 3. 查看可用工具

配置成功后，应该可以看到以下MCP工具：
- `chrome_interactive_feedback`
- `chrome_get_feedback_history`
- `chrome_clear_feedback_history`
- `chrome_get_extension_status`
- `chrome_navigate_to_url`
- `chrome_click_element`
- `chrome_fill_input`
- `chrome_execute_script`
- `chrome_get_page_info`
- `chrome_take_screenshot`

---

## 🐛 故障排除

### 配置文件位置

如果不确定配置文件位置，可以在IDE中查看：

**Cursor**:
- macOS: `~/Library/Application Support/Cursor/User/mcp_servers.json`
- Windows: `%APPDATA%\Cursor\User\mcp_servers.json`
- Linux: `~/.config/Cursor/User/mcp_servers.json`

**Trae**:
- macOS: `~/Library/Application Support/Trae/mcp_config.json`
- Windows: `%APPDATA%\Trae\mcp_config.json`
- Linux: `~/.config/Trae/mcp_config.json`

### 常见问题

1. **命令未找到**: 确保已全局安装 `mcp-chrome-feedback`
2. **端口冲突**: 修改 `MCP_CHROME_PORT` 环境变量
3. **权限问题**: 确保有执行npm全局包的权限
4. **Chrome扩展未连接**: 检查扩展是否已安装并启用

### 重启服务

配置更改后，需要重启IDE或重新加载MCP服务：

1. 重启IDE
2. 或在IDE中重新加载MCP配置
3. 确保Chrome扩展已连接

---

## 📚 使用示例

配置完成后，可以在IDE中这样使用：

```
# 收集用户反馈
请使用interactive_feedback工具，summary设置为"我已经完成了登录功能的实现，请测试并提供反馈"

# 查看反馈历史
请显示最近5条反馈记录

# 检查扩展状态
请检查Chrome扩展的连接状态
```

---

*配置完成后，记得重启IDE以使配置生效！*