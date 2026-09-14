# MultiProvider LLM Toolbox 用户使用手册

## 1. 当前可用功能

当前版本提供一个本地优先的网页大模型工具箱，包含：

- OpenAI、Anthropic、DeepSeek、GLM 的 Provider 和模型选择；
- 默认 Mock Provider 对话，以及服务端 live Adapter 运行模式；
- SSE 流式聊天、停止生成、错误提示和重试；
- `temperature`、`max_tokens` 参数设置；
- Assistant 消息的安全 Markdown、代码块和基础表格展示；
- 最多 5 个浏览器本地会话；
- 服务端内置只读提示词，以及浏览器本地自定义提示词；
- TXT、Markdown、JSON 本地文档导入；
- 回复复制、会话导出 Markdown；
- Mock/Live 运行状态和 Provider 配置状态提示；
- Enter 发送、Shift + Enter 换行。

当前版本不包含用户注册、登录、多租户、云同步、数据库、插件、MCP、图片或语音功能。Docker 镜像适用于本地或受控环境；公开部署仍需由运维配置 HTTPS、可信访问控制、限流和受控网络出口。

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

Windows PowerShell 如果因执行策略阻止 `npm.ps1`，可以将上述命令中的 `npm` 改为 `npm.cmd`，无需修改永久执行策略。

Docker 的构建、Mock/Live 启动、健康检查、升级和回滚请参阅 `docs/deployment-guide.md`。

## 5. Provider、模型和生成参数

页面启动后会从 `GET /api/providers` 加载当前服务端目录。当前配置示例为：

| Provider | 当前模型示例 | live Adapter |
|---|---|---|
| OpenAI | GPT-6 Astra、GPT-5.6 Sol/Terra/Luna、GPT-5 系列 | OpenAICompatibleAdapter |
| Anthropic | Claude 4.5、Claude 4.1、Claude 4、Claude 3.5 系列 | AnthropicAdapter |
| DeepSeek | DeepSeek V4 Pro/V4 Flash、Chat、Reasoner | OpenAICompatibleAdapter |
| GLM | GLM-5.3/5.2/5、GLM-4.7 Flash、GLM-4 Flash | OpenAICompatibleAdapter |

切换 Provider 时，模型会自动切换到该 Provider 当前目录中的第一个模型。Provider 和模型目录由服务端控制，浏览器不能提交任意 `baseUrl`。

模型是否能被当前账号调用，最终由 Provider 返回结果和账号权限决定；目录中出现模型不代表所有 API Key 都已获得访问权限。

生成参数：

- `temperature`：默认 `0.2`，允许 `0–2`；数值越低通常越稳定，越高通常越发散；
- `max_tokens`：默认 `4096`，允许整数 `1–32768`，控制允许生成的最大 token 数；长回答或推理模型建议提高该值；
- 参数超出范围时页面会显示错误并禁用发送，服务端还会再次校验。

## 6. 聊天操作

### 发送

在消息输入框中输入内容后按 Enter 或选择“发送”。Shift + Enter 用于换行。页面使用 `POST /api/chat`，固定发送 `stream: true`，并携带当前 Provider、模型、消息、`temperature` 和 `max_tokens`。

### 停止生成

生成期间选择“停止生成”，页面会通过 AbortSignal 取消当前请求。已经显示的部分响应可能保留在当前会话中；停止后可选择重试。

### 重试

请求失败或手动停止后会出现“重试”按钮。重试使用失败请求当时的 Provider、模型、消息和生成参数，不需要重新输入原问题。

### Markdown

Assistant 消息支持代码块、基础表格、标题、列表、粗体和行内代码。原始 HTML、脚本和事件属性不会执行，只会作为普通文本显示；页面未使用 `dangerouslySetInnerHTML`。

### 复制与导出

- 每条 Assistant 回复均可复制到系统剪贴板；浏览器拒绝剪贴板权限时页面会显示错误；
- 会话区的“导出”会下载当前会话的 Markdown 文件；
- 导出文件包含对话内容和附件名称，不包含 API Key、Provider 服务端配置或本地文档原始文件。

