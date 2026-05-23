var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => FootnoteCompassPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");
var VIEW_TYPE_FOOTNOTE = "footnote-compass-view";
function generateUUID() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2);
}
function hexToRgba(hex, alpha) {
  if (!/^#([0-9A-Fa-f]{3}){1,2}$/.test(hex)) return hex;
  let c = hex.substring(1).split("");
  if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
  c = "0x" + c.join("");
  return `rgba(${[c >> 16 & 255, c >> 8 & 255, c & 255].join(",")}, ${alpha})`;
}
function findAnnotationOffsetAndHeal(text, anno) {
  const prefix = anno.prefix || "";
  const suffix = anno.suffix || "";
  const original = anno.original || "";
  const expected = anno.expectedOffset || 0;
  if (!original || original.length === 0) return null;
  const exactTarget = prefix + original + suffix;
  let bestExact = -1;
  let minExactDiff = Infinity;
  if (exactTarget && exactTarget.length > 0) {
    let searchIdx = text.indexOf(exactTarget);
    while (searchIdx !== -1) {
      let diff = Math.abs(searchIdx - expected);
      if (diff < minExactDiff) {
        minExactDiff = diff;
        bestExact = searchIdx;
      }
      searchIdx = text.indexOf(exactTarget, searchIdx + 1);
    }
  }
  if (bestExact !== -1) {
    anno.expectedOffset = bestExact + prefix.length;
    return { start: anno.expectedOffset, end: anno.expectedOffset + original.length };
  }
  let bestFallback = -1;
  let minFallbackDiff = Infinity;
  let fbIdx = text.indexOf(original);
  while (fbIdx !== -1) {
    let diff = Math.abs(fbIdx - expected);
    if (diff < minFallbackDiff) {
      minFallbackDiff = diff;
      bestFallback = fbIdx;
    }
    fbIdx = text.indexOf(original, fbIdx + 1);
  }
  if (bestFallback !== -1) {
    anno.prefix = text.substring(Math.max(0, bestFallback - 10), bestFallback);
    anno.suffix = text.substring(bestFallback + original.length, bestFallback + original.length + 10);
    anno.expectedOffset = bestFallback;
    return { start: bestFallback, end: bestFallback + original.length };
  }
  return null;
}
var FileSuggest = class extends import_obsidian.AbstractInputSuggest {
  constructor(app, textInput, onSelect) {
    super(app, textInput.inputEl);
    this.textInput = textInput;
    this.onSelectCallback = onSelect;
  }
  getSuggestions(inputStr) {
    return this.app.vault.getMarkdownFiles().filter((f) => f.path.toLowerCase().includes(inputStr.toLowerCase()));
  }
  renderSuggestion(file, el) {
    el.setText(file.path);
  }
  selectSuggestion(file) {
    this.textInput.setValue(file.path);
    if (this.onSelectCallback) this.onSelectCallback(file.path);
    this.close();
  }
};
var PhantomWidget = class extends import_view.WidgetType {
  // ✨ 新增：接收 annoId，用于记住自己是哪一个标注的变体
  constructor(text, color, annoId) {
    super();
    this.text = text;
    this.color = color;
    this.annoId = annoId;
    this.color = color || "#009dff";
  }
  eq(other) {
    return other.text === this.text && other.color === this.color && other.annoId === this.annoId;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "annotation-phantom";
    span.textContent = this.text;
    span.style.color = this.color;
    span.style.borderBottomColor = this.color;
    span.style.backgroundColor = hexToRgba(this.color, 0.15);
    span.onclick = () => {
      const event = new CustomEvent("footnote-compass-expand-card", { detail: { annoId: this.annoId } });
      window.dispatchEvent(event);
    };
    return span;
  }
};
var AnnotationStateEffect = import_state.StateEffect.define();
var annotationField = import_state.StateField.define({
  create() {
    return import_view.Decoration.none;
  },
  update(decos, tr) {
    decos = decos.map(tr.changes);
    for (let e of tr.effects) {
      if (e.is(AnnotationStateEffect)) return e.value;
    }
    return decos;
  },
  provide: (f) => import_view.EditorView.decorations.from(f)
});
function createAnnotationDecorations(view, annotations, plugin) {
  const builder = new import_state.RangeSetBuilder();
  const text = view.state.doc.toString();
  const decos = [];
  let needsSave = false;
  annotations.forEach((anno) => {
    const match = findAnnotationOffsetAndHeal(text, anno);
    if (!match) return;
    if (match.start !== text.indexOf((anno.prefix || "") + (anno.original || "") + (anno.suffix || "")) + (anno.prefix || "").length) {
      needsSave = true;
    }
    const hColor = anno.highlightColor || plugin.settings.defaultHighlightColor;
    const pColor = anno.phantomColor || plugin.settings.defaultPhantomColor;
    const checkedComment = (anno.comments || []).find((c) => c.checked);
    if (checkedComment) {
      decos.push({
        from: match.start,
        to: match.end,
        // ✨ 修改：在参数最后把 anno.id 传进去
        deco: import_view.Decoration.replace({ widget: new PhantomWidget(checkedComment.text, pColor, anno.id), inclusive: false })
      });
    } else {
      decos.push({
        from: match.start,
        to: match.end,
        deco: import_view.Decoration.mark({ class: "annotation-highlight", attributes: { style: `background-color: ${hexToRgba(hColor, 0.25)}; border-bottom-color: ${hColor};` } })
      });
    }
  });
  decos.sort((a, b) => a.from - b.from).forEach((d) => builder.add(d.from, d.to, d.deco));
  if (needsSave) plugin.annoManager.save();
  return builder.finish();
}
function updateEditorDecorations(plugin) {
  plugin.app.workspace.iterateAllLeaves((leaf) => {
    if (leaf.view?.getViewType() === "markdown") {
      const mdView = leaf.view;
      const cm = mdView.editor.cm;
      if (cm && mdView.file) {
        const annos = plugin.annoManager.data[mdView.file.path] || [];
        const decos = createAnnotationDecorations(cm, annos, plugin);
        cm.dispatch({ effects: AnnotationStateEffect.of(decos) });
      }
    }
  });
}
var AnnotationManager = class {
  constructor(plugin) {
    this.plugin = plugin;
    this.data = {};
    this.isLoaded = false;
    this.debouncedWrite = (0, import_obsidian.debounce)(this._performWrite.bind(this), 200, true);
  }
  async load() {
    const path = (0, import_obsidian.normalizePath)(this.plugin.settings.annotationFilePath);
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (file instanceof import_obsidian.TFile) {
      const content = await this.plugin.app.vault.read(file);
      const match = content.match(/```json\r?\n([\s\S]*?)\r?\n```/);
      if (match) {
        try {
          this.data = JSON.parse(match[1]);
        } catch (e) {
          console.error("\u89E3\u6790\u53D8\u4F53\u6570\u636E\u5931\u8D25", e);
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
    const path = (0, import_obsidian.normalizePath)(this.plugin.settings.annotationFilePath);
    let file = this.plugin.app.vault.getAbstractFileByPath(path);
    const jsonStr = JSON.stringify(this.data, null, 2);
    const newBlock = `\`\`\`json
${jsonStr}
\`\`\``;
    const defaultContent = `# \u{1F4DA} \u5C0F\u8BF4\u6807\u6CE8\u4E0E\u53D8\u4F53\u6570\u636E\u5E93
> \u26A0\uFE0F \u8BF7\u4E0D\u8981\u624B\u52A8\u4FEE\u6539\u4E0B\u9762\u7684\u4EE3\u7801\u5757\uFF0C\u8FD9\u662F\u63D2\u4EF6\u81EA\u52A8\u7EF4\u62A4\u7684\uFF01\u8FD9\u4FDD\u8BC1\u4E86\u4F60\u7684\u6570\u636E\u53EF\u4EE5\u968F\u7B14\u8BB0\u4E00\u8D77\u5B89\u5168\u5907\u4EFD\u3002

${newBlock}
`;
    try {
      if (file instanceof import_obsidian.TFile) {
        await this.plugin.app.vault.process(file, (data) => {
          const match = data.match(/```json\r?\n([\s\S]*?)\r?\n```/);
          if (match) return data.replace(/```json\r?\n([\s\S]*?)\r?\n```/, newBlock);
          return defaultContent;
        });
      } else {
        await this.plugin.app.vault.create(path, defaultContent);
      }
    } catch (e) {
      console.error("\u4FDD\u5B58\u6807\u6CE8\u6570\u636E\u5931\u8D25:", e);
    }
  }
  async forceSave() {
    if (!this.isLoaded) return;
    await this._performWrite();
  }
};
var ColorPickerModal = class extends import_obsidian.Modal {
  // ✨ 修改：onSelect 现在允许接收 null 代表恢复默认
  constructor(app, titleText, palette, onSelect) {
    super(app);
    this.titleText = titleText;
    this.palette = palette;
    this.onSelect = onSelect;
  }
  onOpen() {
    this.setTitle(this.titleText);
    const container = this.contentEl.createDiv({ cls: "color-picker-container" });
    this.palette.forEach((color) => {
      const btn = container.createDiv({ cls: "color-picker-btn" });
      btn.style.backgroundColor = color.hex;
      btn.title = color.name;
      btn.onclick = () => {
        this.onSelect(color.hex);
        this.close();
      };
    });
    const resetWrapper = this.contentEl.createDiv({ cls: "color-picker-reset-wrapper" });
    const resetBtn = resetWrapper.createEl("button", { text: "\u21BA \u56DE\u5230\u9ED8\u8BA4\u989C\u8272" });
    resetBtn.onclick = () => {
      this.onSelect(null);
      this.close();
    };
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ConfirmModal = class extends import_obsidian.Modal {
  constructor(app, titleText, message, onConfirm) {
    super(app);
    this.titleText = titleText;
    this.message = message;
    this.onConfirm = onConfirm;
  }
  onOpen() {
    this.setTitle(this.titleText);
    this.contentEl.createEl("p", { text: this.message, cls: "annotation-confirm-msg" });
    new import_obsidian.Setting(this.contentEl).addButton((btn) => btn.setButtonText("\u53D6\u6D88").onClick(() => this.close())).addButton((btn) => btn.setButtonText("\u786E\u8BA4\u79FB\u9664").setWarning().onClick(() => {
      this.onConfirm();
      this.close();
    }));
  }
  onClose() {
    this.contentEl.empty();
  }
};
var CommentModal = class extends import_obsidian.Modal {
  constructor(app, titleText, initialVal, onSubmit, onDelete = null) {
    super(app);
    this.titleText = titleText;
    this.onSubmit = onSubmit;
    this.onDelete = onDelete;
    this.result = initialVal || "";
  }
  onOpen() {
    this.setTitle(this.titleText);
    new import_obsidian.Setting(this.contentEl).setName("\u5185\u5BB9\u6587\u5B57").setDesc("\u8F93\u5165\u53D8\u4F53\u5185\u5BB9\uFF0C\u6309\u56DE\u8F66\u952E\u76F4\u63A5\u4FDD\u5B58\u3002").addText((text) => {
      text.setValue(this.result).onChange((val) => this.result = val);
      text.inputEl.style.width = "100%";
      text.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.isComposing) {
          e.preventDefault();
          if (this.result.trim()) this.onSubmit(this.result.trim());
          this.close();
        }
      });
    });
    const btnSetting = new import_obsidian.Setting(this.contentEl);
    btnSetting.infoEl.style.display = "none";
    btnSetting.controlEl.style.width = "100%";
    btnSetting.controlEl.style.justifyContent = "flex-end";
    btnSetting.settingEl.style.borderTop = "none";
    if (this.onDelete) {
      btnSetting.addButton((btn) => {
        btn.setButtonText("\u5220\u9664\u53D8\u4F53").setWarning().onClick(() => {
          this.onDelete();
          this.close();
        });
        btn.buttonEl.style.marginRight = "auto";
      });
    }
    btnSetting.addButton((btn) => btn.setButtonText("\u53D6\u6D88").onClick(() => this.close())).addButton((btn) => btn.setButtonText("\u786E\u8BA4\u4FDD\u5B58").setCta().onClick(() => {
      if (this.result.trim()) this.onSubmit(this.result.trim());
      this.close();
    }));
  }
  onClose() {
    this.contentEl.empty();
  }
};
var FootnoteListView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.cachedRefs = [];
    this.lastActiveView = null;
    this.listRoot = null;
    this.isNavigating = false;
    this._lastStateHash = "";
    this._lastScrolledItem = null;
    this._forceExpandedCardId = null;
    this.plugin = plugin;
    this.debouncedSync = (0, import_obsidian.debounce)(() => {
      const activeLeaf = this.app.workspace.activeLeaf;
      if (activeLeaf?.view instanceof import_obsidian.MarkdownView) this.syncHighlightWithCursor(activeLeaf.view);
    }, 100, true);
    this.debouncedScrollSync = (0, import_obsidian.debounce)((view) => {
      const cm = view.editor.cm;
      if (!cm) return;
      try {
        const block = cm.lineBlockAtHeight(cm.scrollDOM.scrollTop + 100);
        if (block) this.syncHighlightToOffset(view, block.from);
      } catch (e) {
      }
    }, 50, true);
  }
  getViewType() {
    return VIEW_TYPE_FOOTNOTE;
  }
  getDisplayText() {
    return "\u811A\u6CE8 & \u53D8\u4F53\u5927\u7EB2";
  }
  getIcon() {
    return "message-circle-more";
  }
  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("footnote-compass-view-container");
    this.listRoot = container.createDiv({ cls: "footnote-list-root" });
    this.registerDomEvent(this.listRoot, "contextmenu", (e) => {
      const target = e.target;
      if (target.closest(".footnote-item") || target.closest(".annotation-card")) return;
      this.showContextMenu(e);
    });
    const triggerNavLock = () => {
      this.isNavigating = true;
      setTimeout(() => {
        this.isNavigating = false;
      }, 350);
    };
    const workspaceEl = this.app.workspace.containerEl;
    this.registerDomEvent(workspaceEl, "click", triggerNavLock, { capture: true });
    this.registerDomEvent(workspaceEl, "keyup", triggerNavLock, { capture: true });
    this.registerDomEvent(workspaceEl, "scroll", (e) => {
      if (this.isNavigating) return;
      const target = e.target;
      if (target?.classList?.contains("cm-scroller")) {
        if (this._forceExpandedCardId !== null) {
          this._forceExpandedCardId = null;
          this.listRoot?.querySelectorAll(".annotation-card.force-expand").forEach((el) => el.classList.remove("force-expand"));
        }
        if (this.lastActiveView) {
          const cm = this.lastActiveView.editor?.cm;
          if (cm && cm.scrollDOM === target) {
            this.debouncedScrollSync(this.lastActiveView);
            return;
          }
        }
        const leaves = this.app.workspace.getLeavesOfType("markdown");
        for (let leaf of leaves) {
          const view = leaf.view;
          const cm = view.editor?.cm;
          if (cm && cm.scrollDOM === target) {
            this.lastActiveView = view;
            this.debouncedScrollSync(view);
            break;
          }
        }
      }
    }, { capture: true });
    this.registerDomEvent(window, "footnote-compass-expand-card", (e) => {
      const customEvent = e;
      const targetId = customEvent.detail?.annoId;
      if (!targetId || !this.listRoot) return;
      const targetCard = this.listRoot.querySelector(`.annotation-card[data-anno-id="${targetId}"]`);
      if (targetCard) {
        this._forceExpandedCardId = targetId;
        this.listRoot.querySelectorAll(".annotation-card.force-expand").forEach((el) => el.classList.remove("force-expand"));
        targetCard.classList.add("force-expand");
        this.listRoot.querySelectorAll(".annotation-card.is-active").forEach((el) => el.classList.remove("is-active"));
        targetCard.classList.add("is-active");
        targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
    setTimeout(() => this.checkAndUpdate(), 300);
  }
  findBestLeaf() {
    const active = this.app.workspace.activeLeaf;
    if (active && (active.view.getViewType() === "markdown" || active.view.getViewType() === "kanban")) return active;
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    return leaves.length > 0 ? leaves[0] : null;
  }
  generateStateHash(view, refs, annos) {
    const path = view.file?.path || "unknown";
    const refHash = refs.map((r) => `${r.key}:${r.content}`).join("|");
    const annoHash = (annos || []).map((a) => `${a.id}-${a.original}-${(a.comments || []).map((c) => c.checked).join(",")}`).join("|");
    return `${path}::${refHash}::${annoHash}::${!!this.plugin.settings.isAnnotationsCollapsed}::${!!this.plugin.settings.isSortByKey}`;
  }
  async checkAndUpdate() {
    const bestLeaf = this.findBestLeaf();
    if (bestLeaf && bestLeaf.view instanceof import_obsidian.MarkdownView) {
      this.lastActiveView = bestLeaf.view;
      await this.updateView(bestLeaf.view);
    } else {
      this.renderRefList();
    }
  }
  async updateView(view) {
    if (!this.listRoot) return;
    let text = "";
    if (view.editor) {
      text = view.editor.getValue();
    } else if (view.file) {
      text = await this.app.vault.read(view.file);
    }
    if (typeof text !== "string") return;
    const lines = text.split("\n");
    const definitionMap = /* @__PURE__ */ new Map();
    lines.forEach((line) => {
      const match = line.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
      if (match) definitionMap.set(match[1], match[2]);
    });
    this.cachedRefs = [];
    const footRefRegex = /\[\^([^\]]+)\](?!:)/g;
    let inMultiLineCode = false;
    lines.forEach((line, lineIndex) => {
      if (line.trim().startsWith("```") || line.trim().startsWith("~~~")) {
        inMultiLineCode = !inMultiLineCode;
        return;
      }
      if (inMultiLineCode) return;
      let cleanLine = line.replace(/`[^`\n]+`/g, (match) => " ".repeat(match.length));
      if (!cleanLine.includes("[")) return;
      if (cleanLine.startsWith("[^") && cleanLine.includes("]:")) return;
      let fMatch;
      while ((fMatch = footRefRegex.exec(cleanLine)) !== null) {
        this.cachedRefs.push({
          type: "footnote",
          key: fMatch[1],
          content: definitionMap.get(fMatch[1]) || "(\u672A\u5B9A\u4E49)",
          line: lineIndex,
          col: fMatch.index,
          len: fMatch[0].length,
          el: null
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
      const fragment = document.createDocumentFragment();
      const listContainer = fragment.createDiv({ cls: "footnote-compass-container" });
      if (this.cachedRefs.length > 0) {
        let displayRefs = [...this.cachedRefs];
        if (this.plugin.settings.isSortByKey) {
          displayRefs.sort((a, b) => a.key.localeCompare(b.key, void 0, { numeric: true, sensitivity: "base" }));
        }
        displayRefs.forEach((ref) => {
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
        headerContainer.createDiv({ cls: "annotation-divider", text: "\u{1F4CC} \u6587\u672C\u53D8\u4F53\u6807\u6CE8" });
        const rightControls = headerContainer.createDiv({
          attr: { style: "display: flex; align-items: center; gap: 4px;" }
        });
        const filterLvlStr = this.plugin.settings.headingFilters[filePath] || "0";
        const headingMap = { "0": "\u65E0", "1": "H1", "2": "H2", "3": "H3", "4": "H4", "5": "H5", "6": "H6" };
        const headingBtn = rightControls.createEl("button", {
          text: `${headingMap[filterLvlStr]} \u25BE`,
          cls: "compass-ui-btn"
        });
        headingBtn.onclick = (e) => {
          const menu = new import_obsidian.Menu();
          Object.entries(headingMap).forEach(([val, text]) => {
            menu.addItem((item) => {
              item.setTitle(text).setChecked(val === filterLvlStr).onClick(async () => {
                this.plugin.settings.headingFilters[filePath] = val;
                await this.plugin.saveSettings();
                this._lastStateHash = "";
                if (this.lastActiveView) {
                  this.checkAndUpdate();
                } else {
                  this.renderRefList();
                }
              });
            });
          });
          menu.showAtMouseEvent(e);
        };
        const displayModeStr = this.plugin.settings.displayModes[filePath] || "original";
        if (this.listRoot) this.listRoot.dataset.displayMode = displayModeStr;
        const modeMap = { "original": "\u6807\u9898", "variant": "\u53D8\u4F53", "both": "\u540C\u65F6", "closed": "\u5173\u95ED" };
        const displayModeBtn = rightControls.createEl("button", {
          text: `${modeMap[displayModeStr]} \u25BE`,
          cls: "compass-ui-btn"
        });
        displayModeBtn.onclick = (e) => {
          const menu = new import_obsidian.Menu();
          Object.entries(modeMap).forEach(([val, text]) => {
            menu.addItem((item) => {
              item.setTitle(text).setChecked(val === displayModeStr).onClick(async () => {
                this.plugin.settings.displayModes[filePath] = val;
                await this.plugin.saveSettings();
                this._lastStateHash = "";
                if (this.lastActiveView) {
                  this.checkAndUpdate();
                } else {
                  this.renderRefList();
                }
              });
            });
          });
          menu.showAtMouseEvent(e);
        };
        const toggleBtn = rightControls.createEl("button", {
          text: isCollapsed ? "\u5C55\u5F00" : "\u6298\u53E0",
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
        const parsedHeadings = [];
        if (filterLvlStr !== "0") {
          const headingRegex = /^(#{1,6})\s+(.*)$/gm;
          let match;
          while ((match = headingRegex.exec(fullText)) !== null) {
            parsedHeadings.push({ offset: match.index, level: match[1].length, text: match[2].trim() });
          }
        }
        annos.forEach((anno) => {
          const match = findAnnotationOffsetAndHeal(fullText, anno);
          anno._tempOffset = match ? match.start : Number.MAX_SAFE_INTEGER;
        });
        annos.sort((a, b) => (a._tempOffset || 0) - (b._tempOffset || 0));
        let currentHeadingText = "";
        let currentGroupWrapper = null;
        const targetLvl = parseInt(filterLvlStr);
        annos.forEach((anno) => {
          let isNewHeadingBlock = false;
          if (targetLvl > 0) {
            let nearestHeading = null;
            for (let i = parsedHeadings.length - 1; i >= 0; i--) {
              if (parsedHeadings[i].offset <= anno._tempOffset && parsedHeadings[i].level <= targetLvl) {
                nearestHeading = parsedHeadings[i];
                break;
              }
            }
            const hText = nearestHeading ? nearestHeading.text : "\u65E0\u6807\u9898 / \u9876\u90E8";
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
          card.dataset.annoId = anno.id;
          anno.el = card;
          if (displayModeStr === "closed" && this._forceExpandedCardId === anno.id) {
            card.classList.add("force-expand");
          }
          const hColor = anno.highlightColor || this.plugin.settings.defaultHighlightColor;
          const pColor = anno.phantomColor || this.plugin.settings.defaultPhantomColor;
          card.onclick = () => {
            if (displayModeStr === "closed") {
              const wasExpanded = card.classList.contains("force-expand");
              this.listRoot?.querySelectorAll(".annotation-card.force-expand").forEach((el) => el.classList.remove("force-expand"));
              if (!wasExpanded) {
                card.classList.add("force-expand");
                this._forceExpandedCardId = anno.id;
              } else {
                this._forceExpandedCardId = null;
              }
            }
            if (this.lastActiveView?.editor?.offsetToPos && anno._tempOffset < Number.MAX_SAFE_INTEGER) {
              this.isNavigating = true;
              setTimeout(() => {
                this.isNavigating = false;
              }, 800);
              const pos = this.lastActiveView.editor.offsetToPos(anno._tempOffset);
              this.app.workspace.setActiveLeaf(this.lastActiveView.leaf, { focus: true });
              this.lastActiveView.setEphemeralState({ line: pos.line, cursor: { from: pos, to: pos } });
              this.syncHighlightWithCursor(this.lastActiveView);
            }
          };
          card.oncontextmenu = (e) => {
            e.stopPropagation();
            card.classList.add("is-context-active");
            const menu = new import_obsidian.Menu();
            menu.onHide(() => {
              card.classList.remove("is-context-active");
            });
            menu.addItem((item) => {
              item.setTitle("\u6DFB\u52A0\u65B0\u53D8\u4F53").setIcon("list-plus").onClick(() => {
                new CommentModal(this.app, "\u6DFB\u52A0\u65B0\u53D8\u4F53", "", async (text) => {
                  if (!anno.comments) anno.comments = [];
                  anno.comments.push({ id: generateUUID(), text, checked: false });
                  await this.plugin.annoManager.save();
                  this._lastStateHash = "";
                  this.checkAndUpdate();
                }).open();
              });
            });
            menu.addSeparator();
            menu.addItem((item) => {
              item.setTitle("\u4FEE\u6539\u5F53\u524D\u6807\u6CE8\u989C\u8272").setIcon("highlighter").onClick(() => {
                new ColorPickerModal(this.app, "\u9009\u62E9\u6807\u6CE8\u9AD8\u4EAE\u989C\u8272", palette, async (c) => {
                  if (c) {
                    anno.highlightColor = c;
                  } else {
                    delete anno.highlightColor;
                  }
                  await this.plugin.annoManager.save();
                  updateEditorDecorations(this.plugin);
                  this._lastStateHash = "";
                  this.checkAndUpdate();
                }).open();
              });
            });
            menu.addItem((item) => {
              item.setTitle("\u4FEE\u6539\u5F53\u524D\u53D8\u4F53\u989C\u8272").setIcon("paintbrush").onClick(() => {
                new ColorPickerModal(this.app, "\u9009\u62E9\u66FF\u6362\u540E\u989C\u8272", palette, async (c) => {
                  if (c) {
                    anno.phantomColor = c;
                  } else {
                    delete anno.phantomColor;
                  }
                  await this.plugin.annoManager.save();
                  updateEditorDecorations(this.plugin);
                  this._lastStateHash = "";
                  this.checkAndUpdate();
                }).open();
              });
            });
            menu.addSeparator();
            menu.addItem((item) => {
              item.setTitle("\u91CD\u65B0\u9009\u62E9\u6587\u672C").setIcon("text-cursor").onClick(async () => {
                const view = this.lastActiveView;
                if (!view || !view.editor) return;
                const editor = view.editor;
                const selectedText = editor.getSelection();
                if (!selectedText || selectedText.trim().length === 0) {
                  new import_obsidian.Notice("\u26A0\uFE0F \u66FF\u6362\u63D0\u793A\uFF1A\n\u8BF7\u5148\u5728\u6B63\u6587\u4E2D\u3010\u9009\u4E2D\u4E00\u6BB5\u65B0\u6587\u672C\u3011\uFF0C\u7136\u540E\u518D\u6765\u70B9\u51FB\u6B64\u9009\u9879\uFF01", 4e3);
                  return;
                }
                const cursor = editor.getCursor("from");
                const lineText = editor.getLine(cursor.line);
                anno.original = selectedText;
                anno.prefix = lineText.substring(Math.max(0, cursor.ch - 10), cursor.ch);
                anno.suffix = lineText.substring(cursor.ch + selectedText.length, cursor.ch + selectedText.length + 10);
                anno.expectedOffset = editor.posToOffset(cursor);
                await this.plugin.annoManager.save();
                updateEditorDecorations(this.plugin);
                this._lastStateHash = "";
                this.checkAndUpdate();
                new import_obsidian.Notice(`\u2705 \u7ED1\u5B9A\u7684\u539F\u6587\u672C\u5DF2\u6210\u529F\u4FEE\u6539\u4E3A\uFF1A
"${selectedText}"`);
              });
            });
            menu.addItem((item) => {
              item.setTitle("\u79FB\u9664\u6574\u4E2A\u6807\u6CE8").setIcon("trash").setWarning(true).onClick(() => {
                new ConfirmModal(this.app, "\u79FB\u9664\u6807\u6CE8", `\u786E\u5B9A\u8981\u5F7B\u5E95\u79FB\u9664\u3010${anno.original}\u3011\u7684\u6807\u6CE8\u8BB0\u5F55\u5417\uFF1F`, async () => {
                  this.plugin.annoManager.data[filePath] = this.plugin.annoManager.data[filePath].filter((a) => a.id !== anno.id);
                  await this.plugin.annoManager.save();
                  updateEditorDecorations(this.plugin);
                  this._lastStateHash = "";
                  this.checkAndUpdate();
                }).open();
              });
            });
            menu.showAtMouseEvent(e);
          };
          const header = card.createDiv({ cls: "annotation-header" });
          header.dataset.displayMode = displayModeStr;
          const checkedComment = (anno.comments || []).find((c) => c.checked);
          const variantText = checkedComment ? checkedComment.text : "\u65E0";
          header.createSpan({ text: anno.original, cls: "anno-title-text anno-text-original" });
          header.createSpan({ text: variantText, cls: "anno-title-text anno-text-variant" });
          header.createSpan({ text: `${anno.original}\uFF1A${variantText}`, cls: "anno-title-text anno-text-both" });
          const list = card.createDiv({ cls: "annotation-comments-list" });
          (anno.comments || []).forEach((comment) => {
            const row = list.createDiv({ cls: "annotation-comment-row" });
            row.dataset.commentId = comment.id;
            row.onclick = async (e) => {
              e.stopPropagation();
              if (this.lastActiveView?.editor?.offsetToPos && anno._tempOffset < Number.MAX_SAFE_INTEGER) {
                this.isNavigating = true;
                setTimeout(() => {
                  this.isNavigating = false;
                }, 800);
                const pos = this.lastActiveView.editor.offsetToPos(anno._tempOffset);
                this.app.workspace.setActiveLeaf(this.lastActiveView.leaf, { focus: true });
                this.lastActiveView.setEphemeralState({ line: pos.line, cursor: { from: pos, to: pos } });
              }
              const isChecked = comment.checked;
              anno.comments.forEach((c) => c.checked = false);
              comment.checked = !isChecked;
              this.plugin.annoManager.save();
              updateEditorDecorations(this.plugin);
              this._lastStateHash = "";
              this.checkAndUpdate();
              this.syncHighlightWithCursor(this.lastActiveView);
            };
            const cb = row.createEl("input", { type: "checkbox", cls: "annotation-checkbox" });
            cb.checked = comment.checked;
            cb.style.setProperty("--dynamic-color", pColor);
            cb.style.pointerEvents = "none";
            const textSpan = row.createSpan({ text: comment.text, cls: "annotation-comment-text" });
            if (comment.checked) {
              textSpan.style.color = pColor;
              textSpan.style.fontWeight = "bold";
            }
            row.oncontextmenu = (e) => {
              e.stopPropagation();
              new import_obsidian.Menu().addItem((item) => {
                item.setTitle("\u7F16\u8F91\u53D8\u4F53").setIcon("pencil").onClick(() => {
                  new CommentModal(
                    this.app,
                    "\u7F16\u8F91\u53D8\u4F53",
                    comment.text,
                    async (newText) => {
                      comment.text = newText;
                      await this.plugin.annoManager.save();
                      updateEditorDecorations(this.plugin);
                      this._lastStateHash = "";
                      this.checkAndUpdate();
                    },
                    async () => {
                      anno.comments = anno.comments.filter((c) => c.id !== comment.id);
                      await this.plugin.annoManager.save();
                      updateEditorDecorations(this.plugin);
                      this._lastStateHash = "";
                      this.checkAndUpdate();
                    }
                  ).open();
                });
              }).showAtMouseEvent(e);
            };
          });
        });
      }
      if (this.cachedRefs.length === 0 && (!this.plugin.annoManager.data[filePath || ""] || this.plugin.annoManager.data[filePath || ""].length === 0)) {
        fragment.createDiv({ cls: "footnote-empty", text: "\u5F53\u524D\u6587\u6863\u65E0\u811A\u6CE8\u6216\u6807\u6CE8" });
      }
      this.listRoot.appendChild(fragment);
    } catch (err) {
      console.error("FootnoteCompass \u4FA7\u8FB9\u680F\u6E32\u67D3\u4E25\u91CD\u9519\u8BEF:", err);
      this.listRoot.createDiv({ cls: "footnote-empty", text: "\u26A0\uFE0F \u4FA7\u8FB9\u680F\u52A0\u8F7D\u9047\u5230\u5F02\u5E38\uFF0C\u8BF7\u68C0\u67E5\u63A7\u5236\u53F0\u6216\u91CD\u542F\u63D2\u4EF6\u3002" });
    }
  }
  syncHighlightWithCursor(view) {
    if (!view?.editor) return;
    this.syncHighlightToOffset(view, view.editor.posToOffset(view.editor.getCursor()));
  }
  syncHighlightToOffset(view, targetOffset) {
    if (!view?.editor || !this.listRoot) return;
    try {
      let allItems = [];
      this.cachedRefs.forEach((ref) => {
        if (ref.el) allItems.push({ el: ref.el, offset: view.editor.posToOffset({ line: ref.line, ch: ref.col }) });
      });
      const annos = this.plugin.annoManager.data[view.file?.path || ""] || [];
      annos.forEach((anno) => {
        if (anno.el && anno._tempOffset !== void 0 && anno._tempOffset < Number.MAX_SAFE_INTEGER) {
          allItems.push({ el: anno.el, offset: anno._tempOffset });
        }
      });
      if (allItems.length === 0) return;
      allItems.sort((a, b) => a.offset - b.offset);
      let primaryItem = allItems.slice().reverse().find((item) => targetOffset >= item.offset - 15) || allItems[0];
      const displayModeStr = this.plugin.settings.displayModes[view.file?.path || ""] || "original";
      const isClosedMode = displayModeStr === "closed";
      allItems.forEach((item) => {
        const distance = Math.abs(item.offset - targetOffset);
        let isActive = false;
        if (isClosedMode) {
          isActive = item === primaryItem;
        } else {
          isActive = item === primaryItem || distance <= 30;
        }
        if (isActive) item.el.addClass("is-active");
        else item.el.removeClass("is-active");
      });
      if (primaryItem && this._lastScrolledItem !== primaryItem) {
        primaryItem.el.scrollIntoView({ behavior: "smooth", block: "center" });
        this._lastScrolledItem = primaryItem;
      }
    } catch (e) {
    }
  }
  showContextMenu(e, ref = null) {
    const menu = new import_obsidian.Menu();
    if (ref) {
      menu.addItem((item) => item.setTitle(ref.type === "footnote" ? "\u7F16\u8F91\u811A\u6CE8 (\u672A\u5B9E\u73B0)" : "\u7F16\u8F91\u6CE8\u8BB0").setIcon("pencil"));
      menu.addSeparator();
    }
    menu.addItem((item) => {
      item.setTitle("\u6570\u5B57\u6392\u5E8F (\u9488\u5BF9\u811A\u6CE8)").setIcon("sort-asc").setChecked(this.plugin.settings.isSortByKey).onClick(async () => {
        this.plugin.settings.isSortByKey = !this.plugin.settings.isSortByKey;
        await this.plugin.saveSettings();
        this._lastStateHash = "";
        this.checkAndUpdate();
      });
    });
    menu.addItem((item) => {
      item.setTitle("\u811A\u6CE8\u7F8E\u5316").setIcon("wand-2").setChecked(this.plugin.settings.beautifyEnabled).onClick(async () => {
        this.plugin.settings.beautifyEnabled = !this.plugin.settings.beautifyEnabled;
        await this.plugin.saveSettings();
        this.plugin.applyBeautifyStyle();
      });
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle("\u5BFC\u51FA\u5F53\u524D\u53D8\u4F53\u5168\u6587").setIcon("file-output").onClick(async () => await this.exportVariantFile());
    });
    menu.showAtMouseEvent(e);
  }
  async exportVariantFile() {
    const file = this.lastActiveView?.file;
    if (!file) {
      new import_obsidian.Notice("\u672A\u627E\u5230\u5F53\u524D\u6D3B\u52A8\u7684\u6587\u6863\uFF01");
      return;
    }
    let text = await this.app.vault.read(file);
    let activeAnnos = (this.plugin.annoManager.data[file.path] || []).filter((a) => (a.comments || []).some((c) => c.checked));
    if (activeAnnos.length === 0) {
      new import_obsidian.Notice("\u5F53\u524D\u6CA1\u6709\u52FE\u9009\u4EFB\u4F55\u53D8\u4F53\uFF0C\u65E0\u9700\u5BFC\u51FA\uFF01");
      return;
    }
    activeAnnos.forEach((anno) => {
      const match = findAnnotationOffsetAndHeal(text, anno);
      anno._exportOffset = match ? match.start : -1;
    });
    activeAnnos.filter((a) => a._exportOffset !== -1).sort((a, b) => b._exportOffset - a._exportOffset).forEach((anno) => {
      const checkedText = anno.comments.find((c) => c.checked).text;
      text = text.substring(0, anno._exportOffset) + checkedText + text.substring(anno._exportOffset + anno.original.length);
    });
    let newPath = "", counter = 1;
    while (true) {
      newPath = (0, import_obsidian.normalizePath)(`${file.parent?.path === "/" ? "" : file.parent?.path + "/"}${file.basename} ${counter.toString().padStart(2, "0")}.${file.extension}`);
      if (!this.app.vault.getAbstractFileByPath(newPath)) break;
      counter++;
    }
    const newFile = await this.app.vault.create(newPath, text);
    new import_obsidian.Notice(`\u{1F389} \u5BFC\u51FA\u6210\u529F\uFF01\u5DF2\u751F\u6210\u65B0\u6587\u4EF6\uFF1A${newFile.name}`);
    this.app.workspace.getLeaf("tab")?.openFile(newFile);
  }
  async handleJump(ref) {
    const view = this.lastActiveView || this.findBestLeaf()?.view;
    if (!view?.editor) return;
    this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
    view.setEphemeralState({ line: ref.line, cursor: { from: { line: ref.line, ch: ref.col }, to: { line: ref.line, ch: ref.col + ref.len } } });
    this.syncHighlightWithCursor(view);
  }
};
var FootnoteCompassSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  // ✨ 需求 1：辅助函数，用于改变设置后强制侧边栏视图立刻刷新
  forceRefreshSidebar() {
    this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_FOOTNOTE).forEach((leaf) => {
      const view = leaf.view;
      if (view) {
        view._lastStateHash = "";
        view.checkAndUpdate();
      }
    });
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "\u811A\u6CE8\u4E0E\u6807\u6CE8\u5927\u7EB2 \u8BBE\u7F6E" });
    new import_obsidian.Setting(containerEl).setName("\u6807\u6CE8\u6570\u636E\u5B58\u50A8\u6587\u4EF6").setDesc("\u6307\u5B9A\u4E00\u4E2A .md \u6587\u4EF6\u6765\u5B89\u5168\u5B58\u50A8\u4F60\u7684\u6807\u6CE8\u548C\u53D8\u4F53\u6570\u636E\u3002\u652F\u6301\u76F4\u63A5\u8F93\u5165\u65B0\u6587\u4EF6\u540D\uFF0C\u6216\u641C\u7D22\u9009\u62E9\u5DF2\u6709\u6587\u4EF6\u3002").addText((text) => {
      text.setPlaceholder("Annotations.md").setValue(this.plugin.settings.annotationFilePath).onChange(async (value) => {
        this.plugin.settings.annotationFilePath = value || "Annotations.md";
        await this.plugin.saveSettings();
        await this.plugin.annoManager.load();
      });
      new FileSuggest(this.app, text, async (selectedPath) => {
        this.plugin.settings.annotationFilePath = selectedPath;
        await this.plugin.saveSettings();
        await this.plugin.annoManager.load();
      });
    });
    containerEl.createEl("h3", { text: "\u5168\u5C40\u9ED8\u8BA4\u989C\u8272\u8BBE\u7F6E", cls: "setting-section-header" });
    this.createColorSetting(containerEl, "\u9ED8\u8BA4\u539F\u6587\u672C\u9AD8\u4EAE\u989C\u8272", "\u5F53\u521B\u5EFA\u65B0\u53D8\u4F53\u65F6\uFF0C\u6B63\u6587\u4E2D\u88AB\u5708\u5B9A\u7684\u539F\u8BCD\u9AD8\u4EAE\u989C\u8272\u3002", "defaultHighlightColor");
    this.createColorSetting(containerEl, "\u9ED8\u8BA4\u66FF\u6362\u540E\u53D8\u4F53\u989C\u8272", "\u5728\u6B63\u6587\u4E2D\u66FF\u6362\u6210\u53D8\u4F53\u6587\u5B57\u540E\u7684\u6587\u5B57\u548C\u8FB9\u6846\u989C\u8272\u3002", "defaultPhantomColor");
    this.createColorSetting(containerEl, "\u4FA7\u8FB9\u680F\u5206\u7C7B\u6807\u9898\u989C\u8272", "\u5728\u4FA7\u8FB9\u680F\u4E2D\u57FA\u4E8EH1-H6\u5206\u7C7B\u663E\u793A\u7684\u6807\u9898\u6587\u672C\u989C\u8272\u3002", "headingColor");
    const colorSection = containerEl.createDiv({ cls: "color-preset-section" });
    const headerDiv = colorSection.createDiv({ cls: "color-preset-header" });
    headerDiv.createEl("h3", { text: "\u989C\u8272\u9884\u8BBE\u7BA1\u7406" });
    headerDiv.createEl("button", { text: "+ \u6DFB\u52A0\u65B0\u989C\u8272", cls: "mod-cta" }).onclick = async () => {
      this.plugin.settings.colorPresets.push({ name: "\u65B0\u989C\u8272", hex: "#ffffff" });
      await this.plugin.saveSettings();
      this.display();
    };
    const grid = colorSection.createDiv({ cls: "color-preset-grid" });
    this.plugin.settings.colorPresets.forEach((preset, index) => {
      const item = grid.createDiv({ cls: "color-preset-item" });
      item.createEl("input", { type: "text", value: preset.name }).onchange = async (e) => {
        preset.name = e.target.value;
        await this.plugin.saveSettings();
      };
      const colorPicker = item.createEl("input", { type: "color", value: preset.hex, cls: "color-circle-input" });
      const hexInput = item.createEl("input", { type: "text", value: preset.hex, cls: "color-hex-input" });
      colorPicker.oninput = async (e) => {
        preset.hex = e.target.value;
        hexInput.value = preset.hex;
        await this.plugin.saveSettings();
      };
      hexInput.onchange = async (e) => {
        let val = e.target.value;
        val = val.startsWith("#") ? val : "#" + val;
        preset.hex = val;
        colorPicker.value = val;
        await this.plugin.saveSettings();
      };
      const delBtn = item.createDiv({ cls: "color-preset-del" });
      (0, import_obsidian.setIcon)(delBtn, "trash");
      delBtn.onclick = async () => {
        this.plugin.settings.colorPresets.splice(index, 1);
        await this.plugin.saveSettings();
        this.display();
      };
    });
  }
  createColorSetting(containerEl, name, desc, settingKey) {
    let colorComp, textComp;
    new import_obsidian.Setting(containerEl).setName(name).setDesc(desc).addColorPicker((color) => {
      colorComp = color;
      color.setValue(this.plugin.settings[settingKey]).onChange(async (val) => {
        this.plugin.settings[settingKey] = val;
        if (textComp) textComp.setValue(val);
        await this.plugin.saveSettings();
        updateEditorDecorations(this.plugin);
        this.forceRefreshSidebar();
      });
    }).addText((text) => {
      textComp = text;
      text.setValue(this.plugin.settings[settingKey]).onChange(async (val) => {
        val = val.trim().startsWith("#") ? val.trim() : "#" + val.trim();
        this.plugin.settings[settingKey] = val;
        if (/^#([0-9A-Fa-f]{3}){1,2}$/.test(val)) {
          if (colorComp) colorComp.setValue(val);
          updateEditorDecorations(this.plugin);
        }
        await this.plugin.saveSettings();
        this.forceRefreshSidebar();
      });
      text.inputEl.classList.add("color-hex-input");
      text.inputEl.style.marginLeft = "8px";
    });
  }
};
var FootnoteCompassPlugin = class extends import_obsidian.Plugin {
  async onload() {
    const defaultPresets = [
      { name: "\u7EA2\u8272", hex: "#e57373" },
      { name: "\u9EC4\u8272", hex: "#ffb74d" },
      { name: "\u7EFF\u8272", hex: "#81c784" },
      { name: "\u84DD\u8272", hex: "#64b5f6" },
      { name: "\u7D2B\u8272", hex: "#ba68c8" },
      { name: "\u7070\u8272", hex: "#90a4ae" }
    ];
    let loadedData = await this.loadData();
    this.settings = Object.assign({
      beautifyEnabled: false,
      isSortByKey: false,
      isAnnotationsCollapsed: true,
      annotationFilePath: "\u5927\u7EB2\u53D8\u4F53\u6807\u6CE8\u6570\u636E\u5E93.md",
      defaultHighlightColor: "#ff4444",
      defaultPhantomColor: "#009dff",
      colorPresets: defaultPresets,
      headingFilters: {},
      displayModes: {},
      // ✨ 新增：默认值
      headingColor: "#2196f3"
      // 新增：默认标题颜色（蓝色）
    }, loadedData);
    this.annoManager = new AnnotationManager(this);
    this.addSettingTab(new FootnoteCompassSettingTab(this.app, this));
    this.registerEditorExtension([annotationField]);
    this.registerView(VIEW_TYPE_FOOTNOTE, (leaf) => new FootnoteListView(leaf, this));
    this.addRibbonIcon("message-circle-more", "\u6253\u5F00\u811A\u6CE8\u4E0E\u6807\u6CE8\u9762\u677F", () => {
      this.activateView();
    });
    const debouncedOutlineUpdate = (0, import_obsidian.debounce)(() => {
      this.app.workspace.getLeavesOfType(VIEW_TYPE_FOOTNOTE).forEach((leaf) => leaf.view?.checkAndUpdate());
    }, 500, true);
    const fastOutlineUpdate = (0, import_obsidian.debounce)(() => {
      this.app.workspace.getLeavesOfType(VIEW_TYPE_FOOTNOTE).forEach((leaf) => leaf.view?.checkAndUpdate());
    }, 50, true);
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      fastOutlineUpdate();
      updateEditorDecorations(this);
    }));
    this.registerEvent(this.app.workspace.on("file-open", () => {
      fastOutlineUpdate();
      updateEditorDecorations(this);
    }));
    this.registerEvent(this.app.workspace.on("editor-change", debouncedOutlineUpdate));
    this.registerEvent(this.app.vault.on("rename", async (file, oldPath) => {
      if (file instanceof import_obsidian.TFile && file.extension === "md" && this.annoManager.data[oldPath]) {
        this.annoManager.data[file.path] = this.annoManager.data[oldPath];
        delete this.annoManager.data[oldPath];
        await this.annoManager.save();
        debouncedOutlineUpdate();
      }
    }));
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor, view) => {
      if (editor.somethingSelected()) {
        menu.addItem((item) => {
          item.setTitle("\u6DFB\u52A0\u6B63\u6587\u53D8\u4F53\u6807\u6CE8").setIcon("pin").onClick(async () => {
            const selectedText = editor.getSelection();
            if (!selectedText || selectedText.trim().length === 0) {
              new import_obsidian.Notice("\u65E0\u6CD5\u5BF9\u7A7A\u5B57\u7B26\u6DFB\u52A0\u6807\u6CE8\uFF01");
              return;
            }
            const cursor = editor.getCursor("from");
            const lineText = editor.getLine(cursor.line);
            const prefix = lineText.substring(Math.max(0, cursor.ch - 10), cursor.ch);
            const suffix = lineText.substring(cursor.ch + selectedText.length, cursor.ch + selectedText.length + 10);
            const path = view.file.path;
            const expectedOffset = editor.posToOffset(cursor);
            if (!this.annoManager.data[path]) this.annoManager.data[path] = [];
            this.annoManager.data[path].push({ id: generateUUID(), original: selectedText, prefix, suffix, expectedOffset, comments: [] });
            await this.annoManager.save();
            const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_FOOTNOTE)[0];
            if (leaf && leaf.view instanceof FootnoteListView) leaf.view._lastStateHash = "";
            updateEditorDecorations(this);
            this.activateView();
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
  async saveSettings() {
    await this.saveData(this.settings);
  }
  applyBeautifyStyle() {
    document.body.classList.toggle("footnote-beautify-enabled", this.settings.beautifyEnabled);
  }
  async onunload() {
    document.body.classList.remove("footnote-beautify-enabled");
    if (this.annoManager) {
      await this.annoManager.forceSave();
    }
  }
  async activateView() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_FOOTNOTE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE_FOOTNOTE, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof FootnoteListView) leaf.view.checkAndUpdate();
  }
};
