
# Variant Compass (小说变体与标注大纲)

> **💡 温馨提示 / Notice:**  
> 插件还在测试当中，欢迎加群讨论反馈！  
> QQ交流群: 1094620986  
> 本插件专为小说大纲、剧本分支等设计，建议在正常长度的文档中使用，超大长篇可能需要注意性能。

[English](#🇬🇧 English)

---

## 🇨🇳 简体中文

**Variant Compass（小说变体与标注大纲）** 是一款专为小说家、剧本创作者及多版本文档撰写者打造的硬核 Obsidian 辅助插件。它彻底改变了传统的修改方式，帮助您在不破坏原稿的情况下，轻松掌控复杂的叙事分支、备选台词与文稿修订。

### 🌟 核心功能

#### 1. 正文变体标注（多版本情节管理）

- **框选即添加**：在编辑器中选中任意文本，右击并选择“添加正文变体标注”，即可锁定该段落。
    
- **无限平行宇宙**：在锁定的原文下，可在侧边栏中添加多个不同的修改备选、角色台词、或不同的情节走向（即“变体”）。
    
- **个性化图标与色彩**：右键侧边栏卡片，可为每条标注分配专属图标（如 💡、⚔️、❤️）和高亮颜色，一眼看清是灵感、战斗还是感情戏。
    

#### 2. 行内幻影预览（所见即所得）

- **无痕替换**：在侧边栏中勾选某个变体，正文中的原文将动态替换为该变体的精美内联挂件（Phantom Widget）。
    
- **智能复制剪切**：当变体生效时，您直接框选正文并复制，系统会自动抓取您替换后的“变体文字”，真正做到所见即所得。
    

#### 3. 侧边栏高级大纲

- **H1-H6 标题过滤**：大长篇小说必备！可在侧边栏顶部一键筛选，只显示当前章节（如 H2）下的变体标注。
    
- **沉浸显示模式**：自由切换卡片标题显示“仅原文本”、“仅分支文本”或“同时显示”。
    
- **手风琴式折叠**：支持开启/关闭自动展开模式。关闭时，点击哪张卡片就展开哪张，极大节省侧边栏空间。
    

#### 4. 终极数据防丢失机制（专为网文作者打造）

- **防误删锁定保护**：被标注的正文将变为“不可删除”受保护状态。彻底杜绝因为误删文字导致数据错位的灾难！（如需删除原文，需先在侧边栏解除标注）。
    
- **后台静默滚动备份**：插件每隔几小时会在系统底层自动为您备份整个标注数据库（最多保留 50 份），就算同步盘崩溃也能一键找回心血。
    
- **底层映射回收站**：如果因为外部操作导致文件改名或丢失，可在设置面板的“数据库管理器”中重新关联或从回收站恢复数据。
    

#### 5. 一键导出最终定稿

- 选好了所有的情节分支，想要导出给编辑看？
    
- 只需在侧边栏空白处右击，选择“导出当前变体全文”。插件将以无损原文的方式，将所有勾选生效的变体替换到正文中，并自动生成一份干净的全新 .md 导出文件！
    

### ⚙️ 数据存储机制

所有的变体标注和备选文本数据，均加密保存在您指定的本地 .md 文件（默认：大纲变体标注数据库.md）中的一个 JSON 代码块内。**数据随笔记走，完全离线**，支持任意多端云同步。

### 📥 安装方法

#### 方法一：社区插件安装（推荐）

待本插件通过审核上架后，您可以直接在软件内安装：

1. 打开 Obsidian **设置** > **社区插件** > **浏览**。
    
2. 搜索 Variant Compass。
    
3. 点击 **安装**，随后选择 **启用**。
    

#### 方法二：手动安装

1. 前往本仓库的 Releases 页面，下载最新的 main.js、manifest.json 和 styles.css 文件。
    
2. 打开您的 Obsidian 库所在的本地文件夹。
    
3. 进入 .obsidian/plugins/ 目录，创建一个名为 footnote-compass（或您自定义的英文名）的新文件夹。
    
4. 将下载的三个文件放入该文件夹。
    
5. 重启 Obsidian，或者在 **设置** > **社区插件** 中刷新并启用该插件。
    

### 🛠️ 使用指南

1. **呼出面板**：点击 Obsidian 左侧功能栏的 **Message Circle（气泡）** 图标，打开“变体与标注”大纲视图。
    
2. **创建分支**：在正文中鼠标选中一段想要进行多版本修改的文字 -> 右击选区 -> 点击 **添加正文变体标注**。
    
3. **编写备选**：在右侧弹出的卡片上右击，选择 **添加分支**，写下您的其他备选词句或不同情节。
    
4. **实时预览**：勾选卡片中不同的分支前面的复选框，即可在正文中实时查看替换后的效果。光标点击某行时，侧边栏会自动滚动并高亮对应的卡片。
    
5. **导出全文**：确定版本后，右击侧边栏空白处并选择 **导出当前变体全文** 即可生成最终定稿。
    

---

## 🇬🇧 English

**Variant Compass** is a powerful, specialized Obsidian plugin designed for novelists, scriptwriters, and content creators. It provides an elegant sidebar outline to manage, preview, and export alternative text variants (revisions, dialogue choices, or plot branches) seamlessly without cluttering your original manuscript.

### 🌟 Key Features

#### 1. Novel/Text Variant Management

- **Add Variants**: Select any text in the editor, right-click, and select "Add Text Variant Annotation" to mark a section of text.
    
- **Multiple Branches**: Add multiple alternative drafts, character dialogues, or plot directions under the same marked text in the sidebar.
    
- **Custom Icons & Colors**: Assign custom emojis/icons and colors to specific annotations to categorize your plot points or character dialogues.
    

#### 2. Inline Phantom Preview (WYSIWYG)

- Toggle alternative variants in the sidebar using checkboxes.
    
- The checked variant will dynamically replace the original text inline with a beautifully styled, read-only Phantom Widget.
    
- **What You See Is What You Get**: If you copy the text while a variant is active, the clipboard will safely capture the variant text!
    

#### 3. Advanced Sidebar Outline

- **Heading Filters**: Filter your variant annotations by document headings (H1 - H6) to focus on a specific chapter.
    
- **Display Modes**: Toggle the sidebar card display mode to show only the "Original text", only the "Variant text", or "Both".
    
- **Smart Expand/Collapse**: Use the global collapse toggle or auto-expand mode to keep your sidebar clean and focused.
    

#### 4. Ultimate Data Safety & Backups

- **Deletion Lock**: Accidental deletions are a thing of the past! Annotated text is locked and protected in the editor. You must remove the annotation from the sidebar before deleting the original text.
    
- **Silent Auto-Backups**: A built-in backup engine silently takes snapshots of your annotation database every few hours, keeping up to 50 versions locally.
    
- **Database Trash Bin**: If you accidentally rename or delete a file outside Obsidian, your data isn't lost. Use the built-in Database Manager to relink or restore discarded annotations.
    

#### 5. One-Click Variant Export

- Seamlessly export your alternative draft. Right-click in the sidebar and select "Export Current Variant Fulltext".
    
- It generates a new, clean markdown file, automatically substituting all active text variants while keeping your original draft completely untouched.
    

### ⚙️ Data Storage Mechanism

All annotation and variant data are stored securely inside a dedicated markdown file (default: 大纲变体标注数据库.md / Annotations.md) inside a hidden JSON code block. This allows your annotations to be safely backed up and synchronized along with your normal vault files offline.

### 📥 Installation

#### Method 1: Community Plugins (Recommended)

Once approved, install it directly from the Obsidian plugin store:

1. Go to **Settings** > **Community plugins** > **Browse**.
    
2. Search for Variant Compass.
    
3. Click **Install**, then **Enable**.
    

#### Method 2: Manual Installation

1. Go to the Releases page and download main.js, manifest.json, and styles.css.
    
2. Open your Obsidian vault folder.
    
3. Navigate to <vault>/.obsidian/plugins/ and create a folder named footnote-compass.
    
4. Copy the downloaded files into that folder.
    
5. Reload Obsidian or toggle the plugin on in Settings.
    

### 🛠️ How to Use

1. **Open the Sidebar**: Click the **Message Circle** ribbon icon on the left sidebar to open the Variant Outline.
    
2. **Create a Branch**: Select a word/sentence in your manuscript -> Right-click -> **Add Text Variant Annotation**.
    
3. **Write Alternatives**: Right-click the newly created card in the sidebar -> **Add Branch**, and write your alternative plot or dialogue.
    
4. **Live Preview**: Check the boxes on the sidebar cards to instantly see the text swap in your document. The sidebar auto-scrolls to the relevant card when you click a line in the editor.
    
5. **Export Final Draft**: Right-click the empty space in the sidebar -> **Export Current Variant Fulltext** to generate your final version.