## 7. 本地文档

输入区可选择本机的 `.txt`、`.md` 和 `.json` 文件作为当前问题的参考资料：

- 最多同时选择 3 个文件；
- 每个文件最大 1 MB，空文件会被拒绝；
- JSON 必须是有效格式；其他扩展名不会被接受；
- 选择文件后仍需主动发送，不会自动上传；
- 文档正文只会随本次聊天请求发送给当前 Provider，发送后从页面内存移除，不写入服务端数据库；
- 会话只保留附件名称等展示信息，不将文档正文保存到 localStorage。

本地文档可能包含不可信指令。应用会把文档标记为参考资料，但用户仍应检查内容，不要导入密钥、个人隐私或未经授权的数据。Live 模式下，发送的文档内容会进入所选 Provider 的上游 API。

## 8. 本地会话管理

- “新建会话”创建一个空白本地会话；
- 选择会话条目可切换会话；
- “删除”移除对应会话；删除最后一个会话后页面会自动创建空白会话；
- 每个会话保存消息内容、Provider、模型和更新时间；
- 最多保留 5 个会话，超过上限时只保留最近更新的 5 个。

聊天记录只保存在当前浏览器的 localStorage 中，不会保存到服务端、数据库或云端。清理站点数据、更换浏览器、使用其他设备或某些隐私浏览模式会导致记录不可用或被删除。不要把浏览器本地存储视为长期备份。

## 9. 提示词

页面加载时会从 `GET /api/prompts` 读取少量服务端内置模板，目前包括总结、中英翻译和代码解释。

- 提示词选择器按“内置提示词（只读）”和“本地自定义提示词”分组；
- 选择提示词只会把内容插入消息输入框，不会自动发送；
- 内置提示词不能修改或删除；
- 可在“管理本地自定义提示词”区域保存、更新、选择、插入和删除自定义提示词；
- 自定义提示词只保存在当前浏览器 localStorage，不会同步到服务端。

提示词被插入输入框后，只有用户主动选择“发送”，输入框中的文本才会作为普通聊天消息提交。

## 10. 运行状态与 Live 模式

页面会显示当前是 Mock 还是 Live 模式，并标明各 Provider 是否已配置。Mock 模式下所有 Provider 用于界面演示；Live 模式只有安全注入了密钥的 Provider 才能调用真实上游。

Live 模式会调用真实 Provider Adapter。只在受控的服务端环境中配置密钥，不要在浏览器、URL、日志或 Git 中保存密钥。Docker 本地测试推荐使用项目根目录的安全启动脚本：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\run-live.ps1 -Provider deepseek -Action start -Port 3000
```

脚本会在当前终端安全提示输入密钥，将它写入受限的系统临时文件并以只读文件挂载到容器，不把密钥写入命令历史、项目目录或镜像。替换 `deepseek` 可选择 `openai`、`anthropic` 或 `glm`。查看和停止：

```powershell
.\run-live.ps1 -Action status
.\run-live.ps1 -Action stop
```

停止操作会删除临时密钥文件。脚本默认使用 `multi-provider-llm-toolbox:phase3` 镜像。

如果暂时不使用 Docker，可以直接运行已构建的 standalone 源码服务。该脚本只提示输入一次 Provider API Key，不要求输入模型；进入网页后可在当前已配置 Provider 的模型目录中自由切换，不需要 `Ctrl+C` 重启：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\run-live-local.ps1 -Provider deepseek -Port 3000
```

脚本只在当前 PowerShell 进程中临时设置密钥，并在服务退出后恢复原环境变量，不会把密钥写入项目文件、Git 或命令行参数。

直接从源码运行时，也可以使用仅保存在本机且被 Git 忽略的 `.env.local`：

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

Provider 地址使用 `src/providers/config.ts` 中的固定 HTTPS 白名单。客户端不能传入 API Key 或 `baseUrl`；`.env.example` 中的 `*_ALLOWED_BASE_URL` 行只是部署配置说明，当前运行时代码不会用它们覆盖固定地址。

