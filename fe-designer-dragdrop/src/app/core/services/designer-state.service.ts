import { Injectable, signal, computed, effect } from '@angular/core';
import { CanvasElement, ReportLayout, createDefaultLayout, A4_WIDTH_MM, A4_HEIGHT_MM } from '../../shared/models/schema';

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

export type CanvasZoomMode = 'fit' | 'width' | 'height';

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
  }

  removeElement(id: string) {
    this.elementsSignal.update(elements => elements.filter(el => el.id !== id));
    this.addToHistory(this.elementsSignal());
    if (this.selectedElementIdSignal() === id) {
      this.selectedElementIdSignal.set(null);
    }
  }

  selectElement(id: string | null) {
    this.selectedElementIdSignal.set(id);
  }

  clearElements() {
    this.elementsSignal.set([]);
    this.selectedElementIdSignal.set(null);
    this.clearHistory();
    this.addToHistory([]);
  }

  loadLayout(layout: ReportLayout) {
    this.currentLayoutSignal.set(layout);
    this.elementsSignal.set(JSON.parse(JSON.stringify(layout.elements)));
    this.clampElementsToMargins(this.pageGutters());
    this.selectedElementIdSignal.set(null);
    this.clearHistory();
    this.addToHistory(this.elementsSignal());
  }

  clearLayout() {
    const defaultLayout = createDefaultLayout();
    this.currentLayoutSignal.set(defaultLayout);
    this.elementsSignal.set([]);
    this.selectedElementIdSignal.set(null);
    this.clearHistory();
    this.addToHistory([]);
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

  undo() {
    if (!this.canUndo()) return;
    
    const newIndex = this.historyIndexSignal() - 1;
    this.historyIndexSignal.set(newIndex);
    
    const entry = this.historySignal()[newIndex];
    this.elementsSignal.set(JSON.parse(JSON.stringify(entry.elements)));
    this.selectedElementIdSignal.set(null);
  }

  redo() {
    if (!this.canRedo()) return;
    
    const newIndex = this.historyIndexSignal() + 1;
    this.historyIndexSignal.set(newIndex);
    
    const entry = this.historySignal()[newIndex];
    this.elementsSignal.set(JSON.parse(JSON.stringify(entry.elements)));
    this.selectedElementIdSignal.set(null);
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

  setPageGutters(gutters: PageGutters) {
    const normalized = this.normalizePageGutters(gutters);
    this.pageGutters.set(normalized);
    const changed = this.clampElementsToMargins(normalized);
    if (changed) {
      this.addToHistory(this.elementsSignal());
    }
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

    if (x !== element.x || y !== element.y || width !== element.width || height !== element.height) {
      return { ...element, x, y, width, height };
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
