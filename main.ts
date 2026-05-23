/* main.ts - Footnote & Hover Note Compass (TypeScript 重构完整版) */
import {
    App, Plugin, ItemView, debounce, setIcon, Menu, Modal, Setting,
    PluginSettingTab, TFile, Notice, AbstractInputSuggest, normalizePath,
    WorkspaceLeaf, MarkdownView
} from 'obsidian';
import { RangeSetBuilder, StateField, StateEffect, Transaction } from "@codemirror/state";
import { Decoration, DecorationSet, WidgetType, EditorView } from "@codemirror/view";

const VIEW_TYPE_FOOTNOTE = "footnote-compass-view";

// --- 接口与类型定义 (Interfaces & Types) ---

export interface ColorPreset {
    name: string;
    hex: string;
}

export interface FootnoteCompassSettings {
    beautifyEnabled: boolean;
    isSortByKey: boolean;
    isAnnotationsCollapsed: boolean;
    annotationFilePath: string;
    defaultHighlightColor: string;
    defaultPhantomColor: string;
    colorPresets: ColorPreset[];
    headingFilters: Record<string, string>; // 新增：保存每个文件的标题过滤偏好
    headingColor: string; // 新增：侧边栏分类标题颜色
}

export interface AnnotationComment {
    id: string;
    text: string;
    checked: boolean;
}

export interface Annotation {
    id: string;
    original: string;
    prefix?: string;
    suffix?: string;
    expectedOffset: number;
    comments: AnnotationComment[];
    highlightColor?: string;
    phantomColor?: string;
    // 运行时临时变量
    _tempOffset?: number;
    _exportOffset?: number;
    el?: HTMLElement;
}

export interface FootnoteRef {
    type: string;
    key: string;
    content: string;
    line: number;
    col: number;
    len: number;
    el: HTMLElement | null;
}

