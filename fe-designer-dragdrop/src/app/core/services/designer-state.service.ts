import { Injectable, signal, computed, effect } from '@angular/core';
import { CanvasElement, ReportLayout, createDefaultLayout, A4_WIDTH_MM, A4_HEIGHT_MM, TableCellBorderConfig, TableCellBorderSpec } from '../../shared/models/schema';
import { getTableRowSizes, getTableColSizes } from '../../shared/utils/table-utils';

export interface PageGutters {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface HistoryEntry {
  elements: CanvasElement[];
  timestamp: number;
}

export interface TableCellSelection {
  elementId: string;
  row: number;
  col: number;
  subTablePath?: Array<{row: number; col: number}>; // Path to nested sub-cell
}

type BorderSide = 'all' | 'top' | 'right' | 'bottom' | 'left';

export type CanvasZoomMode = 'fit' | 'width' | 'height' | 'actual';

/**
 * Central store for designer state, including layout data, history, and export helpers.
 */
@Injectable({
  providedIn: 'root'
})
export class DesignerStateService {
  // Current layout
  private currentLayoutSignal = signal<ReportLayout>(createDefaultLayout());
  readonly currentLayout = this.currentLayoutSignal.asReadonly();

  // Canvas elements
  private elementsSignal = signal<CanvasElement[]>([]);
  readonly elements = this.elementsSignal.asReadonly();

  // Selected element
  private selectedElementIdSignal = signal<string | null>(null);
  readonly selectedElementId = this.selectedElementIdSignal.asReadonly();
  private selectedTableCellSignal = signal<TableCellSelection | null>(null);
  readonly selectedTableCell = this.selectedTableCellSignal.asReadonly();

  // Computed: selected element object
  readonly selectedElement = computed(() => {
    const id = this.selectedElementIdSignal();
    if (!id) return null;
    return this.elementsSignal().find(el => el.id === id) || null;
  });

  // History for undo/redo
  private historySignal = signal<HistoryEntry[]>([]);
  private historyIndexSignal = signal<number>(-1);
  private savedHistoryIndexSignal = signal<number>(-1); // Tracks last saved history index

  readonly canUndo = computed(() => this.historyIndexSignal() > 0);
  readonly canRedo = computed(() => this.historyIndexSignal() < this.historySignal().length - 1);
  readonly isDesignDirty = computed(() => {
    // If canvas empty treat as not dirty regardless of history indices
    if (this.elementsSignal().length === 0) return false;
    return this.historyIndexSignal() !== this.savedHistoryIndexSignal();
  });

  // Panel states
  readonly westCollapsed = signal(false);
  readonly eastCollapsed = signal(false);
  readonly westWidth = signal(250);
  readonly eastWidth = signal(300);

  // Status message
  readonly statusMessage = signal('Ready');
  readonly cursorPosition = signal({ x: 0, y: 0 });

  private designSourceNameSignal = signal<string | null>(null);
  readonly layoutDisplayName = computed(() => {
    const layoutName = (this.currentLayoutSignal().name || '').trim();
    const sourceName = this.designSourceNameSignal();
    const fallback = sourceName && sourceName.trim().length ? sourceName.trim() : 'Untitled Layout';
    if (!layoutName.length) {
      return fallback;
    }
    if (layoutName === 'Untitled Layout') {
      return fallback;
    }
    return layoutName;
  });

  // Grid configuration
  readonly visualGridSize = signal(10); // Background grid display size in mm
  readonly logicalGridSize = signal(1); // Snap-to-grid quantum in mm
  readonly canvasScale = signal(1);
  readonly visualGridColor = signal('#1d4ed8');
  readonly calibrationScale = signal(1);
  readonly canvasZoomMode = signal<CanvasZoomMode>('fit');
  readonly pageGutters = signal<PageGutters>({
    top: 10,
    right: 10,
    bottom: 10,
    left: 10
  });

  /**
   * Initializes default state, loads persisted calibration, and hooks auto-save effect.
   */
  constructor() {
    // Initialize history with empty state
    this.addToHistory([]);

    // Load calibration scale from localStorage
    const savedScale = localStorage.getItem('trueSizeScale');
    if (savedScale) {
      const parsed = parseFloat(savedScale);
      if (Number.isFinite(parsed) && parsed > 0) {
        this.calibrationScale.set(parsed);
      }
    }

    // Set default zoom mode to actual size (1:1)
    this.canvasZoomMode.set('actual');

    // Auto-save to localStorage on element changes
    effect(() => {
      const layout = this.currentLayoutSignal();
      const elements = this.elementsSignal();
      // Could implement auto-save logic here
    });
  }

  // Layout management
  /**
   * Replaces the current layout state and resets history and selections.
   */
  setLayout(layout: ReportLayout) {
    this.currentLayoutSignal.set(layout);
    this.elementsSignal.set(layout.elements);
    this.clampElementsToMargins(this.pageGutters());
    this.clearHistory();
    this.addToHistory(this.elementsSignal());
    this.clearTableCellSelection();
    this.designSourceNameSignal.set(null);
    this.markDesignSaved();
  }

  /**
   * Updates the layout's display name without touching element history.
   */
  updateLayoutName(name: string) {
    this.currentLayoutSignal.update(layout => ({ ...layout, name }));
  }

  // Element management
  /**
   * Adds a new element to the canvas and records the change in history.
   */
  addElement(element: CanvasElement) {
    const gutters = this.pageGutters();
    const clampedElement = this.clampElementToMargins(element, gutters);
    this.elementsSignal.update(elements => [...elements, clampedElement]);
    this.addToHistory(this.elementsSignal());
    this.selectedElementIdSignal.set(clampedElement.id);
    this.clearTableCellSelection();
  }

  /**
   * Applies partial updates to an element and ensures it remains within margins.
   */
  updateElement(id: string, updates: Partial<CanvasElement>) {
    const gutters = this.pageGutters();
    this.elementsSignal.update(elements =>
      elements.map(el => {
        if (el.id !== id) return el;
        const merged = { ...el, ...updates };
        return this.clampElementToMargins(merged, gutters);
      })
    );
    this.addToHistory(this.elementsSignal());
    this.ensureTableCellSelectionInBounds(id);
  }

  /**
   * Removes an element by id and clears related selections.
   */
  removeElement(id: string) {
    this.elementsSignal.update(elements => elements.filter(el => el.id !== id));
    this.addToHistory(this.elementsSignal());
    if (this.selectedElementIdSignal() === id) {
      this.selectedElementIdSignal.set(null);
    }
    const cellSelection = this.selectedTableCellSignal();
    if (cellSelection?.elementId === id) {
      this.clearTableCellSelection();
    }
  }

  /**
   * Updates the selected element, clearing cell selection when appropriate.
   */
  selectElement(id: string | null) {
    this.selectedElementIdSignal.set(id);
    const cellSelection = this.selectedTableCellSignal();
    if (!id || cellSelection?.elementId !== id) {
      this.clearTableCellSelection();
    }
  }

  /**
   * Stores a table cell selection with bounds checking for row and column values.
   */
  selectTableCell(elementId: string, row: number, col: number, subTablePath?: Array<{row: number; col: number}>) {
    const element = this.elementsSignal().find(el => el.id === elementId);
    if (!element) {
      this.clearTableCellSelection();
      return;
    }

    const rows = this.getTableDimension(element, 'rows');
    const cols = this.getTableDimension(element, 'cols');
    if (rows <= 0 || cols <= 0) {
      this.clearTableCellSelection();
      return;
    }

    const normalizedRow = Math.min(Math.max(Math.floor(row), 0), rows - 1);
    const normalizedCol = Math.min(Math.max(Math.floor(col), 0), cols - 1);

    this.selectedTableCellSignal.set({
      elementId,
      row: normalizedRow,
      col: normalizedCol,
      subTablePath
    });
  }

  /**
   * Clears the current table cell selection.
   */
  clearTableCellSelection() {
    this.selectedTableCellSignal.set(null);
  }

  /**
   * Removes all canvas elements and resets history and selection state.
   */
  clearElements() {
    this.elementsSignal.set([]);
    this.selectedElementIdSignal.set(null);
    this.clearHistory();
    this.addToHistory([]);
    this.clearTableCellSelection();
  }

  /**
   * Loads a layout from persisted data and resets history.
   */
  loadLayout(layout: ReportLayout) {
    this.currentLayoutSignal.set(layout);
    this.elementsSignal.set(JSON.parse(JSON.stringify(layout.elements)));
    this.clampElementsToMargins(this.pageGutters());
    this.selectedElementIdSignal.set(null);
    this.clearHistory();
    this.addToHistory(this.elementsSignal());
    this.clearTableCellSelection();
    this.designSourceNameSignal.set(null);
    this.markDesignSaved();
  }

  /**
   * Restores the default empty layout and clears selections.
   */
  clearLayout() {
    const defaultLayout = createDefaultLayout();
    this.currentLayoutSignal.set(defaultLayout);
    this.elementsSignal.set([]);
    this.selectedElementIdSignal.set(null);
    this.clearHistory();
    this.addToHistory([]);
    this.clearTableCellSelection();
    this.designSourceNameSignal.set(null);
    this.markDesignSaved();
  }

