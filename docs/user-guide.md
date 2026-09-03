# MultiProvider LLM Toolbox 阶段二用户使用手册

## 1. 当前可用功能

阶段二版本提供一个本地优先的网页大模型工具箱，当前包含：

- OpenAI、Anthropic、DeepSeek、GLM 的 Provider 和模型选择；
- 默认 Mock Provider 对话，以及服务端 live Adapter 运行模式；
- SSE 流式聊天、停止生成、错误提示和重试；
- `temperature`、`max_tokens` 参数设置；
- Assistant 消息的安全 Markdown、代码块和基础表格展示；
- 最多 5 个浏览器本地会话；
- 服务端内置只读提示词，以及浏览器本地自定义提示词。

当前版本不包含用户注册、登录、多租户、云同步、数据库、插件、MCP、图片或语音功能。Docker 交付和完整的公开部署安全加固属于后续阶段。

## 2. 运行环境

建议环境：

- Node.js 24；项目 CI 当前使用 Node.js 24；
- npm（随 Node.js 安装）；
- 支持 `fetch`、ReadableStream 和 localStorage 的现代浏览器；
- Windows、macOS 或 Linux 均可运行。

默认开发地址为 `http://localhost:3000`。如果 3000 端口已被占用，Next.js 会提示或选择其他可用端口，请以终端输出为准。

## 3. 安装

进入项目根目录后执行：

```powershell
npm ci
```

从示例创建本地环境变量文件。PowerShell 示例：

```powershell
Copy-Item .env.example .env.local
```

`.env.local` 只能保存在本机，不得提交到 Git。示例文件中的 API Key 均为空，不包含真实密钥。

## 4. Mock 模式启动与使用

Mock 是默认运行模式，不需要任何 Provider API Key。确认 `.env.local` 包含：

```dotenv
LLM_MODE=mock
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
DEEPSEEK_API_KEY=
GLM_API_KEY=
```

启动开发服务器：

```powershell
npm run dev
```

打开终端显示的地址，通常为 `http://localhost:3000`。选择任意 Provider 和对应模型后发送消息，Mock Provider 会返回固定的模拟内容，用于验证页面、流式事件、会话和错误处理，不会访问真实上游接口。

生产方式的本地启动流程：

```powershell
npm run build
npm start
```

## 5. Provider、模型和生成参数

页面启动后会从 `GET /api/providers` 加载当前服务端目录。当前配置示例为：

| Provider | 当前模型示例 | live Adapter |
|---|---|---|
| OpenAI | GPT-4o mini（`gpt-4o-mini`） | OpenAICompatibleAdapter |
| Anthropic | Claude 3.5 Sonnet（`claude-3-5-sonnet`） | AnthropicAdapter |
| DeepSeek | DeepSeek Chat（`deepseek-chat`） | OpenAICompatibleAdapter |
| GLM | GLM-4-Flash（`glm-4-flash`） | OpenAICompatibleAdapter |

切换 Provider 时，模型会自动切换到该 Provider 当前目录中的第一个模型。Provider 和模型目录由服务端控制，浏览器不能提交任意 `baseUrl`。

生成参数：

- `temperature`：默认 `0.2`，允许 `0–2`；数值越低通常越稳定，越高通常越发散；
- `max_tokens`：默认 `256`，允许整数 `1–8192`，控制允许生成的最大 token 数；
- 参数超出范围时页面会显示错误并禁用发送，服务端还会再次校验。

## 6. 聊天操作

### 发送

在消息输入框中输入内容并选择“发送”。页面使用 `POST /api/chat`，固定发送 `stream: true`，并携带当前 Provider、模型、消息、`temperature` 和 `max_tokens`。

### 停止生成

生成期间选择“停止生成”，页面会通过 AbortSignal 取消当前请求。已经显示的部分响应可能保留在当前会话中；停止后可选择重试。

### 重试

请求失败或手动停止后会出现“重试”按钮。重试使用失败请求当时的 Provider、模型、消息和生成参数，不需要重新输入原问题。

### Markdown

Assistant 消息支持代码块、基础表格、标题、列表、粗体和行内代码。原始 HTML、脚本和事件属性不会执行，只会作为普通文本显示；页面未使用 `dangerouslySetInnerHTML`。

## 7. 本地会话管理

- “新建会话”创建一个空白本地会话；
- 选择会话条目可切换会话；
- “删除”移除对应会话；删除最后一个会话后页面会自动创建空白会话；
- 每个会话保存消息内容、Provider、模型和更新时间；
- 最多保留 5 个会话，超过上限时只保留最近更新的 5 个。

