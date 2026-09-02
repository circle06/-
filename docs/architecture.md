# MultiProvider LLM Toolbox 架构设计

## 1. 总体架构

系统采用浏览器前端、服务端 API、Provider 适配层和外部大模型 API 四层结构。浏览器只发送业务请求和用户文本；服务端负责校验、选择适配器、读取环境变量中的密钥、调用白名单 Provider，并将统一结果返回。

技术栈定稿为 Next.js + React + TypeScript。前端负责页面、会话状态和浏览器本地数据；Next.js Route Handler 负责统一 API、SSE 和安全边界。

```text
[Browser Chat UI]
       |
       | HTTPS: /api/providers, /api/chat, /api/prompts
       v
[Web/API Server]
  | CORS / 限流 / 输入校验 / 错误归一化
  |-- Config: 环境变量 + Provider 白名单 + 模型目录
  |-- Built-in Prompt Catalog
  `-- Provider Registry
          |-- OpenAICompatibleAdapter -> OpenAI API (白名单地址)
          |-- OpenAICompatibleAdapter -> DeepSeek API (白名单地址)
          |-- OpenAICompatibleAdapter -> GLM API (白名单地址)
          `-- AnthropicAdapter          -> Anthropic API
                         |
                    [统一 LLMResult / StreamEvent]
```

## 2. 前端、服务端、Provider 层职责

### 前端

- 渲染聊天消息、Provider/模型选择、提示词模板和连接状态。
- 保存当前选择、最多 5 个本地会话和用户自定义提示词；只保存非敏感数据，不得保存 API Key。
- 解析非流式 JSON 或流式事件，并展示用户可理解的错误。
- 不决定真实 Provider 地址，不拼接上游 URL。

### 服务端

- 暴露公开 API 契约并执行请求体、角色、长度、模型和速率限制校验。
- 从环境变量读取对应 Provider Key，并从白名单解析目标地址。
- 通过 Provider Registry 选择适配器，统一超时、取消、日志和错误映射。
- 提供内置提示词目录和健康检查；不保存用户自定义提示词。

### Provider 层

- 将统一请求转换为厂商格式。
- 处理厂商鉴权头、请求字段、响应解析和流式事件映射。
- 不向业务层泄露 SDK/HTTP 客户端细节。
- 不记录密钥、完整 Authorization 头或上游原始敏感响应。

## 3. 四类 Provider 调用关系

- OpenAI：通过 `OpenAICompatibleAdapter` 调用配置的 OpenAI 地址和模型；必须有 Adapter 与 mock 契约测试。
- DeepSeek：优先复用同一兼容适配器，仅配置独立地址、密钥变量和模型目录；必须有 Adapter 与 mock 契约测试。
- GLM：先按 OpenAI 兼容协议接入；若请求字段、鉴权或流式事件明显不兼容，改用 `GLMAdapter`，业务契约保持不变；必须有 Adapter 与 mock 契约测试。
- Anthropic：使用 `AnthropicAdapter`，将 system、messages、模型和 token 参数转换为 Anthropic 格式，并将其事件流映射为统一事件。

四个 Provider 均属于交付范围：真实 API 条件不足时，使用固定请求/响应夹具和 mock HTTP 上游完成非流式、流式、超时、取消及错误映射测试。

## 4. Provider 配置与适配器设计

模型名称只是可配置示例，不构成永久承诺。服务端配置为每个 Provider 单独维护 `id`、`displayName`、`apiKeyEnv`、`allowedBaseUrls` 和 `models`；客户端只接收 ProviderId/模型Id。

| Provider | Adapter 默认值 | API Key 环境变量示例 | 地址白名单示例（仅服务端） | 模型名称示例（可配置） |
|---|---|---|---|---|
| OpenAI | `OpenAICompatibleAdapter` | `OPENAI_API_KEY` | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Anthropic | `AnthropicAdapter` | `ANTHROPIC_API_KEY` | `https://api.anthropic.com` | `claude-3-5-sonnet` |
| DeepSeek | `OpenAICompatibleAdapter` | `DEEPSEEK_API_KEY` | `https://api.deepseek.com/v1` | `deepseek-chat` |
| GLM | `OpenAICompatibleAdapter`；不兼容时 `GLMAdapter` | `GLM_API_KEY` | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |

