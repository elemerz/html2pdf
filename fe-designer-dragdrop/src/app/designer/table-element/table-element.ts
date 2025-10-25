import { Component, HostListener, Input, signal, inject, ElementRef } from '@angular/core';
import { CellEditorDialogComponent } from './cell-editor-dialog';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CanvasElement } from '../../shared/models/schema';
import { DesignerStateService } from '../../core/services/designer-state.service';
import { getTableColSizes, getTableRowSizes, withTableSizes } from '../../shared/utils/table-utils';

type ResizeMode =
  | { type: 'row'; index: number; startClientY: number; startRowSizes: number[] }
  | { type: 'col'; index: number; startClientX: number; startColSizes: number[] };

interface ContextMenuCell {
  row: number;
  col: number;
}

@Component({
  selector: 'app-table-element',
  standalone: true,
  imports: [CommonModule, CellEditorDialogComponent],
  templateUrl: './table-element.html',
  styleUrl: './table-element.less',
})
export class TableElementComponent {
  @Input({ required: true }) element!: CanvasElement;
  @Input() mmToPx = 3.7795275591;
  @Input() gridSize = 10;

  protected designerState = inject(DesignerStateService);
  private hostRef = inject(ElementRef<HTMLElement>);
  private sanitizer = inject(DomSanitizer);
  private activeResize: ResizeMode | null = null;

  protected showContextMenu = signal(false);
  protected contextMenuPosition = signal({ x: 0, y: 0 });
  protected showActionsToolbar = signal(false);
  protected contextMenuCell = signal<ContextMenuCell | null>(null);

  protected getRowSizes(): number[] {
    return getTableRowSizes(this.element);
  }

  protected getColSizes(): number[] {
    return getTableColSizes(this.element);
  }
  protected isCellSelected(row: number, col: number): boolean {
    const selection = this.designerState.selectedTableCell();
    if (!selection) return false;
    if (selection.elementId !== this.element.id) return false;
    return selection.row === row && selection.col === col;
  }

  protected getSelectedCellOffsets(): { left: number; top: number; width: number } | null {
    const selection = this.designerState.selectedTableCell();
    if (!selection || selection.elementId !== this.element.id) return null;

    const rowSizes = this.getRowSizes();
    const colSizes = this.getColSizes();
    if (!rowSizes.length || !colSizes.length) return null;

    let top = 0;
    for (let r = 0; r < selection.row; r++) {
      top += rowSizes[r] * this.element.height;
    }

    let left = 0;
    for (let c = 0; c < selection.col; c++) {
      left += colSizes[c] * this.element.width;
    }

    const width = colSizes[selection.col] * this.element.width;
    return { left, top, width };
  }

  protected getCellContentRaw(row: number, col: number): string {
    const contents = this.element.properties?.['tableCellContents'];
    if (contents && typeof contents === 'object') {
      const key = `${row}_${col}`;
      const value = (contents as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.length) {
        return value;
      }
    }
    return '&nbsp;';
  }

  protected getCellContent(row: number, col: number): SafeHtml {
    const htmlString = this.getCellContentRaw(row, col);
    
    // Bypass Angular's sanitization to preserve inline styles from Quill
    // This is safe because the content comes from our own Quill editor
    return this.sanitizer.bypassSecurityTrustHtml(htmlString);
  }

  protected showCellEditor = signal(false);

  protected onEditCellContent(): void {
    const selection = this.designerState.selectedTableCell();
    if (!selection || selection.elementId !== this.element.id) return;
    this.showCellEditor.set(true);
    this.closeActionsToolbar();
  }

  protected toggleActionsToolbar(): void {
    this.showActionsToolbar.update(v => !v);
  }

  protected closeActionsToolbar(): void {
    this.showActionsToolbar.set(false);
  }

