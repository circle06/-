# MultiProvider LLM Toolbox API 契约

## 1. 通用约定

- 传输：HTTPS（本地开发可使用 HTTP）。
- 请求体：`application/json`。
- 响应：UTF-8 JSON；流式接口使用 `text/event-stream`。
- 每个业务响应包含服务端生成的 `requestId`（健康检查除外）。客户端不得提交或覆盖 `requestId`。
- 浏览器永远不传 API Key、Authorization 或 `baseUrl`。
- 默认本地部署不要求访问码；公开部署时，`/api/providers`、`/api/chat`、`/api/prompts` 必须在请求头 `X-Access-Code` 发送由服务端配置的 `ACCESS_CODE`，服务端不得回显访问码。`/healthz` 不要求访问码。`X-Access-Code` 只通过 HTTPS 传输，不进入 URL、日志、LocalStorage、异常或响应体。

## 2. GET /healthz

用途：容器和编排系统存活检查。不调用上游。

响应 `200`：

```json
{"status":"ok","service":"multi-provider-llm-toolbox","version":"0.1.0"}
```

## 3. GET /api/providers

响应 `200`：

```json
{
  "providers": [
    {"id":"openai","name":"OpenAI","models":[{"id":"gpt-6-astra","name":"GPT-6 Astra"},{"id":"gpt-5.6-sol","name":"GPT-5.6 Sol"},{"id":"gpt-5-mini","name":"GPT-5 mini"}]},
    {"id":"anthropic","name":"Anthropic","models":[{"id":"claude-opus-4-1","name":"Claude Opus 4.1"},{"id":"claude-3-5-sonnet-20241022","name":"Claude 3.5 Sonnet"}]},
    {"id":"deepseek","name":"DeepSeek","models":[{"id":"deepseek-chat","name":"DeepSeek Chat"}]},
    {"id":"glm","name":"GLM","models":[{"id":"glm-4-flash","name":"GLM-4-Flash"}]}
  ]
}
```

仅返回已配置且启用的 Provider；不返回地址、密钥或内部配置。

## 4. POST /api/chat

请求示例：

```json
{
  "provider":"openai",
  "model":"gpt-5-mini",
  "messages":[
    {"role":"user","content":"用一句话解释向量数据库。"}
  ],
  "stream":false,
  "max_tokens":256,
  "temperature":0.2
}
```

非流式响应 `200`：

```json
{
  "requestId":"req_123",
  "provider":"openai",
  "model":"gpt-5-mini",
  "message":{"role":"assistant","content":"向量数据库用于按语义相似度检索数据。"},
  "finishReason":"stop",
  "usage":{"inputTokens":18,"outputTokens":16}
}
```

流式请求仅将 `stream` 改为 `true`，响应头：

```text
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

流式事件格式（每个事件以空行分隔）：

```text
event: start
data: {"requestId":"req_123","provider":"openai","model":"gpt-4o-mini"}

event: delta
data: {"text":"向量数据库"}

event: usage
data: {"inputTokens":18,"outputTokens":16}

event: done
data: {"finishReason":"stop"}
```

错误事件：

```text
event: error
data: {"requestId":"req_123","code":"UPSTREAM_TIMEOUT","message":"上游响应超时。"}
```

## 5. List built-in prompts — GET /api/prompts

响应 `200`：

```json
{"prompts":[{"id":"summarize","name":"摘要","content":"请将以下内容概括为三点：{{input}}","updatedAt":"2026-08-31T00:00:00Z"}]}
```

该接口只返回服务端内置只读模板。用户自定义模板在浏览器 LocalStorage/IndexedDB 中管理，不调用服务端 Create/Delete 接口，也不承诺跨浏览器或跨用户同步。

## 6. 错误码

| HTTP | code | 含义 |
|---:|---|---|
| 400 | `INVALID_REQUEST` | JSON、字段、角色或长度不合法 |
| 400 | `PROVIDER_NOT_ALLOWED` | Provider 不在白名单 |
| 400 | `MODEL_NOT_ALLOWED` | 模型不属于 Provider 目录 |
| 401 | `UNAUTHORIZED` | 公开部署启用 `ACCESS_CODE` 时缺少或错误的访问码 |
| 404 | `PROMPT_NOT_FOUND` | 模板不存在 |
| 429 | `RATE_LIMITED` / `UPSTREAM_RATE_LIMITED` | 本地或上游限流 |
| 500 | `INTERNAL_ERROR` | 未分类内部错误 |
| 502 | `UPSTREAM_AUTH_ERROR` | 上游鉴权失败 |
| 502 | `UPSTREAM_BAD_REQUEST` | 上游拒绝请求 |
| 502 | `UPSTREAM_UNAVAILABLE` | 上游 5xx 或网络不可用 |
| 503 | `PROVIDER_NOT_CONFIGURED` | 服务端未配置密钥或 Provider |
| 504 | `UPSTREAM_TIMEOUT` | 上游超时 |

统一错误 JSON：`{"error":{"code":"INVALID_REQUEST","message":"请求参数无效。","requestId":"req_123"}}`。

## 7. 参数限制

阶段一建议默认值（实现前可经 ADR 调整）：

- 请求体 ≤ 256 KiB。
- 消息数量 1–50；单条文本 ≤ 16 KiB；总文本 ≤ 64 KiB。
- 仅允许 `system`、`user`、`assistant` 角色；不得出现未知字段注入。
- `max_tokens` 为 1–8192，且受 Provider/模型更小上限约束。
- `temperature` 为 0–2；缺省由服务端设置。
- `name` ≤ 80 字符；提示词 `content` ≤ 16 KiB；模板数量 ≤ 200（服务实例级）。
- SSE 单事件 `data` ≤ 32 KiB；服务端必须周期性发送心跳或在代理层禁用缓冲。
- `requestId` 只能由服务端生成，并贯穿 Route、ChatService、Registry、Adapter 和脱敏日志；客户端不得提交该字段。Provider 调用必须绑定服务端 `AbortSignal` 和 `timeout`；客户端停止/断开后服务端取消上游，不发送伪造的 `done`。

