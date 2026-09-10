# 阶段三部署指南

## 1. 适用范围

本文面向负责构建、发布、运行和排障的运维人员，适用于 MultiProvider LLM Toolbox 的 Linux/amd64 Docker 部署。当前镜像默认运行在 `mock` 模式，不需要真实 Provider API Key，也不会访问真实上游。

生产公开部署必须额外配置 HTTPS、反向代理、访问控制、限流、容器资源限制和受控网络出口。本项目不提供用户注册、多租户或企业权限系统。

## 2. 环境要求

- amd64/x86_64 Linux 容器运行环境，或支持构建和运行 `linux/amd64` 的 Docker Desktop；
- Docker Engine/CLI 可用；建议使用当前受支持的稳定版本；
- 构建环境能够访问 npm 软件源和 Node.js 基础镜像源；
- 主机或反向代理能够访问容器 3000 端口；
- live 模式下，容器网络只能访问批准的 Provider HTTPS 地址。

当前阶段三验证环境使用 Node.js 24、Next.js 16.3.4 和 Docker 29.7.2。交付镜像标签为 `multi-provider-llm-toolbox:phase3`，镜像 ID 为 `sha256:44d6d7b920333166facc502289f8c594eeafcd50b04b0c6054b606c2b347cac0`。导出文件大小和校验值见 `docs/test-records.md`。

## 3. 构建镜像

在项目根目录执行：

```powershell
docker build --platform linux/amd64 -t multi-provider-llm-toolbox:phase3 .
```

检查镜像：

```powershell
docker image inspect multi-provider-llm-toolbox:phase3
docker image inspect multi-provider-llm-toolbox:phase3 --format "ID={{.Id}} OS={{.Os}} ARCH={{.Architecture}} USER={{.Config.User}}"
```

应确认：

- `OS=linux`、`ARCH=amd64`；
- `USER=nextjs`，不能是 root 或空值；
- Dockerfile 默认只有 `LLM_MODE=mock` 等非敏感运行配置；
- 镜像历史和配置中没有 `.env`、`ACCESS_CODE` 或真实 API Key。

项目使用 Next.js standalone 多阶段构建。`.dockerignore` 排除 `.env*`、`.git`、宿主机 `node_modules`、`.next`、覆盖率及测试缓存；运行镜像不包含开发源树和测试依赖。

## 4. Mock 模式部署

Mock 是默认模式。启动命令：

```powershell
docker run --rm -d `
  --name llm-toolbox `
  -p 3000:3000 `
  multi-provider-llm-toolbox:phase3
```

显式指定模式时可增加：

```powershell
-e LLM_MODE=mock
```

Mock 模式不应传入任何 Provider API Key。它适合安装验证、页面演示、健康检查和不访问真实上游的功能测试。

### 从交付文件导入镜像

收到导出的 `.tar` 镜像时不需要重新构建：

```powershell
docker load -i .\multi-provider-llm-toolbox-stage3-amd64.tar
docker image inspect multi-provider-llm-toolbox:phase3 --format "ID={{.Id}} OS={{.Os}} ARCH={{.Architecture}} USER={{.Config.User}}"
```

将交付文件的 SHA-256 与同目录校验文件进行比对后再导入。镜像应显示 `OS=linux`、`ARCH=amd64`、`USER=nextjs`。

## 5. Live 模式与运行时环境变量

Live 模式在容器启动时读取以下服务端环境变量：

| 变量 | 用途 | Mock 是否需要 | Live 是否需要 |
|---|---|---|---|
| `LLM_MODE` | `mock` 或 `live` | 默认 `mock` | 设置为 `live` |
| `ACCESS_CODE` | 公开部署的简单访问码 | 否 | 公开部署时必须配置 |
| `OPENAI_API_KEY` | OpenAI 服务端密钥 | 否 | 使用 OpenAI 时需要 |
| `ANTHROPIC_API_KEY` | Anthropic 服务端密钥 | 否 | 使用 Anthropic 时需要 |
| `DEEPSEEK_API_KEY` | DeepSeek 服务端密钥 | 否 | 使用 DeepSeek 时需要 |
| `GLM_API_KEY` | GLM 服务端密钥 | 否 | 使用 GLM 时需要 |

不要把真实值写入 Dockerfile、镜像标签、命令文档、Git、工单或聊天记录。推荐由受控密钥系统生成宿主机外部环境文件，并限制文件 ACL。示例文件只展示变量名：

```dotenv
LLM_MODE=live
ACCESS_CODE=<由部署系统注入>
OPENAI_API_KEY=<由部署系统注入>
ANTHROPIC_API_KEY=<由部署系统注入>
DEEPSEEK_API_KEY=<由部署系统注入>
GLM_API_KEY=<由部署系统注入>
```

使用仓库外的安全文件启动：

```powershell
docker run --rm -d `
  --name llm-toolbox `
  --env-file D:\secure\llm-toolbox.env `
  -p 3000:3000 `
  multi-provider-llm-toolbox:phase3