  // History management
  /**
   * Pushes a deep-cloned snapshot of elements onto the undo stack.
   */
  private addToHistory(elements: CanvasElement[]) {
    const currentIndex = this.historyIndexSignal();
    const history = this.historySignal().slice(0, currentIndex + 1);

    const newEntry: HistoryEntry = {
      elements: JSON.parse(JSON.stringify(elements)), // Deep clone
      timestamp: Date.now()
    };

    this.historySignal.set([...history, newEntry]);
    this.historyIndexSignal.set(history.length);
  }

  /**
   * Resets the undo/redo history.
   */
  private clearHistory() {
    this.historySignal.set([]);
    this.historyIndexSignal.set(-1);
  }

  /**
   * Ensures the selected table cell remains valid after element mutations.
   */
  private ensureTableCellSelectionInBounds(elementId: string) {
    const selection = this.selectedTableCellSignal();
    if (!selection || selection.elementId !== elementId) {
      return;
    }

    const element = this.elementsSignal().find(el => el.id === elementId);
    if (!element) {
      this.clearTableCellSelection();
      return;
    }

    const rows = this.getTableDimension(element, 'rows');
    const cols = this.getTableDimension(element, 'cols');

    if (rows <= 0 || cols <= 0) {
      this.clearTableCellSelection();
      return;
    }

    const row = Math.min(selection.row, rows - 1);
    const col = Math.min(selection.col, cols - 1);

    if (row !== selection.row || col !== selection.col) {
      this.selectedTableCellSignal.set({ elementId, row, col });
    }
  }

  /**
   * Restores the previous history snapshot if available.
   */
  undo() {
    if (!this.canUndo()) return;

    const newIndex = this.historyIndexSignal() - 1;
    this.historyIndexSignal.set(newIndex);

    const entry = this.historySignal()[newIndex];
    this.elementsSignal.set(JSON.parse(JSON.stringify(entry.elements)));
    this.selectedElementIdSignal.set(null);
    this.clearTableCellSelection();
  }

  /**
   * Reapplies the next history snapshot if available.
   */
  redo() {
    if (!this.canRedo()) return;

    const newIndex = this.historyIndexSignal() + 1;
    this.historyIndexSignal.set(newIndex);

    const entry = this.historySignal()[newIndex];
    this.elementsSignal.set(JSON.parse(JSON.stringify(entry.elements)));
    this.selectedElementIdSignal.set(null);
    this.clearTableCellSelection();
  }

  // Status updates
  /**
   * Updates the status bar message.
   */
  setStatusMessage(message: string) {
    this.statusMessage.set(message);
  }

  /**
   * Stores the latest cursor position in millimeters.
   */
  setCursorPosition(x: number, y: number) {
    this.cursorPosition.set({ x, y });
  }

  private extractDesignFileBase(fileName?: string | null): string | null {
    if (!fileName) {
      return null;
    }
    const trimmed = fileName.trim();
    if (!trimmed.length) {
      return null;
    }
    return trimmed.replace(/\.json$/i, '');
  }

  // Panel controls
  /**
   * Toggles the collapsed state of the west panel.
   */
  toggleWestPanel() {
    this.westCollapsed.update(v => !v);
  }

  /**
   * Toggles the collapsed state of the east panel.
   */
  toggleEastPanel() {
    this.eastCollapsed.update(v => !v);
  }

  /**
   * Sets the width of the west panel.
   */
  setWestWidth(width: number) {
    this.westWidth.set(width);
  }

  /**
   * Sets the width of the east panel.
   */
  setEastWidth(width: number) {
    this.eastWidth.set(width);
  }

  // Grid configuration
  /**
   * Updates the visible grid spacing in millimeters.
   */
  setVisualGridSize(size: number) {
    this.visualGridSize.set(Math.max(1, size));
  }

  /**
   * Updates the logical snap grid spacing in millimeters.
   */
  setLogicalGridSize(size: number) {
    this.logicalGridSize.set(Math.max(1, size));
  }

  /**
   * Sets the canvas zoom scale, enforcing a minimum value.
   */
  setCanvasScale(scale: number) {
    const normalized = Math.max(0.1, scale);
    if (this.canvasScale() !== normalized) {
      this.canvasScale.set(normalized);
    }
  }

  /**
   * Updates the visual grid color.
   */
  setVisualGridColor(color: string) {
    if (!color) return;
    this.visualGridColor.set(color);
  }

  /**
   * Switches the canvas zoom mode used for automatic scaling.
   */
  setCanvasZoomMode(mode: CanvasZoomMode) {
    this.canvasZoomMode.set(mode);
  }

  /**
   * Stores the monitor calibration scale factor.
   */
  setCalibrationScale(scale: number) {
    if (!Number.isFinite(scale) || scale <= 0) scale = 1;
    this.calibrationScale.set(scale);
  }

  /**
   * Adjusts page gutter settings and clamps elements to the new bounds.
   */
  setPageGutters(gutters: PageGutters) {
    const normalized = this.normalizePageGutters(gutters);
    this.pageGutters.set(normalized);
    const changed = this.clampElementsToMargins(normalized);
    if (changed) {
      this.addToHistory(this.elementsSignal());
    }
  }

  /**
   * Determines the normalized semantic role for a canvas element.
   */
  private resolveElementRole(element: CanvasElement | null | undefined): 'report-header' | 'report-body' | 'report-footer' {
    const role = element?.properties?.['elementRole'];
    return role === 'report-header' || role === 'report-footer' ? role : 'report-body';
  }

  /**
   * Validates that elements with matching roles are grouped contiguously.
   */
  private validateRoleAdjacency(elements: CanvasElement[]): void {
    if (elements.length === 0) {
      return;
    }

    const roles = new Set<string>();
    elements.forEach(el => roles.add(this.resolveElementRole(el)));

    if (roles.size <= 1) {
      return; // Nothing to validate when only one role exists
    }

    // Check for each possible intercalation pattern
    // Pattern: role1 + role2 + role1 (where role1 != role2)
    const roleList = Array.from(roles);

    for (let i = 0; i < roleList.length; i++) {
      for (let j = 0; j < roleList.length; j++) {
        if (i === j) continue; // Skip same role pairs

        const role1 = roleList[i];
        const role2 = roleList[j];

        // Query: *[data-role="role1"]+*[data-role="role2"]+*[data-role="role1"]
        const selector = `app-canvas-element[data-role="${role1}"]+app-canvas-element[data-role="${role2}"]+app-canvas-element[data-role="${role1}"]`;
        const intercalations = document.querySelectorAll(selector);

        if (intercalations.length > 0) {
          throw new Error(
            `Validation Error: Elements with role "${role1}" are not adjacent. ` +
            `Found "${role2}" element(s) intercalated between "${role1}" elements. ` +
            `Please group all ${role1} elements together before saving.`
          );
        }
      }
    }
  }

  /**
   * Serializes the current layout into an XHTML document string.
   */
  generateXhtmlDocument(title: string): string {
    const safeTitle = this.escapeHtml(title || 'Layout');
    const elements = [...this.elementsSignal()];

    // Validate role adjacency before saving
    this.validateRoleAdjacency(elements);

    // Group consecutive elements by role
    const groups: Array<{ role: string | null; elements: CanvasElement[] }> = [];
    let currentGroup: { role: string | null; elements: CanvasElement[] } | null = null;

    for (const el of elements) {
      const role = this.resolveElementRole(el);

      if (!currentGroup || currentGroup.role !== role) {
        // Start a new group
        currentGroup = { role, elements: [el] };
        groups.push(currentGroup);
      } else {
        // Add to current group
        currentGroup.elements.push(el);
      }
    }

    // Reorder main layout tables within each role group by ascending Y coordinate
    // Only affects relative ordering among tables; non-table elements retain their sequence.
    for (const group of groups) {
      group.elements = [...group.elements].sort((a, b) => {
        if (a.type === 'table' && b.type === 'table') {
          return a.y - b.y; // ascending top position
        }
        return 0; // preserve original order for mixed/non-table comparisons (stable sort)
      });
    }

    // Generate markup for each group
    let lastFlowBottom = 0;
    let firstFlow = true;

    const bodyContent = groups
      .map(group => {
        const groupMarkup: string[] = [];

        for (const el of group.elements) {
          if (el.type === 'table') {
            const topMargin = firstFlow ? el.y : Math.max(0, el.y - lastFlowBottom);
            const leftMargin = el.x;
            lastFlowBottom = el.y + el.height;
            firstFlow = false;
            const tableStyle = [
              `margin-top:${this.formatMillimeters(topMargin)}mm`,
              `margin-left:${this.formatMillimeters(leftMargin)}mm`,
              `width:${this.formatMillimeters(el.width)}mm`,
              `height:${this.formatMillimeters(el.height)}mm`
            ].join(';') + ';';

            const tableHtml = this.serializeTableElement(
              el,
              tableStyle,
              false // Don't include data-role on table, it will be on parent wrapper
            );
            groupMarkup.push(tableHtml);
          } else {
            const elementHtml = this.serializeElementToXhtml(el);
            if (elementHtml) {
              groupMarkup.push(elementHtml);
            }
          }
        }

        // Wrap group in appropriate parent tag based on role
        const groupContent = groupMarkup.join('\n      ');

        if (group.role === 'report-header') {
          return `    <header>\n      ${groupContent}\n    </header>`;
        } else if (group.role === 'report-footer') {
          return `    <footer>\n      ${groupContent}\n    </footer>`;
        } else if (group.role === 'report-body') {
          return `    <div class="report-body">\n      ${groupContent}\n    </div>`;
        } else {
          // No role or unrecognized role - output without wrapper
          return groupContent ? `    ${groupContent}` : '';
        }
      })
      .filter(Boolean)
      .join('\n');

    const margins = this.pageGutters();
    const commonStylesRaw = this.getA4CommonStyles();
    const commonStyles = commonStylesRaw
      .replace(/__TOP__/g, `${margins.top}mm`)
      .replace(/__RIGHT__/g, `${margins.right}mm`)
      .replace(/__BOTTOM__/g, `${margins.bottom}mm`)
      .replace(/__LEFT__/g, `${margins.left}mm`);

    let xhtml = `<html xmlns="http://www.w3.org/1999/xhtml">\n` +
      `  <head>\n` +
      `    <title>${safeTitle}</title>\n` +
      `    <style type="text/css" media="all">\n` +
      `${commonStyles}\n` +
      `    </style>\n` +
      `  </head>\n` +
      `  <body>\n${bodyContent}\n  </body>\n</html>`;
    // Ensure all <img> tags have explicit closing </img>
    xhtml = this.ensureImageTagsClosed(xhtml);
    // Add alt attributes to images for PDF/A compliance
    xhtml = this.addAltToImages(xhtml);
    // Add title attributes to links for PDF/A compliance
    xhtml = this.addTitleToLinks(xhtml);
    // Transform QR code <img> placeholders into <object type="application/qrcode"> for OpenHTMLtoPDF
    xhtml = this.transformQrImages(xhtml);
    return xhtml;
  }

