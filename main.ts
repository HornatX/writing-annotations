/* main.ts - Footnote & Hover Note Compass (TypeScript 重构完整版) */
import {
    App, Plugin, ItemView, debounce, setIcon, Menu, Modal, Setting,
    PluginSettingTab, TFile, TFolder, Notice, AbstractInputSuggest, normalizePath,
    WorkspaceLeaf, MarkdownView, FuzzySuggestModal, getIconIds
} from 'obsidian';
import { RangeSetBuilder, StateField, StateEffect, Transaction, EditorState } from "@codemirror/state";
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
    displayModes: Record<string, string>;
    autoExpands: Record<string, boolean>; // ✨ 新增：保存每个文件的“自动展开开启/关闭”偏好// ✨ 新增：保存每个文件的“标题显示模式”偏好
    headingColor: string; // 新增：侧边栏分类标题颜色
    // 👇 新增以下三个字段
    flashingColor: string;     // 👈 新增：选区高亮颜色

    // 👇 新增备份相关的三个字段
    maxBackups: number;          // 最大备份份数 (20-100)
    backupIntervalMinutes: number; // 备份间隔时间(分钟)
    lastBackupTime: number;
    recentIcons: string[]; // ✨ 新增：保存最近使用的图标

    iconOffsetY: number;       // ✨ 新增：图标向下微调的值
    lockDeletion: boolean; // ✨ 新增：锁定删除保护

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
    icon?: string; // ✨ 新增：在这里加上一行，用来保存选中的图标名称
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