聊天记录只保存在当前浏览器的 localStorage 中，不会保存到服务端、数据库或云端。清理站点数据、更换浏览器、使用其他设备或某些隐私浏览模式会导致记录不可用或被删除。不要把浏览器本地存储视为长期备份。

## 8. 提示词

页面加载时会从 `GET /api/prompts` 读取少量服务端内置模板，目前包括总结、中英翻译和代码解释。

- 提示词选择器按“内置提示词（只读）”和“本地自定义提示词”分组；
- 选择提示词只会把内容插入消息输入框，不会自动发送；
- 内置提示词不能修改或删除；
- 可在“管理本地自定义提示词”区域保存、更新、选择、插入和删除自定义提示词；
- 自定义提示词只保存在当前浏览器 localStorage，不会同步到服务端。

提示词被插入输入框后，只有用户主动选择“发送”，输入框中的文本才会作为普通聊天消息提交。

## 9. Live 模式

Live 模式会调用真实 Provider Adapter。只在受控的服务端环境中配置密钥，不要在浏览器、URL、日志或 Git 中保存密钥。

将 `.env.local` 中的模式改为：

```dotenv
LLM_MODE=live
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
DEEPSEEK_API_KEY=
GLM_API_KEY=
```

只需要为计划使用的 Provider 填写对应的真实值，其余密钥可以保持为空。修改环境变量后应重启应用。

| Provider | 服务端环境变量 |
|---|---|
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| GLM | `GLM_API_KEY` |

当前阶段二代码使用 `src/providers/config.ts` 中的固定 HTTPS Provider 地址白名单。客户端不能传入 API Key 或 `baseUrl`；`.env.example` 中的 `*_ALLOWED_BASE_URL` 行目前只是部署配置示例，当前运行时代码不会用它们覆盖固定地址。

`ACCESS_CODE` 是后续公开部署边界的一部分。当前网页没有访问码输入或请求头配置界面；使用本地网页时应保持 `ACCESS_CODE` 为空。不要把当前阶段二版本直接暴露到公网。

## 10. 常见错误与排查

| 现象或错误码 | 常见原因 | 排查方法 |
|---|---|---|
| Provider 或内置提示词一直无法加载 | 开发服务器未启动、地址错误，或设置了当前页面无法提交的 `ACCESS_CODE` | 查看终端错误；确认访问正确端口；本地网页使用时保持 `ACCESS_CODE` 为空 |
| `INVALID_REQUEST` | 消息或生成参数不符合限制 | 确认消息非空；`temperature` 为 0–2；`max_tokens` 为 1–8192 的整数 |
| `PROVIDER_NOT_ALLOWED` / `MODEL_NOT_ALLOWED` | Provider 或模型不在服务端目录 | 刷新页面并从下拉列表重新选择，不要手工构造未知值 |
| `PROVIDER_NOT_CONFIGURED` | live 模式缺少当前 Provider 的 API Key | 在服务端 `.env.local` 配置对应密钥并重启应用，不要把密钥发到浏览器 |
| `UPSTREAM_AUTH_ERROR` | 上游拒绝密钥 | 检查密钥是否有效、是否已撤销以及账户权限；不要在日志中打印密钥 |
| `UPSTREAM_BAD_REQUEST` | 上游拒绝模型或请求结构 | 检查当前模型配置是否仍被 Provider 支持，并查看不含敏感信息的服务端错误分类 |
| `UPSTREAM_UNAVAILABLE` | 网络故障、上游 5xx 或服务不可用 | 检查服务端网络和 Provider 状态，稍后重试 |
| `UPSTREAM_TIMEOUT` | 上游超过服务端超时 | 降低请求复杂度或稍后重试；确认服务端网络稳定 |
| “流式响应提前结束” | SSE 连接被代理、网络或上游提前关闭 | 检查反向代理是否缓冲/截断 SSE，刷新后重试 |
| 本地会话或提示词无法保存 | localStorage 被禁用、存储空间不足或隐私模式限制 | 允许当前站点使用本地存储、清理不需要的站点数据，或退出受限隐私模式 |
| `npm ci` 失败 | Node/npm 版本、网络或锁文件环境异常 | 使用 Node.js 24；确认 npm 可访问已配置的软件源；不要手工修改 `package-lock.json` |
| 3000 端口不可用 | 已有进程占用 | 关闭占用进程，或按 Next.js 终端提示使用其他端口 |

排查时不要复制或上传 `.env.local`、API Key、完整请求头或含敏感内容的日志。

## 11. 开发检查

提交变更前运行：

```powershell
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

自动化测试使用 Mock Provider 或 mock fetch，不需要也不应使用真实 API Key。