  protected onSplitRowsFromToolbar(): void {
    const selection = this.designerState.selectedTableCell();
    if (!selection || selection.elementId !== this.element.id) return;
    
    const parts = this.promptForSplit('row');
    if (!parts) {
      this.closeActionsToolbar();
      return;
    }

    const rowSizes = this.getRowSizes();
    if (!rowSizes.length) {
      this.closeActionsToolbar();
      return;
    }

    const currentSize = rowSizes[selection.row];
    if (currentSize <= 0) {
      this.closeActionsToolbar();
      return;
    }

    const newSizesSegment = Array.from({ length: parts }, () => currentSize / parts);
    const updatedRows = [...rowSizes];
    updatedRows.splice(selection.row, 1, ...newSizesSegment);

    this.applyTableSizes(updatedRows, this.getColSizes());
    this.designerState.selectTableCell(this.element.id, selection.row, selection.col);
    this.closeActionsToolbar();
  }

  protected onSplitColsFromToolbar(): void {
    const selection = this.designerState.selectedTableCell();
    if (!selection || selection.elementId !== this.element.id) return;
    
    const parts = this.promptForSplit('col');
    if (!parts) {
      this.closeActionsToolbar();
      return;
    }

    const colSizes = this.getColSizes();
    if (!colSizes.length) {
      this.closeActionsToolbar();
      return;
    }

    const currentSize = colSizes[selection.col];
    if (currentSize <= 0) {
      this.closeActionsToolbar();
      return;
    }

    const newSizesSegment = Array.from({ length: parts }, () => currentSize / parts);
    const updatedCols = [...colSizes];
    updatedCols.splice(selection.col, 1, ...newSizesSegment);

    this.applyTableSizes(this.getRowSizes(), updatedCols);
    this.designerState.selectTableCell(this.element.id, selection.row, selection.col);
    this.closeActionsToolbar();
  }

  protected onDeleteRowFromToolbar(): void {
    const selection = this.designerState.selectedTableCell();
    if (!selection || selection.elementId !== this.element.id) return;
    
    const rowSizes = this.getRowSizes();
    
    // Check minimum (can't delete last row)
    if (rowSizes.length <= 1) {
      alert("Cannot delete the last row. Table must have at least 1 row.");
      this.closeActionsToolbar();
      return;
    }
    
    // Check for content (smart confirmation)
    const hasContent = this.rowHasContent(selection.row);
    if (hasContent) {
      if (!confirm("This row contains content. Delete anyway?")) {
        this.closeActionsToolbar();
        return;
      }
    }
    
    // Remove the row and redistribute sizes proportionally
    const updatedRows = [...rowSizes];
    updatedRows.splice(selection.row, 1);
    
    // Normalize to maintain total = 1 (proportional redistribution)
    const total = updatedRows.reduce((sum, size) => sum + size, 0);
    const normalized = updatedRows.map(size => size / total);
    
    // Clean up cell properties for deleted row
    this.cleanupDeletedRow(selection.row, rowSizes.length);
    
    this.applyTableSizes(normalized, this.getColSizes());
    
    // Select safe cell after deletion
    const newRow = Math.min(selection.row, normalized.length - 1);
    this.designerState.selectTableCell(this.element.id, newRow, selection.col);
    this.closeActionsToolbar();
  }

  protected onDeleteColFromToolbar(): void {
    const selection = this.designerState.selectedTableCell();
    if (!selection || selection.elementId !== this.element.id) return;
    
    const colSizes = this.getColSizes();
    
    // Check minimum (can't delete last column)
    if (colSizes.length <= 1) {
      alert("Cannot delete the last column. Table must have at least 1 column.");
      this.closeActionsToolbar();
      return;
    }
    
    // Check for content (smart confirmation)
    const hasContent = this.colHasContent(selection.col);
    if (hasContent) {
      if (!confirm("This column contains content. Delete anyway?")) {
        this.closeActionsToolbar();
        return;
      }
    }
    
    // Remove the column and redistribute sizes proportionally
    const updatedCols = [...colSizes];
    updatedCols.splice(selection.col, 1);
    
    // Normalize to maintain total = 1 (proportional redistribution)
    const total = updatedCols.reduce((sum, size) => sum + size, 0);
    const normalized = updatedCols.map(size => size / total);
    
    // Clean up cell properties for deleted column
    this.cleanupDeletedCol(selection.col, colSizes.length);
    
    this.applyTableSizes(this.getRowSizes(), normalized);
    
    // Select safe cell after deletion
    const newCol = Math.min(selection.col, normalized.length - 1);
    this.designerState.selectTableCell(this.element.id, selection.row, newCol);
    this.closeActionsToolbar();
  }

