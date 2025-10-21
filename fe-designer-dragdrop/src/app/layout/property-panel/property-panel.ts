import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DesignerStateService } from '../../core/services/designer-state.service';
import { CanvasElement } from '../../shared/models/schema';
import { reconcileSizeArray, withTableSizes } from '../../shared/utils/table-utils';

@Component({
  selector: 'app-property-panel',
  imports: [CommonModule, FormsModule],
  templateUrl: './property-panel.html',
  styleUrl: './property-panel.less',
  standalone: true
})
export class PropertyPanelComponent {
  private designerState = inject(DesignerStateService);
  
  protected selectedElement = this.designerState.selectedElement;
  
  updateElement(updates: Partial<CanvasElement>) {
    const el = this.selectedElement();
    if (el) {
      this.designerState.updateElement(el.id, updates);
    }
  }

  updatePosition(x: number, y: number) {
    const el = this.selectedElement();
    if (!el) return;
    const safeX = this.normalizeNumber(x, el.x);
    const safeY = this.normalizeNumber(y, el.y);
    if (safeX === el.x && safeY === el.y) return;
    this.updateElement({ x: safeX, y: safeY });
  }

  updateSize(width: number, height: number) {
    const el = this.selectedElement();
    if (!el) return;
    const safeWidth = Math.max(1, this.normalizeNumber(width, el.width));
    const safeHeight = Math.max(1, this.normalizeNumber(height, el.height));
    if (safeWidth === el.width && safeHeight === el.height) return;
    this.updateElement({ width: safeWidth, height: safeHeight });
  }

  updateContent(content: string) {
    const el = this.selectedElement();
    if (!el || el.content === content) return;
    this.updateElement({ content });
  }

  updateTableProperty(property: 'rows' | 'cols', value: number) {
    const el = this.selectedElement();
    if (!el || el.type !== 'table') return;

    const safeValue = Math.max(1, Math.floor(this.normalizeNumber(value, 1)));
    const currentRows = this.tableProperty(el, 'rows');
    const currentCols = this.tableProperty(el, 'cols');

    const nextRows = property === 'rows' ? safeValue : currentRows;
    const nextCols = property === 'cols' ? safeValue : currentCols;

    if (nextRows === currentRows && nextCols === currentCols) {
      return;
    }

    const rowSizes = reconcileSizeArray(el.properties?.['rowSizes'], nextRows);
    const colSizes = reconcileSizeArray(el.properties?.['colSizes'], nextCols);

    const properties = withTableSizes(el, rowSizes, colSizes);
    this.updateElement({ properties });
  }

  tableProperty(element: CanvasElement, property: 'rows' | 'cols'): number {
    const value = element.properties?.[property];
    const parsed = typeof value === 'number' ? value : parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }

  isTable(element: CanvasElement | null): boolean {
    return !!element && element.type === 'table';
  }

  deleteElement() {
    const el = this.selectedElement();
    if (el) {
      this.designerState.removeElement(el.id);
    }
  }

  private normalizeNumber(value: number, fallback: number = 0): number {
    if (Number.isFinite(value)) {
      return value;
    }
    return fallback;
  }
}
