# 📌 小说标注与分支大纲 (Footnote Compass)

一个专为小说创作者设计的 Obsidian 插件，提供强大的文本标注、变体管理和大纲导航功能。帮助你轻松管理小说中的不同版本、分支剧情和角色变体。

<a href="https://www.xiaohongshu.com/user/profile/6353523d000000001802f8ae?xsec_token=YB4vLkLfzOijtg8c1Vh12ZASaI1ByqPPYi82ZzKbG72qE=&xsec_source=app_share&xsshare=QQ&appuid=6353523d000000001802f8ae&apptime=1780631605&share_id=3846902afcd94e2ab78467cd7b9b5669" target="_blank"><img src="https://img.shields.io/badge/✦_关注小红书-ff2442?style=for-the-badge&logo=xiaohongshu&logoColor=white" alt="关注小红书" height="40" style="border-radius: 8px; box-shadow: 0 2px 4px rgba(33, 31, 32, 0.84);"></a>

我在小红书发布了许多obsidian的教程和插件开发进度，你的关注就是对我最大的支持

<p align="center">
  <img src="assets/演示1.gif" alt="插件演示" />
</p>

<p align="center">
  <img src="assets/演示2.gif" alt="插件演示" />
</p>

[简体中文](#简体中文) | [用法](#用法) | [English](#english) | [Usage](#usage)

---

## 简体中文

### 核心功能

#### 1. 智能标注系统
选中任意文本右键即可添加标注，为每个标注创建多个变体版本（如不同剧情走向、角色台词等），切换变体时正文中的文本会实时替换显示，支持为标注和变体设置不同颜色。

#### 2. 侧边栏大纲导航
在侧边栏展示当前文档的所有标注，支持按 H1-H6 标题层级分组显示，点击标注卡片即可跳转到正文对应位置，滚动正文时侧边栏会自动高亮当前视野内的标注。

#### 3. 数据安全保障
后台静默备份，支持自定义备份间隔和保留份数。开启锁定保护后被标注的原文不可直接删除，防止误操作。删除的标注可移至回收站支持恢复或彻底删除，文件移动或重命名后支持重新关联标注数据。

#### 4. 高级编辑功能
复制包含变体的文本时自动复制显示的变体内容（所见即所得），支持为标注添加 Obsidian 内置图标增强视觉识别，一键导出当前所有选中变体的完整文本。

***

## 用法

1. 安装插件后，无需任何配置即可开始工作。
2. 在 Markdown 文件中选中要标注的文本，右键点击选择"添加分支标注"。
3. 在侧边栏的标注卡片上右键选择"添加分支"创建新变体，点击变体前的复选框即可切换显示。
4. 点击标注卡片可跳转到正文对应位置，滚动正文时侧边栏会自动高亮当前视野内的标注。

***

### 赞赏支持

<details>
<summary>🎁 如果觉得有用，请作者喝杯咖啡</summary>

<br>

<p align="center">
  <img src="assets/赞赏码.JPG" width="250" />
</p>

</details>

***

### 安装方法

#### 方法一：社区插件安装（推荐）

待插件通过审核并上架社区市场后：
1. 打开 Obsidian **设置** > **社区插件** > **浏览**。
2. 搜索并选择 `Footnote Compass`。
3. 点击 **安装** 并选择 **启用**。

#### 方法二：手动安装

1. 前往 [Releases](https://github.com/hornatx/footnote-compass/releases) 页面下载最新的 `main.js` 和 `manifest.json` 文件。
2. 打开您的 Obsidian 库所在的本地文件夹。
3. 进入 `.obsidian/plugins/` 目录，并创建一个名为 `footnote-compass` 的文件夹。
4. 将下载的两个文件放入该文件夹中。
5. 在 Obsidian **设置** > **社区插件** 中重新加载并开启该插件。

***

QQ 交流群：1094620986

---

## English

**Footnote Compass** — A powerful Obsidian plugin designed for novel writers, offering advanced text annotation, variant management, and outline navigation. Easily manage different versions, branching plots, and character variations in your stories.

<p align="center">
  <img src="assets/演示1.gif" alt="Plugin Demo" />
</p>

<p align="center">
  <img src="assets/演示2.gif" alt="Plugin Demo" />
</p>

***

### Features

#### 1. Smart Annotation System
Select any text and right-click to add annotations. Create multiple variants for each annotation (e.g., different plot directions, character dialogues). Switch variants and see text replaced in real-time with customizable colors.

#### 2. Sidebar Outline Navigation
Display all annotations for the current document in the sidebar. Group annotations by H1-H6 heading levels. Click annotation cards to jump to the corresponding position. Auto-highlight annotations in the sidebar as you scroll through the document.

#### 3. Data Safety
Silent background backup with customizable interval and retention count. When lock protection is enabled, annotated text cannot be directly deleted. Deleted annotations can be moved to trash supporting recovery or permanent deletion. Re-associate annotation data after file moves or renames.

#### 4. Advanced Editing
When copying text with variants, automatically copies the displayed variant content (WYSIWYG). Add Obsidian built-in icons to annotations for visual identification. Export complete text of all selected variants with one click.

***

## Usage

1. After installing the plugin, it works without any configuration.
2. Select text in a Markdown file, right-click and choose "Add Branch Annotation".
3. Right-click on an annotation card in the sidebar to select "Add Branch" and create a new variant. Click the checkbox before a variant to switch display.
4. Click annotation cards to jump to the corresponding position. Auto-highlight annotations in the sidebar as you scroll through the document.

***

### Installation

#### Method 1: Community Plugins (Recommended)

Once the plugin is reviewed and listed on the community marketplace:
1. Open Obsidian **Settings** > **Community plugins** > **Browse**.
2. Search for and select `Footnote Compass`.
3. Click **Install** and then **Enable**.

#### Method 2: Manual Installation

1. Go to the [Releases](https://github.com/hornatx/footnote-compass/releases) page to download the latest `main.js` and `manifest.json` files.
2. Open your Obsidian vault folder on your computer.
3. Navigate to the `.obsidian/plugins/` directory and create a folder named `footnote-compass`.
4. Place the downloaded files into this folder.
5. Reload and enable the plugin in Obsidian **Settings** > **Community plugins**.

***

QQ Group: 1094620986
