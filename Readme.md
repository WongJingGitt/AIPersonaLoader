# PersonaLoader - AI 人设加载器

<p align="center">
  <img src="https://wongjinggitt.github.io/images/%E5%85%B6%E4%BB%96/PersonaLoaderBanner.jpeg" alt="PersonaLoader 宣传图" width="900" height="320">
</p>

<p align="center">
  <strong>一处配置，多处同步。让每个 AI 从第一句话就“认识”你。</strong>
</p>

<!-- Optimized Badges -->
<p align="center">
    <a href="#"><img src="https://img.shields.io/badge/Version-2.5.1-orange.svg?style=for-the-badge" alt="Version 2.5.1"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=for-the-badge" alt="License Apache 2.0"></a>
    <a href="#"><img src="https://img.shields.io/badge/Status-Active-brightgreen.svg?style=for-the-badge" alt="Status Active"></a>
    <a href="#"><img src="https://img.shields.io/badge/Chrome-Extension-informational.svg?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Chrome Extension"></a>
    <a href="#"><img src="https://img.shields.io/badge/Edge-Extension-blue.svg?style=for-the-badge&logo=microsoft-edge&logoColor=white" alt="Edge Extension"></a>
</p>

<p align="center">
  <a href="docs/user-guide.md"><strong>📖 使用指南</strong></a> •
  <a href="#-核心功能">核心功能</a> •
  <a href="#-功能预览">功能预览</a> •
  <a href="#-两大注入模式">两大注入模式</a> •
  <a href="#-支持平台">支持平台</a> •
  <a href="#-快速上手">快速上手</a> •
  <a href="#-技术架构">技术架构</a>
</p>

> [!WARNING]
> ## ⚠️ 免责声明 (Disclaimer)
> 
> *   **学习与交流**：本项目仅作为技术学习和交流之用，请勿用于任何商业或非法用途。
> *   **遵守第三方协议**：用户在使用本插件与任何第三方 AI 服务（如 ChatGPT、DeepSeek 等）交互时，必须严格遵守相应平台的用户协议和服务条款。
> *   **风险自负**：开发者不对因使用、滥用或无法使用本插件而导致的任何直接或间接的损害、数据丢失或法律纠纷承担任何责任。所有操作均由用户自行承担风险。
> *   **使用即同意**：下载、安装或使用本插件，即表示您已阅读并同意上述所有条款。

---

**PersonaLoader** 是一款浏览器扩展，旨在将您预设的**多套个性化人设方案**无缝注入到您与主流 AI 的对话中。它彻底解决了“每次新对话都要重复介绍自己”的痛点，让每个 AI 从第一句话开始就深度理解你，从而提供真正个性化的回复。

> 这款插件的核心灵感来源于 ChatGPT 的**自定义指令 (Custom Instructions)** 和 **GPTs** 功能，并致力于将这种强大的个性化体验，以更灵活的方式带到更多 AI 平台。

## ✨ 核心功能

### 1. **强大的多维人设系统**
- **创建与管理**：在独立的设置页面自由创建、重命名、删除多套人设方案（如“工作助理”、“创意写作伙伴”、“技术面试官”）。
- **三维定义**：每个人设由 **“👤个人信息”**、**“⚙️输出规范”** 和 **“🧠用户记忆”** 三部分构成，实现对 AI 的全方位调校。
- **一键切换**：在插件的弹出窗口中，通过下拉菜单轻松切换全局激活的人设，即时生效。
- **灵感中心**：内置多种优质模板，帮助你快速构建强大的人设，告别灵感枯竭。

### 2. **现代化的管理界面**
- **专业布局**：选项页面采用**双栏布局**，左侧为“人设配置”和“站点管理”两大独立模块导航，右侧为对应的详细配置区域，结构清晰，操作流畅。
- **动态操作栏**：所有操作按钮（如灵感中心、批量导入/导出）都集成在统一的底部操作栏，并根据当前所选的配置项动态更新，界面整洁且高效。
- **所见即所得**：提供直观的列表管理、开关控制和编辑功能，所有改动都会即时保存并反馈。

### 3. **精细化的站点管理**
- **全局白名单**：在“站点管理”中，你可以集中控制插件在哪些网站上生效。
- **独立开关**：为白名单中的每个网站提供独立的启用/禁用开关。
- **自定义添加**：轻松添加任何新网站到白名单，并支持二次编辑其名称和描述。

## 📸 功能预览 (Feature Preview)