  /**
   * Ensures XHTML compliance by converting bare <img> tags to paired tags.
   */
  private ensureImageTagsClosed(html: string): string {
    // Replace <img ...> that do not self-close or already have </img>
    return html.replace(/<img\b([^>]*)>(?!\s*<\/img>)/gi, '<img$1></img>');
  }

  /**
   * Adds alt attributes to <img> tags for PDF/A compliance.
   * If an alt attribute is missing, adds an empty one.
   */
  private addAltToImages(html: string): string {
    return html.replace(/<img\b([^>]*)>/gi, (match, attrs) => {
      if (/\balt\s*=/i.test(attrs)) {
        return match;
      }
      return `<img${attrs} alt="image">`;
    });
  }

  /**
   * Adds title attributes to <a> tags for PDF/A compliance.
   * Uses the link text or href as the title if not already present.
   */
  private addTitleToLinks(html: string): string {
    return html.replace(/<a\b([^>]*)>(.*?)<\/a>/gi, (match, attrs, content) => {
      if (/\btitle\s*=/i.test(attrs)) {
        return match;
      }
      const hrefMatch = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs);
      const href = hrefMatch ? hrefMatch[1] : '';
      const textContent = content.replace(/<[^>]+>/g, '').trim();
      const titleValue = textContent || href || 'Link';
      const escapedTitle = this.escapeHtml(titleValue);
      return `<a${attrs} title="${escapedTitle}">${content}</a>`;
    });
  }

