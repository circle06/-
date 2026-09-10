# MultiProvider LLM Toolbox 最终 API 契约

## 1. 通用约定

- 本地开发使用 HTTP；部署环境应在可信反向代理后使用 HTTPS。
- Chat 请求使用 `application/json`；流式响应使用 `text/event-stream; charset=utf-8`。
- `POST /api/chat` 的成功响应或错误响应包含服务端 UUID `requestId`；客户端提交 `requestId` 会因未知字段被拒绝。
- 浏览器不得提交 API Key、Authorization 或 `baseUrl`。
- API 默认不返回 `Access-Control-Allow-Origin` 或凭据许可头。
- 配置 `ACCESS_CODE` 时，当前只有 `/api/providers` 和 `/api/prompts` 检查 `X-Access-Code`；`/api/chat` 未实现该检查，公网部署必须由网关统一保护。

## 2. GET /api/healthz

不调用上游，固定返回：

```json
{
  "status": "ok",
  "service": "multi-provider-llm-toolbox",
  "version": "0.1.0"
}
```

成功状态为 HTTP 200。

## 3. GET /api/providers

返回运行模式、Provider 展示数据、模型目录和密钥配置状态布尔值：

```json
{
  "mode": "mock",
  "providers": [
    {
      "id": "deepseek",
      "name": "DeepSeek",
      "configured": false,
      "models": [
        {"id": "deepseek-v4-pro", "name": "DeepSeek V4 Pro"},
        {"id": "deepseek-v4-flash", "name": "DeepSeek V4 Flash"},
        {"id": "deepseek-chat", "name": "DeepSeek Chat（兼容）"},
        {"id": "deepseek-reasoner", "name": "DeepSeek Reasoner（兼容）"}
      ]
    }
  ]
}
```

实际响应包含 OpenAI、Anthropic、DeepSeek、GLM 四项。`configured` 只表示服务端是否读取到对应密钥，不证明密钥有效或模型有权限。接口不返回 API Key、密钥变量名或固定地址。

配置 `ACCESS_CODE` 后，缺少或错误的 `X-Access-Code` 返回 HTTP 401：

```json
{"error":{"code":"UNAUTHORIZED","message":"Access denied."}}
```

## 4. GET /api/prompts

返回 3 个服务端内置只读模板：总结、中英翻译、代码解释。

```json
{
  "prompts": [
    {
      "id": "summarize",
      "name": "总结",
      "content": "请将以下内容概括为三个要点，并保留重要事实：\n\n",
      "updatedAt": "2026-09-03T00:00:00.000Z"
    }
  ]
}
```

此 API 没有写接口。自定义提示词仅由浏览器 localStorage 管理。访问码行为与 `/api/providers` 相同。

## 5. POST /api/chat

### 5.1 请求

```json
{
  "provider": "deepseek",
  "model": "deepseek-chat",
  "messages": [
    {"role": "user", "content": "用一句话解释向量数据库。"}
  ],
  "stream": false,
  "temperature": 0.2,
  "max_tokens": 256
}
```

允许的顶层字段只有：`provider`、`model`、`messages`、`stream`、`temperature`、`max_tokens`。`stream` 缺省为 `false`；temperature 和 max_tokens 可以省略。

### 5.2 非流式响应

```json
{
  "requestId": "4d83f0b0-4ae5-4da0-a129-d074cd10960f",
  "provider": "deepseek",
  "model": "deepseek-chat",
  "message": {"role": "assistant", "content": "回答内容"},
  "finishReason": "stop"
}
```

Mock 模式的 `message.content` 固定为 `mock response`。

### 5.3 SSE 响应

请求将 `stream` 设置为 `true`。成功建立流时 HTTP 状态为 200，响应头包含：

```text
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

外部事件顺序和格式：

```text
event: message_start
data: {"requestId":"...","provider":"deepseek","model":"deepseek-chat"}

event: message_delta
data: {"text":"增量文本"}

event: message_end
data: {"finishReason":"stop"}
```

如果 Provider 返回 usage，服务端先缓存，并合并到 `message_end`：

```text
event: message_end
data: {"finishReason":"stop","usage":{"inputTokens":10,"outputTokens":8}}
```

建立 SSE 后发生错误时仍为 HTTP 200 流，通过事件报告：

```text
event: error
data: {"requestId":"...","code":"UPSTREAM_TIMEOUT","message":"上游响应超时。"}
```

客户端主动取消时可以直接关闭流，不保证收到 error 事件。

## 6. 请求限制

| 项目 | 实际限制 |
|---|---:|
| 请求体序列化大小 | 最大 512 KiB |
| 消息数 | 1 到 50 |
| 单条消息内容 | 1 到 320 KiB 字符 |
| 全部消息总内容 | 最大 384 KiB 字符 |
| 模型 ID | 1 到 256 字符，且必须在对应目录 |
| 消息角色 | `system`、`user`、`assistant` |
| temperature | 0 到 2 |
| max_tokens | 1 到 8192 的整数 |
| Provider 总超时 | 默认 60 秒 |

应用以 JavaScript 字符串长度检查消息，以 UTF-8 字节长度检查序列化请求体。未知字段、空消息、NaN 和非法类型均返回 `INVALID_REQUEST`。

## 7. 错误码

| HTTP | code | 含义 |
|---:|---|---|
| 400 | `INVALID_REQUEST` | 已解析 JSON 的字段、角色、类型或长度不合法 |
| 400 | `PROVIDER_NOT_ALLOWED` | Provider 未启用 |
| 400 | `MODEL_NOT_ALLOWED` | 模型不属于 Provider 目录 |
| 401 | `UNAUTHORIZED` | providers/prompts 的访问码错误 |
| 499 | `CLIENT_CLOSED` | 客户端已取消非流式请求 |
| 502 | `UPSTREAM_AUTH_ERROR` | 上游返回 401/403 |
| 502 | `UPSTREAM_BAD_REQUEST` | 上游其他 4xx 或无效响应 |
| 502 | `UPSTREAM_UNAVAILABLE` | 上游 5xx、网络错误或未分类运行错误 |
| 503 | `PROVIDER_NOT_CONFIGURED` | Live 模式缺少密钥 |
| 504 | `UPSTREAM_TIMEOUT` | 上游或 Provider 调用超时 |

JSON 错误结构：

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Request contains unsupported fields.",
    "requestId": "..."
  }
}
```

服务端不返回上游原始错误正文、密钥、Authorization 或内部堆栈。

当前已知契约限制：无法解析的畸形 JSON 会进入通用错误路径并返回 502 `UPSTREAM_UNAVAILABLE`，尚未单独映射为 400。客户端必须发送有效 JSON；后续若将其改为 400，需要同步增加路由测试和更新本契约。
