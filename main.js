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
function normalizeTo7CharHex(hex) {
  hex = hex.trim();
  if (!hex.startsWith("#")) hex = "#" + hex;
  if (/^#([0-9A-Fa-f]{3})$/i.test(hex)) {
    return "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  if (/^#([0-9A-Fa-f]{6})$/i.test(hex)) {
    return hex;
  }
  return null;
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
  // ✨ 新增 isOriginal 参数，判断当前渲染的是不是原文本
  constructor(text, color, annoId, isOriginal = false) {
    super();
    this.text = text;
    this.color = color;
    this.annoId = annoId;
    this.isOriginal = isOriginal;
    this.color = color || (isOriginal ? "#ff4444" : "#009dff");
  }
  eq(other) {
    return other.text === this.text && other.color === this.color && other.annoId === this.annoId && other.isOriginal === this.isOriginal;
  }
  toDOM() {
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
    span.onmousedown = () => {
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
  provide: (f) => [
    import_view.EditorView.decorations.from(f),
    import_view.EditorView.atomicRanges.of((view) => view.state.field(f))
  ]
});
function createAnnotationDecorations(view, annotations, plugin) {
  const builder = new import_state.RangeSetBuilder();
  const text = view.state.doc.toString();
  const decos = [];
  let needsSave = false;
  annotations.forEach((anno) => {
    const oldExpected = anno.expectedOffset;
    const match = findAnnotationOffsetAndHeal(text, anno);
    if (!match) return;
    if (anno.expectedOffset !== oldExpected) {
      needsSave = true;
    }
    const hColor = anno.highlightColor || plugin.settings.defaultHighlightColor;
    const pColor = anno.phantomColor || plugin.settings.defaultPhantomColor;
    const checkedComment = (anno.comments || []).find((c) => c.checked);
    if (checkedComment) {
      decos.push({
        from: match.start,
        to: match.end,
        deco: import_view.Decoration.replace({ widget: new PhantomWidget(checkedComment.text, pColor, anno.id, false), inclusive: false })
      });
    } else {
      decos.push({
        from: match.start,
        to: match.end,
        deco: import_view.Decoration.replace({ widget: new PhantomWidget(anno.original, hColor, anno.id, true), inclusive: false })
      });
    }
  });
  decos.sort((a, b) => a.from - b.from).forEach((d) => builder.add(d.from, d.to, d.deco));
  if (needsSave) plugin.annoManager.save();
  return builder.finish();
}
function updateEditorDecorations(plugin) {
  try {
    const leaves = plugin.app.workspace.getLeavesOfType("markdown");
    for (let leaf of leaves) {
      const mdView = leaf.view;
      if (!mdView.editor || !mdView.file) continue;
      const cm = mdView.editor.cm;
      if (cm) {
        const annos = plugin.annoManager.data[mdView.file.path] || [];
        const decos = createAnnotationDecorations(cm, annos, plugin);
        cm.dispatch({ effects: AnnotationStateEffect.of(decos) });
      }
    }
  } catch (e) {
    console.warn("FootnoteCompass \u6D3B\u52A8\u89C6\u56FE\u88C5\u9970\u5668\u66F4\u65B0\u5F02\u5E38:", e);
  }
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
      const match = content.match(/<!-- FC_DATA_START -->\r?\n```json\r?\n([\s\S]*?)\r?\n```\r?\n<!-- FC_DATA_END -->/) || content.match(/```json\r?\n([\s\S]*?)\r?\n```/);
      if (match) {
        try {
          this.data = JSON.parse(match[1]);
        } catch (e) {
          console.error("\u89E3\u6790\u53D8\u4F53\u6570\u636E\u5931\u8D25", e);
          new import_obsidian.Notice("\u{1F6A8} \u81F4\u547D\u9519\u8BEF\uFF1A\u5927\u7EB2\u53D8\u4F53\u6807\u6CE8\u6570\u636E\u5E93\u7684 JSON \u683C\u5F0F\u635F\u574F\uFF01\n\u4E3A\u9632\u6B62\u6570\u636E\u88AB\u6E05\u7A7A\uFF0C\u5DF2\u5F3A\u5236\u6682\u505C\u4FDD\u5B58\u529F\u80FD\u3002\u8BF7\u68C0\u67E5\u6570\u636E\u5E93\u6587\u4EF6\uFF01", 15e3);
          this.isLoaded = false;
          return;
        }
      } else if (content.trim().length > 0) {
        new import_obsidian.Notice("\u{1F6A8} \u81F4\u547D\u9519\u8BEF\uFF1A\u5728\u6570\u636E\u5E93\u4E2D\u627E\u4E0D\u5230\u5408\u6CD5\u7684 JSON \u6570\u636E\u5757\uFF01\n\u53EF\u80FD\u662F\u60A8\u7684\u6807\u8BB0\u4EE3\u7801\u88AB\u8BEF\u5220\u3002\u4E3A\u9632\u6B62\u6570\u636E\u8986\u76D6\uFF0C\u5DF2\u6682\u505C\u4FDD\u5B58\u529F\u80FD\uFF0C\u8BF7\u68C0\u67E5\u6587\u4EF6\uFF01", 15e3);
        this.isLoaded = false;
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
    const path = (0, import_obsidian.normalizePath)(this.plugin.settings.annotationFilePath);
    let file = this.plugin.app.vault.getAbstractFileByPath(path);
    const jsonStr = JSON.stringify(this.data, (key, value) => {
      if (key === "el" || key === "_tempOffset" || key === "_exportOffset") return void 0;
      return value;
    }, 2);
    const newBlock = `<!-- FC_DATA_START -->
\`\`\`json
${jsonStr}
\`\`\`
<!-- FC_DATA_END -->`;
    const defaultContent = `# \u{1F4DA} \u5C0F\u8BF4\u6807\u6CE8\u4E0E\u53D8\u4F53\u6570\u636E\u5E93
> \u26A0\uFE0F \u8BF7\u4E0D\u8981\u624B\u52A8\u4FEE\u6539\u4E0B\u9762\u7684\u4EE3\u7801\u5757\uFF0C\u8FD9\u662F\u63D2\u4EF6\u81EA\u52A8\u7EF4\u62A4\u7684\uFF01\u8FD9\u4FDD\u8BC1\u4E86\u4F60\u7684\u6570\u636E\u53EF\u4EE5\u968F\u7B14\u8BB0\u4E00\u8D77\u5B89\u5168\u5907\u4EFD\u3002

${newBlock}
`;
    try {
      if (file instanceof import_obsidian.TFile) {
        await this.plugin.app.vault.process(file, (data) => {
          const regexNew = /<!-- FC_DATA_START -->\r?\n```json\r?\n([\s\S]*?)\r?\n```\r?\n<!-- FC_DATA_END -->/;
          const regexOld = /```json\r?\n([\s\S]*?)\r?\n```/;
          if (data.match(regexNew)) return data.replace(regexNew, () => newBlock);
          if (data.match(regexOld)) return data.replace(regexOld, () => newBlock);
          if (data.trim().length === 0) return defaultContent;
          else return data.replace(/\s+$/, "") + "\n\n" + newBlock + "\n";
        });
      } else {
        await this.plugin.app.vault.create(path, defaultContent);
      }
      await this._processBackup(defaultContent, newBlock, file instanceof import_obsidian.TFile ? file : null);
    } catch (e) {
      console.error("\u4FDD\u5B58\u6807\u6CE8\u6570\u636E\u5931\u8D25:", e);
    }
  }
  // ✨ 终极保命机制：静默滚动备份引擎
  async _processBackup(defaultContent, newBlock, originalFile) {
    const now = Date.now();
    const intervalMs = this.plugin.settings.backupIntervalHours * 60 * 60 * 1e3;
    if (now - this.plugin.settings.lastBackupTime < intervalMs) return;
    try {
      const fullContentToBackup = originalFile ? await this.plugin.app.vault.read(originalFile) : defaultContent;
      const adapter = this.plugin.app.vault.adapter;
      const backupDirPath = (0, import_obsidian.normalizePath)(this.plugin.app.vault.configDir + "/plugins/footnote-compass/backups");
      if (!await adapter.exists(backupDirPath)) {
        await adapter.mkdir(backupDirPath);
      }
      const dateObj = /* @__PURE__ */ new Date();
      const timeString = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}_${String(dateObj.getHours()).padStart(2, "0")}-${String(dateObj.getMinutes()).padStart(2, "0")}-${String(dateObj.getSeconds()).padStart(2, "0")}`;
      const backupFileName = `${backupDirPath}/\u5927\u7EB2\u5907\u4EFD_${timeString}.md`;
      await adapter.write(backupFileName, fullContentToBackup);
      this.plugin.settings.lastBackupTime = now;
      await this.plugin.saveSettings();
      const dirList = await adapter.list(backupDirPath);
      const backupFiles = dirList.files.filter((f) => f.endsWith(".md"));
      if (backupFiles.length > this.plugin.settings.maxBackups) {
        const filesWithTime = await Promise.all(backupFiles.map(async (f) => {
          const stat = await adapter.stat(f);
          return { path: f, ctime: stat?.ctime || 0 };
        }));
        filesWithTime.sort((a, b) => a.ctime - b.ctime);
        const deleteCount = filesWithTime.length - this.plugin.settings.maxBackups;
        for (let i = 0; i < deleteCount; i++) {
          await adapter.remove(filesWithTime[i].path);
        }
      }
      console.log("\u2705 FootnoteCompass \u81EA\u52A8\u5907\u4EFD\u6210\u529F\u6267\u884C\uFF01");
    } catch (e) {
      console.error("FootnoteCompass \u81EA\u52A8\u5907\u4EFD\u5931\u8D25:", e);
    }
  }
  async forceSave() {
    if (!this.isLoaded) return;
    await this._performWrite();
  }
};
var IconGridModal = class extends import_obsidian.Modal {
  constructor(plugin, onSelect) {
    super(plugin.app);
    this.searchQuery = "";
    this.plugin = plugin;
    this.onSelect = onSelect;
    this.allIcons = (0, import_obsidian.getIconIds)();
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    const searchContainer = contentEl.createDiv({ attr: { style: "margin-bottom: 15px;" } });
    const searchInput = searchContainer.createEl("input", {
      type: "text",
      placeholder: "\u641C\u7D22\u56FE\u6807\u540D\u79F0 (\u5982 star, heart)...",
      attr: { style: "width: 100%; padding: 8px 12px; border-radius: 6px;" }
    });
    const gridWrapper = contentEl.createDiv({ attr: { style: "height: 400px; overflow-y: auto; padding-right: 5px;" } });
    const renderGrid = () => {
      gridWrapper.empty();
      const query = this.searchQuery.toLowerCase();
      const filteredIcons = query ? this.allIcons.filter((icon) => icon.toLowerCase().includes(query)) : this.allIcons;
      const recents = this.plugin.settings.recentIcons || [];
      if (!query && recents.length > 0) {
        gridWrapper.createEl("div", { text: "\u6700\u8FD1\u4F7F\u7528\u7684\u56FE\u6807\uFF1A", attr: { style: "font-size: 12px; color: var(--text-muted); margin-bottom: 10px;" } });
        const recentGrid = gridWrapper.createDiv({ attr: { style: "display: grid; grid-template-columns: repeat(auto-fill, minmax(75px, 1fr)); gap: 8px; margin-bottom: 25px;" } });
        recents.forEach((icon) => this.createIconBtn(recentGrid, icon));
      }
      gridWrapper.createEl("div", { text: "\u6240\u6709\u56FE\u6807\uFF1A", attr: { style: "font-size: 12px; color: var(--text-muted); margin-bottom: 10px;" } });
      const mainGrid = gridWrapper.createDiv({ attr: { style: "display: grid; grid-template-columns: repeat(auto-fill, minmax(75px, 1fr)); gap: 8px;" } });
      filteredIcons.slice(0, 200).forEach((icon) => this.createIconBtn(mainGrid, icon));
    };
    searchInput.addEventListener("input", (e) => {
      this.searchQuery = e.target.value;
      renderGrid();
    });
    setTimeout(() => searchInput.focus(), 50);
    renderGrid();
  }
  // 渲染单个网格按钮的工具函数
  createIconBtn(parent, iconName) {
    const btn = parent.createDiv({ attr: { style: "display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 12px 4px; border-radius: 8px; cursor: pointer; border: 1px solid var(--background-modifier-border); transition: background-color 0.2s;" } });
    btn.addEventListener("mouseover", () => btn.style.backgroundColor = "var(--background-modifier-hover)");
    btn.addEventListener("mouseout", () => btn.style.backgroundColor = "transparent");
    const iconSpan = btn.createSpan({ attr: { style: "margin-bottom: 8px; pointer-events: none;" } });
    (0, import_obsidian.setIcon)(iconSpan, iconName);
    let displayName = iconName;
    if (displayName.length > 10) displayName = displayName.substring(0, 8) + "..";
    btn.createSpan({ text: displayName, attr: { style: "font-size: 11px; color: var(--text-muted); pointer-events: none;" } });
    btn.onclick = async () => {
      let recents = this.plugin.settings.recentIcons || [];
      recents = recents.filter((id) => id !== iconName);
      recents.unshift(iconName);
      if (recents.length > 5) recents.pop();
      this.plugin.settings.recentIcons = recents;
      await this.plugin.saveSettings();
      this.onSelect(iconName);
      this.close();
    };
  }
  onClose() {
    this.contentEl.empty();
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
    const textSetting = new import_obsidian.Setting(this.contentEl).setName("\u5185\u5BB9\u6587\u5B57").setDesc("\u8F93\u5165\u53D8\u4F53\u5185\u5BB9\u3002(Enter \u4FDD\u5B58\uFF0CShift + Enter \u6362\u884C)").addTextArea((text) => {
      text.setValue(this.result).onChange((val) => this.result = val);
      text.inputEl.style.width = "100%";
      text.inputEl.style.minHeight = "120px";
      text.inputEl.style.resize = "vertical";
      text.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          if (this.result.trim()) this.onSubmit(this.result.trim());
          this.close();
        }
      });
    });
    textSetting.settingEl.addClass("annotation-textarea-setting");
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
var RelinkModal = class extends import_obsidian.Modal {
  constructor(app, oldPath, plugin, onSuccess) {
    super(app);
    this.oldPath = oldPath;
    this.plugin = plugin;
    this.onSuccess = onSuccess;
  }
  onOpen() {
    const { contentEl } = this;
    this.setTitle("\u91CD\u65B0\u6307\u5B9A\u6587\u4EF6\u6620\u5C04");
    const missingFileName = this.oldPath.split("/").pop() || "";
    contentEl.createEl("p", {
      text: `\u8BB0\u5F55\u4E2D\u7684\u6587\u4EF6\u4E3A\uFF1A\u3010${this.oldPath}\u3011
\u7531\u4E8E\u88AB\u5916\u90E8\u79FB\u52A8\u6216\u5220\u9664\uFF0C\u73B0\u5DF2\u65AD\u8054\u3002`,
      cls: "annotation-confirm-msg"
    });
    contentEl.createEl("p", {
      text: `\u26A0\uFE0F \u5F3A\u5236\u5B89\u5168\u89C4\u5219\uFF1A\u4F60\u53EA\u80FD\u5C06\u5176\u91CD\u65B0\u5173\u8054\u5230\u540D\u4E3A "${missingFileName}" \u7684\u6587\u4EF6\u3002`,
      cls: "annotation-confirm-msg",
      attr: { style: "color: var(--text-warning); font-size: 13px;" }
    });
    const matchingFiles = this.app.vault.getMarkdownFiles().filter((f) => f.name === missingFileName);
    const listContainer = contentEl.createDiv({ cls: "relink-file-list" });
    if (matchingFiles.length === 0) {
      listContainer.createDiv({
        text: "\u274C \u5728\u5F53\u524D\u6574\u4E2A\u77E5\u8BC6\u5E93\u4E2D\uFF0C\u6CA1\u6709\u627E\u5230\u540C\u540D\u6587\u4EF6\u3002\u5982\u679C\u4F60\u5728\u5916\u90E8\u6539\u540D\u4E86\uFF0C\u8BF7\u5148\u6539\u56DE\u539F\u540D\u3002",
        attr: { style: "color: var(--text-error); padding: 10px; background: var(--background-modifier-error);" }
      });
    } else {
      matchingFiles.forEach((file) => {
        const btn = listContainer.createEl("button", {
          text: `\u{1F517} \u5173\u8054\u81F3: ${file.path}`,
          cls: "relink-file-btn"
        });
        btn.onclick = async () => {
          this.plugin.annoManager.data[file.path] = this.plugin.annoManager.data[this.oldPath];
          delete this.plugin.annoManager.data[this.oldPath];
          if (this.plugin.settings.headingFilters[this.oldPath]) {
            this.plugin.settings.headingFilters[file.path] = this.plugin.settings.headingFilters[this.oldPath];
            delete this.plugin.settings.headingFilters[this.oldPath];
          }
          if (this.plugin.settings.displayModes[this.oldPath]) {
            this.plugin.settings.displayModes[file.path] = this.plugin.settings.displayModes[this.oldPath];
            if (this.plugin.settings.autoExpands[this.oldPath] !== void 0) {
              this.plugin.settings.autoExpands[file.path] = this.plugin.settings.autoExpands[this.oldPath];
              delete this.plugin.settings.autoExpands[this.oldPath];
            }
            delete this.plugin.settings.displayModes[this.oldPath];
          }
          await this.plugin.annoManager.save();
          await this.plugin.saveSettings();
          updateEditorDecorations(this.plugin);
          this.onSuccess();
          this.close();
          new import_obsidian.Notice("\u2705 \u91CD\u65B0\u5173\u8054\u6210\u529F\uFF01");
        };
      });
    }
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
    // ✨ 新增：用于在关闭模式下记住手动展开的卡片
    this._lockedActiveId = null;
    this.plugin = plugin;
    this.debouncedSync = (0, import_obsidian.debounce)(() => {
      const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      if (activeView) this.syncHighlightWithCursor(activeView);
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
        this._lockedActiveId = null;
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
      this._lockedActiveId = targetId;
      this.isNavigating = true;
      setTimeout(() => {
        this.isNavigating = false;
      }, 800);
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
    const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (activeView && activeView.leaf) return activeView.leaf;
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    if (this.lastActiveView) {
      const isStillOpen = leaves.find((l) => l.view === this.lastActiveView);
      if (isStillOpen) return isStillOpen;
    }
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
      this.lastActiveView = null;
      this.cachedRefs = [];
      this._lastStateHash = "";
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
        headerContainer.createDiv({ cls: "annotation-divider", text: "\u{1F4CC} \u6807\u6CE8" });
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
        const modeMap = { "original": "\u6807\u9898", "variant": "\u5206\u652F", "both": "\u540C\u65F6" };
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
        const isAutoExpand = this.plugin.settings.autoExpands[filePath] !== false;
        if (this.listRoot) this.listRoot.dataset.autoExpand = isAutoExpand ? "true" : "false";
        const autoExpandBtn = rightControls.createEl("button", {
          text: isAutoExpand ? "\u5F00\u542F" : "\u5173\u95ED",
          cls: "compass-ui-btn"
        });
        if (!isCollapsed) {
          autoExpandBtn.disabled = true;
          autoExpandBtn.style.opacity = "0.4";
          autoExpandBtn.style.cursor = "not-allowed";
          autoExpandBtn.title = "\u5168\u5C40\u5C55\u5F00\u72B6\u6001\u4E0B\u65E0\u9700\u6B64\u529F\u80FD";
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
          if (!isAutoExpand && this._forceExpandedCardId === anno.id) {
            card.classList.add("force-expand");
          }
          const hColor = anno.highlightColor || this.plugin.settings.defaultHighlightColor;
          const pColor = anno.phantomColor || this.plugin.settings.defaultPhantomColor;
          card.onclick = () => {
            this._lockedActiveId = anno.id;
            if (!isAutoExpand) {
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
              item.setTitle("\u6DFB\u52A0\u5206\u652F").setIcon("list-plus").onClick(() => {
                new CommentModal(this.app, "\u6DFB\u52A0\u5206\u652F", "", async (text) => {
                  if (!anno.comments) anno.comments = [];
                  anno.comments.push({ id: generateUUID(), text, checked: false });
                  await this.plugin.annoManager.save();
                  this._lastStateHash = "";
                  this.checkAndUpdate();
                }).open();
              });
            });
            menu.addItem((item) => {
              item.setTitle("\u6DFB\u52A0\u56FE\u6807").setIcon("smile-plus").onClick(() => {
                new IconGridModal(this.plugin, async (iconName) => {
                  anno.icon = iconName;
                  await this.plugin.annoManager.save();
                  this._lastStateHash = "";
                  this.checkAndUpdate();
                }).open();
              });
              if (anno.icon) {
                menu.addItem((item2) => {
                  item2.setTitle("\u5220\u9664\u56FE\u6807").setIcon("eraser").onClick(async () => {
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
              item.setTitle("\u4FEE\u6539\u6807\u6CE8\u989C\u8272").setIcon("highlighter").onClick(() => {
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
              item.setTitle("\u4FEE\u6539\u5206\u652F\u989C\u8272").setIcon("paintbrush").onClick(() => {
                new ColorPickerModal(this.app, "\u9009\u62E9\u5206\u652F\u989C\u8272", palette, async (c) => {
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
              item.setTitle("\u4FEE\u6539\u539F\u6587\u672C").setIcon("pencil").onClick(async () => {
                const view = this.lastActiveView;
                if (!view || !view.editor) return;
                new CommentModal(this.app, "\u4FEE\u6539\u6807\u6CE8\u539F\u6587\u672C", anno.original, async (newText) => {
                  if (!newText || newText === anno.original) return;
                  const editor = view.editor;
                  const fullText2 = editor.getValue();
                  const match = findAnnotationOffsetAndHeal(fullText2, anno);
                  if (!match) {
                    new import_obsidian.Notice("\u26A0\uFE0F \u65E0\u6CD5\u5728\u6B63\u6587\u4E2D\u5B9A\u4F4D\u539F\u6587\u672C\uFF0C\u8BF7\u786E\u4FDD\u6587\u672C\u672A\u88AB\u7834\u574F\uFF01");
                    return;
                  }
                  const fromPos = editor.offsetToPos(match.start);
                  const toPos = editor.offsetToPos(match.end);
                  editor.replaceRange(newText, fromPos, toPos);
                  const cursor = editor.offsetToPos(match.start);
                  const lineText = editor.getLine(cursor.line);
                  anno.original = newText;
                  anno.prefix = lineText.substring(Math.max(0, cursor.ch - 30), cursor.ch);
                  anno.suffix = lineText.substring(cursor.ch + newText.length, cursor.ch + newText.length + 30);
                  anno.expectedOffset = match.start;
                  await this.plugin.annoManager.save();
                  updateEditorDecorations(this.plugin);
                  this._lastStateHash = "";
                  this.checkAndUpdate();
                  new import_obsidian.Notice(`\u2705 \u539F\u6587\u672C\u5DF2\u6210\u529F\u4FEE\u6539\u4E3A\uFF1A
"${newText}"`);
                }).open();
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
          const titleWrapper = header.createDiv({
            cls: "anno-title-wrapper",
            attr: { style: "display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;" }
          });
          if (anno.icon) {
            const iconSpan = titleWrapper.createSpan({ cls: "anno-icon" });
            iconSpan.style.flexShrink = "0";
            (0, import_obsidian.setIcon)(iconSpan, anno.icon);
            const offset = this.plugin.settings.iconOffsetY || 0;
            if (offset !== 0) {
              iconSpan.style.position = "relative";
              iconSpan.style.top = `${offset}px`;
            }
          }
          titleWrapper.createSpan({ text: anno.original, cls: "anno-title-text anno-text-original" });
          titleWrapper.createSpan({ text: variantText, cls: "anno-title-text anno-text-variant" });
          titleWrapper.createSpan({ text: `${anno.original}\uFF1A${variantText}`, cls: "anno-title-text anno-text-both" });
          const list = card.createDiv({ cls: "annotation-comments-list" });
          (anno.comments || []).forEach((comment) => {
            const row = list.createDiv({ cls: "annotation-comment-row" });
            row.dataset.commentId = comment.id;
            row.onclick = async (e) => {
              e.stopPropagation();
              this._lockedActiveId = anno.id;
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
        if (ref.el) allItems.push({ el: ref.el, offset: view.editor.posToOffset({ line: ref.line, ch: ref.col }), id: ref.key });
      });
      const annos = this.plugin.annoManager.data[view.file?.path || ""] || [];
      annos.forEach((anno) => {
        if (anno._tempOffset !== void 0 && anno._tempOffset < Number.MAX_SAFE_INTEGER) {
          const cardEl = this.listRoot?.querySelector(`.annotation-card[data-anno-id="${anno.id}"]`);
          if (cardEl) {
            allItems.push({ el: cardEl, offset: anno._tempOffset, id: anno.id });
          }
        }
      });
      if (allItems.length === 0) return;
      let primaryItem = allItems[0];
      let minDistance = Infinity;
      allItems.forEach((item) => {
        let dist = Math.abs(item.offset - targetOffset);
        if (dist < minDistance) {
          minDistance = dist;
          primaryItem = item;
        }
      });
      if (this._lockedActiveId) {
        const lockedItem = allItems.find((i) => i.id === this._lockedActiveId);
        if (lockedItem && Math.abs(lockedItem.offset - targetOffset) < 150) {
          primaryItem = lockedItem;
        } else {
          this._lockedActiveId = null;
        }
      }
      const isClosedMode = this.plugin.settings.autoExpands[view.file?.path || ""] === false;
      if (isClosedMode && !this.isNavigating && this._forceExpandedCardId !== null && this._lockedActiveId === null) {
        const oldExpanded = this.listRoot.querySelector(`.annotation-card[data-anno-id="${this._forceExpandedCardId}"]`);
        if (oldExpanded) oldExpanded.classList.remove("force-expand");
        this._forceExpandedCardId = null;
      }
      allItems.forEach((item) => {
        let isActive = false;
        if (isClosedMode) {
          isActive = item === primaryItem;
        } else {
          isActive = item === primaryItem;
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
    const DEFAULT_FILE = "\u5927\u7EB2\u53D8\u4F53\u6807\u6CE8\u6570\u636E\u5E93.md";
    new import_obsidian.Setting(containerEl).setName("\u6807\u6CE8\u6570\u636E\u5B58\u50A8\u6587\u4EF6").setDesc("\u6307\u5B9A\u4E00\u4E2A .md \u6587\u4EF6\u6765\u5B89\u5168\u5B58\u50A8\u4F60\u7684\u6807\u6CE8\u548C\u53D8\u4F53\u6570\u636E\u3002\u7559\u7A7A\u5219\u9ED8\u8BA4\u4F7F\u7528\u300C\u5927\u7EB2\u53D8\u4F53\u6807\u6CE8\u6570\u636E\u5E93.md\u300D\u3002\u652F\u6301\u76F4\u63A5\u8F93\u5165\u65B0\u6587\u4EF6\u540D\uFF0C\u6216\u641C\u7D22\u9009\u62E9\u5DF2\u6709\u6587\u4EF6\u3002").addText((text) => {
      text.setPlaceholder(DEFAULT_FILE).setValue(this.plugin.settings.annotationFilePath === DEFAULT_FILE ? "" : this.plugin.settings.annotationFilePath).onChange(async (value) => {
        this.plugin.settings.annotationFilePath = value.trim() || DEFAULT_FILE;
        await this.plugin.saveSettings();
        await this.plugin.annoManager.load();
      });
      new FileSuggest(this.app, text, async (selectedPath) => {
        this.plugin.settings.annotationFilePath = selectedPath;
        text.setValue(selectedPath === DEFAULT_FILE ? "" : selectedPath);
        await this.plugin.saveSettings();
        await this.plugin.annoManager.load();
      });
    });
    containerEl.createEl("h3", { text: "\u5168\u5C40\u9ED8\u8BA4\u989C\u8272\u8BBE\u7F6E", cls: "setting-section-header" });
    this.createColorSetting(containerEl, "\u9ED8\u8BA4\u539F\u6587\u672C\u9AD8\u4EAE\u989C\u8272", "\u5F53\u521B\u5EFA\u65B0\u53D8\u4F53\u65F6\uFF0C\u6B63\u6587\u4E2D\u88AB\u5708\u5B9A\u7684\u539F\u8BCD\u9AD8\u4EAE\u989C\u8272\u3002", "defaultHighlightColor");
    this.createColorSetting(containerEl, "\u9ED8\u8BA4\u66FF\u6362\u540E\u53D8\u4F53\u989C\u8272", "\u5728\u6B63\u6587\u4E2D\u66FF\u6362\u6210\u53D8\u4F53\u6587\u5B57\u540E\u7684\u6587\u5B57\u548C\u8FB9\u6846\u989C\u8272\u3002", "defaultPhantomColor");
    this.createColorSetting(containerEl, "\u4FA7\u8FB9\u680F\u5206\u7C7B\u6807\u9898\u989C\u8272", "\u5728\u4FA7\u8FB9\u680F\u4E2D\u57FA\u4E8EH1-H6\u5206\u7C7B\u663E\u793A\u7684\u6807\u9898\u6587\u672C\u989C\u8272\u3002", "headingColor");
    this.createColorSetting(containerEl, "\u9009\u533A\u80CC\u666F\u9AD8\u4EAE\u989C\u8272", "\u4FEE\u6539\u9009\u533A\u9AD8\u4EAE\u65F6\u7684\u80CC\u666F\u989C\u8272\uFF08\u5BF9\u5E94 .is-flashing \u7684\u80CC\u666F\u8272\uFF09\u3002", "flashingColor");
    new import_obsidian.Setting(containerEl).setName("\u56FE\u6807\u5411\u4E0B\u5FAE\u8C03").setDesc("\u5FAE\u8C03\u6807\u9898\u524D\u9762\u56FE\u6807\u7684\u5782\u76F4\u4F4D\u7F6E\uFF0C\u586B\u5165\u6570\u5B57\u5373\u53EF\uFF08\u8D1F\u6570\u4EE3\u8868\u5411\u4E0A\u5FAE\u8C03\uFF09\u3002\u4E0D\u540C\u5B57\u4F53\u4E0B\u53EF\u80FD\u9700\u8981\u5FAE\u8C03\u5BF9\u9F50\u3002").addText(
      (text) => text.setPlaceholder("0").setValue((this.plugin.settings.iconOffsetY || 0).toString()).onChange(async (value) => {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          this.plugin.settings.iconOffsetY = num;
        } else if (value.trim() === "") {
          this.plugin.settings.iconOffsetY = 0;
        }
        await this.plugin.saveSettings();
        this.forceRefreshSidebar();
      })
    );
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
      hexInput.oninput = async (e) => {
        const val = e.target.value;
        const validHex = normalizeTo7CharHex(val);
        if (validHex) {
          preset.hex = validHex;
          colorPicker.value = validHex;
          await this.plugin.saveSettings();
        }
      };
      hexInput.onblur = (e) => {
        const val = e.target.value;
        const validHex = normalizeTo7CharHex(val);
        if (validHex) {
          hexInput.value = validHex;
        } else {
          hexInput.value = preset.hex;
        }
      };
      const delBtn = item.createDiv({ cls: "color-preset-del" });
      (0, import_obsidian.setIcon)(delBtn, "trash");
      delBtn.onclick = async () => {
        this.plugin.settings.colorPresets.splice(index, 1);
        await this.plugin.saveSettings();
        this.display();
      };
    });
    containerEl.createEl("h3", { text: "\u6570\u636E\u5E93\u6587\u4EF6\u6620\u5C04\u7BA1\u7406", cls: "setting-section-header" });
    containerEl.createEl("p", {
      text: "\u5F53\u4F60\u53D1\u73B0\u5728\u5916\u90E8\uFF08\u5982 Win10 \u6587\u4EF6\u5939\uFF09\u79FB\u52A8\u6216\u5220\u9664\u4E86\u6587\u4EF6\u5BFC\u81F4\u6807\u6CE8\u5931\u6548\u65F6\uFF0C\u53EF\u4EE5\u5728\u8FD9\u91CC\u8FDB\u884C\u5B89\u5168\u627E\u56DE\u6216\u5F7B\u5E95\u6E05\u7406\u3002",
      cls: "setting-item-description"
    });
    const dbContainer = containerEl.createDiv({ cls: "db-manager-container" });
    const TRASH_PREFIX = "__TRASH__";
    const allKeys = Object.keys(this.plugin.annoManager.data);
    const activeKeys = allKeys.filter((k) => !k.startsWith(TRASH_PREFIX));
    const trashKeys = allKeys.filter((k) => k.startsWith(TRASH_PREFIX));
    dbContainer.createEl("h4", { text: "\u5F53\u524D\u6709\u6548\u8BB0\u5F55", cls: "db-section-title" });
    const activeTable = dbContainer.createDiv({ cls: "db-table" });
    const headerRow = activeTable.createDiv({ cls: "db-row db-header" });
    headerRow.createDiv({ text: "\u72B6\u6001", cls: "db-col db-col-status" });
    headerRow.createDiv({ text: "\u8BB0\u5F55\u4E2D\u7684\u8DEF\u5F84 (Key)", cls: "db-col db-col-path" });
    headerRow.createDiv({ text: "\u6807\u6CE8\u6570", cls: "db-col db-col-count" });
    headerRow.createDiv({ text: "\u64CD\u4F5C", cls: "db-col db-col-action" });
    if (activeKeys.length === 0) {
      activeTable.createDiv({ text: "\u5F53\u524D\u6CA1\u6709\u4EFB\u4F55\u6807\u6CE8\u8BB0\u5F55\u3002", cls: "db-empty-msg" });
    }
    activeKeys.forEach((key) => {
      const arr = this.plugin.annoManager.data[key];
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
      const row = activeTable.createDiv({ cls: `db-row ${!isExist ? "db-row-missing" : ""}` });
      row.createDiv({ text: isExist ? "\u6B63\u5E38" : "\u4E22\u5931", cls: "db-col db-col-status" });
      row.createDiv({ text: key, cls: "db-col db-col-path" });
      row.createDiv({ text: `${count} \u6761`, cls: "db-col db-col-count" });
      const actionCol = row.createDiv({ cls: "db-col db-col-action" });
      if (!isExist) {
        const relinkBtn = actionCol.createEl("button", { text: "\u91CD\u65B0\u6307\u5B9A", cls: "db-btn-relink" });
        relinkBtn.onclick = () => {
          new RelinkModal(this.app, key, this.plugin, () => {
            this.forceRefreshSidebar();
            this.display();
          }).open();
        };
      }
      const trashBtn = actionCol.createEl("button", { text: "\u79FB\u81F3\u56DE\u6536\u533A", cls: "db-btn-trash" });
      trashBtn.onclick = async () => {
        if (!this.plugin.annoManager.data[key]) return;
        this.plugin.annoManager.data[`${TRASH_PREFIX}${key}`] = this.plugin.annoManager.data[key];
        delete this.plugin.annoManager.data[key];
        await this.plugin.annoManager.save();
        updateEditorDecorations(this.plugin);
        this.forceRefreshSidebar();
        this.display();
      };
    });
    const trashHeader = dbContainer.createDiv({ cls: "db-section-title-wrapper" });
    trashHeader.createEl("h4", { text: "\u56DE\u6536\u7AD9", cls: "db-section-title", attr: { style: "margin:0;" } });
    if (trashKeys.length > 0) {
      const emptyTrashBtn = trashHeader.createEl("button", { text: "\u6E05\u7A7A\u56DE\u6536\u7AD9", cls: "db-btn-trash" });
      emptyTrashBtn.onclick = () => {
        new ConfirmModal(this.app, "\u6E05\u7A7A\u56DE\u6536\u7AD9", "\u8B66\u544A\uFF1A\u5F7B\u5E95\u6E05\u7A7A\u540E\uFF0C\u56DE\u6536\u7AD9\u5185\u7684\u6240\u6709\u6570\u636E\u5C06\u4ECE Markdown \u6570\u636E\u5E93\u4E2D\u5B8C\u5168\u62B9\u9664\uFF0C\u65E0\u6CD5\u6062\u590D\uFF01\u786E\u8BA4\u6E05\u7A7A\u5417\uFF1F", async () => {
          trashKeys.forEach((k) => delete this.plugin.annoManager.data[k]);
          await this.plugin.annoManager.save();
          this.display();
          new import_obsidian.Notice("\u56DE\u6536\u7AD9\u5DF2\u6E05\u7A7A\u3002");
        }).open();
      };
    }
    const trashTable = dbContainer.createDiv({ cls: "db-table" });
    if (trashKeys.length === 0) {
      trashTable.createDiv({ text: "\u56DE\u6536\u7AD9\u662F\u7A7A\u7684\u3002", cls: "db-empty-msg" });
    }
    trashKeys.forEach((key) => {
      const arr = this.plugin.annoManager.data[key];
      if (!arr) {
        delete this.plugin.annoManager.data[key];
        return;
      }
      const originalPath = key.replace(TRASH_PREFIX, "");
      const count = arr.length;
      const row = trashTable.createDiv({ cls: "db-row db-row-trashed" });
      row.createDiv({ text: "\u5DF2\u5E9F\u5F03", cls: "db-col db-col-status" });
      row.createDiv({ text: originalPath, cls: "db-col db-col-path", attr: { style: "text-decoration: line-through;" } });
      row.createDiv({ text: `${count} \u6761`, cls: "db-col db-col-count" });
      const actionCol = row.createDiv({ cls: "db-col db-col-action" });
      const restoreBtn = actionCol.createEl("button", { text: "\u53CD\u6094\u6062\u590D", cls: "db-btn-restore" });
      restoreBtn.onclick = async () => {
        if (!this.plugin.annoManager.data[key]) return;
        this.plugin.annoManager.data[originalPath] = this.plugin.annoManager.data[key];
        delete this.plugin.annoManager.data[key];
        await this.plugin.annoManager.save();
        updateEditorDecorations(this.plugin);
        this.forceRefreshSidebar();
        this.display();
        new import_obsidian.Notice("\u5DF2\u6062\u590D\u8BE5\u8BB0\u5F55\u3002");
      };
      const delBtn = actionCol.createEl("button", { text: "\u5F7B\u5E95\u5220\u9664", cls: "db-btn-trash" });
      delBtn.onclick = () => {
        new ConfirmModal(this.app, "\u5F7B\u5E95\u5220\u9664\u5355\u6761\u8BB0\u5F55", `\u786E\u5B9A\u8981\u5F7B\u5E95\u5220\u9664\u6587\u4EF6\u3010${originalPath}\u3011\u7684\u5168\u90E8\u6807\u6CE8\u8BB0\u5F55\u5417\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\uFF01`, async () => {
          delete this.plugin.annoManager.data[key];
          await this.plugin.annoManager.save();
          this.display();
          new import_obsidian.Notice("\u5DF2\u5F7B\u5E95\u5220\u9664\u8BE5\u8BB0\u5F55\u3002");
        }).open();
      };
    });
    containerEl.createEl("h3", { text: "\u{1F6E1}\uFE0F \u6570\u636E\u5B89\u5168\u4E0E\u81EA\u52A8\u5907\u4EFD", cls: "setting-section-header" });
    containerEl.createEl("p", {
      text: "\u4E13\u4E3A\u5C0F\u8BF4\u5927\u7EB2\u7B49\u9AD8\u4EF7\u503C\u6570\u636E\u8BBE\u8BA1\u7684\u4FDD\u547D\u673A\u5236\u3002\u63D2\u4EF6\u4F1A\u5728\u540E\u53F0\u9759\u9ED8\u8BB0\u5F55\u60A8\u7684\u5386\u53F2\u7248\u672C\uFF0C\u4EE5\u9632\u8BEF\u5220\u6216\u540C\u6B65\u76D8\u5F15\u53D1\u7684\u6587\u4EF6\u635F\u574F\u3002",
      cls: "setting-item-description"
    });
    new import_obsidian.Setting(containerEl).setName("\u81EA\u52A8\u5907\u4EFD\u51B7\u5374\u65F6\u95F4 (\u5C0F\u65F6)").setDesc("\u5F53\u60A8\u6709\u4FEE\u6539\u53D1\u751F\u65F6\uFF0C\u81F3\u5C11\u95F4\u9694\u591A\u5C11\u5C0F\u65F6\u624D\u751F\u6210\u4E00\u4EFD\u65B0\u5907\u4EFD\u3002(\u5EFA\u8BAE: 1-2\u5C0F\u65F6)").addSlider(
      (slider) => slider.setLimits(1, 24, 1).setValue(this.plugin.settings.backupIntervalHours).setDynamicTooltip().onChange(async (val) => {
        this.plugin.settings.backupIntervalHours = val;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u6700\u591A\u4FDD\u7559\u5386\u53F2\u4EFD\u6570").setDesc("\u8D85\u8FC7\u6B64\u4EFD\u6570\u65F6\uFF0C\u5C06\u81EA\u52A8\u5220\u9664\u6700\u8001\u7684\u4E00\u4EFD\u5907\u4EFD\u3002(\u8303\u56F4: 5 ~ 50\u4EFD)").addSlider(
      (slider) => slider.setLimits(5, 50, 1).setValue(this.plugin.settings.maxBackups).setDynamicTooltip().onChange(async (val) => {
        this.plugin.settings.maxBackups = val;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u6025\u6551\uFF1A\u67E5\u770B\u5907\u4EFD\u6587\u4EF6").setDesc("\u{1F6A8} \u5982\u679C\u60A8\u7684\u6807\u6CE8\u6570\u636E\u610F\u5916\u4E22\u5931\uFF0C\u70B9\u51FB\u53F3\u4FA7\u6309\u94AE\u7ACB\u523B\u6253\u5F00\u5907\u4EFD\u5B58\u653E\u7684\u7CFB\u7EDF\u6587\u4EF6\u5939\u8FDB\u884C\u62A2\u6551\u3002").addButton(
      (btn) => btn.setButtonText("\u{1F4C2} \u6253\u5F00\u5907\u4EFD\u6587\u4EF6\u5939").setCta().onClick(async () => {
        const backupDirPath = (0, import_obsidian.normalizePath)(this.plugin.app.vault.configDir + "/plugins/footnote-compass/backups");
        const adapter = this.plugin.app.vault.adapter;
        if (!await adapter.exists(backupDirPath)) {
          await adapter.mkdir(backupDirPath);
        }
        if (typeof adapter.getBasePath === "function") {
          const fullSystemPath = adapter.getBasePath() + "/" + backupDirPath;
          if (typeof window !== "undefined" && window.require) {
            window.require("electron").shell.openPath(fullSystemPath);
            return;
          }
        }
        new import_obsidian.Notice("\u{1F4F1} \u79FB\u52A8\u7AEF\u4E0D\u652F\u6301\u76F4\u63A5\u6253\u5F00\u7CFB\u7EDF\u6587\u4EF6\u5939\uFF0C\u5907\u4EFD\u5DF2\u5B89\u5168\u5B58\u653E\u5728\u6B64\u8DEF\u5F84: \n" + backupDirPath, 8e3);
      })
    );
    setTimeout(() => {
      const firstInput = containerEl.querySelector('input[type="text"]');
      if (firstInput && document.activeElement === firstInput) {
        firstInput.blur();
      }
    }, 50);
  }
  createColorSetting(containerEl, name, desc, settingKey) {
    let colorComp, textComp;
    new import_obsidian.Setting(containerEl).setName(name).setDesc(desc).addColorPicker((color) => {
      colorComp = color;
      color.setValue(this.plugin.settings[settingKey]).onChange(async (val) => {
        this.plugin.settings[settingKey] = val;
        if (textComp) textComp.setValue(val);
        await this.plugin.saveSettings();
        this.plugin.applyDynamicStyles();
        updateEditorDecorations(this.plugin);
        this.forceRefreshSidebar();
      });
    }).addText((text) => {
      textComp = text;
      text.setValue(this.plugin.settings[settingKey]).onChange(async (val) => {
        const validHex = normalizeTo7CharHex(val);
        if (validHex) {
          this.plugin.settings[settingKey] = validHex;
          if (colorComp) colorComp.setValue(validHex);
          await this.plugin.saveSettings();
          this.plugin.applyDynamicStyles();
          updateEditorDecorations(this.plugin);
          this.forceRefreshSidebar();
        }
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
      autoExpands: {},
      // ✨ 新增：默认值// ✨ 新增：默认值
      headingColor: "#2196f3",
      // 新增：默认标题颜色（蓝色）
      flashingColor: "#EEE7DD",
      iconOffsetY: 0,
      // ✨ 新增：默认微调为 0
      recentIcons: [],
      // ✨ 新增：默认初始化为空
      maxBackups: 20,
      // 默认保存 20 份
      backupIntervalHours: 1,
      // 默认 1 小时冷却时间
      lastBackupTime: 0
      // 初始时间为 0
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
      let hasChanges = false;
      if (file instanceof import_obsidian.TFile && file.extension === "md") {
        if (this.settings.autoExpands[oldPath] !== void 0) {
          this.settings.autoExpands[file.path] = this.settings.autoExpands[oldPath];
          delete this.settings.autoExpands[oldPath];
          hasChanges = true;
        }
        if (this.annoManager.data[oldPath]) {
          this.annoManager.data[file.path] = this.annoManager.data[oldPath];
          delete this.annoManager.data[oldPath];
          hasChanges = true;
        }
        if (this.settings.headingFilters[oldPath]) {
          this.settings.headingFilters[file.path] = this.settings.headingFilters[oldPath];
          delete this.settings.headingFilters[oldPath];
          hasChanges = true;
        }
        if (this.settings.displayModes[oldPath]) {
          this.settings.displayModes[file.path] = this.settings.displayModes[oldPath];
          delete this.settings.displayModes[oldPath];
          hasChanges = true;
        }
      } else if (file instanceof import_obsidian.TFolder) {
        const oldPrefix = oldPath + "/";
        const newPrefix = file.path + "/";
        Object.keys(this.settings.autoExpands).forEach((key) => {
          if (key.startsWith(oldPrefix)) {
            const newKey = key.replace(oldPrefix, newPrefix);
            this.settings.autoExpands[newKey] = this.settings.autoExpands[key];
            delete this.settings.autoExpands[key];
            hasChanges = true;
          }
        });
        Object.keys(this.annoManager.data).forEach((key) => {
          if (key.startsWith(oldPrefix)) {
            const newKey = key.replace(oldPrefix, newPrefix);
            this.annoManager.data[newKey] = this.annoManager.data[key];
            delete this.annoManager.data[key];
            hasChanges = true;
          }
        });
        Object.keys(this.settings.headingFilters).forEach((key) => {
          if (key.startsWith(oldPrefix)) {
            const newKey = key.replace(oldPrefix, newPrefix);
            this.settings.headingFilters[newKey] = this.settings.headingFilters[key];
            delete this.settings.headingFilters[key];
            hasChanges = true;
          }
        });
        Object.keys(this.settings.displayModes).forEach((key) => {
          if (key.startsWith(oldPrefix)) {
            const newKey = key.replace(oldPrefix, newPrefix);
            this.settings.displayModes[newKey] = this.settings.displayModes[key];
            delete this.settings.displayModes[key];
            hasChanges = true;
          }
        });
      }
      if (hasChanges) {
        await this.annoManager.save();
        await this.saveSettings();
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
            if (!view || !view.file) {
              new import_obsidian.Notice("\u26A0\uFE0F \u65E0\u6CD5\u5728\u6B64\u5904\u6DFB\u52A0\u6807\u6CE8\uFF1A\u5F53\u524D\u6587\u6863\u4E0D\u5B58\u5728\u5BF9\u5E94\u7684\u7269\u7406\u6587\u4EF6\u3002");
              return;
            }
            const cursorFrom = editor.getCursor("from");
            const cursorTo = editor.getCursor("to");
            if (cursorFrom.line !== cursorTo.line) {
              new import_obsidian.Notice("\u26A0\uFE0F \u6682\u4E0D\u652F\u6301\u8DE8\u884C\u6DFB\u52A0\u6807\u6CE8\uFF0C\u8BF7\u5728\u540C\u4E00\u6BB5\u843D\u5185\u9009\u62E9\uFF01");
              return;
            }
            const lineText = editor.getLine(cursorFrom.line);
            const prefix = lineText.substring(Math.max(0, cursorFrom.ch - 30), cursorFrom.ch);
            const suffix = lineText.substring(cursorTo.ch, Math.min(lineText.length, cursorTo.ch + 30));
            const path = view.file.path;
            const expectedOffset = editor.posToOffset(cursorFrom);
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
    this.applyDynamicStyles();
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
  // 👇 修改：加入安全默认值，防止旧数据生成 "undefinedpx"
  applyDynamicStyles() {
    const flashColor = this.settings.flashingColor || "#EEE7DD";
    document.body.style.setProperty("--fc-flashing-color", flashColor);
  }
  async onunload() {
    document.body.classList.remove("footnote-beautify-enabled");
    document.body.style.removeProperty("--fc-flashing-color");
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
