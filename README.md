# Codex Quota Rings

一个供自己使用的 VS Code 插件：状态栏常驻显示 Codex 剩余额度；小圆环和额度信息显示在资源管理器中。

## 显示方式

- 有 7 天和 5 小时时，外圈为 7 天、内圈为 5 小时；只有一个时间窗口时显示单圈。
- 每个时间窗口有两条同心实线：额度粗圈沿整圈渐变，7 天使用玫瑰粉到浅珊瑚粉，5 小时使用深蓝到冰蓝色；亮色表示剩余额度、暗色表示已消耗额度。时间细圈使用对应的粉色或淡蓝单色，已过去的时间部分留空。
- 圆心显示 Codex 返回的**可用额度重置次数**，下方依次以 `exp: Oct 12` 这样的英文月份缩写和日期显示已返回的可用重置卡中最近的过期日期、以 `resets` 标注次数。服务未提供数量或日期时显示「—」；明细可能只返回部分卡片，数量以服务提供的总数为准。点击圆环或圆心即可刷新；加载失败时可点击“重试”。
- 圆环与右侧信息并排，右侧用英文列出时间窗口、剩余额度和重置时间。状态栏的三个独立块依次显示 `xdxh / 7d : xx%`、`xhxm / 5h : xx%` 和 `reset: x`，分别为粉色、蓝色和白色；块间由 VS Code 自动留出间距。时间按小时和分钟上取整，所有具体时刻使用 24 小时制。悬停提示显示额度百分比与重置时间。状态栏倒计时每 10 秒更新，额度数据默认每 30 秒自动刷新，也可手动刷新。读取失败后每 3 秒重试一次；连续 10 次重试失败才显示错误，成功后恢复正常刷新间隔。
- 视图下方平时居中显示墨绿色 `Codex Quota`；发生错误时改为显示错误信息。额度读取失败或没有可显示的时间窗口时，视图提供“常见问题与解决方案”按钮，打开随插件安装的 [排查文档](FAQ.md)。

## 安装

先在运行 VS Code 工作区的同一环境里安装并登录 Codex CLI。插件调用本机 `codex app-server` 的 `account/rateLimits/read`，复用 CLI 登录态；无需复制令牌或配置 API key。

在 VS Code 中运行 **Extensions: Install from VSIX...**，选择 `release/codex-quota-rings-0.4.17.vsix`，然后重新加载窗口。若使用 Remote SSH / WSL，请安装到远程工作区一侧，并确认远程终端能执行 `codex`。

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

生成的 VSIX 位于项目的 `release/` 目录。额度数据取决于当前账户和 Codex CLI 返回的字段；只有 API key 登录、未登录、或服务未返回时间窗口时，可能没有可显示的订阅额度。

数据接口字段见 [Codex app-server 官方文档](https://learn.chatgpt.com/docs/app-server#6-rate-limits-chatgpt)。