// --- 工具：生成安全 UUID ---
function generateUUID(): string {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// --- 工具：Hex 转 RGBA ---
function hexToRgba(hex: string, alpha: number): string {
    if (!/^#([0-9A-Fa-f]{3}){1,2}$/.test(hex)) return hex;
    let c: any = hex.substring(1).split('');
    if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    c = '0x' + c.join('');
    return `rgba(${[(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',')}, ${alpha})`;
}

// --- 核心算法：带预期偏移量的自愈搜索 (防死循环保护版) ---
function findAnnotationOffsetAndHeal(text: string, anno: Annotation): { start: number, end: number } | null {
    const prefix = anno.prefix || "";
    const suffix = anno.suffix || "";
    const original = anno.original || "";
    const expected = anno.expectedOffset || 0;

    // 🚨 绝对防御：防止空字符串导致 while 陷入死循环卡死整个 UI
    if (!original || original.length === 0) return null;

    const exactTarget = prefix + original + suffix;

    // 1. 精确匹配 (寻找距离预期位置最近的完美匹配)
    let bestExact = -1;
    let minExactDiff = Infinity;
    if (exactTarget && exactTarget.length > 0) {
        let searchIdx = text.indexOf(exactTarget);
        while (searchIdx !== -1) {
            let diff = Math.abs(searchIdx - expected);
            if (diff < minExactDiff) { minExactDiff = diff; bestExact = searchIdx; }
            searchIdx = text.indexOf(exactTarget, searchIdx + 1);
        }
    }

    if (bestExact !== -1) {
        anno.expectedOffset = bestExact + prefix.length;
        return { start: anno.expectedOffset, end: anno.expectedOffset + original.length };
    }

    // 2. 降级匹配自愈 (寻找距离预期位置最近的原词)
    let bestFallback = -1;
    let minFallbackDiff = Infinity;
    let fbIdx = text.indexOf(original);
    while (fbIdx !== -1) {
        let diff = Math.abs(fbIdx - expected);
        if (diff < minFallbackDiff) { minFallbackDiff = diff; bestFallback = fbIdx; }
        fbIdx = text.indexOf(original, fbIdx + 1);
    }

    if (bestFallback !== -1) {
        // ✨ 自愈：更新前缀和后缀，以便下次精准定位
        anno.prefix = text.substring(Math.max(0, bestFallback - 10), bestFallback);
        anno.suffix = text.substring(bestFallback + original.length, bestFallback + original.length + 10);
        anno.expectedOffset = bestFallback;
        return { start: bestFallback, end: bestFallback + original.length };
    }

    return null; // 彻底丢失
}

// --- UI：文件搜索提示框 ---
class FileSuggest extends AbstractInputSuggest<TFile> {
    textInput: Setting | any; // Any because Setting text input isn't fully exported
    onSelectCallback: (path: string) => void;

    constructor(app: App, textInput: any, onSelect: (path: string) => void) {
        super(app, textInput.inputEl);
        this.textInput = textInput;
        this.onSelectCallback = onSelect;
    }
    getSuggestions(inputStr: string): TFile[] {
        return this.app.vault.getMarkdownFiles().filter(f => f.path.toLowerCase().includes(inputStr.toLowerCase()));
    }
    renderSuggestion(file: TFile, el: HTMLElement) {
        el.setText(file.path);
    }
    selectSuggestion(file: TFile) {
        this.textInput.setValue(file.path);
        if (this.onSelectCallback) this.onSelectCallback(file.path);
        this.close();
    }
}

// --- CM6：变体幽灵文本 ---
class PhantomWidget extends WidgetType {
    constructor(public text: string, public color: string) {
        super();
        this.color = color || "#009dff";
    }
    eq(other: PhantomWidget) {
        return other.text === this.text && other.color === this.color;
    }
    toDOM() {
        const span = document.createElement("span");
        span.className = "annotation-phantom";
        span.textContent = this.text;
        span.style.color = this.color;
        span.style.borderBottomColor = this.color;
        span.style.backgroundColor = hexToRgba(this.color, 0.15);
        return span;
    }
}

// --- CM6：高性能状态机 (O(1) 键盘平移核心) ---
const AnnotationStateEffect = StateEffect.define<DecorationSet>();
const annotationField = StateField.define<DecorationSet>({
    create() { return Decoration.none; },
    update(decos: DecorationSet, tr: Transaction) {
        decos = decos.map(tr.changes);
        for (let e of tr.effects) {
            if (e.is(AnnotationStateEffect)) return e.value;
        }
        return decos;
    },
    provide: f => EditorView.decorations.from(f)
});

function createAnnotationDecorations(view: EditorView, annotations: Annotation[], plugin: FootnoteCompassPlugin): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const text = view.state.doc.toString();
    const decos: { from: number, to: number, deco: Decoration }[] = [];
    let needsSave = false;

    annotations.forEach(anno => {
        const match = findAnnotationOffsetAndHeal(text, anno);
        if (!match) return;

        // 验证自愈是否发生
        if (match.start !== text.indexOf((anno.prefix || "") + (anno.original || "") + (anno.suffix || "")) + (anno.prefix || "").length) {
            needsSave = true;
        }

        const hColor = anno.highlightColor || plugin.settings.defaultHighlightColor;
        const pColor = anno.phantomColor || plugin.settings.defaultPhantomColor;
        const checkedComment = (anno.comments || []).find(c => c.checked);

        if (checkedComment) {
            decos.push({
                from: match.start, to: match.end,
                deco: Decoration.replace({ widget: new PhantomWidget(checkedComment.text, pColor), inclusive: false })
            });
        } else {
            decos.push({
                from: match.start, to: match.end,
                deco: Decoration.mark({ class: "annotation-highlight", attributes: { style: `background-color: ${hexToRgba(hColor, 0.25)}; border-bottom-color: ${hColor};` } })
            });
        }
    });

    decos.sort((a, b) => a.from - b.from).forEach(d => builder.add(d.from, d.to, d.deco));
    if (needsSave) plugin.annoManager.save();
    return builder.finish();
}

function updateEditorDecorations(plugin: FootnoteCompassPlugin) {
    plugin.app.workspace.iterateAllLeaves(leaf => {
        if (leaf.view?.getViewType() === 'markdown') {
            const mdView = leaf.view as MarkdownView;
            // 通过 any 绕过官方未暴露的 cm 属性
            const cm = (mdView.editor as any).cm as EditorView;
            if (cm && mdView.file) {
                const annos = plugin.annoManager.data[mdView.file.path] || [];
                const decos = createAnnotationDecorations(cm, annos, plugin);
                cm.dispatch({ effects: AnnotationStateEffect.of(decos) });
            }
        }
    });
}

// --- 数据存储管理器 (原子操作强化) ---
class AnnotationManager {
    plugin: FootnoteCompassPlugin;
    data: Record<string, Annotation[]>;
    isLoaded: boolean;
    debouncedWrite: Function;

    constructor(plugin: FootnoteCompassPlugin) {
        this.plugin = plugin;
        this.data = {};
        this.isLoaded = false;
        this.debouncedWrite = debounce(this._performWrite.bind(this), 200, true);
    }

    async load() {
        const path = normalizePath(this.plugin.settings.annotationFilePath);
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            const content = await this.plugin.app.vault.read(file);
            const match = content.match(/```json\r?\n([\s\S]*?)\r?\n```/);
            if (match) {
                try {
                    this.data = JSON.parse(match[1]);
                } catch (e) {
                    console.error("解析变体数据失败", e);
                }
            }
        }
        this.isLoaded = true;
    }

    async save() {
        if (!this.isLoaded) return;
        this.debouncedWrite();
    }

    // ✨ 核心保护：使用 vault.process 进行安全的原子写入
    async _performWrite() {
        if (!this.isLoaded) return;
        const path = normalizePath(this.plugin.settings.annotationFilePath);
        let file = this.plugin.app.vault.getAbstractFileByPath(path);
        const jsonStr = JSON.stringify(this.data, null, 2);
        const newBlock = `\`\`\`json\n${jsonStr}\n\`\`\``;
        const defaultContent = `# 📚 小说标注与变体数据库\n> ⚠️ 请不要手动修改下面的代码块，这是插件自动维护的！这保证了你的数据可以随笔记一起安全备份。\n\n${newBlock}\n`;

        try {
            if (file instanceof TFile) {
                await this.plugin.app.vault.process(file, (data) => {
                    const match = data.match(/```json\r?\n([\s\S]*?)\r?\n```/);
                    if (match) return data.replace(/```json\r?\n([\s\S]*?)\r?\n```/, newBlock);
                    return defaultContent; // 若被破坏，直接重置模板
                });
            } else {
                await this.plugin.app.vault.create(path, defaultContent);
            }
        } catch (e) {
            console.error("保存标注数据失败:", e);
        }
    }

    async forceSave() {
        if (!this.isLoaded) return;
        await this._performWrite();
    }
}

// --- 弹窗组件集 ---
class ColorPickerModal extends Modal {
    constructor(app: App, public titleText: string, public palette: ColorPreset[], public onSelect: (hex: string) => void) {
        super(app);
    }
    onOpen() {
        this.setTitle(this.titleText);
        const container = this.contentEl.createDiv({ cls: "color-picker-container" });
        this.palette.forEach(color => {
            const btn = container.createDiv({ cls: "color-picker-btn" });
            btn.style.backgroundColor = color.hex;
            btn.title = color.name;
            btn.onclick = () => { this.onSelect(color.hex); this.close(); };
        });
    }
    onClose() { this.contentEl.empty(); }
}

class ConfirmModal extends Modal {
    constructor(app: App, public titleText: string, public message: string, public onConfirm: () => void) {
        super(app);
    }
    onOpen() {
        this.setTitle(this.titleText);
        this.contentEl.createEl("p", { text: this.message, cls: "annotation-confirm-msg" });
        new Setting(this.contentEl)
            .addButton(btn => btn.setButtonText("取消").onClick(() => this.close()))
            .addButton(btn => btn.setButtonText("确认移除").setWarning().onClick(() => { this.onConfirm(); this.close(); }));
    }
    onClose() { this.contentEl.empty(); }
}

