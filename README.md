# Footnote Compass (脚注与变体大纲)

A powerful hybrid Obsidian plugin designed for writers, novelists, and content creators. It provides an elegant sidebar outline for footnotes and allows you to highlight text to manage, preview, and export alternative text variants (revisions/plots) seamlessly.

QQ交流群:599796635
不要处理长文本,这是给小说大纲这种短文本准备的!!!

[简体中文说明](#简体中文)

---

## 🌟 Key Features

### 1. Footnote & Annotation Outline
- Automatically parses all footnotes (`[^1]`) in your active document.
- Interactive outline in the right sidebar—click any footnote to navigate instantly with smooth scrolling.
- Highlights the active footnote element dynamically as your cursor moves or as you scroll through the editor.
- Supports sorting footnotes numerically or by document order.

### 2. Novel/Text Variant Management
- **Add Variants**: Select any text in the editor, right-click, and select "Add Text Variant Annotation" (添加正文变体标注) to mark a section of text.
- **Multiple Branches**: Add multiple alternative drafts, character dialogues, or plot directions (variants) under the same marked text.
- **Inline Phantom Preview**: Toggle alternative variants in the sidebar using checkboxes. The checked variant will dynamically replace the original text inline with a beautifully styled inline widget (*Phantom Widget*). Unchecked annotations will gracefully display as colored highlights.

### 3. One-Click Variant Export
- Seamlessly export your alternative draft. Right-click in the sidebar and select "Export Current Variant Fulltext" (导出当前变体全文).
- It generates a new, clean markdown file, automatically substituting all active text variants while keeping your original draft completely untouched.

### 4. Footnote Beautifier
- Enable **Footnote Beautification** (脚注美化) in the settings.
- It automatically changes how footnote references display in the editor, styling them elegantly and adding context-aware emoji tags (💬) to make footnote-heavy manuscripts look pristine.

---

## ⚙️ Settings & Data Security

- **Safe Storage**: All annotation and variant data are stored inside a dedicated markdown file (default: `大纲变体标注数据库.md` / `Annotations.md`) inside a secure, hidden JSON code block. This allows your annotations to be safely backed up and synchronized along with your normal vault files.
- **Color Presets**: Fully customize the default highlight and text-replacement colors with an interactive color picker and preset grid.

---

## 📥 Installation

### Method 1: Community Plugins (Recommended)
Once approved, install it directly from the Obsidian plugin store:
1. Go to **Settings** > **Community plugins** > **Browse**.
2. Search for `Footnote Compass`.
3. Click **Install**, then **Enable**.

### Method 2: Manual Installation
1. Go to the [Releases](https://github.com/hornatx/footnote-compass/releases) page and download `main.js`, `manifest.json`, and `styles.css`.
2. Open your Obsidian vault folder in your file explorer.
3. Navigate to `<vault>/.obsidian/plugins/` and create a folder named `footnote-compass`.
4. Copy the downloaded files into that folder.
5. Reload Obsidian or go to **Settings** > **Community plugins**, and toggle the plugin on.

---

## 🛠️ How to Use

### Managing Footnotes
1. Write footnotes in your document using standard syntax: `This is a statement.[^1]` and define it later: `[^1]: This is the footnote content.`
2. Click the **Message Circle** ribbon icon on the left sidebar to open the Footnote Outline.
3. Click any footnote in the list to jump straight to its location in the editor.

### Managing Text Variants (Alternative Drafts)
1. Select a word, sentence, or paragraph in your manuscript.
2. Right-click the selection and choose **Add Text Variant Annotation** (添加正文变体标注).
3. In the sidebar card, click **Add** (新增) to write your alternative options.
4. Check any option to dynamically preview how it looks inside your actual document.
5. To generate a separate version of your draft with your checked options, right-click the sidebar and select **Export Current Variant Fulltext** (导出当前变体全文).

---

## 简体中文

**Footnote Compass（脚注与变体大纲）** 是一款专为小说家、创作者及多版本文档撰写者打造的 Obsidian 辅助插件。它将“脚注导航”与“多分支文本变体管理”完美结合，帮助您轻松掌控复杂的叙事结构与文稿修订。

---

## 🌟 核心功能

### 1. 脚注与标注大纲
- 自动解析当前活动文档中的所有脚注（`[^1]`）。
- 在右侧边栏提供直观的大纲视图，点击即可平滑跳转定位。
- 智能光标与滚动跟踪：侧边栏大纲会根据您在正文中的阅读位置或光标位置自动高亮对应的脚注。
- 支持按文档先后顺序排列，或按数字大小进行排序。

### 2. 正文变体标注（多版本情节管理）
- **添加变体**：在编辑器中选中任意文本，右击并选择“添加正文变体标注”，即可锁定该段落。
- **多版本管理**：在锁定的原文下，可在侧边栏中添加多个不同的修改备选、角色台词、或不同的情节走向（即“变体”）。
- **幻影行内预览**：在侧边栏中勾选某个变体，正文中的原文将动态替换为该变体的精美内联挂件（Phantom Widget）。未勾选时，则会恢复为柔和的彩色背景高亮。

### 3. 一键导出特定版本
- 想要将选中的修改版本汇整成独立篇章？
- 只需在侧边栏空白处右击，选择“导出当前变体全文”。插件将以无损原文的方式，将所有勾选生效的变体替换到正文中，并自动生成一份干净的全新 `.md` 文件。

### 4. 脚注美化
- 在设置中开启“脚注美化”选项。
- 插件会自动优化源文件和实时预览（Live Preview）中脚注引用的显示样式，为其戴上气泡图标（💬），让充斥着脚注的学术或创作手稿视觉观感更为优雅。

---

## ⚙️ 设置与数据安全

- **数据安全备份**：所有的变体标注和备选文本数据，均加密保存在您指定的本地 `.md` 文件（默认：`大纲变体标注数据库.md`）中的一个 JSON 代码块内。数据随笔迹走，支持多端云同步与本地备份，无数据丢失之虞。
- **颜色预设管理**：提供直观的调色盘和十六进制色彩编辑器，支持自定义原文高亮颜色、变体幻影颜色及常用的颜色预设。

---

## 📥 安装方法

### 方法一：社区插件安装（推荐）
待本插件通过审核上架后，您可以直接在软件内安装：
1. 打开 Obsidian **设置** > **社区插件** > **浏览**。
2. 搜索 `Footnote Compass`。
3. 点击 **安装**，随后选择 **启用**。

### 方法二：手动安装
1. 前往本仓库的 [Releases](https://github.com/hornatx/footnote-compass/releases) 页面，下载最新的 `main.js`、`manifest.json` 和 `styles.css` 文件。
2. 打开您的 Obsidian 库所在的本地文件夹。
3. 进入 `.obsidian/plugins/` 目录，创建一个名为 `footnote-compass` 的新文件夹。
4. 将下载的三个文件放入该文件夹。
5. 重启 Obsidian，或者在 **设置** > **社区插件** 中刷新并启用该插件。

---

## 🛠️ 使用说明

### 管理脚注
1. 在正文中使用标准语法输入脚注：`这里是一段话。[^1]`，并在文章其他地方定义它：`[^1]: 这里是脚注的具体解释。`
2. 点击 Obsidian 左侧功能栏的 **Message Circle** 图标，即可展开大纲视图。
3. 点击列表中的任意脚注项，编辑器即可自动滚动并精准定位。

### 管理正文变体（多版本备选草稿）
1. 在您的手稿中，鼠标选中一段想要进行多版本对比或修改的文字。
2. 右击该选区，点击 **添加正文变体标注**。
3. 在右侧卡片中点击 **新增**，写下您的其他备选词句或不同情节。
4. 勾选卡片中不同的备选，即可在正文中实时查看替换后的效果。
5. 确定版本后，右击侧边栏空白处并选择 **导出当前变体全文** 即可生成最终定稿。