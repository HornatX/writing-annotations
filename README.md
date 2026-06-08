# 📌 小说标注与分支大纲 (Footnote Compass)

一个专为小说创作者设计的 Obsidian 插件，提供强大的文本标注、变体管理和大纲导航功能。帮助你轻松管理小说中的不同版本、分支剧情和角色变体。

<a href="https://www.xiaohongshu.com/user/profile/6353523d000000001802f8ae?xsec_token=YB4vLkLfzOijtg8c1Vh12ZASaI1ByqPPYi82ZzKbG72qE=&xsec_source=app_share&xsshare=QQ&appuid=6353523d000000001802f8ae&apptime=1780631605&share_id=3846902afcd94e2ab78467cd7b9b5669" target="_blank"><img src="https://img.shields.io/badge/✦_关注小红书-ff2442?style=for-the-badge&logo=xiaohongshu&logoColor=white" alt="关注小红书" height="40" style="border-radius: 8px; box-shadow: 0 2px 4px rgba(33, 31, 32, 0.84);"></a>

我在小红书发布了许多 Obsidian 的教程和插件开发进度，你的关注就是对我最大的支持

<p align="center">
  <img src="assets/滚轮演示.gif" alt="插件演示" />
</p>

[简体中文](#简体中文) | [English](#english)

---

## 简体中文

### ✨ 核心功能

#### 1. 智能标注系统
- **文本标注**：选中任意文本，右键即可添加标注
- **变体管理**：为每个标注创建多个变体版本（如不同剧情走向、角色台词等）
- **实时预览**：切换变体时，正文中的文本会实时替换显示
- **颜色自定义**：支持为标注和变体设置不同颜色，便于区分

#### 2. 侧边栏大纲导航
- **标注列表**：在侧边栏展示当前文档的所有标注
- **标题分类**：支持按 H1-H6 标题层级分组显示标注
- **快速跳转**：点击标注卡片即可跳转到正文对应位置
- **滚动同步**：滚动正文时，侧边栏会自动高亮当前视野内的标注

#### 3. 数据安全保障
- **自动备份**：后台静默备份，支持自定义备份间隔和保留份数
- **锁定保护**：开启后，被标注的原文不可直接删除，防止误操作
- **回收站机制**：删除的标注可移至回收站，支持恢复或彻底删除
- **断联修复**：文件移动或重命名后，支持重新关联标注数据

#### 4. 高级编辑功能
- **所见即所得复制**：复制包含变体的文本时，自动复制显示的变体内容
- **图标标记**：支持为标注添加 Obsidian 内置图标，增强视觉识别
- **批量导出**：一键导出当前所有选中变体的完整文本

***

### 📦 安装方法

#### 方法一：社区插件安装（推荐）

待插件通过审核并上架社区市场后：
1. 打开 Obsidian **设置** > **社区插件** > **浏览**
2. 搜索并选择 `Footnote Compass`
3. 点击 **安装** 并选择 **启用**

#### 方法二：手动安装

1. 前往 [Releases](https://github.com/hornatx/footnote-compass/releases) 页面下载最新的 `main.js` 和 `manifest.json` 文件
2. 打开您的 Obsidian 库所在的本地文件夹
3. 进入 `.obsidian/plugins/` 目录，并创建一个名为 `footnote-compass` 的文件夹
4. 将下载的两个文件放入该文件夹中
5. 在 Obsidian **设置** > **社区插件** 中重新加载并开启该插件

***

### 🎯 使用指南

#### 基础操作

**添加标注**
1. 在 Markdown 文件中选中要标注的文本
2. 右键点击，选择 **"添加分支标注"**
3. 标注会自动创建，并在侧边栏显示

**管理变体**
1. 在侧边栏的标注卡片上 **右键**
2. 选择 **"添加分支"** 创建新变体
3. 点击变体前的复选框即可切换显示

**修改原文本**
1. 在侧边栏标注卡片上 **右键**
2. 选择 **"修改原文本"**
3. 输入新内容后确认保存

#### 高级功能

**标题分类显示**
1. 在侧边栏顶部点击 **标题过滤按钮**（如 "无 ▾"）
2. 选择标题层级（H1-H6）
3. 标注会按对应标题分组显示

**显示模式切换**
- **标题模式**：只显示标注的原文本
- **分支模式**：只显示当前选中的变体
- **同时模式**：同时显示原文本和变体

**导出变体全文**
1. 在侧边栏空白处 **右键**
2. 选择 **"导出当前变体全文"**
3. 会生成新文件，包含所有选中变体的替换结果

***

### ⚙️ 设置选项

**数据存储**
- **标注数据存储文件**：指定存储标注数据的 Markdown 文件路径
- **锁定删除保护**：开启后，被标注的原文不可直接删除

**颜色设置**
- **默认原文本高亮颜色**：正文中标注文本的高亮颜色
- **默认替换后变体颜色**：变体文本的颜色
- **侧边栏分类标题颜色**：侧边栏标题分组的颜色
- **选区背景高亮颜色**：选中文本时的背景色
- **颜色预设管理**：自定义常用颜色集合

**显示设置**
- **图标向下微调**：调整标注图标的垂直位置
- **自动展开**：控制侧边栏标注卡片是否自动展开

**数据安全**
- **自动备份冷却时间**：两次备份之间的最小间隔（1-60 分钟）
- **最多保留历史份数**：自动删除超出数量的旧备份（20-100 份）
- **查看备份文件**：打开备份文件夹进行手动管理

***

### 🔧 技术特性

**性能优化**
- **防抖机制**：编辑时采用 500ms 防抖，避免频繁刷新
- **缓存读取**：使用 Obsidian 的 `cachedRead` 提升文件读取性能
- **离线渲染**：使用 DocumentFragment 批量更新 DOM，减少重排

**数据安全**
- **原子写入**：使用 `vault.process` 确保数据完整写入
- **防清空保护**：检测到异常数据清空时自动拦截保存
- **自愈搜索**：文本位置变化时自动修复标注定位

**跨平台兼容**
- **Obsidian API**：完全使用 Obsidian 官方 API，不依赖 Node.js 模块
- **资源清理**：`onunload` 时自动清理所有事件监听和 DOM 元素
- **CSS 变量**：使用 Obsidian 主题变量，支持深色/浅色模式

***

### 🤝 反馈与支持

**问题反馈**
- GitHub Issues: [提交问题](https://github.com/hornatx/footnote-compass/issues)
- 小红书私信: [@你的小红书ID](https://www.xiaohongshu.com/user/profile/6353523d000000001802f8ae)

**交流社群**
- QQ 交流群: **1094620986**

### 赞赏支持

<details>
<summary>🎁 如果觉得有用，请作者喝杯咖啡</summary>

<p align="center">
  <img src="assets/赞赏码.JPG" width="250" />
</p>

</details>

---

## English

**Footnote Compass** — A powerful Obsidian plugin designed for novel writers, offering advanced text annotation, variant management, and outline navigation. Easily manage different versions, branching plots, and character variations in your stories.

<p align="center">
  <img src="assets/滚轮演示.gif" alt="Plugin Demo" />
</p>

***

### ✨ Core Features

#### 1. Smart Annotation System
- **Text Annotation**: Select any text, right-click to add annotations
- **Variant Management**: Create multiple variants for each annotation (e.g., different plot directions, character dialogues)
- **Real-time Preview**: Switch variants and see text replaced in real-time
- **Color Customization**: Set different colors for annotations and variants

#### 2. Sidebar Outline Navigation
- **Annotation List**: Display all annotations for the current document in the sidebar
- **Heading Classification**: Group annotations by H1-H6 heading levels
- **Quick Jump**: Click annotation cards to jump to the corresponding position
- **Scroll Sync**: Auto-highlight annotations in the sidebar as you scroll through the document

#### 3. Data Safety
- **Auto Backup**: Silent background backup with customizable interval and retention count
- **Lock Protection**: When enabled, annotated text cannot be directly deleted
- **Recycle Bin**: Deleted annotations can be moved to trash, supporting recovery or permanent deletion
- **Relink Support**: Re-associate annotation data after file moves or renames

#### 4. Advanced Editing
- **WYSIWYG Copy**: When copying text with variants, automatically copies the displayed variant content
- **Icon Marking**: Add Obsidian built-in icons to annotations for visual identification
- **Batch Export**: Export complete text of all selected variants with one click

***

### 📦 Installation

#### Method 1: Community Plugins (Recommended)

Once the plugin is reviewed and listed on the community marketplace:
1. Open Obsidian **Settings** > **Community plugins** > **Browse**
2. Search for and select `Footnote Compass`
3. Click **Install** and then **Enable**

#### Method 2: Manual Installation

1. Go to the [Releases](https://github.com/hornatx/footnote-compass/releases) page to download the latest `main.js` and `manifest.json` files
2. Open your Obsidian vault folder on your computer
3. Navigate to the `.obsidian/plugins/` directory and create a folder named `footnote-compass`
4. Place the downloaded files into this folder
5. Reload and enable the plugin in Obsidian **Settings** > **Community plugins**

***

### 🎯 Usage Guide

#### Basic Operations

**Add Annotation**
1. Select text in a Markdown file
2. Right-click and choose **"Add Branch Annotation"**
3. The annotation will be created and displayed in the sidebar

**Manage Variants**
1. Right-click on an annotation card in the sidebar
2. Select **"Add Branch"** to create a new variant
3. Click the checkbox before a variant to switch display

**Modify Original Text**
1. Right-click on an annotation card in the sidebar
2. Select **"Modify Original Text"**
3. Enter new content and confirm

#### Advanced Features

**Heading Classification**
1. Click the **heading filter button** at the top of the sidebar (e.g., "None ▾")
2. Select heading level (H1-H6)
3. Annotations will be grouped by the selected heading level

**Display Mode Switch**
- **Title Mode**: Show only the original annotation text
- **Variant Mode**: Show only the currently selected variant
- **Both Mode**: Show both original text and variant

**Export Variant Text**
1. Right-click in the sidebar blank area
2. Select **"Export Current Variant Full Text"**
3. A new file will be generated with all selected variants replaced

***

### ⚙️ Settings

**Data Storage**
- **Annotation Data File**: Specify the Markdown file path for storing annotation data
- **Lock Deletion Protection**: When enabled, annotated text cannot be directly deleted

**Color Settings**
- **Default Highlight Color**: Highlight color for annotated text in the document
- **Default Variant Color**: Color for variant text
- **Sidebar Heading Color**: Color for heading groups in the sidebar
- **Selection Background Color**: Background color when text is selected
- **Color Presets**: Manage custom color collections

**Display Settings**
- **Icon Vertical Offset**: Adjust the vertical position of annotation icons
- **Auto Expand**: Control whether sidebar annotation cards auto-expand

**Data Safety**
- **Backup Cooldown**: Minimum interval between backups (1-60 minutes)
- **Max Backup Count**: Auto-delete old backups when exceeding limit (20-100)
- **View Backup Files**: Open backup folder for manual management

***

### 🔧 Technical Features

**Performance Optimization**
- **Debounce Mechanism**: 500ms debounce during editing to avoid frequent refreshes
- **Cached Read**: Use Obsidian's `cachedRead` for better file read performance
- **Offline Rendering**: Use DocumentFragment for batch DOM updates, reducing reflows

**Data Safety**
- **Atomic Write**: Use `vault.process` for complete data writing
- **Anti-clear Protection**: Auto-intercept saves when abnormal data clearing is detected
- **Self-healing Search**: Auto-fix annotation positioning when text positions change

**Cross-platform Compatibility**
- **Obsidian API**: Uses only Obsidian official API, no Node.js module dependencies
- **Resource Cleanup**: Auto-cleanup of all event listeners and DOM elements in `onunload`
- **CSS Variables**: Uses Obsidian theme variables, supports dark/light modes

***

### 🤝 Feedback & Support

**Issue Feedback**
- GitHub Issues: [Submit Issues](https://github.com/hornatx/footnote-compass/issues)

**Community**
- QQ Group: **1094620986**

### Support

<details>
<summary>🎁 If you find it helpful, buy the author a coffee</summary>

<p align="center">
  <img src="assets/赞赏码.JPG" width="250" />
</p>

</details>

---

## 📄 License

MIT License

---

## 🙏 Acknowledgments

Thanks to all users who use and provide feedback. Your support drives continuous development!

---

**Made with ❤️ for Obsidian users**
