# Codex Quota Rings

一个供自己使用的 VS Code 插件：状态栏常驻显示 Codex 剩余额度；小圆环和额度信息显示在资源管理器中。

## 显示方式

- 有 7 天和 5 小时时，外圈为 7 天、内圈为 5 小时；只有一个时间窗口时显示单圈。
- 每个时间窗口有两条同心实线：额度粗圈沿整圈渐变，7 天使用玫瑰粉到浅珊瑚粉，5 小时使用深蓝到冰蓝色；亮色表示剩余额度、暗色表示已消耗额度。时间细圈使用对应的粉色或淡蓝单色，已过去的时间部分留空。
- 圆心显示 Codex 返回的**可用额度重置次数**。后端未提供时显示「—」，不会把未知当作 0。
- 圆环与右侧信息并排，右侧的 7 天和 5 小时文字分别使用粉色和蓝色，列出项目、剩余额度和重置时间；圆心的重置次数标题分两行显示为 `usable` 和 `resets`。状态栏使用 `xdxh | xhxm : xx% | xx%  reset: x` 格式，前两个时间分别是 7 天和 5 小时窗口距重置的剩余时间，按小时和分钟上取整；两个百分比分别是对应窗口的剩余额度。状态栏倒计时每 10 秒更新，额度数据默认每 30 秒自动刷新，也可手动刷新。

## 安装

先在运行 VS Code 工作区的同一环境里安装并登录 Codex CLI。插件调用本机 `codex app-server` 的 `account/rateLimits/read`，复用 CLI 登录态；无需复制令牌或配置 API key。

在 VS Code 中运行 **Extensions: Install from VSIX...**，选择 `codex-quota-rings-0.4.8.vsix`，然后重新加载窗口。若使用 Remote SSH / WSL，请安装到远程工作区一侧，并确认远程终端能执行 `codex`。

**Codex 额度** 视图位于资源管理器中。点击状态栏摘要可切换到它；关闭资源管理器后状态栏摘要仍然可见。

## 设置

| 设置 | 默认值 | 用途 |
|---|---:|---|
| `codexQuota.codexPath` | `codex` | Codex CLI 路径或命令名 |
| `codexQuota.refreshIntervalSeconds` | `30` | 自动刷新间隔，最短 15 秒 |
| `codexQuota.limitId` | `codex` | 优先展示的额度桶 ID |

命令面板提供 **Codex 额度：立即刷新** 和 **Codex 额度：显示圆环**。

## 构建

```bash
npm ci
npm test
npm run package
```

生成的 VSIX 位于项目根目录。额度数据取决于当前账户和 Codex CLI 返回的字段；只有 API key 登录、未登录、或服务未返回时间窗口时，可能没有可显示的订阅额度。

数据接口字段见 [Codex app-server 官方文档](https://learn.chatgpt.com/docs/app-server#6-rate-limits-chatgpt)。