<table>
  <tr>
    <td align="center">
      <p><strong>插件弹出窗口 (一键切换)</strong></p>
      <img src="https://wongjinggitt.github.io/images/其他/AIPersonaLoader-popup.png" width="400" alt="插件弹出窗口，展示了人设下拉选择菜单">
    </td>
    <td align="center">
      <p><strong>手动注入浮窗 (灵活选择)</strong></p>
      <img src="https://wongjinggitt.github.io/images/其他/AIPersonaLoader-输入框注入.png" width="400" alt="在聊天输入框旁的手动注入图标和浮窗">
    </td>
  </tr>
  <tr>
    <td align="center">
      <p><strong>人设配置界面 (双栏布局)</strong></p>
      <img src="https://wongjinggitt.github.io/images/其他/AIPersonaLoader-options-人设.png" width="400" alt="双栏布局的人设管理和编辑界面">
    </td>
    <td align="center">
      <p><strong>站点管理界面 (精细化控制)</strong></p>
      <img src="https://wongjinggitt.github.io/images/其他/AIPersonaLoader-options-站点.png" width="400" alt="站点白名单管理界面，包含独立开关">
    </td>
  </tr>
</table>

## 🚀 两大注入模式

PersonaLoader 提供两种互补的模式，确保在任何场景下都能获得最佳体验。

### 模式一：无感·自动注入 (后台模式)
- **工作方式**：在后台自动监测受支持网站的聊天请求。
- **触发时机**：仅在**新对话开始**或检测到**手动刷新指令 `{{刷新人设}}`** 时触发。
- **核心优势**：完全无感，无需改变你的任何使用习惯。在你发送第一条消息时，人设已经悄无声息地注入其中。
- **适用平台**：适用于已深度适配的 AI 平台。

### 模式二：灵活·手动注入 (前台模式)
- **工作方式**：在所有白名单网站的输入框旁，智能注入一个**功能图标**。
- **核心优势**：
    - **通用性**：即使某个网站未被深度适配，只要它在白名单内，你就能通过此模式注入人设。
    - **即时选择**：点击图标弹出浮窗，可**临时切换**并注入任意一套人设，而不改变全局激活的人设。
    - **一键填充**：选择人设后，其完整 Prompt 会被自动、安全地填充到输入框。
    - **干净利落**：支持临时禁用功能，一键移除所有注入的UI元素和监听器，保持页面纯净。

## ✅ 支持平台

**自动注入**已深度适配以下平台，**手动注入**支持所有白名单内的网站。

- [DeepSeek](https://chat.deepseek.com/)
- [腾讯元宝](https://yuanbao.tencent.com/)
- [通义千问](https://www.tongyi.com/)
- [豆包 / Doubao](https://www.doubao.com/chat/)
- [ChatGPT](https://chatgpt.com/)
- [Grok](https://grok.com/)
- *更多平台正在适配中...*

## 🛠️ 快速上手

1.  **安装插件**：
    - 克隆本仓库或下载 ZIP 压缩包到本地并解压。
    - 在 Chrome/Edge 浏览器中打开 `chrome://extensions/` 页面。
    - 启用 **“开发者模式”**。
    - 将解压后的整个文件夹拖拽到该页面中完成安装。
2.  **配置你的第一个人设**：
    - 点击浏览器工具栏的插件图标，在弹窗中点击 **“详细设置 & 人设管理”**。
    - 在选项页，你可以直接编辑“默认人设”，或点击底部操作栏的“+ 新建人设”。
    - 使用“✨ 灵感中心”为你的新人设快速填充强大的模板。
3.  **激活并使用**：
    - 回到插件弹窗，从下拉菜单中**选择你想激活的人设**。
    - 访问任一受支持的 AI 网站，开始新对话，体验个性化回复！
    > **注意**：首次安装后，如果你的 AI 网站已经打开，请**刷新页面**以确保插件脚本成功加载。

## ⚙️ 技术架构

插件的核心是**后台无感注入**与**前台灵活增强**的协同工作。

1.  **后台服务 (`background.js`)**：作为指挥中心，监听`webNavigation`事件。当用户访问目标网站时，动态注入内容脚本。
2.  **内容脚本 (`contentScripts.js`)**：作为桥梁，运行在隔离的沙箱环境中。它负责与后台服务通信（获取API列表等），并向页面主世界（MAIN World）注入核心 Hook 脚本。同时，它也负责与`inputEnhancer.js`通信。
3.  **核心注入脚本 (`background.js`内的`executeScript`)**：被注入到**MAIN World**，使其拥有访问页面`window`对象的权限。它通过 Hook `fetch` 和 `XMLHttpRequest` 来拦截聊天请求，并根据预设规则修改请求体，植入人设。
4.  **输入框增强器 (`inputEnhancer.js`)**：独立模块，负责所有前台 UI 的注入。它使用`MutationObserver`动态监测并增强页面输入框，提供手动注入功能。
5.  **安全通信**：通过`window.postMessage`和`chrome.runtime.sendMessage`等机制，在不同权限的脚本环境之间安全、高效地传递数据。

## 🔒 隐私承诺

您的数据安全是我们的最高优先级。

*   **纯本地存储**：您的所有人设数据、白名单配置等信息，都**只存储在您本地浏览器的 `chrome.storage.local` 区域中**。
*   **无任何数据上传**：插件代码中不包含任何将您的配置数据上传到任何外部服务器的逻辑。
*   **开源透明**：整个项目代码完全开源，您可以随时审查所有脚本以验证其行为。