class CommentModal extends Modal {
    result: string;

    constructor(app: App, public titleText: string, initialVal: string, public onSubmit: (val: string) => void, public onDelete: (() => void) | null = null) {
        super(app);
        this.result = initialVal || "";
    }
    onOpen() {
        this.setTitle(this.titleText);
        new Setting(this.contentEl).setName("内容文字").setDesc("输入变体内容，按回车键直接保存。")
            .addText(text => {
                text.setValue(this.result).onChange(val => this.result = val);
                text.inputEl.style.width = "100%";
                text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
                    if (e.key === "Enter" && !e.isComposing) {
                        e.preventDefault();
                        if (this.result.trim()) this.onSubmit(this.result.trim());
                        this.close();
                    }
                });
            });

        const btnSetting = new Setting(this.contentEl);
        btnSetting.infoEl.style.display = "none";
        btnSetting.controlEl.style.width = "100%";
        btnSetting.controlEl.style.justifyContent = "flex-end";
        btnSetting.settingEl.style.borderTop = "none";

        if (this.onDelete) {
            btnSetting.addButton(btn => {
                btn.setButtonText("删除变体").setWarning().onClick(() => {
                    this.onDelete!();
                    this.close();
                });
                btn.buttonEl.style.marginRight = "auto";
            });
        }
        btnSetting.addButton(btn => btn.setButtonText("取消").onClick(() => this.close()))
            .addButton(btn => btn.setButtonText("确认保存").setCta().onClick(() => {
                if (this.result.trim()) this.onSubmit(this.result.trim());
                this.close();
            }));
    }
    onClose() { this.contentEl.empty(); }
}

// --- 核心视图类 ---
class FootnoteListView extends ItemView {
    plugin: FootnoteCompassPlugin;
    cachedRefs: FootnoteRef[] = [];
    lastActiveView: MarkdownView | null = null;
    listRoot: HTMLElement | null = null;
    isNavigating: boolean = false;
    _lastStateHash: string = "";
    _lastScrolledItem: any = null;

    debouncedSync: Function;
    debouncedScrollSync: Function;

    constructor(leaf: WorkspaceLeaf, plugin: FootnoteCompassPlugin) {
        super(leaf);
        this.plugin = plugin;

        this.debouncedSync = debounce(() => {
            const activeLeaf = this.app.workspace.activeLeaf;
            if (activeLeaf?.view instanceof MarkdownView) this.syncHighlightWithCursor(activeLeaf.view);
        }, 100, true);

        this.debouncedScrollSync = debounce((view: MarkdownView) => {
            const cm = (view.editor as any).cm as EditorView;
            if (!cm) return;
            try {
                const block = cm.lineBlockAtHeight(cm.scrollDOM.scrollTop + 100);
                if (block) this.syncHighlightToOffset(view, block.from);
            } catch (e) { }
        }, 50, true);
    }

    getViewType() { return VIEW_TYPE_FOOTNOTE; }
    getDisplayText() { return "脚注 & 变体大纲"; }
    getIcon() { return "message-circle-more"; }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass("footnote-compass-view-container");
        this.listRoot = container.createDiv({ cls: "footnote-list-root" });

