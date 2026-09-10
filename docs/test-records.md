# 阶段三测试记录

## 1. 记录信息

| 项目 | 内容 |
|---|---|
| 项目 | MultiProvider LLM Toolbox |
| 分支 | `phase/3-release` |
| 测试日期 | 2026-09-03、最终源码回归 2026-09-10（Asia/Shanghai） |
| 宿主环境 | Windows + PowerShell + Docker Desktop |
| Node.js | 24.20.0 |
| npm | 11.19.0 |
| Next.js | 16.3.4 |
| Docker CLI | 29.7.2 |
| 容器目标平台 | Linux/amd64 |
| Provider 运行模式 | 自动化测试使用 `mock`/mock fetch；手工验收包含 DeepSeek `live` |

本记录中的自动化测试使用 Mock Provider 或 mock fetch，不包含真实 API Key。2026-09-10 另使用用户自有 DeepSeek API Key 完成受控手工烟囱测试；密钥只在运行时注入，未写入代码、Git、日志或本文档。OpenAI、Anthropic、GLM 未执行真实上游测试。

## 2. 代码质量与自动化测试

| 检查项 | 执行命令 | 预期结果 | 实际结果 | 结论 |
|---|---|---|---|---|
| ESLint | `npm run lint` | 命令退出码为 0，无 ESLint 错误 | 退出码 0，无错误 | 通过 |
| TypeScript | `npm run typecheck` | 命令退出码为 0，无类型错误 | 退出码 0，无类型错误 | 通过 |
| 自动化测试 | `npm test -- --run` | 所有测试通过，不访问真实 Provider | 16 个测试文件、80 个测试全部通过 | 通过 |
| 生产构建 | `npm run build` | Next.js 生产构建成功并生成 standalone 输出 | 构建成功；生成首页和 `/api/chat`、`/api/healthz`、`/api/prompts`、`/api/providers` 路由 | 通过 |
| 依赖审计 | `npm audit` | 不存在已知 npm 依赖漏洞 | `found 0 vulnerabilities` | 通过 |

80 个自动化测试覆盖页面与本地数据逻辑、本地文档、会话导出、请求校验、Provider Registry/Factory、Mock Provider、OpenAI 兼容 Adapter、Anthropic Adapter、非流式与 SSE、超时、取消、统一错误、安全 Markdown，以及 API 安全边界。

## 3. 依赖漏洞验证

| 阶段 | 命令 | 预期结果 | 实际结果 |
|---|---|---|---|
| 修复前基线 | `npm audit` | 识别需要修复的依赖漏洞 | 共 13 项漏洞 |
| 安全升级后 | `npm audit --cache .npm-cache-phase3` | 漏洞数降为 0 | 共 0 项漏洞 |
| 新公告复核 | `npm audit`（2026-09-10） | 识别新披露风险 | Vitest 依赖报告 2 项 Moderate |
| 二次修复后 | 升级 Vitest 5.0.0 后执行 `npm audit` | 漏洞数恢复为 0 | `found 0 vulnerabilities` |

依赖修复采用兼容升级并在升级后重新执行 lint、typecheck、测试和生产构建。`npm audit` 只反映 npm 审计源当前已知的依赖漏洞，不等同于代码、容器基础镜像或运行环境不存在其他风险。

## 4. Docker 构建与运行验证

### 4.1 镜像构建

执行命令：

```powershell
docker build --platform linux/amd64 -t multi-provider-llm-toolbox:phase3 .
```

预期结果：多阶段构建成功，生成 Linux/amd64 镜像；构建上下文不包含 `.env`、Git 数据、宿主机 `node_modules` 或测试缓存。

实际结果：基于 Commit `32ad2a5` 构建最终交付镜像成功。

| 属性 | 实际值 |
|---|---|
| 镜像名称 | `multi-provider-llm-toolbox:phase3` |
| 镜像 ID | `sha256:44d6d7b920333166facc502289f8c594eeafcd50b04b0c6054b606c2b347cac0` |
| OS/架构 | `linux/amd64` |
| 默认运行用户 | `nextjs` |
| 默认模式 | `LLM_MODE=mock` |
| 暴露端口 | `3000` |

### 4.2 镜像检查

执行命令：

```powershell
docker image inspect multi-provider-llm-toolbox:phase3
```

预期结果：镜像架构为 `amd64`、操作系统为 `linux`，运行用户不是 root，镜像配置中不包含真实 API Key 或访问码。

实际结果：OS/架构为 `linux/amd64`，运行用户为 `nextjs`；未在构建参数或镜像默认环境中配置 `ACCESS_CODE` 和四个 Provider API Key。

### 4.3 容器启动与检查

执行命令：

```powershell
docker run --rm -d --name llm-toolbox-test -p 3000:3000 multi-provider-llm-toolbox:phase3
docker inspect llm-toolbox-test
```

预期结果：容器在 mock 模式正常启动，端口 3000 可访问，容器进程使用 `nextjs` 用户运行。

实际结果：最终镜像在宿主机 3001 端口成功启动，容器配置显示运行用户为 `nextjs`，状态为 `running`，未调用真实 Provider API。

### 4.4 HTTP 验证

执行命令：

```powershell
Invoke-WebRequest http://localhost:3000/api/healthz
Invoke-WebRequest http://localhost:3000
```

| 验证项 | 预期结果 | 实际结果 | 结论 |
|---|---|---|---|
| `GET /api/healthz` | HTTP 200，返回服务健康状态 | HTTP 200 | 通过 |
| `GET /` | HTTP 200，返回网页内容 | HTTP 200 | 通过 |
| `GET /api/providers` | HTTP 200，返回 Provider 与模型目录 | HTTP 200 | 通过 |
| `POST /api/chat` | Mock 非流式聊天返回统一响应 | HTTP 200，返回 `mock response` | 通过 |

### 4.5 停止测试容器

执行命令：

```powershell
docker stop llm-toolbox-test
```

预期结果：测试容器停止；由于使用 `--rm`，停止后容器自动删除。

实际结果：容器已停止并清理。

## 5. 镜像导出与校验

最终镜像使用 `docker save` 导出：

```powershell
docker save -o multi-provider-llm-toolbox-stage3-amd64.tar multi-provider-llm-toolbox:phase3
Get-FileHash .\multi-provider-llm-toolbox-stage3-amd64.tar -Algorithm SHA256
```

| 属性 | 实际值 |
|---|---|
| 交付文件 | `multi-provider-llm-toolbox-stage3-amd64.tar` |
| 文件大小 | 92,624,384 bytes（88.33 MiB） |
| SHA-256 | `b41c4a83f29a619862033f47f8ad840c91f5aae4fc58fddbbe64ec2166761d48` |
| 校验文件 | `multi-provider-llm-toolbox-stage3-amd64.sha256.txt` |

镜像文件和校验文件位于阶段三交付目录。接收方应先核对 SHA-256，再使用 `docker load -i` 导入。

## 6. 测试边界

- DeepSeek 已使用运行时注入密钥完成真实网络烟囱测试；未记录密钥原文。
- OpenAI、Anthropic、GLM 没有执行真实网络烟囱测试；四个 Provider 的请求/响应转换均通过 mock fetch 契约测试验证。
- 没有执行压力、长时间稳定性、密钥轮换、SBOM、镜像签名或生产出口网络策略测试。
- 当前安全测试验证客户端 `baseUrl`/API Key 覆盖被拒绝、服务端密钥不进入响应和日志、非法 Provider/模型与参数被拒绝、默认同源 CORS、timeout 和 AbortSignal；DNS 重绑定、重定向链和容器网络出口仍需部署层补充验证。