```

只配置计划使用的 Provider 密钥；缺少对应密钥时，该 Provider 会返回统一的 `PROVIDER_NOT_CONFIGURED`，不会回显环境变量名称或密钥内容。

### Windows 本地安全启动脚本

项目提供一个通用脚本，在 Docker 中按 Provider 启动 Live 模式：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\run-live.ps1 -Provider deepseek -Action start -Port 3000
```

`Provider` 支持 `openai`、`anthropic`、`deepseek`、`glm`。脚本通过 `Read-Host -AsSecureString` 读取密钥，在 Windows 系统临时目录创建仅当前用户和 SYSTEM 可访问的临时文件，并只读挂载到容器 `/run/secrets/provider_api_key`。密钥不会出现在 Docker 命令参数、Git 或镜像层中。

查看状态和停止：

```powershell
.\run-live.ps1 -Action status
.\run-live.ps1 -Action stop
```

停止时脚本会停止 `llm-toolbox-live` 容器并删除临时密钥文件。Docker Desktop 必须已经启动，且目标镜像必须存在。PowerShell 若禁止脚本执行，只应对当前进程使用上述 Bypass，不要为整台电脑永久降低策略。

Provider 地址由服务端代码白名单固定，客户端不能传入 `baseUrl`。当前地址为 OpenAI、Anthropic、DeepSeek、GLM 各自的批准 HTTPS API 地址。修改地址需要代码审查、测试和重新构建镜像，不能通过浏览器请求覆盖。

### ACCESS_CODE 注意事项

配置 `ACCESS_CODE` 后，受保护 API 要求请求头 `X-Access-Code`。访问码不能放入 URL、浏览器 localStorage、日志或静态前端构建。当前网页没有访问码输入界面；需要公开部署时，应由经过评审的可信网关或专用客户端安全添加请求头。`GET /api/healthz` 不要求访问码，不能将其当作身份认证接口。

## 6. 健康检查与验收

容器启动后执行：

```powershell
Invoke-WebRequest http://localhost:3000/api/healthz -UseBasicParsing
Invoke-WebRequest http://localhost:3000 -UseBasicParsing
```

预期：

- `/api/healthz` 返回 HTTP 200，并包含 `status: ok`；
- `/` 返回 HTTP 200 和 HTML 页面。

反向代理或编排平台应使用 `/api/healthz` 作为存活探针。该接口证明进程和路由可响应，不证明真实 Provider 密钥、账户余额或上游网络正常。

Mock 模式还应在浏览器验证 Provider/模型切换、SSE、停止、复制、Markdown 导出、本地会话、提示词和 TXT/Markdown/JSON 文档导入。Live 上线前应只对已授权 Provider 做最小真实请求，并确认模型权限、配额、流式响应和错误映射。

## 7. 日常操作

查看容器状态：

```powershell
docker ps --filter "name=llm-toolbox"
docker inspect llm-toolbox
```

查看日志：

```powershell
docker logs --tail 200 llm-toolbox
docker logs -f llm-toolbox
```

日志中不应出现 API Key、Authorization、ACCESS_CODE、完整请求头、完整用户消息或上游原始响应。发现疑似泄露时应立即停止公开访问、轮换对应密钥并保留最小必要审计证据。

停止容器：

```powershell
docker stop llm-toolbox
```

如果容器没有使用 `--rm`，停止后按变更管理流程删除旧容器；不要直接删除仍用于回滚的版本化镜像。

