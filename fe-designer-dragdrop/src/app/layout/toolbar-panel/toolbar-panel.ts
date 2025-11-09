import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toolbarElements, ToolbarElement, ToolbarCategory } from '../../shared/models/schema';
import { DragDropService } from '../../core/services/drag-drop.service';
import { ReportDataService } from '../../core/services/report-data.service';

interface JsonNode {
  key: string;
  value: any;
  type: 'object' | 'array' | 'primitive';
  expanded: boolean;
  children?: JsonNode[];
  path: string;
}

/**
 * Collapsible toolbar that exposes draggable building blocks for the report canvas.
 */
@Component({
  selector: 'app-toolbar-panel',
  imports: [CommonModule],
  templateUrl: './toolbar-panel.html',
  styleUrl: './toolbar-panel.less',
  standalone: true
})
export class ToolbarPanelComponent {
  private dragDropService = inject(DragDropService);
  private reportDataService = inject(ReportDataService);

  protected toolbarElements = toolbarElements;
  protected expandedCategory = signal<string | null>('layout'); // allow passive categories

  protected categories: { id: string; label: string; passive?: boolean }[] = [
    { id: 'layout', label: 'Layout' },
    { id: 'custom-templates', label: 'Custom Templates', passive: true },
    { id: 'report-data-model', label: 'Report Data Model', passive: true },
    { id: 'custom-symbols', label: 'Custom Symbols', passive: true },
    { id: 'manage-managed-fonts', label: 'Manage Fonts', passive: true },
    { id: 'manage-images', label: 'Manage Images', passive: true }
  ];

  // Sample JSON data for the Report Data Model viewer
  protected reportDataModel: any = {
    invoice: {
      number: 'INV-2024-001',
      date: '2024-01-15',
      dueDate: '2024-02-15',
      total: 1250.00,
      currency: 'USD'
    },
    customer: {
      name: 'Acme Corporation',
      email: 'billing@acme.com',
      address: {
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zip: '62701'
      }
    },
    items: [
      { id: 1, description: 'Widget A', quantity: 10, price: 50.00 },
      { id: 2, description: 'Widget B', quantity: 5, price: 150.00 }
    ]
  };

  protected jsonTree = signal<JsonNode[]>([]);

  constructor() {
    this.jsonTree.set(this.buildJsonTree(this.reportDataModel, ''));
    this.reportDataService.setReportDataModel(this.reportDataModel);
  }

  private buildJsonTree(obj: any, path: string): JsonNode[] {
    const nodes: JsonNode[] = [];

    for (const key in obj) {
      const value = obj[key];
      const nodePath = path ? `${path}.${key}` : key;
      const node: JsonNode = {
        key,
        value,
        type: this.getValueType(value),
        expanded: false,
        path: nodePath
      };

      if (node.type === 'object' || node.type === 'array') {
        node.children = this.buildJsonTree(value, nodePath);
      }

      nodes.push(node);
    }

    return nodes;
  }

  private getValueType(value: any): 'object' | 'array' | 'primitive' {
    if (Array.isArray(value)) return 'array';
    if (value !== null && typeof value === 'object') return 'object';
    return 'primitive';
  }

  protected toggleJsonNode(node: JsonNode) {
    node.expanded = !node.expanded;
  }

  protected getValuePreview(node: JsonNode): string {
    if (node.type === 'primitive') {
      if (typeof node.value === 'string') return `"${node.value}"`;
      if (node.value === null) return 'null';
      return String(node.value);
    }
    if (node.type === 'array') {
      return `[${node.children?.length || 0}]`;
    }
    return `{${node.children?.length || 0}}`;
  }

  protected getValueClass(value: any): string {
    if (value === null) return 'json-null';
    if (typeof value === 'string') return 'json-string';
    if (typeof value === 'number') return 'json-number';
    if (typeof value === 'boolean') return 'json-boolean';
    return '';
  }

  protected onImportJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (event: Event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const jsonData = JSON.parse(e.target?.result as string);
          this.reportDataModel = jsonData;
          this.jsonTree.set(this.buildJsonTree(this.reportDataModel, ''));
          this.reportDataService.setReportDataModel(jsonData);
        } catch (error) {
          console.error('Failed to parse JSON file:', error);
          alert('Invalid JSON file');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  /**
   * Returns toolbar entries belonging to the requested category.
   */
  getElementsForCategory(category: string): ToolbarElement[] {
    return this.toolbarElements.filter(el => el.category === category);
  }

  /**
   * Expands or collapses a category accordion section.
   */
  toggleCategory(category: string) {
    this.expandedCategory.update(current => current === category ? null : category);
  }

  /**
   * Initiates a toolbar drag operation and seeds the drag-drop service with ghost metadata.
   */
  onDragStart(event: DragEvent, element: ToolbarElement) {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('application/json', JSON.stringify(element));
    }
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    this.dragDropService.startToolbarDrag(
      element,
      event.clientX,
      event.clientY,
      offsetX,
      offsetY
    );
  }

  /**
   * Signals the drag-drop service to reset once the drag concludes.
   */
  onDragEnd() {
    this.dragDropService.endDrag();
  }
}