        this.registerDomEvent(this.listRoot, "contextmenu", (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('.footnote-item') || target.closest('.annotation-card')) return;
            this.showContextMenu(e);
        });

        const triggerNavLock = () => {
            this.isNavigating = true;
            setTimeout(() => { this.isNavigating = false; }, 800);
            /*this.debouncedSync();*/   /*  不要删这个禁用光标判定*/ 
        };

        const workspaceEl = this.app.workspace.containerEl;
        this.registerDomEvent(workspaceEl, 'click', triggerNavLock, { capture: true });
        this.registerDomEvent(workspaceEl, 'keyup', triggerNavLock, { capture: true });

        this.registerDomEvent(workspaceEl, 'scroll', (e: Event) => {
            if (this.isNavigating) return;
            const target = e.target as HTMLElement;
            if (target?.classList?.contains('cm-scroller')) {
                // 1. 性能优化：优先检查最后一次操作的视图是不是当前滚动的视图（99%的情况）
                if (this.lastActiveView) {
                    const cm = (this.lastActiveView.editor as any)?.cm as EditorView;
                    if (cm && cm.scrollDOM === target) {
                        this.debouncedScrollSync(this.lastActiveView);
                        return;
                    }
                }
                
                // 2. 失去焦点兜底：如果焦点在侧边栏，遍历寻找真正发生滚动的那个正文窗口
                const leaves = this.app.workspace.getLeavesOfType('markdown');
                for (let leaf of leaves) {
                    const view = leaf.view as MarkdownView;
                    const cm = (view.editor as any)?.cm as EditorView;
                    if (cm && cm.scrollDOM === target) {
                        this.lastActiveView = view; // 更新缓存
                        this.debouncedScrollSync(view);
                        break;
                    }
                }
            }
        }, { capture: true });

        // 强行给足加载时间，避免刚启动时找不准 leaf
        setTimeout(() => this.checkAndUpdate(), 300);
    }

    findBestLeaf(): WorkspaceLeaf | null {
        const active = this.app.workspace.activeLeaf;
        if (active && (active.view.getViewType() === 'markdown' || active.view.getViewType() === 'kanban')) return active;
        const leaves = this.app.workspace.getLeavesOfType('markdown');
        return leaves.length > 0 ? leaves[0] : null;
    }

    generateStateHash(view: MarkdownView, refs: FootnoteRef[], annos: Annotation[]): string {
        const path = view.file?.path || "unknown";
        const refHash = refs.map(r => `${r.key}:${r.content}`).join('|');
        // 安全链式调用保护，防止旧数据缺少 comments 报错导致白屏
        const annoHash = (annos || []).map(a => `${a.id}-${a.original}-${(a.comments || []).map(c => c.checked).join(',')}`).join('|');
        return `${path}::${refHash}::${annoHash}::${!!this.plugin.settings.isAnnotationsCollapsed}::${!!this.plugin.settings.isSortByKey}`;
    }

    async checkAndUpdate() {
        const bestLeaf = this.findBestLeaf();
        if (bestLeaf && bestLeaf.view instanceof MarkdownView) {
            this.lastActiveView = bestLeaf.view;
            await this.updateView(bestLeaf.view);
        } else {
            // 如果没找到任何活动叶子，也要执行一次 render，保证 UI 不会完全空荡荡
            this.renderRefList();
        }
    }

    async updateView(view: MarkdownView) {
        if (!this.listRoot) return;

        let text = "";
        if (view.editor) {
            text = view.editor.getValue();
        } else if (view.file) {
            text = await this.app.vault.read(view.file);
        }

        if (typeof text !== "string") return;

        const lines = text.split("\n");
        const definitionMap = new Map<string, string>();

        lines.forEach(line => {
            const match = line.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
            if (match) definitionMap.set(match[1], match[2]);
        });

        this.cachedRefs = [];
        const footRefRegex = /\[\^([^\]]+)\](?!:)/g;
        let inMultiLineCode = false;

        lines.forEach((line, lineIndex) => {
            if (line.trim().startsWith('```') || line.trim().startsWith('~~~')) { inMultiLineCode = !inMultiLineCode; return; }
            if (inMultiLineCode) return;
            let cleanLine = line.replace(/`[^`\n]+`/g, (match) => " ".repeat(match.length));
            if (!cleanLine.includes('[')) return;
            if (cleanLine.startsWith('[^') && cleanLine.includes(']:')) return;

            let fMatch;
            while ((fMatch = footRefRegex.exec(cleanLine)) !== null) {
                this.cachedRefs.push({
                    type: 'footnote', key: fMatch[1], content: definitionMap.get(fMatch[1]) || "(未定义)", line: lineIndex, col: fMatch.index, len: fMatch[0].length, el: null
                });
            }
        });

        const annos = this.plugin.annoManager.data[view.file?.path || ""] || [];
        const currentHash = this.generateStateHash(view, this.cachedRefs, annos);

        if (this._lastStateHash !== currentHash) {
            this.renderRefList();
            this._lastStateHash = currentHash;
        }

        this.syncHighlightWithCursor(view);
    }

    renderRefList() {
        if (!this.listRoot) return;

        try {
            this.listRoot.empty();

            const isCollapsed = this.plugin.settings.isAnnotationsCollapsed;
            this.listRoot.classList.toggle("annotations-collapsed-mode", !!isCollapsed);

            const listContainer = this.listRoot.createDiv({ cls: "footnote-compass-container" });

            if (this.cachedRefs.length > 0) {
                let displayRefs = [...this.cachedRefs];
                if (this.plugin.settings.isSortByKey) {
                    displayRefs.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: 'base' }));
                }

                displayRefs.forEach(ref => {
                    const itemEl = listContainer.createDiv({ cls: "footnote-item" });
                    ref.el = itemEl;
                    itemEl.createDiv({ cls: "footnote-key", text: `[^${ref.key}]` });
                    itemEl.createDiv({ cls: "footnote-content", text: `${ref.key}: ${ref.content}` });
                    itemEl.onclick = () => this.handleJump(ref);
                    itemEl.oncontextmenu = (e) => this.showContextMenu(e, ref);
                });
            }

            const filePath = this.lastActiveView?.file?.path;
            if (filePath && this.plugin.annoManager.data[filePath]?.length > 0) {
                const headerContainer = this.listRoot.createDiv({ cls: "annotation-section-header" });

                // 左侧：固定标题
                headerContainer.createDiv({ cls: "annotation-divider", text: "📌 文本变体标注" });

                // 右侧控制区：下拉框 + 按钮放在一行
                const rightControls = headerContainer.createDiv({
                    attr: { style: "display: flex; align-items: center; gap: 8px;" }
                });

                const filterLvlStr = this.plugin.settings.headingFilters[filePath] || "0";
                const headingSelect = rightControls.createEl("select", { cls: "heading-filter-select" });
                const headingOptions = [
                    { v: "0", t: "无" }, { v: "1", t: "H1" }, { v: "2", t: "H2" },
                    { v: "3", t: "H3" }, { v: "4", t: "H4" }, { v: "5", t: "H5" }, { v: "6", t: "H6" }
                ];
                headingOptions.forEach(opt => {
                    const opEl = headingSelect.createEl("option", { text: opt.t, value: opt.v });
                    if (opt.v === filterLvlStr) opEl.selected = true;
                });

                headingSelect.onchange = async () => {
                    this.plugin.settings.headingFilters[filePath] = headingSelect.value;
                    await this.plugin.saveSettings();
                    this._lastStateHash = "";
                    // ✨ 修复需求 4：改变标题后不应该折叠丢失焦点，调用 checkAndUpdate 可保证重新同步高亮
                    if (this.lastActiveView) {
                        this.checkAndUpdate();
                    } else {
                        this.renderRefList();
                    }
                };

                const toggleBtn = rightControls.createEl("button", { text: isCollapsed ? "展开" : "折叠" });

                Object.assign(toggleBtn.style, {
                    padding: "2px 8px", fontSize: "12px", cursor: "pointer",
                    backgroundColor: "transparent", border: "1px solid var(--background-modifier-border)",
                    borderRadius: "4px", color: "var(--text-muted)"
                });

                toggleBtn.onclick = async () => {
                    this.plugin.settings.isAnnotationsCollapsed = !isCollapsed;
                    await this.plugin.saveSettings();
                    this._lastStateHash = "";
                    if (this.lastActiveView) this.checkAndUpdate();
                };

                const annos = [...this.plugin.annoManager.data[filePath]];
                const fullText = this.lastActiveView?.editor?.getValue() || "";
                const palette = this.plugin.settings.colorPresets || [];

                const parsedHeadings: { offset: number, level: number, text: string }[] = [];
                if (filterLvlStr !== "0") {
                    const headingRegex = /^(#{1,6})\s+(.*)$/gm;
                    let match;
                    while ((match = headingRegex.exec(fullText)) !== null) {
                        parsedHeadings.push({ offset: match.index, level: match[1].length, text: match[2].trim() });
                    }
                }

                annos.forEach(anno => {
                    const match = findAnnotationOffsetAndHeal(fullText, anno);
                    anno._tempOffset = match ? match.start : Number.MAX_SAFE_INTEGER;
                });

                annos.sort((a, b) => (a._tempOffset || 0) - (b._tempOffset || 0));

                let currentHeadingText = "";
                let currentGroupWrapper: HTMLElement | null = null;
                const targetLvl = parseInt(filterLvlStr);

                annos.forEach(anno => {
                    let isNewHeadingBlock = false;

                    if (targetLvl > 0) {
                        let nearestHeading = null;
                        for (let i = parsedHeadings.length - 1; i >= 0; i--) {
                            if (parsedHeadings[i].offset <= anno._tempOffset! && parsedHeadings[i].level <= targetLvl) {
                                nearestHeading = parsedHeadings[i];
                                break;
                            }
                        }
                        // ★ 修改：去掉了 '#' 符号，只保留纯文本
                        const hText = nearestHeading ? nearestHeading.text : "无标题 / 顶部";

                        if (hText !== currentHeadingText) {
                            const hDivider = this.listRoot!.createDiv({ cls: "annotation-heading-divider", text: hText });
                            // ★ 新增：应用你在设置面板里配置的标题颜色
                            hDivider.style.color = this.plugin.settings.headingColor || "#2196f3";

                            currentHeadingText = hText;
                            isNewHeadingBlock = true;
                        }
                    }

                    // ✨ 优化：如果选择了"无"(targetLvl === 0)，则强制每个项目都拥有独立的独立外框；
                    // 否则，按同标题归拢在同一个外框内。
                    if (targetLvl === 0 || isNewHeadingBlock || !currentGroupWrapper) {
                        currentGroupWrapper = this.listRoot!.createDiv({
                            cls: "annotation-group-wrapper"
                        });
                    }

                    const card = currentGroupWrapper.createDiv({ cls: "annotation-card" });
                    anno.el = card;
                    const hColor = anno.highlightColor || this.plugin.settings.defaultHighlightColor;
                    const pColor = anno.phantomColor || this.plugin.settings.defaultPhantomColor;

                    card.onclick = () => {
                        if (this.lastActiveView?.editor?.offsetToPos && anno._tempOffset! < Number.MAX_SAFE_INTEGER) {
                            this.isNavigating = true;
                            setTimeout(() => { this.isNavigating = false; }, 800);
                            const pos = this.lastActiveView.editor.offsetToPos(anno._tempOffset!);
                            this.app.workspace.setActiveLeaf(this.lastActiveView.leaf, { focus: true });
                            this.lastActiveView.setEphemeralState({ line: pos.line, cursor: { from: pos, to: pos } });
                            this.syncHighlightWithCursor(this.lastActiveView);
                        }
                    };

                    card.oncontextmenu = (e) => {
                        e.stopPropagation();
                        const menu = new Menu();
                        menu.addItem((item) => {
                            item.setTitle("添加新变体").setIcon("list-plus").onClick(() => {
                                new CommentModal(this.app, "添加新变体", "", async (text) => {
                                    if (!anno.comments) anno.comments = [];
                                    anno.comments.push({ id: generateUUID(), text, checked: false });
                                    await this.plugin.annoManager.save();
                                    this._lastStateHash = ""; this.checkAndUpdate();
                                }).open();
                            });
                        });
                        menu.addSeparator();
                        menu.addItem((item) => {
                            item.setTitle("修改当前标注颜色").setIcon("highlighter").onClick(() => {
                                new ColorPickerModal(this.app, "选择标注高亮颜色", palette, async (c) => {
                                    anno.highlightColor = c; await this.plugin.annoManager.save();
                                    updateEditorDecorations(this.plugin); this._lastStateHash = ""; this.checkAndUpdate();
                                }).open();
                            });
                        });

                        menu.addItem((item) => {
                            item.setTitle("修改当前变体颜色").setIcon("paintbrush").onClick(() => {
                                new ColorPickerModal(this.app, "选择替换后颜色", palette, async (c) => {
                                    anno.phantomColor = c; await this.plugin.annoManager.save();
                                    updateEditorDecorations(this.plugin); this._lastStateHash = ""; this.checkAndUpdate();
                                }).open();
                            });
                        });
                        menu.addSeparator();

                        menu.addItem((item) => {
                            item.setTitle("重新选择文本").setIcon("text-cursor").onClick(async () => {
                                const view = this.lastActiveView;
                                if (!view || !view.editor) return;
                                const editor = view.editor;
                                const selectedText = editor.getSelection();
                                if (!selectedText || selectedText.trim().length === 0) {
                                    new Notice("⚠️ 替换提示：\n请先在正文中【选中一段新文本】，然后再来点击此选项！", 4000);
                                    return;
                                }
                                const cursor = editor.getCursor('from');
                                const lineText = editor.getLine(cursor.line);
                                anno.original = selectedText;
                                anno.prefix = lineText.substring(Math.max(0, cursor.ch - 10), cursor.ch);
                                anno.suffix = lineText.substring(cursor.ch + selectedText.length, cursor.ch + selectedText.length + 10);
                                anno.expectedOffset = editor.posToOffset(cursor);
                                await this.plugin.annoManager.save();
                                updateEditorDecorations(this.plugin);
                                this._lastStateHash = ""; this.checkAndUpdate();
                                new Notice(`✅ 绑定的原文本已成功修改为：\n"${selectedText}"`);
                            });
                        });

                        menu.addItem((item) => {
                            item.setTitle("移除整个标注").setIcon("trash").setWarning(true).onClick(() => {
                                new ConfirmModal(this.app, "移除标注", `确定要彻底移除【${anno.original}】的标注记录吗？`, async () => {
                                    this.plugin.annoManager.data[filePath] = this.plugin.annoManager.data[filePath].filter(a => a.id !== anno.id);
                                    await this.plugin.annoManager.save();
                                    updateEditorDecorations(this.plugin); this._lastStateHash = ""; this.checkAndUpdate();
                                }).open();
                            });
                        });
                        menu.showAtMouseEvent(e);
                    };

                    const header = card.createDiv({ cls: "annotation-header" });

                    // --- 需求 1：移除原来的背景色和强行颜色指定 ---
                    const originalSpan = header.createSpan({ text: anno.original, cls: "annotation-original" });

                    const list = card.createDiv({ cls: "annotation-comments-list" });

                    (anno.comments || []).forEach(comment => {
                        const row = list.createDiv({ cls: "annotation-comment-row" });
                        row.dataset.commentId = comment.id;

                        row.onclick = async (e) => {
                            e.stopPropagation();
                            if (this.lastActiveView?.editor?.offsetToPos && anno._tempOffset! < Number.MAX_SAFE_INTEGER) {
                                this.isNavigating = true; setTimeout(() => { this.isNavigating = false; }, 800);
                                const pos = this.lastActiveView.editor.offsetToPos(anno._tempOffset!);
                                this.app.workspace.setActiveLeaf(this.lastActiveView.leaf, { focus: true });
                                this.lastActiveView.setEphemeralState({ line: pos.line, cursor: { from: pos, to: pos } });
                            }

                            const isChecked = comment.checked;
                            anno.comments.forEach(c => c.checked = false);
                            comment.checked = !isChecked;

                            this.plugin.annoManager.save();
                            updateEditorDecorations(this.plugin);

                            this._lastStateHash = "";
                            this.checkAndUpdate();
                            this.syncHighlightWithCursor(this.lastActiveView!);
                        };

                        const cb = row.createEl("input", { type: "checkbox", cls: "annotation-checkbox" });
                        cb.checked = comment.checked;
                        cb.style.setProperty('--dynamic-color', pColor);
                        cb.style.pointerEvents = "none";

                        const textSpan = row.createSpan({ text: comment.text, cls: "annotation-comment-text" });
                        if (comment.checked) {
                            textSpan.style.color = pColor; textSpan.style.fontWeight = "bold";
                        }

                        row.oncontextmenu = (e) => {
                            e.stopPropagation();
                            new Menu().addItem((item) => {
                                item.setTitle("编辑变体").setIcon("pencil").onClick(() => {
                                    new CommentModal(this.app, "编辑变体", comment.text,
                                        async (newText) => {
                                            comment.text = newText; await this.plugin.annoManager.save();
                                            updateEditorDecorations(this.plugin); this._lastStateHash = ""; this.checkAndUpdate();
                                        },
                                        async () => {
                                            anno.comments = anno.comments.filter(c => c.id !== comment.id); await this.plugin.annoManager.save();
                                            updateEditorDecorations(this.plugin); this._lastStateHash = ""; this.checkAndUpdate();
                                        }
                                    ).open();
                                });
                            }).showAtMouseEvent(e);
                        };
                    });
                });
            }

            if (this.cachedRefs.length === 0 && (!this.plugin.annoManager.data[filePath || ""] || this.plugin.annoManager.data[filePath || ""].length === 0)) {
                this.listRoot.createDiv({ cls: "footnote-empty", text: "当前文档无脚注或标注" });
            }
        } catch (err) {
            console.error("FootnoteCompass 侧边栏渲染严重错误:", err);
            this.listRoot.createDiv({ cls: "footnote-empty", text: "⚠️ 侧边栏加载遇到异常，请检查控制台或重启插件。" });
        }
    }

    syncHighlightWithCursor(view: MarkdownView) {
        if (!view?.editor) return;
        this.syncHighlightToOffset(view, view.editor.posToOffset(view.editor.getCursor()));
    }

    syncHighlightToOffset(view: MarkdownView, targetOffset: number) {
        if (!view?.editor || !this.listRoot) return;
        try {
            let allItems: { el: HTMLElement, offset: number }[] = [];
            this.cachedRefs.forEach(ref => {
                if (ref.el) allItems.push({ el: ref.el, offset: view.editor.posToOffset({ line: ref.line, ch: ref.col }) });
            });
            const annos = this.plugin.annoManager.data[view.file?.path || ""] || [];
            annos.forEach(anno => {
                if (anno.el && anno._tempOffset !== undefined && anno._tempOffset < Number.MAX_SAFE_INTEGER) {
                    allItems.push({ el: anno.el, offset: anno._tempOffset });
                }
            });

            if (allItems.length === 0) return;
            allItems.sort((a, b) => a.offset - b.offset);

            let primaryItem = allItems.slice().reverse().find(item => targetOffset >= item.offset - 15) || allItems[allItems.length - 1];

            allItems.forEach(item => {
                const distance = Math.abs(item.offset - targetOffset);
                if (item === primaryItem || distance <= 30) item.el.addClass("is-active");
                else item.el.removeClass("is-active");
            });

            if (primaryItem && this._lastScrolledItem !== primaryItem) {
                primaryItem.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                this._lastScrolledItem = primaryItem;
            }
        } catch (e) { }
    }

    showContextMenu(e: MouseEvent, ref: FootnoteRef | null = null) {
        const menu = new Menu();
        if (ref) {
            menu.addItem((item) => item.setTitle(ref.type === 'footnote' ? "编辑脚注 (未实现)" : "编辑注记").setIcon("pencil"));
            menu.addSeparator();
        }
        menu.addItem((item) => {
            item.setTitle("数字排序 (针对脚注)").setIcon("sort-asc").setChecked(this.plugin.settings.isSortByKey).onClick(async () => {
                this.plugin.settings.isSortByKey = !this.plugin.settings.isSortByKey;
                await this.plugin.saveSettings();
                this._lastStateHash = ""; this.checkAndUpdate();
            });
        });
        menu.addItem((item) => {
            item.setTitle("脚注美化").setIcon("wand-2").setChecked(this.plugin.settings.beautifyEnabled)
                .onClick(async () => {
                    this.plugin.settings.beautifyEnabled = !this.plugin.settings.beautifyEnabled;
                    await this.plugin.saveSettings(); this.plugin.applyBeautifyStyle();
                });
        });
        menu.addSeparator();
        menu.addItem((item) => {
            item.setTitle("导出当前变体全文").setIcon("file-output").onClick(async () => await this.exportVariantFile());
        });
        menu.showAtMouseEvent(e);
    }

    async exportVariantFile() {
        const file = this.lastActiveView?.file;
        if (!file) {
            new Notice("未找到当前活动的文档！");
            return;
        }

        let text = await this.app.vault.read(file);
        let activeAnnos = (this.plugin.annoManager.data[file.path] || []).filter(a => (a.comments || []).some(c => c.checked));

        if (activeAnnos.length === 0) {
            new Notice("当前没有勾选任何变体，无需导出！");
            return;
        }

        activeAnnos.forEach(anno => {
            const match = findAnnotationOffsetAndHeal(text, anno);
            anno._exportOffset = match ? match.start : -1;
        });

        activeAnnos.filter(a => a._exportOffset !== -1).sort((a, b) => b._exportOffset! - a._exportOffset!).forEach(anno => {
            const checkedText = anno.comments.find(c => c.checked)!.text;
            text = text.substring(0, anno._exportOffset!) + checkedText + text.substring(anno._exportOffset! + anno.original.length);
        });

        let newPath = "", counter = 1;
        while (true) {
            newPath = normalizePath(`${file.parent?.path === "/" ? "" : file.parent?.path + "/"}${file.basename} ${counter.toString().padStart(2, '0')}.${file.extension}`);
            if (!this.app.vault.getAbstractFileByPath(newPath)) break;
            counter++;
        }

        const newFile = await this.app.vault.create(newPath, text);
        new Notice(`🎉 导出成功！已生成新文件：${newFile.name}`);
        this.app.workspace.getLeaf('tab')?.openFile(newFile);
    }

    async handleJump(ref: FootnoteRef) {
        const view = this.lastActiveView || (this.findBestLeaf()?.view as MarkdownView);
        if (!view?.editor) return;
        this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
        view.setEphemeralState({ line: ref.line, cursor: { from: { line: ref.line, ch: ref.col }, to: { line: ref.line, ch: ref.col + ref.len } } });
        this.syncHighlightWithCursor(view);
    }
}

class FootnoteCompassSettingTab extends PluginSettingTab {
    plugin: FootnoteCompassPlugin;

    constructor(app: App, plugin: FootnoteCompassPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    // ✨ 需求 1：辅助函数，用于改变设置后强制侧边栏视图立刻刷新
    forceRefreshSidebar() {
        this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_FOOTNOTE).forEach(leaf => {
            const view = leaf.view as FootnoteListView;
            if (view) {
                view._lastStateHash = "";
                view.checkAndUpdate();
            }
        });
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "脚注与标注大纲 设置" });

        new Setting(containerEl).setName("标注数据存储文件")
            .setDesc("指定一个 .md 文件来安全存储你的标注和变体数据。支持直接输入新文件名，或搜索选择已有文件。")
            .addText(text => {
                text.setPlaceholder("Annotations.md").setValue(this.plugin.settings.annotationFilePath)
                    .onChange(async (value) => {
                        this.plugin.settings.annotationFilePath = value || "Annotations.md";
                        await this.plugin.saveSettings(); await this.plugin.annoManager.load();
                    });
                new FileSuggest(this.app, text, async (selectedPath) => {
                    this.plugin.settings.annotationFilePath = selectedPath;
                    await this.plugin.saveSettings(); await this.plugin.annoManager.load();
                });
            });

        containerEl.createEl("h3", { text: "全局默认颜色设置", cls: "setting-section-header" });
        this.createColorSetting(containerEl, "默认原文本高亮颜色", "当创建新变体时，正文中被圈定的原词高亮颜色。", 'defaultHighlightColor');
        this.createColorSetting(containerEl, "默认替换后变体颜色", "在正文中替换成变体文字后的文字和边框颜色。", 'defaultPhantomColor');
        this.createColorSetting(containerEl, "侧边栏分类标题颜色", "在侧边栏中基于H1-H6分类显示的标题文本颜色。", 'headingColor');

        const colorSection = containerEl.createDiv({ cls: "color-preset-section" });
        const headerDiv = colorSection.createDiv({ cls: "color-preset-header" });
        headerDiv.createEl("h3", { text: "颜色预设管理" });
        headerDiv.createEl("button", { text: "+ 添加新颜色", cls: "mod-cta" }).onclick = async () => {
            this.plugin.settings.colorPresets.push({ name: "新颜色", hex: "#ffffff" });
            await this.plugin.saveSettings(); this.display();
        };

        const grid = colorSection.createDiv({ cls: "color-preset-grid" });
        this.plugin.settings.colorPresets.forEach((preset, index) => {
            const item = grid.createDiv({ cls: "color-preset-item" });
            item.createEl("input", { type: "text", value: preset.name }).onchange = async (e) => {
                preset.name = (e.target as HTMLInputElement).value; await this.plugin.saveSettings();
            };
            const colorPicker = item.createEl("input", { type: "color", value: preset.hex, cls: "color-circle-input" });
            const hexInput = item.createEl("input", { type: "text", value: preset.hex, cls: "color-hex-input" });

            colorPicker.oninput = async (e) => {
                preset.hex = (e.target as HTMLInputElement).value;
                hexInput.value = preset.hex;
                await this.plugin.saveSettings();
            };
            hexInput.onchange = async (e) => {
                let val = (e.target as HTMLInputElement).value;
                val = val.startsWith("#") ? val : "#" + val;
                preset.hex = val; colorPicker.value = val; await this.plugin.saveSettings();
            };
            const delBtn = item.createDiv({ cls: "color-preset-del" });
            setIcon(delBtn, "trash");
            delBtn.onclick = async () => {
                this.plugin.settings.colorPresets.splice(index, 1);
                await this.plugin.saveSettings(); this.display();
            };
        });
    }

    createColorSetting(containerEl: HTMLElement, name: string, desc: string, settingKey: keyof FootnoteCompassSettings) {
        let colorComp: any, textComp: any;
        new Setting(containerEl).setName(name).setDesc(desc)
            .addColorPicker(color => {
                colorComp = color;
                color.setValue(this.plugin.settings[settingKey] as string).onChange(async (val) => {
                    (this.plugin.settings as any)[settingKey] = val;
                    if (textComp) textComp.setValue(val);
                    await this.plugin.saveSettings(); 
                    updateEditorDecorations(this.plugin);
                    this.forceRefreshSidebar(); // ✨ 立即刷新侧边栏颜色
                });
            })
            .addText(text => {
                textComp = text;
                text.setValue(this.plugin.settings[settingKey] as string).onChange(async (val) => {
                    val = val.trim().startsWith("#") ? val.trim() : "#" + val.trim();
                    (this.plugin.settings as any)[settingKey] = val;
                    if (/^#([0-9A-Fa-f]{3}){1,2}$/.test(val)) {
                        if (colorComp) colorComp.setValue(val); 
                        updateEditorDecorations(this.plugin);
                    }
                    await this.plugin.saveSettings();
                    this.forceRefreshSidebar(); // ✨ 立即刷新侧边栏颜色
                });
                text.inputEl.classList.add("color-hex-input"); text.inputEl.style.marginLeft = "8px";
            });
    }
}

export default class FootnoteCompassPlugin extends Plugin {
    settings: FootnoteCompassSettings;
    annoManager: AnnotationManager;

    async onload() {
        const defaultPresets: ColorPreset[] = [
            { name: "红色", hex: "#e57373" }, { name: "黄色", hex: "#ffb74d" }, { name: "绿色", hex: "#81c784" },
            { name: "蓝色", hex: "#64b5f6" }, { name: "紫色", hex: "#ba68c8" }, { name: "灰色", hex: "#90a4ae" }
        ];

        let loadedData = await this.loadData();
        this.settings = Object.assign({
            beautifyEnabled: false, isSortByKey: false, isAnnotationsCollapsed: true, annotationFilePath: "大纲变体标注数据库.md",
            defaultHighlightColor: "#ff4444", defaultPhantomColor: "#009dff", colorPresets: defaultPresets,
            headingFilters: {},
            headingColor: "#2196f3" // 新增：默认标题颜色（蓝色）
        }, loadedData);

        this.annoManager = new AnnotationManager(this);
        this.addSettingTab(new FootnoteCompassSettingTab(this.app, this));
        this.registerEditorExtension([annotationField]);
        this.registerView(VIEW_TYPE_FOOTNOTE, (leaf) => new FootnoteListView(leaf, this));
        this.addRibbonIcon('message-circle-more', '打开脚注与标注面板', () => { this.activateView(); });

        const debouncedOutlineUpdate = debounce(() => {
            this.app.workspace.getLeavesOfType(VIEW_TYPE_FOOTNOTE).forEach(leaf => (leaf.view as FootnoteListView)?.checkAndUpdate());
        }, 500, true);

        this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
            debouncedOutlineUpdate(); updateEditorDecorations(this);
        }));

        this.registerEvent(this.app.workspace.on('file-open', () => {
            updateEditorDecorations(this);
        }));

        this.registerEvent(this.app.workspace.on('editor-change', debouncedOutlineUpdate));

        this.registerEvent(this.app.vault.on('rename', async (file, oldPath) => {
            if (file instanceof TFile && file.extension === 'md' && this.annoManager.data[oldPath]) {
                this.annoManager.data[file.path] = this.annoManager.data[oldPath];
                delete this.annoManager.data[oldPath];
                await this.annoManager.save(); debouncedOutlineUpdate();
            }
        }));

        this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor, view) => {
            if (editor.somethingSelected()) {
                menu.addItem((item) => {
                    item.setTitle("添加正文变体标注").setIcon("pin").onClick(async () => {
                        const selectedText = editor.getSelection();
                        if (!selectedText || selectedText.trim().length === 0) {
                            new Notice("无法对空字符添加标注！");
                            return;
                        }
                        const cursor = editor.getCursor('from');
                        const lineText = editor.getLine(cursor.line);
                        const prefix = lineText.substring(Math.max(0, cursor.ch - 10), cursor.ch);
                        const suffix = lineText.substring(cursor.ch + selectedText.length, cursor.ch + selectedText.length + 10);
                        const path = view.file!.path;

                        const expectedOffset = editor.posToOffset(cursor);

                        if (!this.annoManager.data[path]) this.annoManager.data[path] = [];
                        this.annoManager.data[path].push({ id: generateUUID(), original: selectedText, prefix, suffix, expectedOffset, comments: [] });
                        await this.annoManager.save();

                        const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_FOOTNOTE)[0];
                        if (leaf && leaf.view instanceof FootnoteListView) leaf.view._lastStateHash = "";

                        updateEditorDecorations(this); this.activateView();
                    });
                });
            }
        }));

        this.applyBeautifyStyle();
        this.app.workspace.onLayoutReady(async () => {
            await this.annoManager.load();
            debouncedOutlineUpdate();
            updateEditorDecorations(this);
        });
    }

    async saveSettings() { await this.saveData(this.settings); }

    applyBeautifyStyle() { document.body.classList.toggle('footnote-beautify-enabled', this.settings.beautifyEnabled); }

    async onunload() {
        document.body.classList.remove('footnote-beautify-enabled');
        if (this.annoManager) { await this.annoManager.forceSave(); }
    }

    async activateView() {
        let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_FOOTNOTE)[0];
        if (!leaf) {
            leaf = this.app.workspace.getRightLeaf(false)!;
            await leaf.setViewState({ type: VIEW_TYPE_FOOTNOTE, active: true });
        }
        this.app.workspace.revealLeaf(leaf);
        if (leaf.view instanceof FootnoteListView) leaf.view.checkAndUpdate();
    }
}