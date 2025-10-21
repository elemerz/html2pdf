import { Injectable, signal, computed, effect } from '@angular/core';
import { CanvasElement, ReportLayout, createDefaultLayout } from '../../shared/models/schema';

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
  readonly logicalGridSize = signal(10); // Snap-to-grid quantum in mm
  readonly canvasScale = signal(1);
  readonly visualGridColor = signal('#c2c7d1');
  readonly canvasZoomMode = signal<CanvasZoomMode>('fit');

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
    this.clearHistory();
    this.addToHistory(layout.elements);
  }

  updateLayoutName(name: string) {
    this.currentLayoutSignal.update(layout => ({ ...layout, name }));
  }

  // Element management
  addElement(element: CanvasElement) {
    this.elementsSignal.update(elements => [...elements, element]);
    this.addToHistory(this.elementsSignal());
    this.selectedElementIdSignal.set(element.id);
  }

  updateElement(id: string, updates: Partial<CanvasElement>) {
    this.elementsSignal.update(elements => 
      elements.map(el => el.id === id ? { ...el, ...updates } : el)
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
}
