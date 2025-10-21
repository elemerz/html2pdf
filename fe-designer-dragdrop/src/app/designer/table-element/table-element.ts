import { Component, HostListener, Input, signal, inject, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  imports: [CommonModule],
  templateUrl: './table-element.html',
  styleUrl: './table-element.less',
})
export class TableElementComponent {
  @Input({ required: true }) element!: CanvasElement;
  @Input() mmToPx = 3.7795275591;
  @Input() gridSize = 10;

  private designerState = inject(DesignerStateService);
  private hostRef = inject(ElementRef<HTMLElement>);
  private activeResize: ResizeMode | null = null;

  protected showContextMenu = signal(false);
  protected contextMenuPosition = signal({ x: 0, y: 0 });
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
}