  /**
   * Converts QR code <img data-type="application/qrcode" ...></img> to <object type="application/qrcode" ... /> markup.
   * We map data-data => data, data-size => width/height, data-ec => data-ec-level, data-margin => data-margin.
   */
  private transformQrImages(html: string): string {
    // Convert QR <img> placeholders (size now stored in mm) to <object> with pixel dimensions.
    return html.replace(/<img([^>]*\bdata-type="application\/qrcode"[^>]*)><\/img>/gi, (match, attrs) => {
      const dataAttr = /\bdata-data="([^"]*)"/.exec(attrs);
      const sizeAttr = /\bdata-size="([^"]*)"/.exec(attrs); // millimeter value
      const ecAttr = /\bdata-ec="([^"]*)"/.exec(attrs);
      const marginAttr = /\bdata-margin="([^"]*)"/.exec(attrs);
      const dataVal = dataAttr ? this.escapeHtml(dataAttr[1]) : '';
      const sizeMmStr = sizeAttr ? sizeAttr[1] : '20';
      const sizeMm = parseFloat(sizeMmStr);
      const ecVal = ecAttr ? ecAttr[1] : 'M';
      const marginVal = marginAttr ? marginAttr[1] : '2';
      // Use dedicated export px/mm factor (empirically derived) instead of trueSizeScale.
      const overrideFactor = (() => { try { const v = localStorage.getItem('qrExportPxPerMm'); return v ? parseFloat(v) : NaN; } catch { return NaN; } })();
      const pxPerMm = Number.isFinite(overrideFactor) && overrideFactor > 0 ? overrideFactor : 4.44; // empirical default=4.63
      const sizePx = Math.max(1, Math.round(sizeMm * pxPerMm));
      return `<object type="application/qrcode" data="${dataVal}" width="${sizePx}" height="${sizePx}" data-ec-level="${ecVal}" data-margin="${marginVal}" />`;
    });
  }

  private a4StylesCache: string | null = null; // Set by preload provider
  /**
   * Caches the common A4 stylesheet shared across exports.
   */
  setA4CommonStyles(css: string): void {
    if (css && css.trim().length) {
      this.a4StylesCache = css;
    }
  }

  /**
   * Retrieves the cached A4 stylesheet, falling back to defaults.
   */
  private getA4CommonStyles(): string {
    if (this.a4StylesCache) {
      return this.a4StylesCache;
    }
    // Fallback minimal if not preloaded by startup APP_INITIALIZER
    this.a4StylesCache = this.a4StylesCache || `/*** Page-level definitions ***/\n@page {\n  size: A4 portrait;\n  /* MARGINS: __TOP__ __RIGHT__ __BOTTOM__ __LEFT__ */\n  margin: __TOP__ __RIGHT__ __BOTTOM__ __LEFT__;\n}`;
    return this.a4StylesCache;
  }

  /**
   * Converts a non-table canvas element into XHTML markup.
   */
  private serializeElementToXhtml(element: CanvasElement): string {
    const style = `left:${element.x}mm;top:${element.y}mm;width:${element.width}mm;height:${element.height}mm;`;

    switch (element.type) {
      case 'table':
        return this.serializeTableElement(element, style);
      case 'heading':
        return `<h1 class="element" style="${style}">${this.formatContent(element.content)}</h1>`;
      case 'paragraph':
        return `<p class="element" style="${style}">${this.formatContent(element.content)}</p>`;
      case 'text':
        return `<div class="element" style="${style}">${this.formatContent(element.content)}</div>`;
      case 'div':
        return `<div class="element" style="${style}">${this.formatContent(element.content)}</div>`;
      default:
        return `<div class="element" style="${style}">${this.formatContent(element.content)}</div>`;
    }
  }

  /**
   * Renders a table element into XHTML, optionally including role data attributes.
   */
  private serializeTableElement(element: CanvasElement, style: string, includeDataRole: boolean = true): string {
    const rowSizes = getTableRowSizes(element);
    const colSizes = getTableColSizes(element);

    const effectiveRowSizes = rowSizes.length ? rowSizes : [1];
    const effectiveColSizes = colSizes.length ? colSizes : [1];

    // Ensure exported tables always include explicit height in inline styles.
    let normalizedStyle = (style ?? '').trim();
    if (normalizedStyle.length && !normalizedStyle.endsWith(';')) {
      normalizedStyle += ';';
    }
    if (!/(^|;)\s*height\s*:/i.test(normalizedStyle)) {
      normalizedStyle += `height:${this.formatMillimeters(element.height)}mm;`;
    }
    style = normalizedStyle;

    // Extract id and data-role attributes
    const elementId = element.properties?.['elementId'] || '';
    const elementRole = this.resolveElementRole(element);
    const idAttr = elementId ? ` id="${this.escapeHtml(elementId)}"` : '';
    // Only include data-role if requested (not when wrapped in parent tag)
    const roleAttr = includeDataRole ? ` data-role="${this.escapeHtml(elementRole)}"` : '';

    const subTablesMap = element.properties?.['tableCellSubTables'] as Record<string, any> | undefined;

    // Repeat binding data for table/tbody (level 0 only)
    const repeatMap = element.properties?.['tableRepeatBindings'] as Record<string, any> | undefined;
    const tableRepeat = repeatMap ? Object.values(repeatMap).find(r => r.repeatedElement === 'table' && r.level === 0) : undefined;
    const tbodyRepeat = repeatMap ? Object.values(repeatMap).find(r => r.repeatedElement === 'tbody' && r.level === 0) : undefined;

    const borderConfigMap = element.properties?.['tableCellBorders'] as Record<string, TableCellBorderConfig> | undefined;
    const borderWidthMap = element.properties?.['tableCellBorderWidth'] as Record<string, number> | undefined;
    const borderStyleMap = element.properties?.['tableCellBorderStyle'] as Record<string, string> | undefined;
    const borderColorMap = element.properties?.['tableCellBorderColor'] as Record<string, string> | undefined;

    const rowsMarkup = effectiveRowSizes
      .map((rowRatio, rowIndex) => {
        const rowHeightMm = element.height * rowRatio;
        const rowHeightStr = this.formatMillimeters(rowHeightMm);

        const cells = effectiveColSizes
          .map((colRatio, colIndex) => {
            const colWidthMm = element.width * colRatio;
            const colWidthStr = this.formatMillimeters(colWidthMm);
            const key = `${rowIndex}_${colIndex}`; // use explicit indices to avoid indexOf duplication

            // Check if this cell has a sub-table
            const subTable = subTablesMap?.[key];
            let cellContent: string;

            if (subTable) {
              // Serialize the sub-table recursively
              cellContent = this.serializeSubTable(subTable, colWidthMm, rowHeightMm);
            } else {
              // Use regular cell content
              const contents = (element.properties?.['tableCellContents'] as Record<string, string> | undefined) || {};
              const raw = contents[key];
              cellContent = raw && raw.length ? raw.replace(/&nbsp;/g, '&#160;') : '&#160;'; // numeric nbsp entity
            }

            const padMap = element.properties?.['tableCellPadding'] as Record<string, number[]> | undefined;
            const paddings = padMap?.[key];
            const [pt, pr, pb, pl] = Array.isArray(paddings) && paddings.length === 4 ? paddings : [0,0,0,0];
            const hAlignMap = element.properties?.['tableCellHAlign'] as Record<string, string> | undefined;
            const vAlignMap = element.properties?.['tableCellVAlign'] as Record<string, string> | undefined;
            const hAlign = (hAlignMap?.[key] === 'center' || hAlignMap?.[key] === 'right') ? hAlignMap?.[key] : 'left';
            const vAlignRaw = (vAlignMap?.[key] === 'middle' || vAlignMap?.[key] === 'bottom') ? vAlignMap?.[key] : 'top';
            const vAlign = vAlignRaw === 'middle' ? 'middle' : vAlignRaw; // 'top' | 'middle' | 'bottom'
            const borderConfig = borderConfigMap?.[key];
            const legacyBorder = this.legacyBorderSpecFromMaps(borderWidthMap, borderStyleMap, borderColorMap, key);
            const borderTopCss = this.borderSpecToCss(this.composeBorderSpec(borderConfig, legacyBorder, 'top'));
            const borderRightCss = this.borderSpecToCss(this.composeBorderSpec(borderConfig, legacyBorder, 'right'));
            const borderBottomCss = this.borderSpecToCss(this.composeBorderSpec(borderConfig, legacyBorder, 'bottom'));
            const borderLeftCss = this.borderSpecToCss(this.composeBorderSpec(borderConfig, legacyBorder, 'left'));
            const borderCss = `border-top:${borderTopCss};border-right:${borderRightCss};border-bottom:${borderBottomCss};border-left:${borderLeftCss};`;
            const fontStyleMap = element.properties?.['tableCellFontStyle'] as Record<string, string> | undefined;
            const fontWeightMap = element.properties?.['tableCellFontWeight'] as Record<string, string> | undefined;
            const fontSizeMap = element.properties?.['tableCellFontSize'] as Record<string, number> | undefined;
            const lineHeightMap = element.properties?.['tableCellLineHeight'] as Record<string, number> | undefined;
            const fontFamilyMap = element.properties?.['tableCellFontFamily'] as Record<string, string> | undefined;
            const textDecorationMap = element.properties?.['tableCellTextDecoration'] as Record<string, string> | undefined;
            const rawFontSize = fontSizeMap?.[key];
            const rawLineHeight = lineHeightMap?.[key];
            const fontStyle = fontStyleMap?.[key] || 'normal';
            const fontWeight = fontWeightMap?.[key] || 'normal';
            const fontSize = Number.isFinite(rawFontSize) ? rawFontSize! : 9;
            const lineHeight = Number.isFinite(rawLineHeight) ? rawLineHeight! : 1;
            const fontFamilyRaw = fontFamilyMap?.[key];
            const fontFamily = fontFamilyRaw && fontFamilyRaw.length ? fontFamilyRaw : 'Roboto, sans-serif';
            const textDecoration = textDecorationMap?.[key] || 'none';
            const fontCss = `font-style:${fontStyle};font-weight:${fontWeight};font-size:${fontSize}pt;line-height:${lineHeight};font-family:${fontFamily};text-decoration:${textDecoration};`;
            return `        <td style="width:${colWidthStr}mm;height:${rowHeightStr}mm;padding:${pt}mm ${pr}mm ${pb}mm ${pl}mm;text-align:${hAlign};vertical-align:${vAlign};${borderCss}${fontCss}">${cellContent}</td>`;
          })
          .join('\n');

        const rowRepeat = repeatMap ? repeatMap[`${rowIndex}_0`] && repeatMap[`${rowIndex}_0`].repeatedElement === 'tr' && repeatMap[`${rowIndex}_0`].level === 0 ? repeatMap[`${rowIndex}_0`] : undefined : undefined;
        const repeatAttr = rowRepeat ? ` data-repeat-over=\"${this.escapeHtml(rowRepeat.binding)}\" data-repeat-var=\"${this.escapeHtml(rowRepeat.iteratorName)}\"` : '';
        return `      <tr${repeatAttr} style=\"height:${rowHeightStr}mm;\">\n${cells}\n      </tr>`;
      })
      .join('\n');

    const tableRepeatAttr = tableRepeat ? ` data-repeat-over=\"${this.escapeHtml(tableRepeat.binding)}\" data-repeat-var=\"${this.escapeHtml(tableRepeat.iteratorName)}\"` : '';
    const tbodyRepeatAttr = tbodyRepeat ? ` data-repeat-over=\"${this.escapeHtml(tbodyRepeat.binding)}\" data-repeat-var=\"${this.escapeHtml(tbodyRepeat.iteratorName)}\"` : '';

    return `<table${idAttr}${roleAttr}${tableRepeatAttr} class=\"element element-table\" style=\"${style}\">\n` +
      `    <tbody${tbodyRepeatAttr}>\n${rowsMarkup}\n    </tbody>\n  </table>`;
  }

  /**
   * Serializes a nested sub-table structure into XHTML.
   */
  private serializeSubTable(subTable: any, parentWidthMm: number, parentHeightMm: number): string {
    const rows = subTable.rows || 1;
    const cols = subTable.cols || 1;
    const rowSizes = subTable.rowSizes || Array(rows).fill(1 / rows);
    const colSizes = subTable.colSizes || Array(cols).fill(1 / cols);

    const cellBorderConfigMap = subTable.cellBorders as Record<string, TableCellBorderConfig> | undefined;
    const cellBorderWidthMap = subTable.cellBorderWidth as Record<string, number> | undefined;
    const cellBorderStyleMap = subTable.cellBorderStyle as Record<string, string> | undefined;
    const cellBorderColorMap = subTable.cellBorderColor as Record<string, string> | undefined;

    // Repeat binding data for this sub-table
    const repeatMap = subTable.repeatBindings as Record<string, any> | undefined;
    const tableRepeat = repeatMap ? Object.values(repeatMap).find(r => r.repeatedElement === 'table') : undefined;
    const tbodyRepeat = repeatMap ? Object.values(repeatMap).find(r => r.repeatedElement === 'tbody') : undefined;

    const rowsMarkup = rowSizes
      .map((rowRatio: number, rowIndex: number) => {
        const rowHeightMm = parentHeightMm * rowRatio;
        const rowHeightStr = this.formatMillimeters(rowHeightMm);

        const cells = colSizes
          .map((colRatio: number, colIndex: number) => {
            const colWidthMm = parentWidthMm * colRatio;
            const colWidthStr = this.formatMillimeters(colWidthMm);
            const key = `${rowIndex}_${colIndex}`;

            // Check if this sub-table cell has a nested sub-table
            const nestedSubTable = subTable.cellSubTables?.[key];
            let cellContent: string;

            if (nestedSubTable) {
              // Recursively serialize nested sub-table
              cellContent = this.serializeSubTable(nestedSubTable, colWidthMm, rowHeightMm);
            } else {
              // Use sub-table cell content
              const raw = subTable.cellContents?.[key];
              cellContent = raw && raw.length ? raw.replace(/&nbsp;/g, '&#160;') : '&#160;'; // numeric nbsp entity
            }

            const padding = subTable.cellPadding?.[key] || [0, 0, 0, 0];
            const [pt, pr, pb, pl] = padding;
            const hAlign = subTable.cellHAlign?.[key] || 'left';
            const vAlignRaw = subTable.cellVAlign?.[key] || 'top';
            const vAlign = vAlignRaw === 'middle' ? 'middle' : vAlignRaw;
            const cellBorderConfig = cellBorderConfigMap?.[key];
            const nestedLegacy = this.legacyBorderSpecFromMaps(cellBorderWidthMap, cellBorderStyleMap, cellBorderColorMap, key);
            const cellBorderTopCss = this.borderSpecToCss(this.composeBorderSpec(cellBorderConfig, nestedLegacy, 'top'));
            const cellBorderRightCss = this.borderSpecToCss(this.composeBorderSpec(cellBorderConfig, nestedLegacy, 'right'));
            const cellBorderBottomCss = this.borderSpecToCss(this.composeBorderSpec(cellBorderConfig, nestedLegacy, 'bottom'));
            const cellBorderLeftCss = this.borderSpecToCss(this.composeBorderSpec(cellBorderConfig, nestedLegacy, 'left'));
            const borderCss = `border-top:${cellBorderTopCss};border-right:${cellBorderRightCss};border-bottom:${cellBorderBottomCss};border-left:${cellBorderLeftCss};`;
            const rawSubFontSize = subTable.cellFontSize?.[key];
            const rawSubLineHeight = subTable.cellLineHeight?.[key];
            const fontStyle = subTable.cellFontStyle?.[key] || 'normal';
            const fontWeight = subTable.cellFontWeight?.[key] || 'normal';
            const fontSize = Number.isFinite(rawSubFontSize) ? rawSubFontSize! : 9;
            const lineHeight = Number.isFinite(rawSubLineHeight) ? rawSubLineHeight! : 1;
            const fontFamilyRaw = subTable.cellFontFamily?.[key];
            const fontFamily = fontFamilyRaw && fontFamilyRaw.length ? fontFamilyRaw : 'Roboto, sans-serif';
            const textDecoration = subTable.cellTextDecoration?.[key] || 'none';
            const fontCss = `font-style:${fontStyle};font-weight:${fontWeight};font-size:${fontSize}pt;line-height:${lineHeight};font-family:${fontFamily};text-decoration:${textDecoration};`;

            return `          <td style="width:${colWidthStr}mm;height:${rowHeightStr}mm;padding:${pt}mm ${pr}mm ${pb}mm ${pl}mm;text-align:${hAlign};vertical-align:${vAlign};${borderCss}${fontCss}">${cellContent}</td>`;
          })
          .join('\n');

        // Check for row-level repeat binding
        const rowRepeat = repeatMap ? repeatMap['0_0'] && repeatMap['0_0'].repeatedElement === 'tr' ? repeatMap['0_0'] : undefined : undefined;
        const repeatAttr = rowRepeat ? ` data-repeat-over="${this.escapeHtml(rowRepeat.binding)}" data-repeat-var="${this.escapeHtml(rowRepeat.iteratorName)}"` : '';
        return `        <tr${repeatAttr} style="height:${rowHeightStr}mm;">\n${cells}\n        </tr>`;
      })
      .join('\n');

    const tableRepeatAttr = tableRepeat ? ` data-repeat-over="${this.escapeHtml(tableRepeat.binding)}" data-repeat-var="${this.escapeHtml(tableRepeat.iteratorName)}"` : '';
    const tbodyRepeatAttr = tbodyRepeat ? ` data-repeat-over="${this.escapeHtml(tbodyRepeat.binding)}" data-repeat-var="${this.escapeHtml(tbodyRepeat.iteratorName)}"` : '';

    return `<table${tableRepeatAttr} style="width:100%;height:100%;border-collapse:collapse;">\n      <tbody${tbodyRepeatAttr}>\n${rowsMarkup}\n      </tbody>\n    </table>`;
  }

  /**
   * Escapes and normalizes cell content for XHTML output.
   */
  private formatContent(content: string | undefined | null): string {
    const escaped = this.escapeHtml(content ?? '');
    const withBreaks = escaped.replace(/\r?\n/g, '<br />');
    const normalized = withBreaks.replace(/&nbsp;/g, '&#160;');
    return normalized.length ? normalized : '&#160;'; // Use numeric nbsp entity for XHTML compliance
  }

  /**
   * Retrieves table dimensions from properties, applying fallbacks.
   */
  private getTableDimension(element: CanvasElement, property: 'rows' | 'cols'): number {
    if (property === 'rows') {
      const sizes = element.properties?.['rowSizes'];
      if (Array.isArray(sizes) && sizes.length > 0) {
        return sizes.length;
      }
    } else if (property === 'cols') {
      const sizes = element.properties?.['colSizes'];
      if (Array.isArray(sizes) && sizes.length > 0) {
        return sizes.length;
      }
    }

    const value = element.properties?.[property];
    const parsed = typeof value === 'number' ? value : parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }

  /**
   * Escapes special characters for safe embedding in XHTML.
   */
  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Formats millimeter measurements with limited precision for CSS output.
   */
  private formatMillimeters(value: number): string {
    if (!Number.isFinite(value)) {
      return '0';
    }
    return (Math.round(value * 1000) / 1000).toString();
  }

  /**
   * Clamps gutter values to ensure the content area remains positive.
   */
  private normalizePageGutters(gutters: PageGutters): PageGutters {
    const minContent = Math.max(1, Math.round(this.logicalGridSize()));

    const clampPair = (total: number, start: number, end: number) => {
      let startValue = Math.max(0, start);
      let endValue = Math.max(0, end);
      const maxSum = Math.max(0, total - minContent);

      if (startValue + endValue > maxSum) {
        let excess = startValue + endValue - maxSum;
        if (endValue >= excess) {
          endValue -= excess;
        } else {
          excess -= endValue;
          endValue = 0;
          startValue = Math.max(0, startValue - excess);
        }
      }

      return { start: startValue, end: endValue };
    };

    const horizontal = clampPair(A4_WIDTH_MM, gutters.left, gutters.right);
    const vertical = clampPair(A4_HEIGHT_MM, gutters.top, gutters.bottom);

    return {
      top: vertical.start,
      right: horizontal.end,
      bottom: vertical.end,
      left: horizontal.start
    };
  }

  /**
   * Clamps every element to the allowable page area, returning whether any changes occurred.
   */
  private clampElementsToMargins(gutters: PageGutters): boolean {
    const contentWidth = Math.max(1, A4_WIDTH_MM - gutters.left - gutters.right);
    const contentHeight = Math.max(1, A4_HEIGHT_MM - gutters.top - gutters.bottom);

    const currentElements = this.elementsSignal();
    if (!currentElements.length) return false;

    let changed = false;
    const adjusted = currentElements.map(el => {
      const clamped = this.clampElementToMargins(el, gutters, contentWidth, contentHeight);
      if (clamped !== el) {
        changed = true;
      }
      return clamped;
    });

    if (changed) {
      this.elementsSignal.set(adjusted);
    }
    return changed;
  }

  /**
   * Restricts a single element's bounds to the printable region.
   */
  private clampElementToMargins(
    element: CanvasElement,
    gutters: PageGutters,
    precomputedWidth?: number,
    precomputedHeight?: number
  ): CanvasElement {
    const contentWidth =
      precomputedWidth ?? Math.max(1, A4_WIDTH_MM - gutters.left - gutters.right);
    const contentHeight =
      precomputedHeight ?? Math.max(1, A4_HEIGHT_MM - gutters.top - gutters.bottom);

    const width = Math.max(1, Math.min(element.width, contentWidth));
    const height = Math.max(1, Math.min(element.height, contentHeight));

    const minX = gutters.left;
    const minY = gutters.top;
    const maxX = gutters.left + contentWidth - width;
    const maxY = gutters.top + contentHeight - height;

    const x = this.snapValueWithinBounds(element.x, minX, maxX);
    const y = this.snapValueWithinBounds(element.y, minY, maxY);

    let propertiesChanged = false;
    let nextProperties = element.properties ?? {};

    if (element.type === 'table') {
      const rows = this.getTableDimension(element, 'rows');
      const cols = this.getTableDimension(element, 'cols');

      if (nextProperties['rows'] !== rows || nextProperties['cols'] !== cols) {
        nextProperties = { ...nextProperties, rows, cols };
        propertiesChanged = true;
      }
    }

    if (
      x !== element.x ||
      y !== element.y ||
      width !== element.width ||
      height !== element.height ||
      propertiesChanged
    ) {
      return {
        ...element,
        x,
        y,
        width,
        height,
        ...(propertiesChanged ? { properties: nextProperties } : {})
      };
    }
    return element;
  }

  /**
   * Snaps a numeric value to the grid while staying within provided bounds.
   */
  private snapValueWithinBounds(value: number, min: number, max: number): number {
    if (max <= min) {
      return min;
    }

    const step = this.logicalGridSize();
    if (step <= 0) {
      return Math.min(Math.max(value, min), max);
    }

    const offset = value - min;
    const rawSteps = Math.round(offset / step);
    const maxSteps = Math.floor((max - min) / step);
    const clampedSteps = Math.min(Math.max(rawSteps, 0), maxSteps);
    return min + clampedSteps * step;
  }

  /**
   * Parse XHTML document and convert it back to a ReportLayout
   */
  /**
   * Parses an exported XHTML document back into designer layout data.
   */
  parseXhtmlToLayout(xhtmlContent: string, filename: string): ReportLayout {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xhtmlContent, 'application/xhtml+xml');

    // Check for parsing errors
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      throw new Error('Invalid XHTML: ' + parserError.textContent);
    }

    const elements: CanvasElement[] = [];
    let elementIdCounter = 1;

    // Extract body elements
    const body = doc.querySelector('body');
    if (!body) {
      throw new Error('No body element found in XHTML');
    }

    // Parse all elements (tables, divs, paragraphs, headings, etc.)
    const bodyElements = Array.from(body.children) as HTMLElement[];

    for (const elem of bodyElements) {
      try {
        const tagName = elem.tagName.toLowerCase();

        // Handle wrapper tags: <header>, <footer>, <div class="report-body">
        if (tagName === 'header') {
          // Parse all table children and assign them 'report-header' role
          const tables = Array.from(elem.querySelectorAll(':scope > table')) as HTMLElement[];
          for (const table of tables) {
            const parsed = this.parseXhtmlTable(table, elementIdCounter++, 'report-header');
            if (parsed) {
              elements.push(parsed);
            }
          }
        } else if (tagName === 'footer') {
          // Parse all table children and assign them 'report-footer' role
          const tables = Array.from(elem.querySelectorAll(':scope > table')) as HTMLElement[];
          for (const table of tables) {
            const parsed = this.parseXhtmlTable(table, elementIdCounter++, 'report-footer');
            if (parsed) {
              elements.push(parsed);
            }
          }
        } else if (tagName === 'div' && elem.classList.contains('report-body')) {
          // Parse all table children and assign them 'report-body' role
          const tables = Array.from(elem.querySelectorAll(':scope > table')) as HTMLElement[];
          for (const table of tables) {
            const parsed = this.parseXhtmlTable(table, elementIdCounter++, 'report-body');
            if (parsed) {
              elements.push(parsed);
            }
          }
        } else {
          // Regular element - parse normally
          const parsed = this.parseXhtmlElement(elem, elementIdCounter++);
          if (parsed) {
            elements.push(parsed);
          }
        }
      } catch (err) {
        console.warn('Failed to parse element:', elem, err);
      }
    }

    // Extract title from head
    const title = doc.querySelector('title')?.textContent || filename.replace(/\.(x?html)$/i, '');

    return {
      name: title,
      elements,
      gridSize: 10,
      canvasWidth: 210,
      canvasHeight: 297
    };
  }

  /**
   * Converts a DOM element into the corresponding canvas element representation.
   */
  private parseXhtmlElement(elem: HTMLElement, idCounter: number): CanvasElement | null {
    const tagName = elem.tagName.toLowerCase();

    // Parse table elements
    if (tagName === 'table') {
      return this.parseXhtmlTable(elem, idCounter);
    }

    // Parse other elements (div, p, h1, etc.)
    const style = elem.getAttribute('style') || '';
    const position = this.parseStylePosition(style);

    if (!position) {
      return null; // Skip elements without position/size
    }

    let type: 'paragraph' | 'heading' | 'text' | 'div' = 'div';
    if (tagName === 'p') type = 'paragraph';
    else if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3') type = 'heading';
    else if (tagName === 'div') type = elem.classList.contains('element') ? 'text' : 'div';

    return {
      id: `element-${idCounter}`,
      type,
      x: position.x,
      y: position.y,
      width: position.width,
      height: position.height,
      content: elem.innerHTML || '',
      properties: {}
    };
  }

  /**
   * Reconstructs a canvas table element from an XHTML table node.
   */
  private parseXhtmlTable(table: HTMLElement, idCounter: number, overrideRole?: string): CanvasElement | null {
    const style = table.getAttribute('style') || '';
    const position = this.parseStylePosition(style, true);

    if (!position) {
      return null;
    }

    // Extract id and data-role attributes
    const elementId = table.getAttribute('id') || '';
    // Use override role if provided (from wrapper tag), otherwise use data-role attribute
    const rawRole = overrideRole || table.getAttribute('data-role') || '';
    const elementRole = rawRole === 'report-header' || rawRole === 'report-footer' ? rawRole : 'report-body';

    // Parse table structure
    const tbody = table.querySelector('tbody');
    if (!tbody) {
      return null;
    }

    const rows = Array.from(tbody.querySelectorAll(':scope > tr')) as HTMLTableRowElement[];
    const numRows = rows.length;

    if (numRows === 0) {
      return null;
    }

    // Get number of columns from first row
    const firstRowCells = Array.from(rows[0].querySelectorAll('td')) as HTMLTableCellElement[];
    const numCols = firstRowCells.length;

    if (numCols === 0) {
      return null;
    }

    // Parse cell contents and properties
    const tableCellContents: Record<string, string> = {};
    const tableCellPadding: Record<string, number[]> = {};
    const tableCellHAlign: Record<string, string> = {};
    const tableCellVAlign: Record<string, string> = {};
    const tableCellBorderWidth: Record<string, number> = {};
    const tableCellBorderStyle: Record<string, string> = {};
    const tableCellBorderColor: Record<string, string> = {};
    const tableCellBorders: Record<string, TableCellBorderConfig> = {};
    const tableCellFontStyle: Record<string, string> = {};
    const tableCellFontWeight: Record<string, string> = {};
    const tableCellFontSize: Record<string, number> = {};
    const tableCellLineHeight: Record<string, number> = {};
    const tableCellFontFamily: Record<string, string> = {};
    const tableCellTextDecoration: Record<string, string> = {};
    const tableCellSubTables: Record<string, any> = {};

    // Parse row and column sizes
    const rowSizes: number[] = [];
    const colSizes: number[] = [];

    // Calculate row sizes
    const totalHeight = position.height;
    for (const row of rows) {
      const heightStr = row.style.height || row.getAttribute('style')?.match(/height:\s*([0-9.]+)mm/)?.[1];
      if (heightStr) {
        rowSizes.push(parseFloat(heightStr) / totalHeight);
      }
    }

    // Calculate column sizes from first row
    const totalWidth = position.width;
    for (const cell of firstRowCells) {
      const widthStr = cell.style.width || cell.getAttribute('style')?.match(/width:\s*([0-9.]+)mm/)?.[1];
      if (widthStr) {
        colSizes.push(parseFloat(widthStr) / totalWidth);
      }
    }

    // Parse each cell
    rows.forEach((row, rowIndex) => {
      const cells = Array.from(row.querySelectorAll(':scope > td')) as HTMLTableCellElement[];
      cells.forEach((cell, colIndex) => {
        const key = `${rowIndex}_${colIndex}`;

        // Check if cell contains a nested table
        const nestedTable = cell.querySelector(':scope > table') as HTMLElement | null;

        if (nestedTable) {
          // Parse the nested table as a sub-table
          const subTable = this.parseNestedSubTable(nestedTable, position.width * colSizes[colIndex], position.height * rowSizes[rowIndex], 1);
          if (subTable) {
            tableCellSubTables[key] = subTable;
            tableCellContents[key] = ''; // Clear content as it's now in sub-table
          }
        } else {
          // Content
          tableCellContents[key] = cell.innerHTML;
        }

        // Padding
        const paddingTop = this.parseStyleValue(cell.style.paddingTop || '0');
        const paddingRight = this.parseStyleValue(cell.style.paddingRight || '0');
        const paddingBottom = this.parseStyleValue(cell.style.paddingBottom || '0');
        const paddingLeft = this.parseStyleValue(cell.style.paddingLeft || '0');
        tableCellPadding[key] = [paddingTop, paddingRight, paddingBottom, paddingLeft];

        // Alignment
        tableCellHAlign[key] = cell.style.textAlign || 'left';
        tableCellVAlign[key] = cell.style.verticalAlign || 'top';

        // Border - parse from style attribute
        const cellStyle = cell.getAttribute('style') || '';
        const border = cell.style.border || '';
        const borderMatch = border.match(/([0-9.]+)px\s+(\w+)\s+(#[0-9a-f]{6}|#[0-9a-f]{3}|rgb\([^)]+\)|\w+)/i);
        if (borderMatch) {
          tableCellBorderWidth[key] = parseFloat(borderMatch[1]);
          tableCellBorderStyle[key] = borderMatch[2];
          tableCellBorderColor[key] = borderMatch[3];
        } else {
          // Try parsing from style attribute directly
          const borderWidthMatch = cellStyle.match(/border:\s*([0-9.]+)px/);
          const borderStyleMatch = cellStyle.match(/border:\s*[0-9.]+px\s+(\w+)/);
          const borderColorMatch = cellStyle.match(/border:\s*[0-9.]+px\s+\w+\s+(#[0-9a-f]{6}|#[0-9a-f]{3}|rgb\([^)]+\)|\w+)/i);
          if (borderWidthMatch) tableCellBorderWidth[key] = parseFloat(borderWidthMatch[1]);
          if (borderStyleMatch) tableCellBorderStyle[key] = borderStyleMatch[1];
          if (borderColorMatch) tableCellBorderColor[key] = borderColorMatch[1];
        }

        const borderWidthValue = tableCellBorderWidth[key];
        const borderStyleValue = tableCellBorderStyle[key];
        const borderColorValue = tableCellBorderColor[key];
        if (borderWidthValue !== undefined || borderStyleValue !== undefined || borderColorValue !== undefined) {
          tableCellBorders[key] = {
            all: {
              width: borderWidthValue ?? 0,
              style: borderStyleValue ?? 'solid',
              color: borderColorValue ?? '#000000'
            }
          };
        }

        // Font properties from <td> element's inline style (generic cell properties)
        // Parse from both cell.style and raw attribute to handle all formats
        let fontFamily = cell.style.fontFamily;
        if (!fontFamily) {
          // Try parsing from style attribute directly
          const fontFamilyMatch = cellStyle.match(/font-family:\s*([^;]+)/i);
          if (fontFamilyMatch) {
            fontFamily = fontFamilyMatch[1].trim();
          }
        }
        if (fontFamily) {
          // Normalize quotes: convert double quotes to single quotes to match dropdown options
          // Browser may convert &quot; to " or keep ' as-is
          fontFamily = fontFamily.replace(/"/g, "'").trim();
          tableCellFontFamily[key] = fontFamily;
        }

        if (cell.style.fontSize) {
          tableCellFontSize[key] = this.parseStyleValue(cell.style.fontSize);
        } else {
          const fontSizeMatch = cellStyle.match(/font-size:\s*([0-9.]+)pt/i);
          if (fontSizeMatch) tableCellFontSize[key] = parseFloat(fontSizeMatch[1]);
        }

        if (cell.style.fontWeight) {
          tableCellFontWeight[key] = cell.style.fontWeight;
        } else {
          const fontWeightMatch = cellStyle.match(/font-weight:\s*(\w+)/i);
          if (fontWeightMatch) tableCellFontWeight[key] = fontWeightMatch[1];
        }

        if (cell.style.fontStyle) {
          tableCellFontStyle[key] = cell.style.fontStyle;
        } else {
          const fontStyleMatch = cellStyle.match(/font-style:\s*(\w+)/i);
          if (fontStyleMatch) tableCellFontStyle[key] = fontStyleMatch[1];
        }

        if (cell.style.lineHeight) {
          tableCellLineHeight[key] = parseFloat(cell.style.lineHeight) || 1;
        } else {
          const lineHeightMatch = cellStyle.match(/line-height:\s*([0-9.]+)/i);
          if (lineHeightMatch) tableCellLineHeight[key] = parseFloat(lineHeightMatch[1]);
        }

        if (cell.style.textDecoration) {
          tableCellTextDecoration[key] = cell.style.textDecoration;
        } else {
          const textDecorationMatch = cellStyle.match(/text-decoration:\s*([^;]+)/i);
          if (textDecorationMatch) tableCellTextDecoration[key] = textDecorationMatch[1].trim();
        }

        // Override with any inline styles from Quill content (these take precedence)
        const styledElements = cell.querySelectorAll('[style]') as NodeListOf<HTMLElement>;
        styledElements.forEach(elem => {
          // Only extract overriding styles from direct content, not from wrapper divs
          if (elem !== cell && elem.style) {
            // These are Quill-generated inline styles that should override cell-level styles
            // We keep them in the content HTML, they will be handled by DomSanitizer
            // No need to extract them to cell properties
          }
        });
      });
    });

    return {
      id: `element-${idCounter}`,
      type: 'table',
      x: position.x,
      y: position.y,
      width: position.width,
      height: position.height,
      content: '',
      properties: {
        rows: numRows,
        cols: numCols,
        rowSizes,
        colSizes,
        tableCellContents,
        tableCellPadding,
        tableCellHAlign,
        tableCellVAlign,
        tableCellBorderWidth,
        tableCellBorderStyle,
        tableCellBorderColor,
        ...(Object.keys(tableCellBorders).length > 0 ? { tableCellBorders } : {}),
        tableCellFontStyle,
        tableCellFontWeight,
        tableCellFontSize,
        tableCellLineHeight,
        tableCellFontFamily,
        tableCellTextDecoration,
        ...(elementId ? { elementId } : {}),
        ...(elementRole ? { elementRole } : {}),
        ...(Object.keys(tableCellSubTables).length > 0 ? { tableCellSubTables } : {})
      }
    };
  }

  /**
   * Recursively parses nested tables found within table cells.
   */
  private parseNestedSubTable(table: HTMLElement, parentWidthMm: number, parentHeightMm: number, level: number): any | null {
    const tbody = table.querySelector('tbody');
    if (!tbody) {
      return null;
    }

    const rows = Array.from(tbody.querySelectorAll(':scope > tr')) as HTMLTableRowElement[];
    const numRows = rows.length;
    if (numRows === 0) {
      return null;
    }

    const firstRowCells = Array.from(rows[0].querySelectorAll(':scope > td')) as HTMLTableCellElement[];
    const numCols = firstRowCells.length;
    if (numCols === 0) {
      return null;
    }

    const cellContents: Record<string, string> = {};
    const cellPadding: Record<string, number[]> = {};
    const cellHAlign: Record<string, string> = {};
    const cellVAlign: Record<string, string> = {};
    const cellBorderWidth: Record<string, number> = {};
    const cellBorderStyle: Record<string, string> = {};
    const cellBorderColor: Record<string, string> = {};
    const cellBorders: Record<string, TableCellBorderConfig> = {};
    const cellFontStyle: Record<string, string> = {};
    const cellFontWeight: Record<string, string> = {};
    const cellFontSize: Record<string, number> = {};
    const cellLineHeight: Record<string, number> = {};
    const cellFontFamily: Record<string, string> = {};
    const cellSubTables: Record<string, any> = {};

    const rowSizes: number[] = [];
    const colSizes: number[] = [];

    // Calculate row sizes
    for (const row of rows) {
      const heightStr = row.style.height || row.getAttribute('style')?.match(/height:\s*([0-9.]+)(?:mm|%)/)?.[1];
      const heightUnit = row.getAttribute('style')?.match(/height:\s*[0-9.]+?(mm|%)/)?.[1];
      if (heightStr) {
        if (heightUnit === 'mm') {
          // Convert mm to ratio
          rowSizes.push(parseFloat(heightStr) / parentHeightMm);
        } else {
          // Already a percentage
          rowSizes.push(parseFloat(heightStr) / 100);
        }
      }
    }

    // Calculate column sizes from first row
    for (const cell of firstRowCells) {
      const widthStr = cell.style.width || cell.getAttribute('style')?.match(/width:\s*([0-9.]+)(?:mm|%)/)?.[1];
      const widthUnit = cell.getAttribute('style')?.match(/width:\s*[0-9.]+?(mm|%)/)?.[1];
      if (widthStr) {
        if (widthUnit === 'mm') {
          // Convert mm to ratio
          colSizes.push(parseFloat(widthStr) / parentWidthMm);
        } else {
          // Already a percentage
          colSizes.push(parseFloat(widthStr) / 100);
        }
      }
    }

    // Normalize sizes to ensure they sum to 1.0
    const rowSizeSum = rowSizes.reduce((sum, size) => sum + size, 0);
    if (rowSizeSum > 0 && Math.abs(rowSizeSum - 1.0) > 0.01) {
      for (let i = 0; i < rowSizes.length; i++) {
        rowSizes[i] = rowSizes[i] / rowSizeSum;
      }
    }

    const colSizeSum = colSizes.reduce((sum, size) => sum + size, 0);
    if (colSizeSum > 0 && Math.abs(colSizeSum - 1.0) > 0.01) {
      for (let i = 0; i < colSizes.length; i++) {
        colSizes[i] = colSizes[i] / colSizeSum;
      }
    }

    // Parse each cell
    rows.forEach((row, rowIndex) => {
      const cells = Array.from(row.querySelectorAll(':scope > td')) as HTMLTableCellElement[];
      cells.forEach((cell, colIndex) => {
        const key = `${rowIndex}_${colIndex}`;

        // Check if cell contains a nested table
        const nestedTable = cell.querySelector(':scope > table') as HTMLElement | null;

        if (nestedTable) {
          // Parse the nested table recursively
          const nestedSubTable = this.parseNestedSubTable(
            nestedTable,
            parentWidthMm * colSizes[colIndex],
            parentHeightMm * rowSizes[rowIndex],
            level + 1
          );
          if (nestedSubTable) {
            cellSubTables[key] = nestedSubTable;
            cellContents[key] = ''; // Clear content as it's now in nested sub-table
          }
        } else {
          // Content
          cellContents[key] = cell.innerHTML;
        }

        // Parse padding
        const paddingMatch = cell.style.padding?.match(/([0-9.]+)mm\s+([0-9.]+)mm\s+([0-9.]+)mm\s+([0-9.]+)mm/);
        if (paddingMatch) {
          cellPadding[key] = [
            parseFloat(paddingMatch[1]),
            parseFloat(paddingMatch[2]),
            parseFloat(paddingMatch[3]),
            parseFloat(paddingMatch[4])
          ];
        } else {
          cellPadding[key] = [0, 0, 0, 0];
        }

        // Parse alignment
        cellHAlign[key] = cell.style.textAlign || 'left';
        cellVAlign[key] = cell.style.verticalAlign || 'top';

        // Parse border
        const cellStyle = cell.getAttribute('style') || '';
        const borderMatch = cellStyle.match(/border:\s*([0-9.]+)px\s+(\w+)\s+(#[0-9a-f]{6}|#[0-9a-f]{3}|rgb\([^)]+\)|\w+)/i);
        if (borderMatch) {
          cellBorderWidth[key] = parseFloat(borderMatch[1]);
          cellBorderStyle[key] = borderMatch[2];
          cellBorderColor[key] = borderMatch[3];
        }

        if (cellBorderWidth[key] !== undefined || cellBorderStyle[key] !== undefined || cellBorderColor[key] !== undefined) {
          cellBorders[key] = {
            all: {
              width: cellBorderWidth[key] ?? 0,
              style: cellBorderStyle[key] ?? 'solid',
              color: cellBorderColor[key] ?? '#000000'
            }
          };
        }

        // Parse font properties
        if (cell.style.fontFamily) {
          cellFontFamily[key] = cell.style.fontFamily.replace(/"/g, "'");
        }
        if (cell.style.fontSize) {
          const fontSizeMatch = cell.style.fontSize.match(/([0-9.]+)pt/);
          if (fontSizeMatch) {
            cellFontSize[key] = parseFloat(fontSizeMatch[1]);
          }
        }
        if (cell.style.fontWeight) {
          cellFontWeight[key] = cell.style.fontWeight;
        }
        if (cell.style.fontStyle) {
          cellFontStyle[key] = cell.style.fontStyle;
        }
        if (cell.style.lineHeight) {
          cellLineHeight[key] = parseFloat(cell.style.lineHeight) || 1;
        }
      });
    });

    return {
      rows: numRows,
      cols: numCols,
      rowSizes,
      colSizes,
      level,
      cellContents,
      cellPadding,
      cellHAlign,
      cellVAlign,
      cellBorderWidth,
      cellBorderStyle,
      cellBorderColor,
      ...(Object.keys(cellBorders).length > 0 ? { cellBorders } : {}),
      cellFontFamily,
      cellFontSize,
      cellFontWeight,
      cellFontStyle,
      cellLineHeight,
      ...(Object.keys(cellSubTables).length > 0 ? { cellSubTables } : {})
    };
  }

  /**
   * Extracts positioning information from inline style declarations.
   */
  private parseStylePosition(style: string, isTable: boolean = false): { x: number; y: number; width: number; height: number } | null {
    // For tables, look for margin-top and margin-left (flow positioning)
    // For other elements, look for left/top (absolute positioning)

    let x = 0, y = 0, width = 0, height = 0;

    if (isTable) {
      const marginTopMatch = style.match(/margin-top:\s*([0-9.]+)mm/);
      const marginLeftMatch = style.match(/margin-left:\s*([0-9.]+)mm/);
      const widthMatch = style.match(/width:\s*([0-9.]+)mm/);
      const heightMatch = style.match(/(^|;)\s*height:\s*([0-9.]+)mm/);

      if (marginTopMatch) y = parseFloat(marginTopMatch[1]);
      if (marginLeftMatch) x = parseFloat(marginLeftMatch[1]);
      if (widthMatch) width = parseFloat(widthMatch[1]);
      if (heightMatch) {
        height = parseFloat(heightMatch[2]);
      } else {
        // Height will be calculated from row heights when it's missing
        height = width > 0 ? 100 : 0;
      }
    } else {
      const leftMatch = style.match(/left:\s*([0-9.]+)mm/);
      const topMatch = style.match(/top:\s*([0-9.]+)mm/);
      const widthMatch = style.match(/width:\s*([0-9.]+)mm/);
      const heightMatch = style.match(/height:\s*([0-9.]+)mm/);

      if (leftMatch) x = parseFloat(leftMatch[1]);
      if (topMatch) y = parseFloat(topMatch[1]);
      if (widthMatch) width = parseFloat(widthMatch[1]);
      if (heightMatch) height = parseFloat(heightMatch[1]);
    }

    if (width <= 0 || height <= 0) {
      return null;
    }

    return { x, y, width, height };
  }

  /**
   * Provides a default border spec for cases where none is present.
   */
  private defaultBorderSpec(): TableCellBorderSpec {
    return { width: 0, style: 'solid', color: '#000000' };
  }

  /**
   * Normalizes missing border spec values to safe defaults.
   */
  private normalizeBorderSpec(spec?: TableCellBorderSpec | null): TableCellBorderSpec {
    if (!spec) {
      return this.defaultBorderSpec();
    }
    return {
      width: Number.isFinite(spec.width) ? spec.width : 0,
      style: typeof spec.style === 'string' ? spec.style : 'solid',
      color: typeof spec.color === 'string' ? spec.color : '#000000'
    };
  }

  /**
   * Builds a border spec using legacy width/style/color maps.
   */
  private legacyBorderSpecFromMaps(
    widthMap: Record<string, number> | undefined,
    styleMap: Record<string, string> | undefined,
    colorMap: Record<string, string> | undefined,
    key: string
  ): TableCellBorderSpec | null {
    if (widthMap?.[key] === undefined && styleMap?.[key] === undefined && colorMap?.[key] === undefined) {
      return null;
    }
    return {
      width: Number.isFinite(widthMap?.[key]) ? widthMap![key]! : 0,
      style: typeof styleMap?.[key] === 'string' ? styleMap![key]! : 'solid',
      color: typeof colorMap?.[key] === 'string' ? colorMap![key]! : '#000000'
    };
  }

  /**
   * Merges per-side overrides with an inherited border baseline.
   */
  private composeBorderSpec(
    config: TableCellBorderConfig | undefined,
    legacy: TableCellBorderSpec | null,
    side: BorderSide
  ): TableCellBorderSpec {
    const base = this.normalizeBorderSpec(config?.all ?? legacy ?? this.defaultBorderSpec());
    if (side === 'all') {
      return base;
    }
    const override = config?.[side];
    if (!override) {
      return base;
    }
    return this.normalizeBorderSpec(override);
  }

  /**
   * Converts a border spec to a CSS shorthand string.
   */
  private borderSpecToCss(spec: TableCellBorderSpec): string {
    if (spec.width <= 0 || spec.style === 'none') {
      return 'none';
    }
    return `${spec.width}px ${spec.style} ${spec.color}`;
  }

  /**
   * Parses numeric values from inline style strings, handling units.
   */
  private parseStyleValue(value: string): number {
    const match = value.match(/([0-9.]+)/);
    return match ? parseFloat(match[1]) : 0;
  }

  // Export current design to JSON
  /**
   * Serializes the current designer state to JSON for persistence.
   */
  exportDesign(): string {
    // Ensure layout.elements reflects current elements
    const layout = { ...this.currentLayoutSignal(), elements: this.elementsSignal() };
    const design = {
      version: 1,
      layout,
      pageGutters: this.pageGutters(),
      visualGridSize: this.visualGridSize(),
      logicalGridSize: this.logicalGridSize(),
      calibrationScale: this.calibrationScale(),
      canvasZoomMode: this.canvasZoomMode()
    };
    return JSON.stringify(design, null, 2);
  }

  // Import design JSON
  /**
   * Loads a designer state from a JSON export.
   */
  importDesign(jsonContent: string, fileName?: string): void {
    const parsed = JSON.parse(jsonContent);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid design JSON');
    }
    // Accept legacy format where elements were top-level
    let layout = parsed.layout;
    if (!layout) {
      throw new Error('Design JSON missing layout');
    }
    if (!Array.isArray(layout.elements) || layout.elements.length === 0) {
      if (Array.isArray(parsed.elements) && parsed.elements.length) {
        layout = { ...layout, elements: parsed.elements };
      } else {
        layout = { ...layout, elements: [] };
      }
    }

    if (!Array.isArray(layout.elements)) {
      throw new Error('Design JSON layout.elements must be an array');
    }

    this.setLayout({
      name: layout.name || 'Imported Layout',
      elements: layout.elements,
      gridSize: layout.gridSize || 10,
      canvasWidth: layout.canvasWidth || 210,
      canvasHeight: layout.canvasHeight || 297
    });

    if (parsed.pageGutters) {
      this.setPageGutters(parsed.pageGutters);
    }
    if (Number.isFinite(parsed.visualGridSize)) {
      this.setVisualGridSize(parsed.visualGridSize);
    }
    if (Number.isFinite(parsed.logicalGridSize)) {
      this.setLogicalGridSize(parsed.logicalGridSize);
    }
    if (Number.isFinite(parsed.calibrationScale)) {
      this.setCalibrationScale(parsed.calibrationScale);
    }
    if (parsed.canvasZoomMode) {
      this.setCanvasZoomMode(parsed.canvasZoomMode);
    }

    this.designSourceNameSignal.set(this.extractDesignFileBase(fileName));
    this.markDesignSaved();
  }

  /** Marks current history index as saved */
  markDesignSaved() {
    this.savedHistoryIndexSignal.set(this.historyIndexSignal());
  }
}