地址必须精确匹配白名单（协议、主机、端口和固定路径）；不得接受客户端 `baseUrl`，不得将白名单配置回显给浏览器。GLM 仅在鉴权、请求字段、响应结构或流式事件无法稳定归一化时拆分 `GLMAdapter`，并保留同一上层契约。

建议接口（伪类型，仅用于契约说明）：

```text
interface LLMProvider {
  id(): ProviderId
  listModels(): ModelDescriptor[]
  chat(request: NormalizedChatRequest, context: ProviderCallContext): Promise<NormalizedChatResponse>
  stream(request: NormalizedChatRequest, context: ProviderCallContext): AsyncIterable<NormalizedStreamEvent>
}

interface ProviderCallContext {
  requestId: string
  signal: AbortSignal
  timeoutMs: number
}
```

`NormalizedChatRequest` 包含 `model`、有序 `messages`、可选 `temperature`、`max_tokens`；不包含客户端传入的 baseUrl 或 API Key。`ProviderCallContext` 必须包含服务端生成的 `requestId`、用于客户端断开传播的 `AbortSignal` 和本次调用的 `timeoutMs`。

`NormalizedChatResponse` 包含 Provider、模型、文本、完成原因和可选用量；`NormalizedStreamEvent` 仅允许 `start`、`delta`、`usage`、`done`、`error` 等有限类型。

Provider Registry 负责：

1. 注册已启用 Provider；
2. 验证模型属于该 Provider 的服务端目录；
3. 返回适配器实例；
4. 拒绝未知 Provider、未知模型和任意地址。

## 5. 数据流

### 非流式

1. 浏览器提交 Provider、模型、消息和 `stream=false`。
2. 服务端解析 JSON，执行长度、角色、模型和速率限制校验。
3. Registry 返回适配器；适配器从配置读取密钥和白名单地址。
4. 适配器调用上游并将响应归一化。
5. 服务端返回统一 JSON；日志仅记录元数据。

### 流式

1. 浏览器提交 `stream=true`。
2. 服务端创建 requestId、AbortController 和超时计时器，先返回 `start`，然后转发经校验的增量 `delta`。
3. 上游完成后发送可选 `usage` 与 `done`；客户端断开、显式停止或超时都会触发 AbortSignal，停止读取并取消上游请求。
4. 上游错误或超时在流未结束时发送一次 `error`，随后关闭流；不得再发送 delta。客户端取消不伪装成上游成功。

## 6. 错误流

```text
输入错误 -> 400 INVALID_REQUEST
未知 Provider/模型 -> 400 PROVIDER_NOT_ALLOWED / MODEL_NOT_ALLOWED
配置缺失 -> 503 PROVIDER_NOT_CONFIGURED
上游 401/403 -> 502 UPSTREAM_AUTH_ERROR
上游 429 -> 429 UPSTREAM_RATE_LIMITED
上游其它 4xx -> 502 UPSTREAM_BAD_REQUEST
上游 5xx -> 502 UPSTREAM_UNAVAILABLE
超时/取消 -> 504 UPSTREAM_TIMEOUT 或 499 CLIENT_CLOSED
内部未分类错误 -> 500 INTERNAL_ERROR
```

错误响应使用固定 `code`、用户安全的 `message`、`requestId`；不透传堆栈、密钥和原始敏感头。

## 7. 模块边界

- `web-ui`：展示和交互，不含厂商调用逻辑。
- `api`：HTTP 路由、序列化、状态码和事件协议。
- `domain`：规范化请求/响应、ProviderId、模型和限制规则。
- `provider-registry`：Provider 注册、白名单和模型目录。
- `providers/openai-compatible`：OpenAI、DeepSeek、GLM 的兼容实现。
- `providers/anthropic`：Anthropic 专用实现。
- `prompt-catalog`：服务端内置提示词目录；用户自定义提示词由前端 LocalStorage/IndexedDB 管理。
- `config`：环境变量解析、启动时校验和安全默认值。
- `observability`：脱敏日志、指标、requestId。

模块之间只通过领域契约通信；Provider 层不得反向依赖 UI。

