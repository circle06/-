# MultiProvider LLM Toolbox 最终架构

## 1. 架构概览

系统采用浏览器 UI、Next.js API、Provider 领域层、外部模型服务四层结构。默认 Mock 模式不访问外部 API；Live 模式由服务端 Adapter 调用固定地址。

```text
[Browser / React]
  |-- localStorage: 会话、自定义提示词
  |-- memory: 待发送文档正文
  |-- SSE client
  v
[Next.js Route Handlers]
  |-- GET  /api/healthz
  |-- GET  /api/providers
  |-- GET  /api/prompts
  `-- POST /api/chat
          |
          | 严格字段/长度/角色/模型校验
          | requestId + AbortSignal + 60s timeout
          v
      [ProviderFactory / Registry]
          |-- mock -> MockProvider
          `-- live
              |-- OpenAICompatibleAdapter -> OpenAI
              |-- OpenAICompatibleAdapter -> DeepSeek
              |-- OpenAICompatibleAdapter -> GLM
              `-- AnthropicAdapter -> Anthropic
```

技术栈为 Next.js 16.3.4、React 18、TypeScript、Vitest 5 和 Node.js 24。生产构建使用 Next.js standalone 输出。

## 2. 前端结构

`app/page.tsx` 是单页聊天工作区，配合 `app/page.module.css` 实现桌面固定视口和移动端响应式布局。

- 顶栏：产品标识、Mock/Live 状态、四个 Provider 配置状态。
- 侧栏：最多 5 个本地会话、Markdown 导出、内置与自定义提示词。
- 聊天区：消息、附件名称、安全 Markdown、复制、错误和加载状态。
- 输入区：TXT/MD/JSON 文档、Provider、模型、temperature、max_tokens、发送/停止。

前端辅助模块：

- `src/ui/local-data.ts`：localStorage 会话和提示词读写、校验及 5 会话上限。
- `src/ui/local-documents.ts`：文件类型、100 KB、3 文件上限及 JSON 格式验证；将文档正文组合进当前用户消息。
- `src/ui/safe-markdown.tsx`：仅创建受控 React 元素，不使用 `dangerouslySetInnerHTML`。
- `src/ui/chat-sse.ts`：解析 SSE 文本块。
- `src/ui/session-export.ts`：生成会话 Markdown 和安全文件名。
- `src/ui/chat-settings.ts`：页面参数默认值、边界校验和请求构建。

## 3. 服务端和领域层

### Route Handler

- `app/api/healthz/route.ts`：返回固定健康状态，不访问 Provider。
- `app/api/providers/route.ts`：返回运行模式、四个 Provider、模型目录和密钥是否配置的布尔值，不返回密钥或地址。
- `app/api/prompts/route.ts`：返回 3 个内置只读提示词。
- `app/api/chat/route.ts`：委托 `src/api/chat-handler.ts` 处理 JSON 或 SSE 对话。

### 请求和响应

`src/domain/request-validation.ts` 使用允许字段列表进行校验，拒绝未知字段、未知 Provider/模型、非法角色、空消息、超限内容和非法生成参数。`src/api/chat-handler.ts` 创建 UUID requestId，将浏览器取消和 60 秒总超时传到 Provider，并把错误映射为有限错误码。

SSE 对外事件固定为：

```text
message_start -> message_delta* -> message_end
                                  `-> error
```

Provider 层内部使用 `start`、`delta`、`usage`、`done`、`error`，Chat Handler 再转换为外部事件；usage 在结束时合并进 `message_end`。

## 4. Provider 结构

`src/providers/config.ts` 是 Provider、密钥变量、固定 HTTPS 地址和模型目录的唯一配置源。`ProviderRegistry` 校验 Provider/模型并暴露只读元数据；`ProviderFactory` 根据 `LLM_MODE` 返回 MockProvider 或 Live Adapter。

| Provider | Adapter | 密钥变量 | 固定地址 |
|---|---|---|---|
| OpenAI | OpenAICompatibleAdapter | `OPENAI_API_KEY` | `https://api.openai.com/v1` |
| Anthropic | AnthropicAdapter | `ANTHROPIC_API_KEY` | `https://api.anthropic.com` |
| DeepSeek | OpenAICompatibleAdapter | `DEEPSEEK_API_KEY` | `https://api.deepseek.com/v1` |
| GLM | OpenAICompatibleAdapter | `GLM_API_KEY` | `https://open.bigmodel.cn/api/paas/v4` |

每个密钥也可通过对应的 `*_API_KEY_FILE` 读取。OpenAI-compatible Adapter 同时兼容 `content` 和 DeepSeek `reasoning_content`；Anthropic Adapter 单独转换 system/messages、鉴权头和原生 SSE 事件。

模型目录是服务端允许列表，不是厂商可用性探测。浏览器看到某个模型不代表当前 API Key 一定具有调用权限。

## 5. 数据边界

| 数据 | 保存位置 | 是否发送服务端/上游 |
|---|---|---|
| 会话消息 | 当前浏览器 localStorage | 发送聊天时进入服务端；Live 时进入所选 Provider |
| 自定义提示词 | 当前浏览器 localStorage | 插入并发送后才进入聊天请求 |
| 内置提示词 | 服务端只读代码目录 | 通过 `/api/prompts` 返回浏览器 |
| 本地文档正文 | 发送前位于页面内存 | 当前请求发送；不保存到 localStorage 或服务端数据库 |
| 文档名称/类型 | 会话 localStorage | 用于页面和 Markdown 导出 |
| API Key | 服务端环境变量或只读文件 | 仅 Adapter 鉴权头使用，不返回浏览器 |

系统没有数据库、账号、云同步或服务端会话存储。

## 6. 安全边界

应用代码已实现：固定初始 Provider 地址、客户端未知字段拒绝、默认无跨域许可头、请求边界、错误归一化、超时/取消、非 root 容器和密钥文件注入。

以下能力不属于当前应用层实现，必须由部署环境承担：完整身份认证、`/api/chat` 访问控制、限流、CSP/安全头、结构化审计、DNS/IP 复核、重定向出口限制和 Provider 网络 ACL。`ACCESS_CODE` 当前只由 `/api/providers` 与 `/api/prompts` 检查，因此不能作为完整公网认证方案。

## 7. 构建与交付

- GitHub Actions 使用 Node.js 24，在 push/PR 上执行安装、lint、typecheck、80 项测试和 build。
- Dockerfile 使用 deps、builder、runner 三阶段；runner 仅复制 standalone 和静态资源，以 `nextjs` 用户运行。
- `.dockerignore` 排除 `.env*`、Git、node_modules、`.next`、测试缓存和日志。
- 最终镜像为 `linux/amd64`，导出 `.tar` 及 SHA-256 校验文件；详细证据见 `docs/test-records.md`。