## 8. 升级流程

1. 使用不可变版本号或 Commit ID 构建新标签，不要只覆盖现有生产标签。
2. 在隔离端口启动新容器，保持 mock 模式完成 healthz、首页和核心 API 验证。
3. live 上线前，在受控环境对计划启用的每个 Provider 执行最小烟囱测试，检查非流式、流式、超时和错误映射。
4. 复核 `npm audit`、自动化测试、镜像平台、运行用户、镜像配置和日志脱敏。
5. 切换反向代理流量，观察健康状态和统一错误率。
6. 保留上一已验证镜像，直到新版本观察期结束。

示例：

```powershell
docker build --platform linux/amd64 -t multi-provider-llm-toolbox:<版本号> .
docker run --rm -d --name llm-toolbox-candidate -p 3001:3000 multi-provider-llm-toolbox:<版本号>
Invoke-WebRequest http://localhost:3001/api/healthz
```

## 9. 回滚流程

1. 停止新版本流量并记录触发回滚的症状和 requestId。
2. 使用上一已验证的不可变镜像标签启动容器。
3. 注入对应版本所需的服务端环境变量，不把密钥固化进镜像。
4. 验证 `/api/healthz` 和首页，再恢复反向代理流量。
5. 停止故障版本容器，保留必要的脱敏日志用于分析。

示例：

```powershell
docker stop llm-toolbox
docker run --rm -d --name llm-toolbox --env-file D:\secure\llm-toolbox.env -p 3000:3000 multi-provider-llm-toolbox:<上一版本号>
Invoke-WebRequest http://localhost:3000/api/healthz
```

## 10. 故障排查

| 现象 | 可能原因 | 处理方式 |
|---|---|---|
| 容器立即退出 | 环境变量格式、端口或启动命令异常 | 查看 `docker logs llm-toolbox` 和 `docker inspect llm-toolbox`，不要输出密钥值 |
| `/api/healthz` 无法连接 | 容器未运行、端口未映射或防火墙阻断 | 检查 `docker ps`、`-p 3000:3000` 和主机防火墙 |
| healthz 200 但聊天失败 | Provider 密钥缺失、上游不可达或模型配置变化 | 根据统一错误码排查；验证出口网络和 Provider 状态，不记录真实密钥 |
| `PROVIDER_NOT_CONFIGURED` | live 模式缺少当前 Provider 密钥 | 在运行环境安全注入对应 `*_API_KEY` 并重建容器实例 |
| `UNAUTHORIZED` | `ACCESS_CODE` 已启用但请求头缺失或不匹配 | 检查可信网关/客户端是否发送 `X-Access-Code`，不要把值写入 URL 或日志 |
| `UPSTREAM_AUTH_ERROR` | Provider 拒绝密钥 | 在密钥系统核对状态和权限，必要时轮换；禁止打印密钥 |
| `UPSTREAM_TIMEOUT` | 上游或网络超过超时 | 检查 DNS、TLS、出口策略与 Provider 状态，稍后重试 |
| SSE 提前结束 | 反向代理缓冲或超时设置不适合流式响应 | 禁用 SSE 缓冲，调整代理读取/空闲超时，验证客户端取消行为 |
| 镜像无法在主机启动 | 主机架构不兼容或镜像损坏 | 确认 `docker image inspect` 为 `linux/amd64`，重新拉取或构建已批准标签 |

排障资料只能包含 requestId、错误码、Provider、模型、耗时和状态分类。不得复制 `.env`、API Key、ACCESS_CODE、完整请求头或包含敏感内容的原始日志。

## 11. 运行加固建议

在验证应用不需要写入根文件系统后，可使用只读根文件系统、临时目录和资源限制：

```powershell
docker run --rm -d `
  --name llm-toolbox `
  --read-only `
  --tmpfs /tmp:rw,noexec,nosuid,size=64m `
  --memory 512m `
  --cpus 1.0 `
  --pids-limit 128 `
  -p 3000:3000 `
  multi-provider-llm-toolbox:phase3
```

正式参数应在目标环境进行容量验证后确定。live 模式还应限制容器出口只能访问四个批准 Provider 的 HTTPS 端点，并通过部署平台的 Secret 能力管理密钥。
