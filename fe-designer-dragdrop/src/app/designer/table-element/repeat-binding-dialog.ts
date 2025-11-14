import { Component, EventEmitter, Output, signal, inject, OnInit, Input } from '@angular/core';
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
export class RepeatBindingDialogComponent implements OnInit {
  @Output() saved = new EventEmitter<{ binding: string; iteratorName: string; repeatedElement: 'tr' | 'tbody' | 'table' }>();
  @Output() closed = new EventEmitter<void>();

  private reportData = inject(ReportDataService);

  @Input() initialBinding?: string;
  @Input() initialIterator?: string;
  @Input() initialRepeatedElement?: 'tr' | 'tbody' | 'table';

  protected repeatedElement = signal<'tr' | 'tbody' | 'table'>('tr');
  protected iteratorName = signal<string>('item');
  protected selectedPath = signal<string>('');
  protected jsonTree = signal<JsonTreeNode[]>([]);

  ngOnInit(): void {
    this.jsonTree.set(this.buildTree(this.reportData.reportDataModel(), ''));
    if (this.initialBinding) this.selectedPath.set(this.initialBinding);
    if (this.initialIterator) this.iteratorName.set(this.initialIterator);
    if (this.initialRepeatedElement) this.repeatedElement.set(this.initialRepeatedElement);
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

  protected onOverlayClick() { this.closed.emit(); }
  protected onDialogClick(event: MouseEvent) { event.stopPropagation(); }
}
