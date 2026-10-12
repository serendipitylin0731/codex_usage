# Codex 额度常见问题与解决方案

本插件在 **VS Code 扩展运行的环境**中启动 Codex CLI，并读取 `codex app-server` 返回的额度。先点击资源管理器中“Codex 额度”右上角的刷新按钮；如果仍未加载，按下面的顺序排查。

## 1. 先确认 VS Code 运行在哪个环境

- 普通 Windows 窗口：左下角没有 `WSL: ...`，集成终端通常显示 `PS C:\...`。CLI 需要安装在 Windows。
- WSL 窗口：左下角显示 `WSL: Ubuntu...`，集成终端应显示 `/home/...` 等 Linux 路径。CLI 和本插件都需要安装在 WSL 一侧。Windows 中的 `codex.exe` 不等于 WSL 中已安装 CLI。
- 真正的 Windows / Linux 双启动系统：两个系统各自安装 CLI、登录，并在各自的 VS Code 环境安装本插件；它们的程序和登录状态不会自动共用。
- Remote SSH、容器等远程窗口：在远程扩展运行环境中安装 CLI 并登录。

在集成终端分别检查：

```text
codex --version
codex login status
```

本插件依赖 ChatGPT 订阅额度数据。若 CLI 当前只使用 API key 登录，可能没有可显示的订阅时间窗口；可以在相同环境运行 `codex login`，选择 **Sign in with ChatGPT**，再刷新视图。

## 2. 安装 Codex CLI

### Windows（PowerShell）

在新的 PowerShell 窗口使用 [OpenAI Docs 的 Windows 安装命令](https://learn.chatgpt.com/docs/codex/cli)：

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
codex --version
codex login
```

也可以按官方文档使用 `npm install -g @openai/codex`。如果通过 npm 安装后 PowerShell 拒绝运行 `codex.ps1`，先试 `codex.cmd --version`；本插件的 `codexQuota.codexPath` 应指向可直接执行的程序，推荐使用 Windows 独立安装器生成的 `codex.exe`。无需为排查此问题修改整个系统的执行策略。

### Windows 中的 WSL2 / Ubuntu

如果尚未安装 WSL，在**管理员 PowerShell**中运行 `wsl --install`，按提示完成安装。随后从 WSL 终端运行：

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
codex --version
codex login
```

在 WSL 终端进入项目目录，运行 `code .` 打开 WSL 窗口，并确认左下角显示 `WSL: Ubuntu...`。如已经打开 Windows 窗口，可通过命令面板运行 **WSL: Reopen Folder in WSL**。在这个 WSL 窗口的扩展页确认本插件安装在 **WSL: Ubuntu...** 中。见 [OpenAI Docs 的 WSL 指南](https://learn.chatgpt.com/docs/windows/wsl)。

### 独立安装的 Linux 系统

在该 Linux 系统的终端执行上面的 Linux 安装命令，并单独完成登录。

## 3. Windows 提示“找不到 codex”或 `spawn codex ENOENT`

在 **VS Code 集成 PowerShell** 中运行：

```powershell
Get-Command codex -All | Format-Table CommandType, Source, Definition
where.exe codex
```

如果外部 PowerShell 可以找到 `codex`，而 VS Code 找不到，完全退出 VS Code 后重新打开，再运行 `codex --version`。这是因为已经启动的 VS Code 进程不会自动读取后来修改的 `PATH`。

如果 `Get-Command` 找到了 `codex.exe`，但插件仍显示 `ENOENT`，在 VS Code 设置中搜索 **Codex 额度圆环: Codex Path**（设置键 `codexQuota.codexPath`），填入 `codex.exe` 的**完整路径**，然后运行命令 **Developer: Reload Window**。例如路径可能是：

```text
C:\Users\<用户名>\AppData\Local\Programs\OpenAI\Codex\bin\codex.exe
```

此路径只是示例，实际请以 `Get-Command codex -All` 输出为准。用下面两条命令确认文件确实存在且能执行：

```powershell
Test-Path 'C:\实际路径\codex.exe'
& 'C:\实际路径\codex.exe' --version
```

如果第一条返回 `False`，检查路径拼写，或重新运行 Windows 安装器。若 `Get-Command` 只显示 `codex.ps1` 或 `codex.cmd`，请安装独立 Windows 版本并指向实际的 `codex.exe`。

## 4. WSL 显示 `codex: command not found`

在 **WSL 窗口的集成终端**中运行：

```bash
command -v codex
codex --version
```

如果找不到，在 WSL 内安装 CLI；Windows PowerShell 中安装过也不能代替。安装后重新打开 WSL 终端，并运行 **Developer: Reload Window**。如果 CLI 已安装但仍找不到，在 WSL 设置作用域中把 `codexQuota.codexPath` 设为 `command -v codex` 返回的完整 Linux 路径。

## 5. CLI 能运行，但额度仍为空

1. 在插件运行的同一环境执行 `codex login status`，确认登录方式与账户；需要订阅额度时使用 ChatGPT 登录。
2. 点击视图中的刷新按钮；如果提示超时或网络错误，确认该环境能正常连接 Codex 服务后重试。
3. 若插件显示“Codex 未返回可识别的额度数据”或“该账户未返回时间窗口额度”，先确认该账户在 Codex CLI 中能正常使用，再检查是否使用了正确的 ChatGPT 账户或工作区。服务未提供相关字段时，插件无法自行计算订阅额度。
4. 若刚更换 CLI 路径、安装位置或登录方式，运行 **Developer: Reload Window**。

更多安装与登录说明见 [OpenAI Docs：Codex CLI](https://learn.chatgpt.com/docs/codex/cli)、[WSL](https://learn.chatgpt.com/docs/windows/wsl) 和 [身份验证](https://learn.chatgpt.com/docs/auth)。
