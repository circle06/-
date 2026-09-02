# MultiProvider LLM Toolbox

## 项目目标

从零设计一个网页版大模型接口调用工具箱。OpenAI、Anthropic 是核心必需 Provider，DeepSeek、GLM 是必须实现的扩展 Provider；四者均需 Adapter 和 mock 契约测试。项目提供网页聊天、Provider/模型选择、文本对话、非流式与流式响应、提示词模板、Docker 部署以及测试和 CI 规划。

## 当前状态

当前完成阶段一：需求分析、架构设计、UI 交互设计、API 契约、安全设计和验收标准。此阶段没有开始业务编码，没有安装依赖、下载文件或访问 GitHub。

## 目录说明

- `docs/requirements.md`：项目范围、角色、故事、功能和约束。
- `docs/architecture.md`：分层架构、数据/错误流和适配器边界。
- `docs/ui-design.md`：页面结构、状态和安全交互规则。
- `docs/api-contract.md`：HTTP/SSE 接口及参数限制。
- `docs/security-design.md`：密钥、SSRF、CORS、限流、超时、Docker 等安全设计。
- `docs/acceptance-criteria.md`：阶段一至三可测试验收标准。

## 技术路线与数据边界

项目采用 Next.js + React + TypeScript。聊天记录和用户自定义提示词只保存在浏览器本地；服务端只提供内置只读提示词。API Key 和 ACCESS_CODE 只在服务端环境变量中使用，不进入浏览器。

## 后续阶段

1. 阶段二：实现网页、服务端 API、四个 Provider 适配器及 mock 契约测试、内置提示词目录和浏览器本地会话/提示词存储、自动化测试和 CI。
2. 阶段三：完成必做的功能/安全测试、日志脱敏、SSRF、CORS、Docker 和 amd64；SBOM、签名、压力测试和密钥轮换作为增强项。

## 安全边界

默认本地部署。公开部署时启用服务端 `ACCESS_CODE` 简单访问码，但不实现用户注册和多租户。真实 API Key 只能由服务端环境变量提供；浏览器不得填写或持久化密钥；客户端不得提交任意 `baseUrl`；Provider 地址必须来自服务端白名单；默认不开放任意来源 CORS；请求长度、角色、`max_tokens`、超时、4xx/5xx 和流式事件均受服务端控制。
