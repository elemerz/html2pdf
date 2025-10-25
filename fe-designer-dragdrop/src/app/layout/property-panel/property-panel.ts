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
  protected selectedTableCell = this.designerState.selectedTableCell;
  
  updateElement(updates: Partial<CanvasElement>) {
    const el = this.selectedElement();
    if (el) {
      this.designerState.updateElement(el.id, updates);
    }
  }

  updateElementProperties(patch: Record<string, any>) {
    const el = this.selectedElement();
    if (!el) return;
    const nextProps = { ...(el.properties||{}), ...patch };
    this.updateElement({ properties: nextProps });
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

  // Cell properties helpers
  private cellKey(row: number, col: number): string { return `${row}_${col}`; }

  getSelectedCellPadding(): { top: number; right: number; bottom: number; left: number } | null {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return null;
    const map = el.properties?.['tableCellPadding'] as Record<string, number[]> | undefined;
    const raw = map?.[this.cellKey(selection.row, selection.col)];
    if (Array.isArray(raw) && raw.length === 4) {
      const [top, right, bottom, left] = raw.map(v => (Number.isFinite(v) ? v : 0));
      return { top, right, bottom, left };
    }
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  getSelectedCellHAlign(): 'left' | 'center' | 'right' | null {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return null;
    const map = el.properties?.['tableCellHAlign'] as Record<string, string> | undefined;
    const value = map?.[this.cellKey(selection.row, selection.col)];
    return value === 'center' || value === 'right' ? value : 'left';
  }

  getSelectedCellVAlign(): 'top' | 'middle' | 'bottom' | null {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return null;
    const map = el.properties?.['tableCellVAlign'] as Record<string, string> | undefined;
    const value = map?.[this.cellKey(selection.row, selection.col)];
    return value === 'middle' || value === 'bottom' ? value : 'top';
  }

  updateSelectedCellPadding(side: 'top' | 'right' | 'bottom' | 'left', value: number) {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return;
    const key = this.cellKey(selection.row, selection.col);
    const existing = (el.properties?.['tableCellPadding'] as Record<string, number[]>) || {};
    const current = existing[key] || [0,0,0,0];
    const indexMap: Record<string, number> = { top:0, right:1, bottom:2, left:3 };
    const next = [...current];
    next[indexMap[side]] = Math.max(0, Number.isFinite(value) ? value : 0);
    const updated = { ...(el.properties||{}), tableCellPadding: { ...existing, [key]: next } };
    this.updateElement({ properties: updated });
  }

  updateSelectedCellAlignment(kind: 'h' | 'v', value: string) {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return;
    const key = this.cellKey(selection.row, selection.col);
    const propName = kind === 'h' ? 'tableCellHAlign' : 'tableCellVAlign';
    const existing = (el.properties?.[propName] as Record<string, string>) || {};
    const updated = { ...(el.properties||{}), [propName]: { ...existing, [key]: value } };
    this.updateElement({ properties: updated });
  }

  hasSelectedCell(): boolean {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    return !!selection && !!el && selection.elementId === el.id && el.type === 'table';
  }

  deleteElement() {
    const el = this.selectedElement();
    if (el) {
      this.designerState.removeElement(el.id);
    }
  }

  // Removed table-level border helpers (migrated to cell-level)

  // Cell border helpers
  getSelectedCellBorderWidth(): number | null {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return null;
    const map = el.properties?.['tableCellBorderWidth'] as Record<string, number> | undefined;
    const v = map?.[this.cellKey(selection.row, selection.col)];
    return Number.isFinite(v) ? v! : 0;
  }
  getSelectedCellBorderStyle(): string | null {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return null;
    const map = el.properties?.['tableCellBorderStyle'] as Record<string, string> | undefined;
    const v = map?.[this.cellKey(selection.row, selection.col)];
    return typeof v === 'string' ? v : 'solid';
  }
  getSelectedCellBorderColor(): string | null {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return null;
    const map = el.properties?.['tableCellBorderColor'] as Record<string, string> | undefined;
    const v = map?.[this.cellKey(selection.row, selection.col)];
    return typeof v === 'string' ? v : '#000000';
  }
  updateSelectedCellBorder(part: 'width' | 'style' | 'color', value: any) {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return;
    const key = this.cellKey(selection.row, selection.col);
    const widthMap = (el.properties?.['tableCellBorderWidth'] as Record<string, number>) || {};
    const styleMap = (el.properties?.['tableCellBorderStyle'] as Record<string, string>) || {};
    const colorMap = (el.properties?.['tableCellBorderColor'] as Record<string, string>) || {};
    let nextProps: Record<string, any> = { ...(el.properties||{}) };
    if (part === 'width') {
      nextProps['tableCellBorderWidth'] = { ...widthMap, [key]: Math.max(0, Number(value) || 0) };
    } else if (part === 'style') {
      nextProps['tableCellBorderStyle'] = { ...styleMap, [key]: String(value) };
    } else if (part === 'color') {
      nextProps['tableCellBorderColor'] = { ...colorMap, [key]: String(value) };
    }
    this.updateElement({ properties: nextProps });
  }

  // Cell font helpers
  getSelectedCellFontStyle(): string | null {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return null;
    const map = el.properties?.['tableCellFontStyle'] as Record<string, string> | undefined;
    const v = map?.[this.cellKey(selection.row, selection.col)];
    return typeof v === 'string' ? v : 'normal';
  }
  getSelectedCellFontWeight(): string | null {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return null;
    const map = el.properties?.['tableCellFontWeight'] as Record<string, string> | undefined;
    const v = map?.[this.cellKey(selection.row, selection.col)];
    return typeof v === 'string' ? v : 'normal';
  }
  getSelectedCellFontSize(): number | null {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return null;
    const map = el.properties?.['tableCellFontSize'] as Record<string, number> | undefined;
    const v = map?.[this.cellKey(selection.row, selection.col)];
    return Number.isFinite(v) ? v! : 12;
  }
  getSelectedCellLineHeight(): number | null {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return null;
    const map = el.properties?.['tableCellLineHeight'] as Record<string, number> | undefined;
    const v = map?.[this.cellKey(selection.row, selection.col)];
    return Number.isFinite(v) ? v! : 1.5;
  }
  getSelectedCellFontFamily(): string | null {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return null;
    const map = el.properties?.['tableCellFontFamily'] as Record<string, string> | undefined;
    const v = map?.[this.cellKey(selection.row, selection.col)];
    return typeof v === 'string' ? v : 'sans-serif';
  }
  getSelectedCellTextDecoration(): string | null {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return null;
    const map = el.properties?.['tableCellTextDecoration'] as Record<string, string> | undefined;
    const v = map?.[this.cellKey(selection.row, selection.col)];
    return typeof v === 'string' ? v : 'none';
  }
  updateSelectedCellFont(part: 'style' | 'weight' | 'size' | 'lineHeight' | 'family' | 'decoration', value: any) {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return;
    const key = this.cellKey(selection.row, selection.col);
    let nextProps: Record<string, any> = { ...(el.properties||{}) };
    
    if (part === 'style') {
      const map = (el.properties?.['tableCellFontStyle'] as Record<string, string>) || {};
      nextProps['tableCellFontStyle'] = { ...map, [key]: String(value) };
    } else if (part === 'weight') {
      const map = (el.properties?.['tableCellFontWeight'] as Record<string, string>) || {};
      nextProps['tableCellFontWeight'] = { ...map, [key]: String(value) };
    } else if (part === 'size') {
      const map = (el.properties?.['tableCellFontSize'] as Record<string, number>) || {};
      nextProps['tableCellFontSize'] = { ...map, [key]: Math.max(1, Number(value) || 12) };
    } else if (part === 'lineHeight') {
      const map = (el.properties?.['tableCellLineHeight'] as Record<string, number>) || {};
      nextProps['tableCellLineHeight'] = { ...map, [key]: Math.max(0.5, Number(value) || 1.5) };
    } else if (part === 'family') {
      const map = (el.properties?.['tableCellFontFamily'] as Record<string, string>) || {};
      nextProps['tableCellFontFamily'] = { ...map, [key]: String(value) };
    } else if (part === 'decoration') {
      const map = (el.properties?.['tableCellTextDecoration'] as Record<string, string>) || {};
      nextProps['tableCellTextDecoration'] = { ...map, [key]: String(value) };
    }
    this.updateElement({ properties: nextProps });
  }

  private normalizeNumber(value: number, fallback: number = 0): number {
    if (Number.isFinite(value)) {
      return value;
    }
    return fallback;
  }
}