// --- 工具：Hex转合法 7 位字符 (修复颜色选择器变黑Bug) ---
function normalizeTo7CharHex(hex: string): string | null {
    hex = hex.trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    // 如果是 3 位缩写，转换为 6 位
    if (/^#([0-9A-Fa-f]{3})$/i.test(hex)) {
        return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    // 如果是标准的 6 位
    if (/^#([0-9A-Fa-f]{6})$/i.test(hex)) {
        return hex;
    }
    return null; // 不合法时返回 null
}

function hexToRgba(hex: string, alpha: number): string {
    if (!/^#([0-9A-Fa-f]{3}){1,2}$/.test(hex)) return hex;
    let c: any = hex.substring(1).split('');
    if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    c = '0x' + c.join('');
    return `rgba(${[(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',')}, ${alpha})`;
}

// --- 核心算法：带预期偏移量的自愈搜索 (安全无损版) ---
function findAnnotationOffsetAndHeal(text: string, anno: Annotation): { start: number, end: number } | null {
    const prefix = anno.prefix || "";
    const suffix = anno.suffix || "";
    const original = anno.original || "";
    const expected = anno.expectedOffset || 0;

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
        // 更新正确的偏移量
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
        // 🚨 致命修复：绝对不能在这里覆盖 anno.prefix 和 anno.suffix！
        // 即使暂时找错了（比如用户把那段话剪切到了剪贴板还没粘贴回来），
        // 只要 prefix 和 suffix 还在数据库里，下次刷新就能找回正确位置。
        anno.expectedOffset = bestFallback;
        return { start: bestFallback, end: bestFallback + original.length };
    }

    return null;
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

// --- CM6：变体幽灵文本 (重构版：支持原文本块与分支块) ---
class PhantomWidget extends WidgetType {
    // ✨ 新增 isOriginal 参数，判断当前渲染的是不是原文本
    constructor(public text: string, public color: string, public annoId: string, public isOriginal: boolean = false) {
        super();
        this.color = color || (isOriginal ? "#ff4444" : "#009dff");
    }
    eq(other: PhantomWidget) {
        return other.text === this.text && other.color === this.color && other.annoId === this.annoId && other.isOriginal === this.isOriginal;
    }



    toDOM(view: EditorView) {
        const span = document.createElement("span");

        if (this.isOriginal) {
            span.className = "annotation-highlight annotation-protected-block";
            span.style.backgroundColor = hexToRgba(this.color, 0.25);
            span.style.borderBottom = `2px solid ${this.color}`;
        } else {
            span.className = "annotation-phantom";
            span.style.color = this.color;
            span.style.borderBottomColor = this.color;
            span.style.backgroundColor = hexToRgba(this.color, 0.15);
        }

        span.textContent = this.text;

        // 🌟 修复 2：重写鼠标点击事件
        span.onmousedown = (e: MouseEvent) => {
            // 🛑 核心修复：阻止浏览器的默认点击行为！
            // 防止浏览器把光标强行塞入 atomicRange 导致 CM6 状态树崩溃（光标消失）
            e.preventDefault();

            // 🛑 核心修复：手动夺回焦点，并将光标安全地放在这个高亮块的前面
            view.focus();
            const pos = view.posAtDOM(span);
            if (pos !== null) {
                view.dispatch({
                    selection: { anchor: pos, head: pos }
                });
            }

            // 触发侧边栏展开
            const event = new CustomEvent('footnote-compass-expand-card', { detail: { annoId: this.annoId } });
            window.dispatchEvent(event);
        };

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
    provide: f => [
        EditorView.decorations.from(f),
        EditorView.atomicRanges.of(view => view.state.field(f))
    ]
});


// ✨ 新增：CM6 最高优先级拦截器（防删改）
function createDeletionLockExtension(plugin: FootnoteCompassPlugin) {
    return EditorState.transactionFilter.of(tr => {
        if (!tr.docChanged) return tr; // 如果没改文本（比如只是鼠标动了），直接放行
        if (!plugin.settings.lockDeletion) return tr; // 如果设置里关了，直接放行
        if (plugin.isPluginModifying) return tr; // ✨ 特权放行：如果是插件自己在改原文，放行

        // 获取当前所有的保护区域
        const decos = tr.startState.field(annotationField, false);
        if (!decos) return tr;

        let blocked = false;
        tr.changes.iterChanges((fromA, toA) => {
            // 只要涉及到删除或覆盖 (fromA < toA)
            if (fromA < toA) {
                decos.between(fromA, toA, (from, to) => {
                    // 判断是否真的发生了交叉碰撞（而不是仅仅贴着边缘打字）
                    if (Math.max(fromA, from) < Math.min(toA, to)) {
                        blocked = true;
                    }
                });
            }
        });

        if (blocked) {
            new Notice("⚠️ 锁定保护：请先在侧边栏右键「移除整个标注」，然后再删除！");
            return []; // 🚨 核心惩罚：没收并取消这次操作
        }
        return tr;
    });
}

// ✨ 新增：CM6 复制/剪切拦截器（实现“所见即所得”的复制）
function createCopyInterceptorExtension() {
    return EditorView.domEventHandlers({
        copy: (event: ClipboardEvent, view: EditorView) => {
            const ranges = view.state.selection.ranges;
            const decos = view.state.field(annotationField, false);
            // 1. 如果没有装饰器，或者全是空选区，直接走默认逻辑
            if (!decos || ranges.some(r => r.empty)) return false;

            let hasPhantom = false;
            ranges.forEach(r => {
                decos.between(r.from, r.to, (from, to, value) => {
                    if (value.spec.widget instanceof PhantomWidget) {
                        hasPhantom = true;
                    }
                });
            });

            // 2. 如果选区内没有任何分支或标注文本，依然走系统默认复制逻辑
            if (!hasPhantom) return false;

            const doc = view.state.doc;
            const texts: string[] = [];

            // 3. 提取可见文本并拼接
            ranges.forEach(r => {
                let result = "";
                let currentPos = r.from;

                decos.between(r.from, r.to, (dFrom, dTo, value) => {
                    if (dTo <= currentPos) return;

                    const start = Math.max(currentPos, dFrom);
                    if (start > currentPos) {
                        result += doc.sliceString(currentPos, start); // 拼接前置的普通文本
                    }

                    if (value.spec.widget instanceof PhantomWidget) {
                        result += value.spec.widget.text; // 🌟 拼接视觉上的变体文本
                    }

                    currentPos = Math.max(currentPos, dTo);
                });

                if (currentPos < r.to) {
                    result += doc.sliceString(currentPos, r.to); // 拼接剩余文本
                }
                texts.push(result);
            });

            const finalText = texts.join(view.state.lineBreak);

            // 4. 将我们处理好的“所见即所得”文本塞入剪贴板
            if (event.clipboardData) {
                event.clipboardData.setData('text/plain', finalText);
                event.preventDefault();
                return true;
            }

            return false;
        },

        cut: (event: ClipboardEvent, view: EditorView) => {
            const ranges = view.state.selection.ranges;
            const decos = view.state.field(annotationField, false);
            if (!decos || ranges.some(r => r.empty)) return false;

            let hasPhantom = false;
            ranges.forEach(r => {
                decos.between(r.from, r.to, (from, to, value) => {
                    if (value.spec.widget instanceof PhantomWidget) { hasPhantom = true; }
                });
            });

            if (!hasPhantom) return false;

            const doc = view.state.doc;
            const texts: string[] = [];

            ranges.forEach(r => {
                let result = "";
                let currentPos = r.from;

                decos.between(r.from, r.to, (dFrom, dTo, value) => {
                    if (dTo <= currentPos) return;
                    const start = Math.max(currentPos, dFrom);
                    if (start > currentPos) { result += doc.sliceString(currentPos, start); }
                    if (value.spec.widget instanceof PhantomWidget) { result += value.spec.widget.text; }
                    currentPos = Math.max(currentPos, dTo);
                });

                if (currentPos < r.to) { result += doc.sliceString(currentPos, r.to); }
                texts.push(result);
            });

            const finalText = texts.join(view.state.lineBreak);

            if (event.clipboardData) {
                event.clipboardData.setData('text/plain', finalText);
                event.preventDefault();

                // 执行剪切动作（它会安全地触发保护机制或删除文本）
                let changes = ranges.map(r => ({ from: r.from, to: r.to }));
                view.dispatch({
                    changes: changes,
                    userEvent: "delete.cut"
                });
                return true;
            }
            return false;
        }
    });
}




function createAnnotationDecorations(view: EditorView, annotations: Annotation[], plugin: FootnoteCompassPlugin): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const text = view.state.doc.toString();
    const decos: { from: number, to: number, deco: Decoration }[] = [];
    let needsSave = false;

    annotations.forEach(anno => {
        const oldExpected = anno.expectedOffset; // ✨ 修复 1：记录修复前的预期位置
        const match = findAnnotationOffsetAndHeal(text, anno);
        if (!match) return;

        // ✨ 修复 1：抛弃错误的 indexOf 判定。如果自愈算法真的生效了，它一定会修改 expectedOffset，我们直接对比即可
        if (anno.expectedOffset !== oldExpected) {
            needsSave = true;
        }

        const hColor = anno.highlightColor || plugin.settings.defaultHighlightColor;
        const pColor = anno.phantomColor || plugin.settings.defaultPhantomColor;
        const checkedComment = (anno.comments || []).find(c => c.checked);

        // ✨ 重构：无论是变体还是原文本，全部使用 Replace 变成不可编辑的保护块！
        if (checkedComment) {
            decos.push({
                from: match.start, to: match.end,
                deco: Decoration.replace({ widget: new PhantomWidget(checkedComment.text, pColor, anno.id, false), inclusive: false })
            });
        } else {
            decos.push({
                from: match.start, to: match.end,
                deco: Decoration.replace({ widget: new PhantomWidget(anno.original, hColor, anno.id, true), inclusive: false })
            });
        }
    });

    decos.sort((a, b) => a.from - b.from).forEach(d => builder.add(d.from, d.to, d.deco));
    if (needsSave) plugin.annoManager.save();
    return builder.finish();
}

// --- ✨ 修复 2 回退并改良：不再依赖焦点，而是安全遍历所有已打开的 MD 视图 ---
function updateEditorDecorations(plugin: FootnoteCompassPlugin) {
    try {
        // 直接获取当前打开的所有 Markdown 面板
        const leaves = plugin.app.workspace.getLeavesOfType('markdown');
        for (let leaf of leaves) {
            const mdView = leaf.view as MarkdownView;
            if (!mdView.editor || !mdView.file) continue;

            const cm = (mdView.editor as any).cm as EditorView;
            if (cm) {
                const annos = plugin.annoManager.data[mdView.file.path] || [];
                const decos = createAnnotationDecorations(cm, annos, plugin);
                cm.dispatch({ effects: AnnotationStateEffect.of(decos) });
            }
        }
    } catch (e) {
        console.warn("FootnoteCompass 活动视图装饰器更新异常:", e);
    }
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
            const match = content.match(/<!-- FC_DATA_START -->\r?\n```json\r?\n([\s\S]*?)\r?\n```\r?\n<!-- FC_DATA_END -->/)
                || content.match(/```json\r?\n([\s\S]*?)\r?\n```/);

            if (match) {
                try {
                    this.data = JSON.parse(match[1]);
                } catch (e) {
                    console.error("解析变体数据失败", e);
                    new Notice("🚨 致命错误：大纲变体标注数据库的 JSON 格式损坏！\n为防止数据被清空，已强制暂停保存功能。请检查数据库文件！", 15000);
                    this.isLoaded = false;
                    return;
                }
            } else if (content.trim().length > 0) {
                // 🚨 新增安全拦截：文件里有内容，但是没找到合法的 JSON 块（可能用户误删了标记代码）
                new Notice("🚨 致命错误：在数据库中找不到合法的 JSON 数据块！\n可能是您的标记代码被误删。为防止数据覆盖，已暂停保存功能，请检查文件！", 15000);
                this.isLoaded = false; // 强行阻断后续的保存，保护现场
                return;
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

        // ==========================================
        // 🛡️ 终极防空 Bug 拦截器：防止插件把你的数据写成白板
        // ==========================================
        if (file instanceof TFile) {
            // 1. 算一下当前内存里打算保存多少条标注
            let currentTotal = 0;
            Object.values(this.data).forEach(arr => currentTotal += (arr || []).length);

            // 2. 如果内存里居然一条数据都没有了（可能是触发了极其严重的 Bug）
            if (currentTotal === 0) {
                // 读取一下硬盘上现有的原文件
                const oldContent = await this.plugin.app.vault.read(file);
                // 3. 如果原文件体积大于 300 字符，且包含了 "id":（说明原来明明有大量数据）
                if (oldContent.length > 300 && oldContent.includes('"id":')) {
                    console.error("🚨 致命拦截：触发了数据清空 Bug！已物理阻断保存。");
                    new Notice("🚨 致命异常拦截：插件检测到试图清空全部数据！\n为保护您的心血，已强行中止保存！", 15000);
                    return; // 🛑 直接阻断运行，不准覆盖硬盘！！！
                }
            }
        }
        // ==========================================

        const jsonStr = JSON.stringify(this.data, (key, value) => {
            if (key === 'el' || key === '_tempOffset' || key === '_exportOffset') return undefined;
            return value;
        }, 2);

        const newBlock = `<!-- FC_DATA_START -->\n\`\`\`json\n${jsonStr}\n\`\`\`\n<!-- FC_DATA_END -->`;
        const defaultContent = `# 📚 小说标注与变体数据库\n> ⚠️ 请不要手动修改下面的代码块，这是插件自动维护的！这保证了你的数据可以随笔记一起安全备份。\n\n${newBlock}\n`;

        try {
            if (file instanceof TFile) {
                await this.plugin.app.vault.process(file, (data) => {
                    const regexNew = /<!-- FC_DATA_START -->\r?\n```json\r?\n([\s\S]*?)\r?\n```\r?\n<!-- FC_DATA_END -->/;

                    // 1. 只有在格式 100% 完美无损的情况下，才进行精准覆盖当前块
                    if (data.match(regexNew)) {
                        return data.replace(regexNew, () => newBlock);
                    }

                    // 2. 只要格式出现任何残缺、找不到完美首尾标签（即出现错误）
                    // 绝不去尝试正则模糊替换！绝对不碰原有的任何文本！
                    // 直接在整个文档的最最下方，追加全新的数据块！
                    if (data.trim().length === 0) {
                        return defaultContent;
                    } else {
                        // 清理掉末尾多余的空白符，严格空出两行，然后追加新块
                        return data.replace(/\s+$/, "") + "\n\n" + newBlock + "\n";
                    }
                });
            } else {
                await this.plugin.app.vault.create(path, defaultContent);
            }

            // 👇 每次成功写入后，呼叫备份引擎，检查是否需要备份！
            await this._processBackup(defaultContent, newBlock, file instanceof TFile ? file : null);

        } catch (e) {
            console.error("保存标注数据失败:", e);
        }
    }

    // ✨ 终极保命机制：静默滚动备份引擎
    async _processBackup(defaultContent: string, newBlock: string, originalFile: TFile | null) {
        const now = Date.now();
        const intervalMs = this.plugin.settings.backupIntervalMinutes * 60 * 1000;

        // 如果距离上次备份还没超过设定的冷却时间，直接退出，不备
        if (now - this.plugin.settings.lastBackupTime < intervalMs) return;

        try {
            // 获取最新鲜的数据：如果原文件存在，读取它（包含用户的笔记），否则用默认模版
            const fullContentToBackup = originalFile ? await this.plugin.app.vault.read(originalFile) : defaultContent;

            // 插件配置底层的路径，极其安全，不会在用户的普通文件树里碍眼
            const adapter = this.plugin.app.vault.adapter;
            const backupDirPath = normalizePath(this.plugin.app.vault.configDir + "/plugins/footnote-compass/backups");

            // 确保备份文件夹存在
            if (!(await adapter.exists(backupDirPath))) {
                await adapter.mkdir(backupDirPath);
            }

            // 生成带时间戳的文件名 (例如: 大纲备份_2026-05-24_17-30-15.md)
            const dateObj = new Date();
            const timeString = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}_${String(dateObj.getHours()).padStart(2, '0')}-${String(dateObj.getMinutes()).padStart(2, '0')}-${String(dateObj.getSeconds()).padStart(2, '0')}`;
            const backupFileName = `${backupDirPath}/大纲备份_${timeString}.md`;

            // 1. 写入最新的备份文件
            await adapter.write(backupFileName, fullContentToBackup);

            // 2. 刷新上次备份时间并保存设置
            this.plugin.settings.lastBackupTime = now;
            await this.plugin.saveSettings();

            // 3. 执行垃圾回收：读取所有备份，超过最大份数就删掉最老的
            const dirList = await adapter.list(backupDirPath);
            const backupFiles = dirList.files.filter(f => f.endsWith(".md"));

            if (backupFiles.length > this.plugin.settings.maxBackups) {
                // 获取每个文件的详细信息(创建时间)，排序，找出最老的
                const filesWithTime = await Promise.all(backupFiles.map(async f => {
                    const stat = await adapter.stat(f);
                    return { path: f, ctime: stat?.ctime || 0 };
                }));
                // 按时间从旧到新排序
                filesWithTime.sort((a, b) => a.ctime - b.ctime);

                // 算出需要删掉多少个多余的文件
                const deleteCount = filesWithTime.length - this.plugin.settings.maxBackups;
                for (let i = 0; i < deleteCount; i++) {
                    await adapter.remove(filesWithTime[i].path);
                }
            }
            console.log("✅ FootnoteCompass 自动备份成功执行！");
        } catch (e) {
            console.error("FootnoteCompass 自动备份失败:", e);
        }
    }

    async forceSave() {
        if (!this.isLoaded) return;
        await this._performWrite();
    }
}


// ✨ 替换原来的图标选择器为高级网格版本
class IconGridModal extends Modal {
    plugin: FootnoteCompassPlugin;
    onSelect: (iconName: string) => void;
    allIcons: string[];
    searchQuery: string = "";

    constructor(plugin: FootnoteCompassPlugin, onSelect: (iconName: string) => void) {
        super(plugin.app);
        this.plugin = plugin;
        this.onSelect = onSelect;
        this.allIcons = getIconIds();
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // 1. 顶部搜索框
        const searchContainer = contentEl.createDiv({ attr: { style: "margin-bottom: 15px;" } });
        const searchInput = searchContainer.createEl("input", {
            type: "text",
            placeholder: "搜索图标名称 (如 star, heart)...",
            attr: { style: "width: 100%; padding: 8px 12px; border-radius: 6px;" }
        });

        // 2. 下方大区域（带滚动条）
        const gridWrapper = contentEl.createDiv({ attr: { style: "height: 400px; overflow-y: auto; padding-right: 5px;" } });

        const renderGrid = () => {
            gridWrapper.empty();
            const query = this.searchQuery.toLowerCase();
            const filteredIcons = query
                ? this.allIcons.filter(icon => icon.toLowerCase().includes(query))
                : this.allIcons;

            const recents = this.plugin.settings.recentIcons || [];

            // 只有当没有搜索内容，且有历史记录时，才渲染“最近使用”
            if (!query && recents.length > 0) {
                gridWrapper.createEl("div", { text: "最近使用的图标：", attr: { style: "font-size: 12px; color: var(--text-muted); margin-bottom: 10px;" } });
                const recentGrid = gridWrapper.createDiv({ attr: { style: "display: grid; grid-template-columns: repeat(auto-fill, minmax(75px, 1fr)); gap: 8px; margin-bottom: 25px;" } });
                recents.forEach(icon => this.createIconBtn(recentGrid, icon));
            }

            // 渲染“所有图标”
            gridWrapper.createEl("div", { text: "所有图标：", attr: { style: "font-size: 12px; color: var(--text-muted); margin-bottom: 10px;" } });
            const mainGrid = gridWrapper.createDiv({ attr: { style: "display: grid; grid-template-columns: repeat(auto-fill, minmax(75px, 1fr)); gap: 8px;" } });

            // 为了防止 Obsidian 卡顿，一次最多渲染前 200 个，搜索时会实时过滤
            filteredIcons.slice(0, 200).forEach(icon => this.createIconBtn(mainGrid, icon));
        };

        // 绑定搜索事件
        searchInput.addEventListener("input", (e) => {
            this.searchQuery = (e.target as HTMLInputElement).value;
            renderGrid();
        });

        setTimeout(() => searchInput.focus(), 50); // 弹窗后自动聚焦输入框
        renderGrid();
    }

    // 渲染单个网格按钮的工具函数
    createIconBtn(parent: HTMLElement, iconName: string) {
        const btn = parent.createDiv({ attr: { style: "display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 12px 4px; border-radius: 8px; cursor: pointer; border: 1px solid var(--background-modifier-border); transition: background-color 0.2s;" } });

        btn.addEventListener("mouseover", () => btn.style.backgroundColor = "var(--background-modifier-hover)");
        btn.addEventListener("mouseout", () => btn.style.backgroundColor = "transparent");

        const iconSpan = btn.createSpan({ attr: { style: "margin-bottom: 8px; pointer-events: none;" } });
        setIcon(iconSpan, iconName);

        // 如果名字太长，截断它
        let displayName = iconName;
        if (displayName.length > 10) displayName = displayName.substring(0, 8) + "..";
        btn.createSpan({ text: displayName, attr: { style: "font-size: 11px; color: var(--text-muted); pointer-events: none;" } });

        btn.onclick = async () => {
            // 选中时，更新“最近使用”记录
            let recents = this.plugin.settings.recentIcons || [];
            recents = recents.filter(id => id !== iconName); // 把旧的同名踢掉
            recents.unshift(iconName); // 把最新的插到第 1 个
            if (recents.length > 5) recents.pop(); // 保持最多 5 个
            this.plugin.settings.recentIcons = recents;
            await this.plugin.saveSettings();

            this.onSelect(iconName);
            this.close();
        };
    }

    onClose() { this.contentEl.empty(); }
}

// --- 弹窗组件集 ---
class ColorPickerModal extends Modal {
    // ✨ 修改：onSelect 现在允许接收 null 代表恢复默认
    constructor(app: App, public titleText: string, public palette: ColorPreset[], public onSelect: (hex: string | null) => void) {
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

        // ✨ 新增：回到默认按钮
        const resetWrapper = this.contentEl.createDiv({ cls: "color-picker-reset-wrapper" });
        const resetBtn = resetWrapper.createEl("button", { text: "↺ 回到默认颜色" });
        resetBtn.onclick = () => {
            this.onSelect(null); // 传 null 通知外部清空颜色
            this.close();
        };
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
    descText: string; // ✨ 新增：用于动态改变提示语

    constructor(app: App, public titleText: string, initialVal: string, public onSubmit: (val: string) => void, public onDelete: (() => void) | null = null) {
        super(app);
        this.result = initialVal || "";

        // ✨ 漏洞修复：根据标题动态判断，是修改原词还是写变体
        if (titleText.includes("原文本")) {
            this.descText = "修改正文中的原词。(⚠️ 原词必须在同一段内，不支持换行)";
        } else {
            this.descText = "输入变体内容。(Enter 保存，Shift + Enter 换行)";
        }
    }

    onOpen() {
        this.setTitle(this.titleText);

        const textSetting = new Setting(this.contentEl)
            .setName("内容文字")
            .setDesc(this.descText) // ✨ 使用动态提示语
            .addTextArea(text => {
                text.setValue(this.result).onChange(val => this.result = val);

                text.inputEl.style.width = "100%";
                text.inputEl.style.minHeight = "120px";
                text.inputEl.style.resize = "vertical";

                text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
                    if (e.key === "Enter" && !e.isComposing) {
                        // ✨ 终极防御 1：如果是原文本模式，只要按下回车就直接保存，屏蔽掉 Shift+Enter 换行！
                        if (this.titleText.includes("原文本")) {
                            e.preventDefault();
                            if (this.result.trim()) this.onSubmit(this.result.trim());
                            this.close();
                        } else {
                            // ✨ 变体模式：允许按 Shift+Enter 换行
                            if (!e.shiftKey) {
                                e.preventDefault();
                                if (this.result.trim()) this.onSubmit(this.result.trim());
                                this.close();
                            }
                        }
                    }
                });
            });

        textSetting.settingEl.addClass("annotation-textarea-setting");

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

// --- 数据库管理：重新关联文件的模态框 ---
class RelinkModal extends Modal {
    constructor(
        app: App,
        public oldPath: string,
        public plugin: FootnoteCompassPlugin,
        public onSuccess: () => void
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        this.setTitle("重新指定文件映射");

        // 提取丢掉的文件名（比如 "全局.md"）
        const missingFileName = this.oldPath.split('/').pop() || "";

        contentEl.createEl("p", {
            text: `记录中的文件为：【${this.oldPath}】\n由于被外部移动或删除，现已断联。`,
            cls: "annotation-confirm-msg"
        });

        contentEl.createEl("p", {
            text: `⚠️ 强制安全规则：你只能将其重新关联到名为 "${missingFileName}" 的文件。`,
            cls: "annotation-confirm-msg",
            attr: { style: "color: var(--text-warning); font-size: 13px;" }
        });

        // 查找库中所有文件名完全一样的文件
        const matchingFiles = this.app.vault.getMarkdownFiles().filter(f => f.name === missingFileName);

        const listContainer = contentEl.createDiv({ cls: "relink-file-list" });

        if (matchingFiles.length === 0) {
            listContainer.createDiv({
                text: "❌ 在当前整个知识库中，没有找到同名文件。如果你在外部改名了，请先改回原名。",
                attr: { style: "color: var(--text-error); padding: 10px; background: var(--background-modifier-error);" }
            });
        } else {
            matchingFiles.forEach(file => {
                const btn = listContainer.createEl("button", {
                    text: `🔗 关联至: ${file.path}`,
                    cls: "relink-file-btn"
                });
                btn.onclick = async () => {
                    // 核心数据转移逻辑
                    this.plugin.annoManager.data[file.path] = this.plugin.annoManager.data[this.oldPath];
                    delete this.plugin.annoManager.data[this.oldPath];

                    // 转移UI偏好
                    if (this.plugin.settings.headingFilters[this.oldPath]) {
                        this.plugin.settings.headingFilters[file.path] = this.plugin.settings.headingFilters[this.oldPath];
                        delete this.plugin.settings.headingFilters[this.oldPath];
                    }
                    if (this.plugin.settings.displayModes[this.oldPath]) {
                        this.plugin.settings.displayModes[file.path] = this.plugin.settings.displayModes[this.oldPath];

                        if (this.plugin.settings.autoExpands[this.oldPath] !== undefined) {
                            this.plugin.settings.autoExpands[file.path] = this.plugin.settings.autoExpands[this.oldPath];
                            delete this.plugin.settings.autoExpands[this.oldPath];
                        }

                        delete this.plugin.settings.displayModes[this.oldPath];
                    }

                    await this.plugin.annoManager.save();
                    await this.plugin.saveSettings();

                    // 刷新UI和正文装饰器
                    updateEditorDecorations(this.plugin);
                    this.onSuccess();
                    this.close();
                    new Notice("✅ 重新关联成功！");
                };
            });
        }
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
    _forceExpandedCardId: string | null = null; // ✨ 新增：用于在关闭模式下记住手动展开的卡片
    _lockedActiveId: string | null = null;      // ✨ 修复：补充声明锁定状态变量


    debouncedSync: Function;
    debouncedScrollSync: Function;

    constructor(leaf: WorkspaceLeaf, plugin: FootnoteCompassPlugin) {
        super(leaf);
        this.plugin = plugin;

        this.debouncedSync = debounce(() => {
            // ✅ 官方最新规范：直接获取当前激活的 Markdown 视图
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView) this.syncHighlightWithCursor(activeView);
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
    getDisplayText() { return "小说标注分支大纲"; }
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
            setTimeout(() => { this.isNavigating = false; }, 350);
            /*this.debouncedSync();*/   /*  不要删这个禁用光标判定*/
        };

        const workspaceEl = this.app.workspace.containerEl;
        this.registerDomEvent(workspaceEl, 'click', triggerNavLock, { capture: true });
        this.registerDomEvent(workspaceEl, 'keyup', triggerNavLock, { capture: true });

        this.registerDomEvent(workspaceEl, 'scroll', (e: Event) => {
            if (this.isNavigating) return;

            const target = e.target as HTMLElement;
            if (target?.classList?.contains('cm-scroller')) {

                // ✨ 用户一旦自己动了滚轮，瞬间解除一切强制锁定！
                this._lockedActiveId = null;

                if (this._forceExpandedCardId !== null) {
                    this._forceExpandedCardId = null;
                    this.listRoot?.querySelectorAll('.annotation-card.force-expand').forEach(el => el.classList.remove('force-expand'));
                }

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

        // ✨ 接收在正文里点击“变体文本”的求助信号 (用 (this as any) 绕过 Obsidian 官方对标准 DOM 事件字典的严格重载检查)
        (this as any).registerDomEvent(window, 'footnote-compass-expand-card', (e: Event) => {
            const customEvent = e as CustomEvent;
            const targetId = customEvent.detail?.annoId;
            if (!targetId || !this.listRoot) return;

            this._lockedActiveId = targetId; // ✨ 绝对锁定：告诉系统接下来只认这个ID，别乱算！
            this.isNavigating = true;
            setTimeout(() => { this.isNavigating = false; }, 800);

            // 根据 ID 揪出对应的卡片
            const targetCard = this.listRoot.querySelector(`.annotation-card[data-anno-id="${targetId}"]`) as HTMLElement;
            if (targetCard) {
                this._forceExpandedCardId = targetId;
                this.listRoot.querySelectorAll('.annotation-card.force-expand').forEach(el => el.classList.remove('force-expand'));
                targetCard.classList.add('force-expand');

                this.listRoot.querySelectorAll('.annotation-card.is-active').forEach(el => el.classList.remove('is-active'));
                targetCard.classList.add('is-active');

                targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });

        // 强行给足加载时间，避免刚启动时找不准 leaf
        setTimeout(() => this.checkAndUpdate(), 300);
    }

    findBestLeaf(): WorkspaceLeaf | null {
        // 1. 如果当前真实激活的窗口就是 Markdown，直接返回它
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.leaf) return activeView.leaf;

        // ✨ 核心修复 1：当焦点进入侧边栏时，不要盲目抓取第一个 MD 视图！
        // 优先检查我们上一次正在看的那个文档是否还开着，如果在，坚决锁定它。
        const leaves = this.app.workspace.getLeavesOfType('markdown');
        if (this.lastActiveView) {
            const isStillOpen = leaves.find(l => l.view === this.lastActiveView);
            if (isStillOpen) return isStillOpen;
        }

        // 3. 兜底：随便找一个打开的 markdown 窗口
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
            // ✨ 核心修复 2：当页面里真的没有任何 MD 文件（比如全部关掉，或者只有白板/图片）
            // 彻底清理废弃缓存，这能保证下次你重新打开或切回 MD 时，侧边栏 100% 刷新！
            this.lastActiveView = null;
            this.cachedRefs = [];
            this._lastStateHash = "";
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

            // ✨ 屏蔽：不再从正文中扫描脚注，从源头掐断
            /*
            let fMatch;
            while ((fMatch = footRefRegex.exec(cleanLine)) !== null) {
                this.cachedRefs.push({
                    type: 'footnote', key: fMatch[1], content: definitionMap.get(fMatch[1]) || "(未定义)", line: lineIndex, col: fMatch.index, len: fMatch[0].length, el: null
                });
            }
            */
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

            // ✨ 优化：使用离线文档碎片(DocumentFragment) 避免频繁触发浏览器重排，大幅提高长文渲染性能
            const fragment = document.createDocumentFragment();

            const listContainer = fragment.createDiv({ cls: "footnote-compass-container" });

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
                const headerContainer = fragment.createDiv({ cls: "annotation-section-header" });

                // 左侧：固定标题
                headerContainer.createDiv({ cls: "annotation-divider", text: "📌 标注" });

                // 右侧控制区
                const rightControls = headerContainer.createDiv({
                    attr: { style: "display: flex; align-items: center; gap: 4px;" }
                });

                // --- 1. 层级过滤：从原生Select改为优雅的Obsidian官方Menu ---
                const filterLvlStr = this.plugin.settings.headingFilters[filePath] || "0";
                const headingMap: Record<string, string> = { "0": "无", "1": "H1", "2": "H2", "3": "H3", "4": "H4", "5": "H5", "6": "H6" };

                const headingBtn = rightControls.createEl("button", {
                    text: `${headingMap[filterLvlStr]} ▾`,
                    cls: "compass-ui-btn"
                });
                headingBtn.onclick = (e) => {
                    const menu = new Menu();
                    Object.entries(headingMap).forEach(([val, text]) => {
                        menu.addItem((item) => {
                            item.setTitle(text)
                                .setChecked(val === filterLvlStr)
                                .onClick(async () => {
                                    this.plugin.settings.headingFilters[filePath] = val;
                                    await this.plugin.saveSettings();
                                    this._lastStateHash = "";
                                    if (this.lastActiveView) { this.checkAndUpdate(); } else { this.renderRefList(); }
                                });
                        });
                    });
                    menu.showAtMouseEvent(e);
                };

                // --- 2. 显示模式：从原生Select改为优雅的Obsidian官方Menu ---
                const displayModeStr = this.plugin.settings.displayModes[filePath] || "original";

                if (this.listRoot) this.listRoot.dataset.displayMode = displayModeStr;

                // ✨ 修改：去掉了 "closed": "关闭" 选项，仅保留三种文本显示模式
                const modeMap: Record<string, string> = { "original": "标题", "variant": "分支", "both": "同时" };

                const displayModeBtn = rightControls.createEl("button", {
                    text: `${modeMap[displayModeStr]} ▾`,
                    cls: "compass-ui-btn"
                });
                displayModeBtn.onclick = (e) => {
                    const menu = new Menu();
                    Object.entries(modeMap).forEach(([val, text]) => {
                        menu.addItem((item) => {
                            item.setTitle(text)
                                .setChecked(val === displayModeStr)
                                .onClick(async () => {
                                    this.plugin.settings.displayModes[filePath] = val;
                                    await this.plugin.saveSettings();
                                    this._lastStateHash = "";
                                    if (this.lastActiveView) { this.checkAndUpdate(); } else { this.renderRefList(); }
                                });
                        });
                    });
                    menu.showAtMouseEvent(e);
                };

                // --- 3. 自动展开 开启/关闭 按钮 (新增) ---
                const isAutoExpand = this.plugin.settings.autoExpands[filePath] !== false;
                if (this.listRoot) this.listRoot.dataset.autoExpand = isAutoExpand ? "true" : "false";

                const autoExpandBtn = rightControls.createEl("button", {
                    text: isAutoExpand ? "开启" : "关闭",
                    cls: "compass-ui-btn"
                });

                // ✨ 修复2：如果全局是展开状态，禁用该按钮
                if (!isCollapsed) {
                    autoExpandBtn.disabled = true;
                    autoExpandBtn.style.opacity = "0.4";
                    autoExpandBtn.style.cursor = "not-allowed";
                    autoExpandBtn.title = "全局展开状态下无需此功能";
                } else {
                    autoExpandBtn.onclick = async () => {
                        this.plugin.settings.autoExpands[filePath] = !isAutoExpand;
                        await this.plugin.saveSettings();
                        this._lastStateHash = "";
                        if (this.lastActiveView) this.checkAndUpdate();
                    };
                }

                autoExpandBtn.onclick = async () => {
                    this.plugin.settings.autoExpands[filePath] = !isAutoExpand;
                    await this.plugin.saveSettings();
                    this._lastStateHash = "";
                    if (this.lastActiveView) this.checkAndUpdate();
                };

                // --- 4. 折叠/展开按钮 ---
                const toggleBtn = rightControls.createEl("button", {
                    text: isCollapsed ? "展开" : "折叠",
                    cls: "compass-ui-btn"
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
                        const hText = nearestHeading ? nearestHeading.text : "无标题 / 顶部";

                        if (hText !== currentHeadingText) {
                            const hDivider = fragment.createDiv({ cls: "annotation-heading-divider", text: hText });
                            hDivider.style.color = this.plugin.settings.headingColor || "#2196f3";
                            currentHeadingText = hText;
                            isNewHeadingBlock = true;
                        }
                    }

                    if (targetLvl === 0 || isNewHeadingBlock || !currentGroupWrapper) {
                        currentGroupWrapper = fragment.createDiv({
                            cls: "annotation-group-wrapper"
                        });
                    }

                    const card = currentGroupWrapper.createDiv({ cls: "annotation-card" });
                    card.dataset.annoId = anno.id; // ✨ 新增：给卡片打上用于精准查找的专属 ID 标签
                    // anno.el = card;

                    // ✨ 恢复状态：如果关闭了自动展开，且该卡片之前被手动点击展开过，则给它加上强制展开类
                    if (!isAutoExpand && this._forceExpandedCardId === anno.id) {
                        card.classList.add("force-expand");
                    }

                    const hColor = anno.highlightColor || this.plugin.settings.defaultHighlightColor;
                    const pColor = anno.phantomColor || this.plugin.settings.defaultPhantomColor;

                    card.onclick = () => {
                        this._lockedActiveId = anno.id;
                        // ✨ 修改：判断如果“关闭”了自动展开，则点击卡片触发手风琴展开效果
                        if (!isAutoExpand) {
                            const wasExpanded = card.classList.contains('force-expand');
                            this.listRoot?.querySelectorAll('.annotation-card.force-expand').forEach(el => el.classList.remove('force-expand'));
                            if (!wasExpanded) {
                                card.classList.add('force-expand');
                                this._forceExpandedCardId = anno.id;
                            } else {
                                this._forceExpandedCardId = null;
                            }
                        }
                        // ... 下面光标跳转的代码保持不变

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

                        // ✨ 1. 添加选中状态类
                        card.classList.add("is-context-active");

                        const menu = new Menu();

                        // ✨ 2. 监听菜单消失，移除选中状态
                        menu.onHide(() => {
                            card.classList.remove("is-context-active");
                        });

                        menu.addItem((item) => {
                            item.setTitle("添加分支").setIcon("list-plus").onClick(() => {
                                new CommentModal(this.app, "添加分支", "", async (text) => {
                                    if (!anno.comments) anno.comments = [];
                                    anno.comments.push({ id: generateUUID(), text, checked: false });
                                    await this.plugin.annoManager.save();
                                    this._lastStateHash = ""; this.checkAndUpdate();
                                }).open();
                            });
                        });

                        // ✨ 图标相关
                        menu.addItem((item) => {
                            item.setTitle("添加图标").setIcon("smile-plus").onClick(() => {
                                new IconGridModal(this.plugin, async (iconName) => {
                                    anno.icon = iconName;
                                    await this.plugin.annoManager.save();
                                    this._lastStateHash = "";
                                    this.checkAndUpdate();
                                }).open();
                            });

                            if (anno.icon) {
                                menu.addItem((item) => {
                                    item.setTitle("删除图标").setIcon("eraser").onClick(async () => {
                                        delete anno.icon;
                                        await this.plugin.annoManager.save();
                                        this._lastStateHash = "";
                                        this.checkAndUpdate();
                                    });
                                });
                            }
                        });

                        menu.addSeparator();
                        menu.addItem((item) => {
                            item.setTitle("修改标注颜色").setIcon("highlighter").onClick(() => {
                                new ColorPickerModal(this.app, "选择标注高亮颜色", palette, async (c) => {
                                    if (c) { anno.highlightColor = c; } else { delete anno.highlightColor; }
                                    await this.plugin.annoManager.save();
                                    updateEditorDecorations(this.plugin); this._lastStateHash = ""; this.checkAndUpdate();
                                }).open();
                            });
                        });

                        menu.addItem((item) => {
                            item.setTitle("修改分支颜色").setIcon("paintbrush").onClick(() => {
                                new ColorPickerModal(this.app, "选择分支颜色", palette, async (c) => {
                                    if (c) { anno.phantomColor = c; } else { delete anno.phantomColor; }
                                    await this.plugin.annoManager.save();
                                    updateEditorDecorations(this.plugin); this._lastStateHash = ""; this.checkAndUpdate();
                                }).open();
                            });
                        });
                        menu.addSeparator();

                        // ✨ 重构：修改原文本 (严密作用域，不会报错)
                        // ✨ 重构：修改原文本 (严密作用域，不会报错)
                        menu.addItem((item) => {
                            item.setTitle("修改原文本").setIcon("pencil").onClick(async () => {
                                const view = this.lastActiveView;
                                if (!view || !view.editor) return;

                                new CommentModal(this.app, "修改标注原文本", anno.original, async (rawNewText) => {
                                    // ✨ 终极防御 2：如果用户强行粘贴了多行文本，将其中的换行符全部碾平替换为空格！
                                    const newText = rawNewText.replace(/\r?\n/g, ' ').trim();

                                    if (!newText || newText === anno.original) return;

                                    const editor = view.editor;
                                    const fullText = editor.getValue();

                                    const match = findAnnotationOffsetAndHeal(fullText, anno);
                                    if (!match) {
                                        new Notice("⚠️ 无法在正文中定位原文本，请确保文本未被破坏！");
                                        return;
                                    }

                                    const fromPos = editor.offsetToPos(match.start);
                                    const toPos = editor.offsetToPos(match.end);
                                    this.plugin.isPluginModifying = true; // ✨ 开启特权
                                    editor.replaceRange(newText, fromPos, toPos);
                                    this.plugin.isPluginModifying = false; // ✨ 立即关闭特权

                                    const cursor = editor.offsetToPos(match.start);
                                    const lineText = editor.getLine(cursor.line);
                                    anno.original = newText;

                                    // ✨ 安全计算：现在 newText 绝不包含换行符了，这里的截取才不会越界报错
                                    anno.prefix = lineText.substring(Math.max(0, cursor.ch - 30), cursor.ch);
                                    const suffixStart = cursor.ch + newText.length;
                                    anno.suffix = lineText.substring(suffixStart, Math.min(lineText.length, suffixStart + 30));

                                    anno.expectedOffset = match.start;

                                    await this.plugin.annoManager.save();
                                    updateEditorDecorations(this.plugin);
                                    this._lastStateHash = "";
                                    this.checkAndUpdate();
                                    new Notice(`✅ 原文本已成功修改为：\n"${newText}"`);
                                }).open();
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
                    }; // 👈 右键菜单完整结束块

                    const header = card.createDiv({ cls: "annotation-header" });

                    // ✨ 修复：在关闭模式下，将状态原封不动地传递给 CSS，由 CSS 根据 force-expand（是否展开）来精确控制文字显隐
                    header.dataset.displayMode = displayModeStr;

                    const checkedComment = (anno.comments || []).find(c => c.checked);
                    const variantText = checkedComment ? checkedComment.text : "无";

                    // ✨ 修复：加上 flex: 1 和 min-width: 0，让长文字能够乖乖被截断并显示 "..."
                    const titleWrapper = header.createDiv({
                        cls: "anno-title-wrapper",
                        attr: { style: "display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;" }
                    });

                    if (anno.icon) {
                        const iconSpan = titleWrapper.createSpan({ cls: "anno-icon" });
                        iconSpan.style.flexShrink = "0"; // ✨ 保护机制：文字再长也绝对不能去挤压图标
                        setIcon(iconSpan, anno.icon); // 恢复默认颜色

                        // 读取你的设置，并通过 relative 定位实现垂直微调
                        const offset = this.plugin.settings.iconOffsetY || 0;
                        if (offset !== 0) {
                            iconSpan.style.position = "relative";
                            iconSpan.style.top = `${offset}px`;
                        }
                    }

                    titleWrapper.createSpan({ text: anno.original, cls: "anno-title-text anno-text-original" });
                    titleWrapper.createSpan({ text: variantText, cls: "anno-title-text anno-text-variant" });
                    titleWrapper.createSpan({ text: `${anno.original}：${variantText}`, cls: "anno-title-text anno-text-both" });

                    const list = card.createDiv({ cls: "annotation-comments-list" });

                    (anno.comments || []).forEach(comment => {
                        const row = list.createDiv({ cls: "annotation-comment-row" });
                        row.dataset.commentId = comment.id;

                        row.onclick = async (e) => {
                            e.stopPropagation();
                            this._lockedActiveId = anno.id; // ✨ 给变体条目点击上锁
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
                fragment.createDiv({ cls: "footnote-empty", text: "当前文档无脚注或标注" });
            }

            // ✨ 优化：一次性将所有组装好的 DOM 挂载，彻底解决滚动和渲染卡顿
            this.listRoot.appendChild(fragment);

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
            // 携带 ID 进入数组
            let allItems: { el: HTMLElement, offset: number, id: string }[] = [];
            this.cachedRefs.forEach(ref => {
                if (ref.el) allItems.push({ el: ref.el, offset: view.editor.posToOffset({ line: ref.line, ch: ref.col }), id: ref.key });
            });
            const annos = this.plugin.annoManager.data[view.file?.path || ""] || [];
            annos.forEach(anno => {
                if (anno._tempOffset !== undefined && anno._tempOffset < Number.MAX_SAFE_INTEGER) {
                    // ✨ 动态去页面里找对应的卡片，而不是去内存里拿，彻底解决内存泄漏
                    const cardEl = this.listRoot?.querySelector(`.annotation-card[data-anno-id="${anno.id}"]`) as HTMLElement;
                    if (cardEl) {
                        allItems.push({ el: cardEl, offset: anno._tempOffset, id: anno.id });
                    }
                }
            });

            if (allItems.length === 0) return;

            // ✨ 1. 纯净的最小绝对距离算法 (彻底修复“同行永远选不对”的恶性BUG)
            let primaryItem = allItems[0];
            let minDistance = Infinity;
            allItems.forEach(item => {
                let dist = Math.abs(item.offset - targetOffset);
                if (dist < minDistance) {
                    minDistance = dist;
                    primaryItem = item;
                }
            });

            // ✨ 2. 交互锁定覆盖 (如果在 0.8秒内明确点击了某个卡片，无视光标偏移，系统强行认定它为主目标！)
            if (this._lockedActiveId) {
                const lockedItem = allItems.find(i => i.id === this._lockedActiveId);
                // 只要光标没跑得太远（依然在这行或附近），就维持锁定
                if (lockedItem && Math.abs(lockedItem.offset - targetOffset) < 150) {
                    primaryItem = lockedItem;
                } else {
                    this._lockedActiveId = null; // 光标去别的地方了，释放锁定
                }
            }

            // ✨ 修改：获取当前的自动展开状态（配置为 false 时就是关闭模式）
            const isClosedMode = this.plugin.settings.autoExpands[view.file?.path || ""] === false;

            // 双保险：若失去锁定，恢复自动关闭
            if (isClosedMode && !this.isNavigating && this._forceExpandedCardId !== null && this._lockedActiveId === null) {
                // 👇 优化：不再使用 querySelectorAll 遍历，直接找确切的那个 DOM
                const oldExpanded = this.listRoot.querySelector(`.annotation-card[data-anno-id="${this._forceExpandedCardId}"]`);
                if (oldExpanded) oldExpanded.classList.remove('force-expand');
                this._forceExpandedCardId = null;
            }

            allItems.forEach(item => {
                let isActive = false;
                if (isClosedMode) {
                    isActive = (item === primaryItem);
                } else {
                    // ✨ 3. “多个同时展开”模式下的优化：不再盲目连带展开相邻项（引发疯狂排版跳动），只精准高亮唯一的一项
                    isActive = (item === primaryItem);
                }

                if (isActive) item.el.addClass("is-active");
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
        containerEl.createEl("h2", { text: "标注大纲 设置" });

        const DEFAULT_FILE = "大纲变体标注数据库.md"; // 统一声明默认常量，防止打错字

        new Setting(containerEl).setName("标注数据存储文件")
            .setDesc("指定一个 .md 文件来安全存储你的标注和变体数据。留空则默认使用「大纲变体标注数据库.md」。支持直接输入新文件名，或搜索选择已有文件。")
            .addText(text => {
                text.setPlaceholder(DEFAULT_FILE) // 浅色提示文字改为默认的中文名
                    // ✨ 核心修复：如果是默认文件名，输入框不显示文字；如果是用户自定义的文件名，才显示文字
                    .setValue(this.plugin.settings.annotationFilePath === DEFAULT_FILE ? "" : this.plugin.settings.annotationFilePath)
                    .onChange(async (value) => {
                        // ✨ 核心修复：如果用户清空输入框 (value 为空)，底层安全回退到中文默认文件名，而不是 Annotations.md
                        this.plugin.settings.annotationFilePath = value.trim() || DEFAULT_FILE;
                        await this.plugin.saveSettings();
                        await this.plugin.annoManager.load();
                    });

                new FileSuggest(this.app, text, async (selectedPath) => {
                    this.plugin.settings.annotationFilePath = selectedPath;
                    // 使用下拉建议选中后，如果碰巧选的是默认文件，也保持输入框清爽
                    text.setValue(selectedPath === DEFAULT_FILE ? "" : selectedPath);
                    await this.plugin.saveSettings();
                    await this.plugin.annoManager.load();
                });
            });

        // 把这段加在“标注数据存储文件”下方
        new Setting(containerEl)
            .setName("锁定删除保护")
            .setDesc("开启后，被标注的原文将变为不可删除的受保护状态。如需删除，必须先在侧边栏右键菜单中解除标注。（强烈建议开启，防止误删导致数据断联）")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.lockDeletion)
                .onChange(async (val) => {
                    this.plugin.settings.lockDeletion = val;
                    await this.plugin.saveSettings();
                })
            );

        containerEl.createEl("h3", { text: "全局默认颜色设置", cls: "setting-section-header" });
        this.createColorSetting(containerEl, "默认原文本高亮颜色", "当创建新变体时，正文中被圈定的原词高亮颜色。", 'defaultHighlightColor');
        this.createColorSetting(containerEl, "默认替换后变体颜色", "在正文中替换成变体文字后的文字和边框颜色。", 'defaultPhantomColor');
        this.createColorSetting(containerEl, "侧边栏分类标题颜色", "在侧边栏中基于H1-H6分类显示的标题文本颜色。", 'headingColor');


        // 👇 新增：选区背景颜色
        this.createColorSetting(containerEl, "选区背景高亮颜色", "修改选区高亮时的背景颜色（对应 .is-flashing 的背景色）。", 'flashingColor');

        // ✨ 新增：图标向下微调输入框
        new Setting(containerEl)
            .setName("图标向下微调")
            .setDesc("微调标题前面图标的垂直位置，填入数字即可（负数代表向上微调）。不同字体下可能需要微调对齐。")
            .addText(text => text
                .setPlaceholder("0")
                .setValue((this.plugin.settings.iconOffsetY || 0).toString())
                .onChange(async (value) => {
                    const num = parseFloat(value);
                    if (!isNaN(num)) {
                        this.plugin.settings.iconOffsetY = num;
                    } else if (value.trim() === "") {
                        this.plugin.settings.iconOffsetY = 0; // 清空时恢复默认 0
                    }
                    await this.plugin.saveSettings();
                    this.forceRefreshSidebar(); // ✨ 保存后立刻刷新侧边栏，方便你实时看效果！
                })
            );

        // 🚨 删掉这里原本的两个 new Setting(containerEl) 标题字号和分支字号 🚨

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

            // ✨ 修复 1：颜色预设输入框 防变黑逻辑
            hexInput.oninput = async (e) => {
                const val = (e.target as HTMLInputElement).value;
                const validHex = normalizeTo7CharHex(val);
                // 只有当输入成为合法颜色时，才同步给圆圈选择器和保存
                if (validHex) {
                    preset.hex = validHex;
                    colorPicker.value = validHex;
                    await this.plugin.saveSettings();
                }
            };
            // 失去焦点时，如果不合法，恢复为上次正确的颜色
            hexInput.onblur = (e) => {
                const val = (e.target as HTMLInputElement).value;
                const validHex = normalizeTo7CharHex(val);
                if (validHex) {
                    hexInput.value = validHex;
                } else {
                    hexInput.value = preset.hex;
                }
            };

            const delBtn = item.createDiv({ cls: "color-preset-del" });
            setIcon(delBtn, "trash");
            delBtn.onclick = async () => {
                this.plugin.settings.colorPresets.splice(index, 1);
                await this.plugin.saveSettings(); this.display();
            };
        });
        // ==========================================
        // ✨ 新增：数据库底层映射与回收站管理面板 (纯净版UI)
        // ==========================================
        containerEl.createEl("h3", { text: "数据库文件映射管理", cls: "setting-section-header" });
        containerEl.createEl("p", {
            text: "当你发现在外部（如 Win10 文件夹）移动或删除了文件导致标注失效时，可以在这里进行安全找回或彻底清理。",
            cls: "setting-item-description"
        });

        const dbContainer = containerEl.createDiv({ cls: "db-manager-container" });

        const TRASH_PREFIX = "__TRASH__";
        const allKeys = Object.keys(this.plugin.annoManager.data);
        const activeKeys = allKeys.filter(k => !k.startsWith(TRASH_PREFIX));
        const trashKeys = allKeys.filter(k => k.startsWith(TRASH_PREFIX));

        // --- 1. 当前生效的标注文件区 ---
        dbContainer.createEl("h4", { text: "当前有效记录", cls: "db-section-title" });
        const activeTable = dbContainer.createDiv({ cls: "db-table" });

        const headerRow = activeTable.createDiv({ cls: "db-row db-header" });
        headerRow.createDiv({ text: "状态", cls: "db-col db-col-status" });
        headerRow.createDiv({ text: "记录中的路径 (Key)", cls: "db-col db-col-path" });
        headerRow.createDiv({ text: "标注数", cls: "db-col db-col-count" });
        headerRow.createDiv({ text: "操作", cls: "db-col db-col-action" });

        if (activeKeys.length === 0) {
            activeTable.createDiv({ text: "当前没有任何标注记录。", cls: "db-empty-msg" });
        }

        activeKeys.forEach(key => {
            const arr = this.plugin.annoManager.data[key];
            // ✨ 修复 3：静默清理由于之前双击导致的损坏空数据
            if (!arr) {
                delete this.plugin.annoManager.data[key];
                return;
            }

            const isExist = this.app.vault.getAbstractFileByPath(key) != null;
            const count = arr.length;

            if (count === 0) {
                delete this.plugin.annoManager.data[key];
                return;
            }

            const row = activeTable.createDiv({ cls: `db-row ${!isExist ? 'db-row-missing' : ''}` });

            row.createDiv({ text: isExist ? "正常" : "丢失", cls: "db-col db-col-status" });
            row.createDiv({ text: key, cls: "db-col db-col-path" });
            row.createDiv({ text: `${count} 条`, cls: "db-col db-col-count" });

            const actionCol = row.createDiv({ cls: "db-col db-col-action" });
            if (!isExist) {
                const relinkBtn = actionCol.createEl("button", { text: "重新指定", cls: "db-btn-relink" });
                relinkBtn.onclick = () => {
                    new RelinkModal(this.app, key, this.plugin, () => {
                        this.forceRefreshSidebar();
                        this.display();
                    }).open();
                };
            }

            const trashBtn = actionCol.createEl("button", { text: "移至回收区", cls: "db-btn-trash" });
            trashBtn.onclick = async () => {
                // ✨ 修复 4：防双击机制，点过一次后如果数据已空直接返回
                if (!this.plugin.annoManager.data[key]) return;

                this.plugin.annoManager.data[`${TRASH_PREFIX}${key}`] = this.plugin.annoManager.data[key];
                delete this.plugin.annoManager.data[key];
                await this.plugin.annoManager.save();
                updateEditorDecorations(this.plugin);
                this.forceRefreshSidebar();
                this.display();
            };
        });

        // --- 2. 回收站区 ---
        const trashHeader = dbContainer.createDiv({ cls: "db-section-title-wrapper" });
        trashHeader.createEl("h4", { text: "回收站", cls: "db-section-title", attr: { style: "margin:0;" } });

        if (trashKeys.length > 0) {
            const emptyTrashBtn = trashHeader.createEl("button", { text: "清空回收站", cls: "db-btn-trash" });
            emptyTrashBtn.onclick = () => {
                new ConfirmModal(this.app, "清空回收站", "警告：彻底清空后，回收站内的所有数据将从 Markdown 数据库中完全抹除，无法恢复！确认清空吗？", async () => {
                    trashKeys.forEach(k => delete this.plugin.annoManager.data[k]);
                    await this.plugin.annoManager.save();
                    this.display();
                    new Notice("回收站已清空。");
                }).open();
            };
        }

        const trashTable = dbContainer.createDiv({ cls: "db-table" });
        if (trashKeys.length === 0) {
            trashTable.createDiv({ text: "回收站是空的。", cls: "db-empty-msg" });
        }

        trashKeys.forEach(key => {
            const arr = this.plugin.annoManager.data[key];
            // ✨ 修复 3：同样静默清理由于之前双击导致的损坏空数据
            if (!arr) {
                delete this.plugin.annoManager.data[key];
                return;
            }

            const originalPath = key.replace(TRASH_PREFIX, "");
            const count = arr.length;
            const row = trashTable.createDiv({ cls: "db-row db-row-trashed" });

            row.createDiv({ text: "已废弃", cls: "db-col db-col-status" });
            row.createDiv({ text: originalPath, cls: "db-col db-col-path", attr: { style: "text-decoration: line-through;" } });
            row.createDiv({ text: `${count} 条`, cls: "db-col db-col-count" });

            const actionCol = row.createDiv({ cls: "db-col db-col-action" });

            const restoreBtn = actionCol.createEl("button", { text: "反悔恢复", cls: "db-btn-restore" });
            restoreBtn.onclick = async () => {
                if (!this.plugin.annoManager.data[key]) return; // 防双击

                this.plugin.annoManager.data[originalPath] = this.plugin.annoManager.data[key];
                delete this.plugin.annoManager.data[key];
                await this.plugin.annoManager.save();
                updateEditorDecorations(this.plugin);
                this.forceRefreshSidebar();
                this.display();
                new Notice("已恢复该记录。");
            };

            const delBtn = actionCol.createEl("button", { text: "彻底删除", cls: "db-btn-trash" });
            delBtn.onclick = () => {
                new ConfirmModal(this.app, "彻底删除单条记录", `确定要彻底删除文件【${originalPath}】的全部标注记录吗？此操作不可恢复！`, async () => {
                    delete this.plugin.annoManager.data[key];
                    await this.plugin.annoManager.save();
                    this.display();
                    new Notice("已彻底删除该记录。");
                }).open();
            };
        });


        // ==========================================
        // ✨ 新增：保命机制 - 本地自动滚动备份设置
        // ==========================================
        containerEl.createEl("h3", { text: "🛡️ 数据安全与自动备份", cls: "setting-section-header" });
        containerEl.createEl("p", {
            text: "专为小说大纲等高价值数据设计的保命机制。插件会在后台静默记录您的历史版本，以防误删或同步盘引发的文件损坏。",
            cls: "setting-item-description"
        });

        new Setting(containerEl)
            .setName("自动备份冷却时间 (分钟)")
            .setDesc("当您有修改发生时，至少间隔多少分钟才生成一份新备份。(建议: 1-60分钟)")
            .addSlider(slider => slider
                .setLimits(1, 60, 1)
                .setValue(this.plugin.settings.backupIntervalMinutes)
                .setDynamicTooltip()
                .onChange(async (val) => {
                    this.plugin.settings.backupIntervalMinutes = val;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("最多保留历史份数")
            .setDesc("超过此份数时，将自动删除最老的一份备份。(范围: 20 ~ 100份)")
            .addSlider(slider => slider
                .setLimits(20, 100, 1)
                .setValue(this.plugin.settings.maxBackups)
                .setDynamicTooltip()
                .onChange(async (val) => {
                    this.plugin.settings.maxBackups = val;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("急救：查看备份文件")
            .setDesc("🚨 如果您的标注数据意外丢失，点击右侧按钮立刻打开备份存放的系统文件夹进行抢救。")
            .addButton(btn => btn
                .setButtonText("📂 打开备份文件夹")
                .setCta()
                .onClick(async () => {
                    const backupDirPath = normalizePath(this.plugin.app.vault.configDir + "/plugins/footnote-compass/backups");
                    const adapter = this.plugin.app.vault.adapter as any;

                    // 确保文件夹存在，免得报错
                    if (!(await adapter.exists(backupDirPath))) {
                        await adapter.mkdir(backupDirPath);
                    }

                    // 🚨 核心修复：先安全判断是不是在电脑端（手机端没有 getBasePath 函数）
                    if (typeof adapter.getBasePath === 'function') {
                        const fullSystemPath = adapter.getBasePath() + "/" + backupDirPath;
                        // 利用 Electron 接口直接在 Windows/Mac 唤起文件管理器
                        if (typeof window !== "undefined" && (window as any).require) {
                            (window as any).require('electron').shell.openPath(fullSystemPath);
                            return;
                        }
                    }

                    // 如果是手机/平板，或者不支持直接打开，则安全弹出路径提示
                    new Notice("📱 移动端不支持直接打开系统文件夹，备份已安全存放在此路径: \n" + backupDirPath, 8000);
                })
            );

        // 打断 Obsidian 的自动聚焦施法
        setTimeout(() => {
            const firstInput = containerEl.querySelector('input[type="text"]') as HTMLElement;
            if (firstInput && document.activeElement === firstInput) {
                firstInput.blur();
            }
        }, 50);
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
                    this.plugin.applyDynamicStyles();
                    updateEditorDecorations(this.plugin);
                    this.forceRefreshSidebar();
                });
            })
            .addText(text => {
                textComp = text;
                text.setValue(this.plugin.settings[settingKey] as string).onChange(async (val) => {
                    // ✨ 修复 2：全局颜色输入框 防变黑逻辑
                    const validHex = normalizeTo7CharHex(val);
                    if (validHex) {
                        (this.plugin.settings as any)[settingKey] = validHex;
                        if (colorComp) colorComp.setValue(validHex);
                        await this.plugin.saveSettings();
                        this.plugin.applyDynamicStyles();
                        updateEditorDecorations(this.plugin);
                        this.forceRefreshSidebar();
                    }
                });
                text.inputEl.classList.add("color-hex-input"); text.inputEl.style.marginLeft = "8px";
            });
    }
}

export default class FootnoteCompassPlugin extends Plugin {
    settings: FootnoteCompassSettings;
    annoManager: AnnotationManager;

    isPluginModifying: boolean = false; // ✨ 新增：特权修改通道标志

    async onload() {
        const defaultPresets: ColorPreset[] = [
            { name: "红色", hex: "#e57373" }, { name: "黄色", hex: "#ffb74d" }, { name: "绿色", hex: "#81c784" },
            { name: "蓝色", hex: "#64b5f6" }, { name: "紫色", hex: "#ba68c8" }, { name: "灰色", hex: "#90a4ae" }
        ];

        let loadedData = await this.loadData();
        this.settings = Object.assign({
            lockDeletion: true, // ✨ 新增：默认开启删除保护
            beautifyEnabled: false, isSortByKey: false, isAnnotationsCollapsed: true, annotationFilePath: "大纲变体标注数据库.md",
            defaultHighlightColor: "#ff4444", defaultPhantomColor: "#009dff", colorPresets: defaultPresets,
            headingFilters: {},
            displayModes: {},
            autoExpands: {}, // ✨ 新增：默认值// ✨ 新增：默认值
            headingColor: "#2196f3", // 新增：默认标题颜色（蓝色）
            flashingColor: "#EEE7DD",
            iconOffsetY: 0,    // ✨ 新增：默认微调为 0
            recentIcons: [], // ✨ 新增：默认初始化为空

            maxBackups: 40,           // 默认保存 40 份
            backupIntervalMinutes: 1, // 默认 1 分钟冷却时间
            lastBackupTime: 0         // 初始时间为 0
        }, loadedData);

        this.annoManager = new AnnotationManager(this);
        this.addSettingTab(new FootnoteCompassSettingTab(this.app, this));
        this.registerEditorExtension([annotationField, createDeletionLockExtension(this), createCopyInterceptorExtension()]);
        this.registerView(VIEW_TYPE_FOOTNOTE, (leaf) => new FootnoteListView(leaf, this));
        this.addRibbonIcon('message-circle-more', '打开标注面板', () => { this.activateView(); });

        // 1. 保留给【打字】用的防抖（0.5秒延迟，防止打字卡顿）
        const debouncedOutlineUpdate = debounce(() => {
            this.app.workspace.getLeavesOfType(VIEW_TYPE_FOOTNOTE).forEach(leaf => (leaf.view as FootnoteListView)?.checkAndUpdate());
        }, 500, true);

        // 2. 新增给【切换文件】用的快速刷新（50毫秒，几乎感觉不到延迟，但能保证 Obsidian 已经加载好新文件）
        const fastOutlineUpdate = debounce(() => {
            this.app.workspace.getLeavesOfType(VIEW_TYPE_FOOTNOTE).forEach(leaf => (leaf.view as FootnoteListView)?.checkAndUpdate());
        }, 50, true);

        // 3. 切换标签页时，使用极速刷新
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
            fastOutlineUpdate();
            updateEditorDecorations(this);
        }));

        // 4. 打开新文件时，使用极速刷新
        this.registerEvent(this.app.workspace.on('file-open', () => {
            fastOutlineUpdate();
            updateEditorDecorations(this);
        }));

        // 5. 只有正文打字修改时，才使用 0.5秒的慢速刷新
        this.registerEvent(this.app.workspace.on('editor-change', debouncedOutlineUpdate));

        // --- 替换原有的 rename 监听逻辑 ---
        this.registerEvent(this.app.vault.on('rename', async (file, oldPath) => {
            let hasChanges = false;

            // 1. 如果移动/重命名的是【单个文件】
            if (file instanceof TFile && file.extension === 'md') {


                if (this.settings.autoExpands[oldPath] !== undefined) {
                    this.settings.autoExpands[file.path] = this.settings.autoExpands[oldPath];
                    delete this.settings.autoExpands[oldPath];
                    hasChanges = true;
                }

                // 转移标注数据
                if (this.annoManager.data[oldPath]) {
                    this.annoManager.data[file.path] = this.annoManager.data[oldPath];
                    delete this.annoManager.data[oldPath];
                    hasChanges = true;
                }
                // 转移该文件的“标题过滤偏好”
                if (this.settings.headingFilters[oldPath]) {
                    this.settings.headingFilters[file.path] = this.settings.headingFilters[oldPath];
                    delete this.settings.headingFilters[oldPath];
                    hasChanges = true;
                }
                // 转移该文件的“显示模式偏好”
                if (this.settings.displayModes[oldPath]) {
                    this.settings.displayModes[file.path] = this.settings.displayModes[oldPath];
                    delete this.settings.displayModes[oldPath];
                    hasChanges = true;
                }
            }
            // 2. 🚨修复核心：如果移动/重命名的是【文件夹】
            else if (file instanceof TFolder) {
                const oldPrefix = oldPath + "/";
                const newPrefix = file.path + "/";


                Object.keys(this.settings.autoExpands).forEach(key => {
                    if (key.startsWith(oldPrefix)) {
                        const newKey = key.replace(oldPrefix, newPrefix);
                        this.settings.autoExpands[newKey] = this.settings.autoExpands[key];
                        delete this.settings.autoExpands[key];
                        hasChanges = true;
                    }
                });

                // 批量转移该文件夹下所有【标注数据】
                Object.keys(this.annoManager.data).forEach(key => {
                    if (key.startsWith(oldPrefix)) {
                        const newKey = key.replace(oldPrefix, newPrefix);
                        this.annoManager.data[newKey] = this.annoManager.data[key];
                        delete this.annoManager.data[key];
                        hasChanges = true;
                    }
                });

                // 批量转移该文件夹下所有文件的【偏好设置】
                Object.keys(this.settings.headingFilters).forEach(key => {
                    if (key.startsWith(oldPrefix)) {
                        const newKey = key.replace(oldPrefix, newPrefix);
                        this.settings.headingFilters[newKey] = this.settings.headingFilters[key];
                        delete this.settings.headingFilters[key];
                        hasChanges = true;
                    }
                });

                Object.keys(this.settings.displayModes).forEach(key => {
                    if (key.startsWith(oldPrefix)) {
                        const newKey = key.replace(oldPrefix, newPrefix);
                        this.settings.displayModes[newKey] = this.settings.displayModes[key];
                        delete this.settings.displayModes[key];
                        hasChanges = true;
                    }
                });
            }

            // 如果有任何变更，统一保存数据并强制刷新UI
            if (hasChanges) {
                await this.annoManager.save();
                await this.saveSettings();
                debouncedOutlineUpdate();
            }
        }));

        this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor, view) => {
            if (editor.somethingSelected()) {
                menu.addItem((item) => {
                    item.setTitle("添加分支标注").setIcon("pin").onClick(async () => {
                        const selectedText = editor.getSelection();
                        if (!selectedText || selectedText.trim().length === 0) {
                            new Notice("无法对空字符添加标注！");
                            return;
                        }

                        // 🚨 核心修复：如果是白板或者无文件视图，强行拦截，防止崩溃！
                        if (!view || !view.file) {
                            new Notice("⚠️ 无法在此处添加标注：当前文档不存在对应的物理文件。");
                            return;
                        }

                        // 👇 修复：检查是否跨行选择
                        const cursorFrom = editor.getCursor('from');
                        const cursorTo = editor.getCursor('to');
                        if (cursorFrom.line !== cursorTo.line) {
                            new Notice("⚠️ 暂不支持跨行添加标注，请在同一段落内选择！");
                            return;
                        }

                        const lineText = editor.getLine(cursorFrom.line);
                        // 安全截取前后文
                        const prefix = lineText.substring(Math.max(0, cursorFrom.ch - 30), cursorFrom.ch);
                        const suffix = lineText.substring(cursorTo.ch, Math.min(lineText.length, cursorTo.ch + 30));

                        // 🚨 去掉了原先危险的感叹号
                        const path = view.file.path;

                        const expectedOffset = editor.posToOffset(cursorFrom);

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
        this.applyDynamicStyles(); // ✨ 启动时应用动态 CSS 变量
        this.app.workspace.onLayoutReady(async () => {
            await this.annoManager.load();
            debouncedOutlineUpdate();
            updateEditorDecorations(this);
        });
    }

    async saveSettings() { await this.saveData(this.settings); }

    applyBeautifyStyle() { document.body.classList.toggle('footnote-beautify-enabled', this.settings.beautifyEnabled); }

    // 👇 修改：加入安全默认值，防止旧数据生成 "undefinedpx"
    applyDynamicStyles() {
        const flashColor = this.settings.flashingColor || "#EEE7DD";

        document.body.style.setProperty('--fc-flashing-color', flashColor);

    }

    async onunload() {
        document.body.classList.remove('footnote-beautify-enabled');
        document.body.style.removeProperty('--fc-flashing-color');
        // 删掉字号的 removeProperty
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