`ACCESS_CODE` 当前只保护 Provider 和内置提示词目录，不能保护 Chat API，也不是完整登录功能。网页没有访问码输入或请求头配置界面；本地网页使用时应保持 `ACCESS_CODE` 为空。不要把当前版本未经可信网关统一认证、HTTPS、限流和出口控制直接暴露到公网。

## 11. 常见错误与排查

| 现象或错误码 | 常见原因 | 排查方法 |
|---|---|---|
| Provider 或内置提示词一直无法加载 | 开发服务器未启动、地址错误，或设置了当前页面无法提交的 `ACCESS_CODE` | 查看终端错误；确认访问正确端口；本地网页使用时保持 `ACCESS_CODE` 为空 |
| `INVALID_REQUEST` | 消息或生成参数不符合限制 | 确认消息非空；`temperature` 为 0–2；`max_tokens` 为 1–32768 的整数 |
| `PROVIDER_NOT_ALLOWED` / `MODEL_NOT_ALLOWED` | Provider 或模型不在服务端目录 | 刷新页面并从下拉列表重新选择，不要手工构造未知值 |
| `PROVIDER_NOT_CONFIGURED` | live 模式缺少当前 Provider 的 API Key | 在服务端 `.env.local` 配置对应密钥并重启应用，不要把密钥发到浏览器 |
| `UPSTREAM_AUTH_ERROR` | 上游拒绝密钥 | 检查密钥是否有效、是否已撤销以及账户权限；不要在日志中打印密钥 |
| `UPSTREAM_BAD_REQUEST` | 上游拒绝模型或请求结构 | 检查当前模型配置是否仍被 Provider 支持，并查看不含敏感信息的服务端错误分类 |
| `UPSTREAM_UNAVAILABLE` | 网络故障、上游 5xx 或服务不可用 | 检查服务端网络和 Provider 状态，稍后重试 |
| `UPSTREAM_TIMEOUT` | 上游超过服务端超时 | 降低请求复杂度或稍后重试；确认服务端网络稳定 |
| “流式响应提前结束” | SSE 连接被代理、网络或上游提前关闭 | 检查反向代理是否缓冲/截断 SSE，刷新后重试 |
| 本地会话或提示词无法保存 | localStorage 被禁用、存储空间不足或隐私模式限制 | 允许当前站点使用本地存储、清理不需要的站点数据，或退出受限隐私模式 |
| 本地文档无法导入 | 格式不支持、文件为空、超过 1 MB、JSON 无效或已达到 3 个文件 | 使用有效的 TXT、Markdown、JSON 文件并缩小文件；不要绕过前端限制 |

流式回答中，若 Provider 返回思考字段，页面会在“查看思考过程”折叠区显示；这不是所有模型都会提供的字段。页面标题会标出上游实际返回的模型名，缺失时才回退到所选模型。若第一轮只返回思考、没有最终正文，会提示提高 `max_tokens` 后重试，而不会把内部思考当作答案提交到下一轮。
| 复制回复失败 | 浏览器未授予剪贴板权限 | 允许当前站点使用剪贴板，或手动选择文本复制 |
| `npm ci` 失败 | Node/npm 版本、网络或锁文件环境异常 | 使用 Node.js 24；确认 npm 可访问已配置的软件源；不要手工修改 `package-lock.json` |
| PowerShell 阻止 `npm.ps1` | 当前执行策略禁止运行 PowerShell 脚本 | 使用 `npm.cmd` 执行相同命令，或仅为当前进程设置 Bypass |
| 3000 端口不可用 | 已有进程占用 | 关闭占用进程，或按 Next.js 终端提示使用其他端口 |

排查时不要复制或上传 `.env.local`、API Key、完整请求头或含敏感内容的日志。

## 12. 开发检查

提交变更前运行：

```powershell
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

自动化测试使用 Mock Provider 或 mock fetch，不需要也不应使用真实 API Key。
