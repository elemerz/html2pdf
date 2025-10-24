import { Injectable, signal, computed, effect } from '@angular/core';
import { CanvasElement, ReportLayout, createDefaultLayout, A4_WIDTH_MM, A4_HEIGHT_MM } from '../../shared/models/schema';
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
}

export type CanvasZoomMode = 'fit' | 'width' | 'height' | 'actual';

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

  readonly canUndo = computed(() => this.historyIndexSignal() > 0);
  readonly canRedo = computed(() => this.historyIndexSignal() < this.historySignal().length - 1);

  // Panel states
  readonly westCollapsed = signal(false);
  readonly eastCollapsed = signal(false);
  readonly westWidth = signal(250);
  readonly eastWidth = signal(300);

  // Status message
  readonly statusMessage = signal('Ready');
  readonly cursorPosition = signal({ x: 0, y: 0 });

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

  constructor() {
    // Initialize history with empty state
    this.addToHistory([]);

    // Auto-save to localStorage on element changes
    effect(() => {
      const layout = this.currentLayoutSignal();
      const elements = this.elementsSignal();
      // Could implement auto-save logic here
    });
  }

  // Layout management
  setLayout(layout: ReportLayout) {
    this.currentLayoutSignal.set(layout);
    this.elementsSignal.set(layout.elements);
    this.clampElementsToMargins(this.pageGutters());
    this.clearHistory();
    this.addToHistory(this.elementsSignal());
    this.clearTableCellSelection();
  }

  updateLayoutName(name: string) {
    this.currentLayoutSignal.update(layout => ({ ...layout, name }));
  }

  // Element management
  addElement(element: CanvasElement) {
    const gutters = this.pageGutters();
    const clampedElement = this.clampElementToMargins(element, gutters);
    this.elementsSignal.update(elements => [...elements, clampedElement]);
    this.addToHistory(this.elementsSignal());
    this.selectedElementIdSignal.set(clampedElement.id);
    this.clearTableCellSelection();
  }

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

  selectElement(id: string | null) {
    this.selectedElementIdSignal.set(id);
    const cellSelection = this.selectedTableCellSignal();
    if (!id || cellSelection?.elementId !== id) {
      this.clearTableCellSelection();
    }
  }

  selectTableCell(elementId: string, row: number, col: number) {
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
      col: normalizedCol
    });
  }

  clearTableCellSelection() {
    this.selectedTableCellSignal.set(null);
  }

  clearElements() {
    this.elementsSignal.set([]);
    this.selectedElementIdSignal.set(null);
    this.clearHistory();
    this.addToHistory([]);
    this.clearTableCellSelection();
  }

  loadLayout(layout: ReportLayout) {
    this.currentLayoutSignal.set(layout);
    this.elementsSignal.set(JSON.parse(JSON.stringify(layout.elements)));
    this.clampElementsToMargins(this.pageGutters());
    this.selectedElementIdSignal.set(null);
    this.clearHistory();
    this.addToHistory(this.elementsSignal());
    this.clearTableCellSelection();
  }

  clearLayout() {
    const defaultLayout = createDefaultLayout();
    this.currentLayoutSignal.set(defaultLayout);
    this.elementsSignal.set([]);
    this.selectedElementIdSignal.set(null);
    this.clearHistory();
    this.addToHistory([]);
    this.clearTableCellSelection();
  }

  // History management
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

  private clearHistory() {
    this.historySignal.set([]);
    this.historyIndexSignal.set(-1);
  }

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

  undo() {
    if (!this.canUndo()) return;

    const newIndex = this.historyIndexSignal() - 1;
    this.historyIndexSignal.set(newIndex);

    const entry = this.historySignal()[newIndex];
    this.elementsSignal.set(JSON.parse(JSON.stringify(entry.elements)));
    this.selectedElementIdSignal.set(null);
    this.clearTableCellSelection();
  }

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
  setStatusMessage(message: string) {
    this.statusMessage.set(message);
  }

  setCursorPosition(x: number, y: number) {
    this.cursorPosition.set({ x, y });
  }

  // Panel controls
  toggleWestPanel() {
    this.westCollapsed.update(v => !v);
  }

  toggleEastPanel() {
    this.eastCollapsed.update(v => !v);
  }

  setWestWidth(width: number) {
    this.westWidth.set(width);
  }

  setEastWidth(width: number) {
    this.eastWidth.set(width);
  }

  // Grid configuration
  setVisualGridSize(size: number) {
    this.visualGridSize.set(Math.max(1, size));
  }

  setLogicalGridSize(size: number) {
    this.logicalGridSize.set(Math.max(1, size));
  }

  setCanvasScale(scale: number) {
    const normalized = Math.max(0.1, scale);
    if (this.canvasScale() !== normalized) {
      this.canvasScale.set(normalized);
    }
  }

  setVisualGridColor(color: string) {
    if (!color) return;
    this.visualGridColor.set(color);
  }

  setCanvasZoomMode(mode: CanvasZoomMode) {
    this.canvasZoomMode.set(mode);
  }

  setCalibrationScale(scale: number) {
    if (!Number.isFinite(scale) || scale <= 0) scale = 1;
    this.calibrationScale.set(scale);
  }

  setPageGutters(gutters: PageGutters) {
    const normalized = this.normalizePageGutters(gutters);
    this.pageGutters.set(normalized);
    const changed = this.clampElementsToMargins(normalized);
    if (changed) {
      this.addToHistory(this.elementsSignal());
    }
  }

  generateXhtmlDocument(title: string): string {
    const safeTitle = this.escapeHtml(title || 'Layout');
    const elements = [...this.elementsSignal()];

    // Flow layout for tables (no absolute positioning). Non-table elements keep absolute for now.
    let lastFlowBottom = 0;
    let firstFlow = true;
    const elementsMarkup = elements
      .map(el => {
        if (el.type === 'table') {
          const topMargin = firstFlow ? el.y : Math.max(0, el.y - lastFlowBottom);
            const leftMargin = el.x;
            lastFlowBottom = el.y + el.height;
            firstFlow = false;
            const tableHtml = this.serializeTableElement(el, `margin-top:${this.formatMillimeters(topMargin)}mm;margin-left:${this.formatMillimeters(leftMargin)}mm;width:${this.formatMillimeters(el.width)}mm;`);
            return tableHtml;
        }
        return this.serializeElementToXhtml(el);
      })
      .filter(Boolean)
      .join('\n    ');

    const bodyContent = elementsMarkup ? `    ${elementsMarkup}\n` : '';

    const margins = this.pageGutters();
    const commonStylesRaw = this.getA4CommonStyles();
    const commonStyles = commonStylesRaw
      .replace(/__TOP__/g, `${margins.top}mm`)
      .replace(/__RIGHT__/g, `${margins.right}mm`)
      .replace(/__BOTTOM__/g, `${margins.bottom}mm`)
      .replace(/__LEFT__/g, `${margins.left}mm`);

    return `<html xmlns="http://www.w3.org/1999/xhtml">\n` +
      `  <head>\n` +
      `    <title>${safeTitle}</title>\n` +
      `    <style type="text/css" media="all">\n` +
      `${commonStyles}\n` +
      `    </style>\n` +
      `  </head>\n` +
      `  <body>\n${bodyContent}  </body>\n</html>`;
  }

  private a4StylesCache: string | null = null; // Set by preload provider
  setA4CommonStyles(css: string): void {
    if (css && css.trim().length) {
      this.a4StylesCache = css;
    }
  }

  private getA4CommonStyles(): string {
    if (this.a4StylesCache) {
      return this.a4StylesCache;
    }
    // Fallback minimal if not preloaded by startup APP_INITIALIZER
    this.a4StylesCache = this.a4StylesCache || `/*** Page-level definitions ***/\n@page {\n  size: A4 portrait;\n  /* MARGINS: __TOP__ __RIGHT__ __BOTTOM__ __LEFT__ */\n  margin: __TOP__ __RIGHT__ __BOTTOM__ __LEFT__;\n}`;
    return this.a4StylesCache;
  }

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

  private serializeTableElement(element: CanvasElement, style: string): string {
    const rowSizes = getTableRowSizes(element);
    const colSizes = getTableColSizes(element);

    const effectiveRowSizes = rowSizes.length ? rowSizes : [1];
    const effectiveColSizes = colSizes.length ? colSizes : [1];

    const rowsMarkup = effectiveRowSizes
      .map((rowRatio, rowIndex) => {
        const rowHeightMm = element.height * rowRatio;
        const rowHeightStr = this.formatMillimeters(rowHeightMm);

        const cells = effectiveColSizes
          .map((colRatio, colIndex) => {
            const colWidthMm = element.width * colRatio;
            const colWidthStr = this.formatMillimeters(colWidthMm);
            const contents = (element.properties?.['tableCellContents'] as Record<string, string> | undefined) || {};
            const key = `${rowIndex}_${colIndex}`; // use explicit indices to avoid indexOf duplication
            const raw = contents[key];
            const cellContent = raw && raw.length ? raw : '&nbsp;';
            const padMap = element.properties?.['tableCellPadding'] as Record<string, number[]> | undefined;
            const paddings = padMap?.[key];
            const [pt, pr, pb, pl] = Array.isArray(paddings) && paddings.length === 4 ? paddings : [0,0,0,0];
            const hAlignMap = element.properties?.['tableCellHAlign'] as Record<string, string> | undefined;
            const vAlignMap = element.properties?.['tableCellVAlign'] as Record<string, string> | undefined;
            const hAlign = (hAlignMap?.[key] === 'center' || hAlignMap?.[key] === 'right') ? hAlignMap?.[key] : 'left';
            const vAlignRaw = (vAlignMap?.[key] === 'middle' || vAlignMap?.[key] === 'bottom') ? vAlignMap?.[key] : 'top';
            const vAlign = vAlignRaw === 'middle' ? 'middle' : vAlignRaw; // 'top' | 'middle' | 'bottom'
            return `        <td style="width:${colWidthStr}mm;height:${rowHeightStr}mm;padding:${pt}mm ${pr}mm ${pb}mm ${pl}mm;text-align:${hAlign};vertical-align:${vAlign};">${cellContent}</td>`;
          })
          .join('\n');

        return `      <tr style="height:${rowHeightStr}mm;">\n${cells}\n      </tr>`;
      })
      .join('\n');

    const bw = element.properties?.['tableBorderWidth'];
    const bs = element.properties?.['tableBorderStyle'];
    const bc = element.properties?.['tableBorderColor'];
    const borderCss = (bw ? `border-width:${bw}px;` : '') + (bs ? `border-style:${bs};` : '') + (bc ? `border-color:${bc};` : '');
    return `<table class="element element-table" style="${style}${borderCss}">\n` +
      `    <tbody>\n${rowsMarkup}\n    </tbody>\n  </table>`;
  }

  private formatContent(content: string | undefined | null): string {
    const escaped = this.escapeHtml(content ?? '');
    const withBreaks = escaped.replace(/\r?\n/g, '<br />');
    return withBreaks.length ? withBreaks : '&nbsp;';
  }

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

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private formatMillimeters(value: number): string {
    if (!Number.isFinite(value)) {
      return '0';
    }
    return (Math.round(value * 1000) / 1000).toString();
  }

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
}