  private rowHasContent(rowIndex: number): boolean {
    const colSizes = this.getColSizes();
    const contents = this.element.properties?.['tableCellContents'] as Record<string, string> | undefined;
    if (!contents) return false;
    
    for (let col = 0; col < colSizes.length; col++) {
      const key = `${rowIndex}_${col}`;
      const content = contents[key];
      if (content && content.trim() !== '' && content !== '&nbsp;') {
        return true;
      }
    }
    return false;
  }

  private colHasContent(colIndex: number): boolean {
    const rowSizes = this.getRowSizes();
    const contents = this.element.properties?.['tableCellContents'] as Record<string, string> | undefined;
    if (!contents) return false;
    
    for (let row = 0; row < rowSizes.length; row++) {
      const key = `${row}_${colIndex}`;
      const content = contents[key];
      if (content && content.trim() !== '' && content !== '&nbsp;') {
        return true;
      }
    }
    return false;
  }

  private cleanupDeletedRow(deletedRow: number, totalRows: number): void {
    const colSizes = this.getColSizes();
    const propertyMaps = [
      'tableCellContents',
      'tableCellPadding',
      'tableCellHAlign',
      'tableCellVAlign',
      'tableCellBorderWidth',
      'tableCellBorderStyle',
      'tableCellBorderColor',
      'tableCellFontStyle',
      'tableCellFontWeight',
      'tableCellFontSize',
      'tableCellLineHeight',
      'tableCellFontFamily',
      'tableCellTextDecoration'
    ];
    
    propertyMaps.forEach(mapName => {
      const map = this.element.properties?.[mapName] as Record<string, any> | undefined;
      if (!map) return;
      
      const newMap: Record<string, any> = {};
      
      // Reindex all cells
      for (let row = 0; row < totalRows; row++) {
        for (let col = 0; col < colSizes.length; col++) {
          const oldKey = `${row}_${col}`;
          
          if (row === deletedRow) {
            // Skip deleted row
            continue;
          } else if (row > deletedRow) {
            // Rows after deleted row: shift up
            const newKey = `${row - 1}_${col}`;
            if (map[oldKey] !== undefined) {
              newMap[newKey] = map[oldKey];
            }
          } else {
            // Rows before deleted row: keep same index
            if (map[oldKey] !== undefined) {
              newMap[oldKey] = map[oldKey];
            }
          }
        }
      }
      
      // Update the property map
      this.element.properties![mapName] = newMap;
    });
  }

  private cleanupDeletedCol(deletedCol: number, totalCols: number): void {
    const rowSizes = this.getRowSizes();
    const propertyMaps = [
      'tableCellContents',
      'tableCellPadding',
      'tableCellHAlign',
      'tableCellVAlign',
      'tableCellBorderWidth',
      'tableCellBorderStyle',
      'tableCellBorderColor',
      'tableCellFontStyle',
      'tableCellFontWeight',
      'tableCellFontSize',
      'tableCellLineHeight',
      'tableCellFontFamily',
      'tableCellTextDecoration'
    ];
    
    propertyMaps.forEach(mapName => {
      const map = this.element.properties?.[mapName] as Record<string, any> | undefined;
      if (!map) return;
      
      const newMap: Record<string, any> = {};
      
      // Reindex all cells
      for (let row = 0; row < rowSizes.length; row++) {
        for (let col = 0; col < totalCols; col++) {
          const oldKey = `${row}_${col}`;
          
          if (col === deletedCol) {
            // Skip deleted column
            continue;
          } else if (col > deletedCol) {
            // Columns after deleted column: shift left
            const newKey = `${row}_${col - 1}`;
            if (map[oldKey] !== undefined) {
              newMap[newKey] = map[oldKey];
            }
          } else {
            // Columns before deleted column: keep same index
            if (map[oldKey] !== undefined) {
              newMap[oldKey] = map[oldKey];
            }
          }
        }
      }
      
      // Update the property map
      this.element.properties![mapName] = newMap;
    });
  }

