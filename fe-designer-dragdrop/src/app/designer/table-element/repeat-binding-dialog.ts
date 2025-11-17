import { Component, EventEmitter, Output, signal, inject, OnInit, Input, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReportDataService } from '../../core/services/report-data.service';

interface JsonTreeNode {
  key: string;
  path: string; // dot path
  type: 'object' | 'array' | 'primitive';
  value: any;
  expanded: boolean;
  children?: JsonTreeNode[];
}

@Component({
  selector: 'app-repeat-binding-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './repeat-binding-dialog.html',
  styleUrl: './repeat-binding-dialog.less'
})
export class RepeatBindingDialogComponent implements OnInit, AfterViewInit {
  @Output() saved = new EventEmitter<{ binding: string; iteratorName: string; repeatedElement: 'tr' | 'tbody' | 'table' }>();
  @Output() cleared = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
  @ViewChild('dialogContent') dialogContent?: ElementRef<HTMLDivElement>;

  private reportData = inject(ReportDataService);

  @Input() initialBinding?: string;
  @Input() initialIterator?: string;
  @Input() initialRepeatedElement?: 'tr' | 'tbody' | 'table';

  protected repeatedElement = signal<'tr' | 'tbody' | 'table'>('tr');
  protected iteratorName = signal<string>('item');
  protected selectedPath = signal<string>('');
  protected jsonTree = signal<JsonTreeNode[]>([]);

  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private initialLeft = 0;
  private initialTop = 0;

  ngOnInit(): void {
    this.jsonTree.set(this.buildTree(this.reportData.reportDataModel(), ''));
    if (this.initialBinding) this.selectedPath.set(this.initialBinding);
    if (this.initialIterator) this.iteratorName.set(this.initialIterator);
    if (this.initialRepeatedElement) this.repeatedElement.set(this.initialRepeatedElement);
  }

  ngAfterViewInit(): void {
    if (this.dialogContent) {
      const element = this.dialogContent.nativeElement;
      element.addEventListener('mousedown', this.onMouseDown.bind(this));
    }
  }

  private onMouseDown(event: MouseEvent) {
    const target = event.target as HTMLElement;
    
    // Only drag from the drag handle
    if (!target.closest('.dialog-drag-handle')) {
      return;
    }

    const element = this.dialogContent!.nativeElement;
    
    // Get current VISUAL position relative to viewport
    const rectBefore = element.getBoundingClientRect();
    
    // Change to fixed positioning
    element.style.position = 'fixed';
    element.style.width = `${rectBefore.width}px`;
    element.style.margin = '0';
    element.style.left = '0px';
    element.style.top = '0px';
    
    // Force reflow
    void element.offsetHeight;
    
    // Now get where it actually ended up
    const rectAfter = element.getBoundingClientRect();
    
    // Calculate the offset and correct it
    const leftOffset = rectBefore.left - rectAfter.left;
    const topOffset = rectBefore.top - rectAfter.top;
    
    element.style.left = `${leftOffset}px`;
    element.style.top = `${topOffset}px`;
    
    // Now it should be at the original visual position
    this.isDragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.initialLeft = leftOffset;
    this.initialTop = topOffset;

    const boundMouseMove = this.onMouseMove.bind(this);
    const boundMouseUp = this.onMouseUp.bind(this);

    document.addEventListener('mousemove', boundMouseMove);
    document.addEventListener('mouseup', boundMouseUp);
    
    // Store bound functions for removal
    (this as any)._boundMouseMove = boundMouseMove;
    (this as any)._boundMouseUp = boundMouseUp;
    
    event.preventDefault();
    event.stopPropagation();
  }

  private onMouseMove(event: MouseEvent) {
    if (!this.isDragging) return;

    const dx = event.clientX - this.dragStartX;
    const dy = event.clientY - this.dragStartY;

    const element = this.dialogContent!.nativeElement;
    element.style.left = `${this.initialLeft + dx}px`;
    element.style.top = `${this.initialTop + dy}px`;
    
    event.preventDefault();
    event.stopPropagation();
  }

  private onMouseUp(event: MouseEvent) {
    if (!this.isDragging) return;
    
    this.isDragging = false;
    
    // Remove event listeners using stored bound functions
    if ((this as any)._boundMouseMove) {
      document.removeEventListener('mousemove', (this as any)._boundMouseMove);
      delete (this as any)._boundMouseMove;
    }
    if ((this as any)._boundMouseUp) {
      document.removeEventListener('mouseup', (this as any)._boundMouseUp);
      delete (this as any)._boundMouseUp;
    }
    
    event.preventDefault();
    event.stopPropagation();
  }

  private buildTree(obj: any, basePath: string): JsonTreeNode[] {
    const nodes: JsonTreeNode[] = [];
    if (!obj || typeof obj !== 'object') return nodes;

    const entries = Array.isArray(obj) ? Object.keys(obj[0] || {}).map(k => [k, obj[0][k]]) : Object.entries(obj);
    for (const [key, value] of entries as any[]) {
      const path = basePath ? `${basePath}.${key}` : key;
      const type: 'object' | 'array' | 'primitive' = Array.isArray(value) ? 'array' : (value && typeof value === 'object') ? 'object' : 'primitive';

      // Determine if this branch (value) contains any array (collection) somewhere beneath
      const branchHasCollection = this.branchContainsCollection(value);
      if (!branchHasCollection && type !== 'array') {
        // Skip non-array branches that don't lead to a collection at any depth
        continue;
      }

      const node: JsonTreeNode = { key, path, type, value, expanded: false };
      if (type !== 'primitive') {
        node.children = this.buildTree(type === 'array' ? (value[0] || {}) : value, path);
      }
      nodes.push(node);
    }
    return nodes;
  }

  private branchContainsCollection(value: any): boolean {
    if (Array.isArray(value)) return true; // itself is a collection
    if (!value || typeof value !== 'object') return false;
    for (const k in value) {
      const v = value[k];
      if (Array.isArray(v)) return true;
      if (v && typeof v === 'object' && this.branchContainsCollection(v)) return true;
    }
    return false;
  }

  protected toggleNode(node: JsonTreeNode) {
    if (node.type === 'primitive') return;
    node.expanded = !node.expanded;
  }

  protected onSelectNode(node: JsonTreeNode) {
    if (node.type === 'array') {
      this.selectedPath.set(node.path);
    } else if (node.type === 'object') {
      // allow selecting object only if it is clearly an array parent? For now require array type
      this.selectedPath.set('');
    } else {
      this.selectedPath.set('');
    }
  }

  protected getPreview(node: JsonTreeNode): string {
    if (node.type === 'array') return `[${(node.children?.length)||0}]`;
    if (node.type === 'object') return `{${(node.children?.length)||0}}`;
    if (typeof node.value === 'string') return '"' + node.value + '"';
    if (node.value === null) return 'null';
    return String(node.value);
  }

  protected canSave(): boolean {
    return !!this.selectedPath() && !!this.iteratorName().trim();
  }

  protected onSaveClicked(event: Event) {
    event.preventDefault();
    if (!this.canSave()) return;
    this.saved.emit({ binding: this.selectedPath(), iteratorName: this.iteratorName().trim(), repeatedElement: this.repeatedElement() });
  }

  protected onCancelClicked() {
    this.closed.emit();
  }

  protected onOverlayClick() {
    // Do not close on overlay click
  }
  protected onDialogClick(event: MouseEvent) { event.stopPropagation(); }
  protected onClearClicked() { this.cleared.emit(); }
}