  protected onCellEditorSaved(html: string): void {
    const selection = this.designerState.selectedTableCell();
    if (!selection || selection.elementId !== this.element.id) return;
    const key = `${selection.row}_${selection.col}`;
    const existingContents = (this.element.properties?.['tableCellContents'] as Record<string, string>) || {};
    const updatedProperties = {
      ...(this.element.properties || {}),
      tableCellContents: { ...existingContents, [key]: html }
    } as Record<string, any>;
    this.designerState.updateElement(this.element.id, { properties: updatedProperties });
    this.showCellEditor.set(false);
  }

  protected onCellEditorClosed(): void {
    this.showCellEditor.set(false);
  }

  protected onCellClick(event: MouseEvent, row: number, col: number): void {
    event.stopPropagation();
    event.preventDefault();
    this.designerState.selectElement(this.element.id);
    this.designerState.selectTableCell(this.element.id, row, col);
    this.closeContextMenu();
  }

  protected onCellContextMenu(event: MouseEvent, row: number, col: number): void {
    event.preventDefault();
    event.stopPropagation();
    this.designerState.selectElement(this.element.id);
    this.designerState.selectTableCell(this.element.id, row, col);
    this.contextMenuCell.set({ row, col });
    const hostRect = this.hostRef.nativeElement.getBoundingClientRect();
    this.contextMenuPosition.set({
      x: event.clientX - hostRect.left,
      y: event.clientY - hostRect.top
    });
    this.showContextMenu.set(true);
  }

  protected onSplitHorizontally(): void {
    const cell = this.contextMenuCell();
    if (!cell) {
      this.closeContextMenu();
      return;
    }

    const parts = this.promptForSplit('row');
    if (!parts) {
      this.closeContextMenu();
      return;
    }

    const rowSizes = this.getRowSizes();
    if (!rowSizes.length) {
      this.closeContextMenu();
      return;
    }

    const currentSize = rowSizes[cell.row];
    if (currentSize <= 0) {
      this.closeContextMenu();
      return;
    }

    const newSizesSegment = Array.from({ length: parts }, () => currentSize / parts);
    const updatedRows = [...rowSizes];
    updatedRows.splice(cell.row, 1, ...newSizesSegment);

    this.applyTableSizes(updatedRows, this.getColSizes());
    this.designerState.selectTableCell(this.element.id, cell.row, cell.col);
    this.closeContextMenu();
  }

  protected onSplitVertically(): void {
    const cell = this.contextMenuCell();
    if (!cell) {
      this.closeContextMenu();
      return;
    }

    const parts = this.promptForSplit('col');
    if (!parts) {
      this.closeContextMenu();
      return;
    }

    const colSizes = this.getColSizes();
    if (!colSizes.length) {
      this.closeContextMenu();
      return;
    }

    const currentSize = colSizes[cell.col];
    if (currentSize <= 0) {
      this.closeContextMenu();
      return;
    }

    const newSizesSegment = Array.from({ length: parts }, () => currentSize / parts);
    const updatedCols = [...colSizes];
    updatedCols.splice(cell.col, 1, ...newSizesSegment);

    this.applyTableSizes(this.getRowSizes(), updatedCols);
    this.designerState.selectTableCell(this.element.id, cell.row, cell.col);
    this.closeContextMenu();
  }

  protected closeContextMenu(): void {
    this.showContextMenu.set(false);
    this.contextMenuCell.set(null);
  }

  protected getRowHandleOffset(rowSizes: number[], index: number): number {
    let sum = 0;
    for (let i = 0; i <= index; i++) {
      sum += rowSizes[i] ?? 0;
    }
    return sum * 100;
  }

  protected getColHandleOffset(colSizes: number[], index: number): number {
    let sum = 0;
    for (let i = 0; i <= index; i++) {
      sum += colSizes[i] ?? 0;
    }
    return sum * 100;
  }

  protected startRowResize(index: number, event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    if (index < 0) return;

    const rowSizes = this.getRowSizes();
    if (index >= rowSizes.length - 1) return;

    this.activeResize = {
      type: 'row',
      index,
      startClientY: event.clientY,
      startRowSizes: [...rowSizes],
    };
    this.closeContextMenu();
    this.designerState.selectElement(this.element.id);
  }

  protected startColResize(index: number, event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    if (index < 0) return;

    const colSizes = this.getColSizes();
    if (index >= colSizes.length - 1) return;

    this.activeResize = {
      type: 'col',
      index,
      startClientX: event.clientX,
      startColSizes: [...colSizes],
    };
    this.closeContextMenu();
    this.designerState.selectElement(this.element.id);
  }

  protected trackByIndex(index: number): number {
    return index;
  }

  protected isResizing(type: 'row' | 'col', index: number): boolean {
    const active = this.activeResize;
    if (!active) return false;
    return active.type === type && active.index === index;
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent): void {
    if (!this.activeResize) {
      return;
    }

    if (this.activeResize.type === 'row') {
      this.handleRowResize(event);
    } else if (this.activeResize.type === 'col') {
      this.handleColResize(event);
    }
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    this.activeResize = null;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.showContextMenu()) {
      return;
    }
    const host = this.hostRef.nativeElement;
    if (!host.contains(event.target as Node)) {
      this.closeContextMenu();
    }
  }

  private handleRowResize(event: MouseEvent): void {
    if (!this.activeResize || this.activeResize.type !== 'row') return;

    const start = this.activeResize;
    const deltaPx = event.clientY - start.startClientY;
    const deltaMm = deltaPx / this.mmToPx;
    const tableHeight = Math.max(this.element.height, 1);
    const deltaRatio = deltaMm / tableHeight;

    const startSizes = start.startRowSizes;
    const index = start.index;
    const pairTotal = startSizes[index] + startSizes[index + 1];

    const minRatio = this.getMinRatio(tableHeight, pairTotal);
    let newFirst = startSizes[index] + deltaRatio;
    newFirst = Math.min(Math.max(newFirst, minRatio), pairTotal - minRatio);
    const newSecond = pairTotal - newFirst;

    const updatedRows = [...startSizes];
    updatedRows[index] = newFirst;
    updatedRows[index + 1] = newSecond;

    this.applyTableSizes(updatedRows, this.getColSizes());
  }

  private handleColResize(event: MouseEvent): void {
    if (!this.activeResize || this.activeResize.type !== 'col') return;

    const start = this.activeResize;
    const deltaPx = event.clientX - start.startClientX;
    const deltaMm = deltaPx / this.mmToPx;
    const tableWidth = Math.max(this.element.width, 1);
    const deltaRatio = deltaMm / tableWidth;

    const startSizes = start.startColSizes;
    const index = start.index;
    const pairTotal = startSizes[index] + startSizes[index + 1];

    const minRatio = this.getMinRatio(tableWidth, pairTotal);
    let newFirst = startSizes[index] + deltaRatio;
    newFirst = Math.min(Math.max(newFirst, minRatio), pairTotal - minRatio);
    const newSecond = pairTotal - newFirst;

    const updatedCols = [...startSizes];
    updatedCols[index] = newFirst;
    updatedCols[index + 1] = newSecond;

    this.applyTableSizes(this.getRowSizes(), updatedCols);
  }

  private getMinRatio(tableSize: number, pairTotal: number): number {
    const minSizeMm = Math.max(2, this.gridSize, this.designerState.logicalGridSize());
    const baseRatio = minSizeMm / Math.max(tableSize, minSizeMm);
    const safeBase = Math.max(baseRatio, 0.001);
    const maxAllowed = Math.max(pairTotal - 0.001, 0.001);
    return Math.min(safeBase, maxAllowed);
  }

  private applyTableSizes(rowSizes: number[], colSizes: number[]): void {
    const properties = withTableSizes(this.element, rowSizes, colSizes);
    this.designerState.updateElement(this.element.id, { properties });
  }

  private promptForSplit(axis: 'row' | 'col'): number | null {
    const axisLabel = axis === 'row' ? 'rows' : 'columns';
    const response = window.prompt(`Split into how many ${axisLabel}?`, '2');
    if (response === null) {
      return null;
    }

    const parsed = Number.parseInt(response, 10);
    if (!Number.isFinite(parsed) || parsed < 2) {
      return 2;
    }

    return Math.min(parsed, 20);
  }

  // Cell style helpers (padding & alignment)
  private cellKey(row: number, col: number): string {
    return `${row}_${col}`;
  }

  protected getCellPadding(row: number, col: number): { top: number; right: number; bottom: number; left: number } {
    const key = this.cellKey(row, col);
    const paddingMap = this.element.properties?.['tableCellPadding'] as Record<string, number[]> | undefined;
    const raw = paddingMap?.[key];
    if (Array.isArray(raw) && raw.length === 4) {
      const [top, right, bottom, left] = raw.map(v => (Number.isFinite(v) ? v : 0));
      return { top, right, bottom, left };
    }
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  protected getCellPaddingString(row: number, col: number): string {
    const padding = this.getCellPadding(row, col);
    return `${padding.top}mm ${padding.right}mm ${padding.bottom}mm ${padding.left}mm`;
  }

  protected getCellHAlign(row: number, col: number): 'left' | 'center' | 'right' {
    const key = this.cellKey(row, col);
    const map = this.element.properties?.['tableCellHAlign'] as Record<string, string> | undefined;
    const value = map?.[key];
    return value === 'center' || value === 'right' ? value : 'left';
  }

  protected getCellVAlign(row: number, col: number): 'top' | 'middle' | 'bottom' {
    const key = this.cellKey(row, col);
    const map = this.element.properties?.['tableCellVAlign'] as Record<string, string> | undefined;
    const value = map?.[key];
    return value === 'middle' || value === 'bottom' ? value : 'top';
  }

  protected getCellVAlignFlex(row: number, col: number): 'flex-start' | 'center' | 'flex-end' {
    const v = this.getCellVAlign(row, col);
    if (v === 'middle') return 'center';
    if (v === 'bottom') return 'flex-end';
    return 'flex-start';
  }

  protected getCellBorder(row: number, col: number): string {
    const key = `${row}_${col}`;
    const widthMap = this.element.properties?.['tableCellBorderWidth'] as Record<string, number> | undefined;
    const styleMap = this.element.properties?.['tableCellBorderStyle'] as Record<string, string> | undefined;
    const colorMap = this.element.properties?.['tableCellBorderColor'] as Record<string, string> | undefined;
    const w = widthMap?.[key];
    const s = styleMap?.[key];
    const c = colorMap?.[key];
    const width = Number.isFinite(w) ? w! : 0;
    const style = typeof s === 'string' ? s : 'solid';
    const color = typeof c === 'string' ? c : '#000000';
    return width > 0 ? `${width}px ${style} ${color}` : 'none';
  }

  protected getCellFontStyle(row: number, col: number): string {
    const key = `${row}_${col}`;
    const map = this.element.properties?.['tableCellFontStyle'] as Record<string, string> | undefined;
    return map?.[key] || 'normal';
  }

  protected getCellFontWeight(row: number, col: number): string {
    const key = `${row}_${col}`;
    const map = this.element.properties?.['tableCellFontWeight'] as Record<string, string> | undefined;
    return map?.[key] || 'normal';
  }

  protected getCellFontSize(row: number, col: number): string {
    const key = `${row}_${col}`;
    const map = this.element.properties?.['tableCellFontSize'] as Record<string, number> | undefined;
    const size = map?.[key];
    return Number.isFinite(size) ? `${size}pt` : '12pt';
  }

  protected getCellLineHeight(row: number, col: number): string {
    const key = `${row}_${col}`;
    const map = this.element.properties?.['tableCellLineHeight'] as Record<string, number> | undefined;
    const lineHeight = map?.[key];
    return Number.isFinite(lineHeight) ? String(lineHeight) : '1.5';
  }

  protected getCellFontFamily(row: number, col: number): string {
    const key = `${row}_${col}`;
    const map = this.element.properties?.['tableCellFontFamily'] as Record<string, string> | undefined;
    return map?.[key] || 'sans-serif';
  }

  protected getCellTextDecoration(row: number, col: number): string {
    const key = `${row}_${col}`;
    const map = this.element.properties?.['tableCellTextDecoration'] as Record<string, string> | undefined;
    return map?.[key] || 'none';
  }
}

