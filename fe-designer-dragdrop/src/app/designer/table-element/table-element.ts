import { Component, HostListener, Input, signal, inject, ElementRef, AfterViewInit, AfterViewChecked, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CellEditorDialogComponent } from './cell-editor-dialog';
import { RepeatBindingDialogComponent } from './repeat-binding-dialog';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CanvasElement, TableCellBorderConfig, TableCellBorderSpec } from '../../shared/models/schema';
import { DesignerStateService } from '../../core/services/designer-state.service';
import { getTableColSizes, getTableRowSizes, withTableSizes } from '../../shared/utils/table-utils';

type ResizeMode =
  | { type: 'row'; index: number; startClientY: number; startRowSizes: number[] }
  | { type: 'col'; index: number; startClientX: number; startColSizes: number[] }
  | { type: 'subtable-row'; parentRow: number; parentCol: number; subTablePath: Array<{row: number; col: number}>; index: number; startClientY: number; startRowSizes: number[]; level: number }
  | { type: 'subtable-col'; parentRow: number; parentCol: number; subTablePath: Array<{row: number; col: number}>; index: number; startClientX: number; startColSizes: number[]; level: number };

type BorderSide = 'all' | 'top' | 'right' | 'bottom' | 'left';
type BorderEdge = 'top' | 'right' | 'bottom' | 'left';

interface ContextMenuCell {
  row: number;
  col: number;
}

/**
 * Rich table component that supports nested sub-tables, resizing, and cell formatting.
 */
@Component({
  selector: 'app-table-element',
  standalone: true,
  imports: [CommonModule, CellEditorDialogComponent, RepeatBindingDialogComponent],
  templateUrl: './table-element.html',
  styleUrl: './table-element.less',
})
export class TableElementComponent implements AfterViewInit, AfterViewChecked, OnDestroy, OnChanges {
  @Input({ required: true }) element!: CanvasElement;
  @Input() mmToPx = 3.7795275591;
  @Input() gridSize = 10;

  protected designerState = inject(DesignerStateService);
  private hostRef = inject(ElementRef<HTMLElement>);
  private sanitizer = inject(DomSanitizer);
  private activeResize: ResizeMode | null = null;
  private clickListener?: (event: MouseEvent) => void;
  private subTableClickHandlersAttached = new WeakSet<HTMLElement>();
  private subTableHtmlCache = new Map<string, SafeHtml>();

  protected showContextMenu = signal(false);
  protected contextMenuPosition = signal({ x: 0, y: 0 });
  protected contextMenuCell = signal<ContextMenuCell | null>(null);
  protected showActionsToolbar = signal(false);

  /**
   * Clears cached HTML when the bound element input changes.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['element'] && !changes['element'].firstChange) {
      this.subTableHtmlCache.clear();
    }
  }

  /**
   * Sets up global capture listeners once the table view is ready.
   */
  ngAfterViewInit(): void {
    // Add DOCUMENT-level listener first for debugging
    const docListener = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
    };
    document.addEventListener('click', docListener, true);

    // Add click listener at capture phase to intercept ALL clicks including sub-table cells
    this.clickListener = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      this.handleNativeClick(event);
    };

    // Use capture phase to intercept before any other handlers
    this.hostRef.nativeElement.addEventListener('click', this.clickListener, true);
  }

  /**
   * Removes capture listeners to avoid leaks.
   */
  ngOnDestroy(): void {
    if (this.clickListener) {
      this.hostRef.nativeElement.removeEventListener('click', this.clickListener, true);
    }
  }

  /**
   * Ensures resize handles on nested sub-tables remain wired to the component logic.
   */
  ngAfterViewChecked(): void {
    // Attach event listeners to subtable resize handles
    this.attachSubTableResizeHandlers();
  }

  /**
   * Registers mousedown handlers for all nested sub-table resize handles.
   */
  private attachSubTableResizeHandlers(): void {
    const allHandles = this.hostRef.nativeElement.querySelectorAll('.sub-table-resize-handle');
    allHandles.forEach((handle: HTMLElement) => {
      // Remove old listener if exists
      (handle as any)._resizeListener && handle.removeEventListener('mousedown', (handle as any)._resizeListener);
      
      // Create and attach new listener
      const listener = (event: MouseEvent) => this.startSubTableResize(handle, event);
      (handle as any)._resizeListener = listener;
      handle.addEventListener('mousedown', listener);
    });
  }

  /**
   * Routes clicks from the DOM (including nested subtables) to Angular selection logic.
   */
  private handleNativeClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    // Check if click was on or inside a sub-table cell
    const subTableCell = target.closest('.sub-table-cell') as HTMLElement;
    if (subTableCell) {
      event.stopPropagation();

      const subRow = parseInt(subTableCell.dataset['row'] || '0', 10);
      const subCol = parseInt(subTableCell.dataset['col'] || '0', 10);
      const level = parseInt(subTableCell.dataset['level'] || '1', 10);

      // Build the full path through all nesting levels
      const subTablePath: Array<{ row: number; col: number }> = [];

      // Walk up from the clicked cell to collect all sub-table levels
      let currentCell: HTMLElement | null = subTableCell;
      while (currentCell && currentCell.classList.contains('sub-table-cell')) {
        const r = parseInt(currentCell.dataset['row'] || '0', 10);
        const c = parseInt(currentCell.dataset['col'] || '0', 10);

        // Add to the FRONT of the path (we're walking up)
        subTablePath.unshift({ row: r, col: c });

        // Move to parent sub-table cell (if any)
        const parentTable = currentCell.closest('table');
        if (parentTable) {
          currentCell = parentTable.closest('.sub-table-cell') as HTMLElement | null;
        } else {
          currentCell = null;
        }
      }

      // Now find the root parent <td> (not a sub-table-cell)
      let parentTd = subTableCell.closest('td') as HTMLElement | null;
      while (parentTd && parentTd.classList.contains('sub-table-cell')) {
        const parentTable = parentTd.closest('table');
        if (parentTable) {
          parentTd = parentTable.closest('td');
        } else {
          parentTd = null;
        }
      }

      if (!parentTd) return;

      // Find parent row and col by searching through the table structure
      const mainTable = this.hostRef.nativeElement.querySelector('table:first-of-type');
      if (!mainTable) return;

      const allTds = Array.from(mainTable.querySelectorAll(':scope > tbody > tr > td'));
      const parentIndex = allTds.indexOf(parentTd);
      if (parentIndex === -1) return;

      const colSizes = this.getColSizes();
      const parentRow = Math.floor(parentIndex / colSizes.length);
      const parentCol = parentIndex % colSizes.length;
      // Build path and select - pass the FULL subTablePath to support all nesting levels
      this.designerState.selectElement(this.element.id);
      this.designerState.selectTableCell(this.element.id, parentRow, parentCol, subTablePath.length > 0 ? subTablePath : undefined);
      if (event.detail === 2) {
        this.onEditCellContent();
      }
      return;
    }

    // Check if click was on a parent cell (not sub-table)
    const parentTd = target.closest('td[data-row]') as HTMLElement;
    if (parentTd && !parentTd.classList.contains('sub-table-cell')) {
      const row = parseInt(parentTd.dataset['row'] || '0', 10);
      const col = parseInt(parentTd.dataset['col'] || '0', 10);
      this.designerState.selectElement(this.element.id);
      this.designerState.selectTableCell(this.element.id, row, col);
      if (event.detail === 2) {
        this.onEditCellContent();
      }
      this.closeContextMenu();
      return;
    }
  }

  /**
   * Returns the row size ratios for the current table.
   */
  protected getRowSizes(): number[] {
    return getTableRowSizes(this.element);
  }

  /**
   * Returns the column size ratios for the current table.
   */
  protected getColSizes(): number[] {
    return getTableColSizes(this.element);
  }
  /**
   * Indicates whether the supplied cell coordinates match the selected cell.
   */
  protected isCellSelected(row: number, col: number): boolean {
    const selection = this.designerState.selectedTableCell();
    if (!selection) return false;
    if (selection.elementId !== this.element.id) return false;
    return selection.row === row && selection.col === col;
  }

  /**
   * Calculates the pixel offsets for the selected cell, including nested sub-cells.
   */
  protected getSelectedCellOffsets(): { left: number; top: number; width: number } | null {
    const selection = this.designerState.selectedTableCell();
    if (!selection || selection.elementId !== this.element.id) return null;

    const rowSizes = this.getRowSizes();
    const colSizes = this.getColSizes();
    if (!rowSizes.length || !colSizes.length) return null;

    // Calculate parent cell position
    let top = 0;
    for (let r = 0; r < selection.row; r++) {
      top += rowSizes[r] * this.element.height;
    }

    let left = 0;
    for (let c = 0; c < selection.col; c++) {
      left += colSizes[c] * this.element.width;
    }

    let width = colSizes[selection.col] * this.element.width;
    let height = rowSizes[selection.row] * this.element.height;

    // If sub-table path exists, calculate nested sub-cell position
    if (selection.subTablePath && selection.subTablePath.length > 0) {
      const parentKey = `${selection.row}_${selection.col}`;
      const subTablesMap = this.element.properties?.['tableCellSubTables'] as Record<string, any> | undefined;

      if (subTablesMap && subTablesMap[parentKey]) {
        // Add parent cell padding once at the start
        const parentPadding = this.getCellPadding(selection.row, selection.col);
        top += parentPadding.top;
        left += parentPadding.left;

        // Walk through each level of nesting
        let currentSubTable = subTablesMap[parentKey];
        // Subtract padding from available dimensions for subtable
        let currentWidth = width - parentPadding.left - parentPadding.right;
        let currentHeight = height - parentPadding.top - parentPadding.bottom;

        for (let level = 0; level < selection.subTablePath.length; level++) {
          const subCell: { row: number; col: number } = selection.subTablePath[level];
          const subRowSizes = currentSubTable.rowSizes || [];
          const subColSizes = currentSubTable.colSizes || [];

          // Calculate offset within current level
          let subTop = 0;
          for (let r = 0; r < subCell.row; r++) {
            subTop += subRowSizes[r] * currentHeight;
          }

          let subLeft = 0;
          for (let c = 0; c < subCell.col; c++) {
            subLeft += subColSizes[c] * currentWidth;
          }

          // Update position
          top += subTop;
          left += subLeft;

          // Update dimensions for next level (or final dimensions)
          currentWidth = subColSizes[subCell.col] * currentWidth;
          currentHeight = subRowSizes[subCell.row] * currentHeight;

          // If there's another level, get the nested sub-table
          if (level < selection.subTablePath.length - 1) {
            const nestedKey = `${subCell.row}_${subCell.col}`;
            const nestedSubTables = currentSubTable.cellSubTables as Record<string, any> | undefined;
            if (nestedSubTables && nestedSubTables[nestedKey]) {
              currentSubTable = nestedSubTables[nestedKey];
            } else {
              console.warn(`No nested sub-table found at level ${level}, key: ${nestedKey}`);
              break;
            }
          }
        }

        width = currentWidth;
      }
    }

    const result = { left, top, width };
    return result;
  }

  /**
   * Builds breadcrumb items for the currently selected nested cell (excludes the active cell).
   */
  protected getSelectedSubTableAncestors(): Array<{ label: string; level: number; path: Array<{ row: number; col: number }> }> {
    const selection = this.designerState.selectedTableCell();
    if (!selection || selection.elementId !== this.element.id) {
      return [];
    }
    const path = selection.subTablePath;
    if (!path || path.length === 0) {
      return [];
    }

    const crumbs: Array<{ label: string; level: number; path: Array<{ row: number; col: number }> }> = [
      { label: 'L0', level: 0, path: [] },
    ];

    for (let index = 0; index < path.length - 1; index++) {
      crumbs.push({
        label: `L${index + 1}`,
        level: index + 1,
        path: path.slice(0, index + 1),
      });
    }

    return crumbs;
  }

  /**
   * Handles breadcrumb clicks to select ancestor nested cells.
   */
  protected onBreadcrumbClick(crumbPath: Array<{ row: number; col: number }>, event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();

    const selection = this.designerState.selectedTableCell();
    if (!selection || selection.elementId !== this.element.id) {
      return;
    }
    if (!selection.subTablePath || selection.subTablePath.length === 0) {
      return;
    }

    const nextPath = crumbPath;
    this.designerState.selectElement(this.element.id);
    this.designerState.selectTableCell(
      this.element.id,
      selection.row,
      selection.col,
      nextPath.length > 0 ? nextPath : undefined
    );
    this.closeActionsToolbar();
  }

  /**
   * Retrieves the raw HTML content for the specified cell, navigating nested tables if required.
   */
  protected getCellContentRaw(row: number, col: number): string {
    const selection = this.designerState.selectedTableCell();

    // Only navigate into nested structure if THIS cell is selected AND has a subTablePath
    if (selection && 
        selection.elementId === this.element.id &&
        selection.row === row && 
        selection.col === col &&
        selection.subTablePath && 
        selection.subTablePath.length > 0) {
      return this.getNestedCellContent(row, col, selection.subTablePath);
    }

    // Otherwise, get root cell content
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

  /**
   * Recursively resolves nested sub-table content for a selected cell path.
   */
  private getNestedCellContent(parentRow: number, parentCol: number, subTablePath: Array<{row: number; col: number}>): string {
    const parentKey = `${parentRow}_${parentCol}`;
    const subTablesMap = this.element.properties?.['tableCellSubTables'] as Record<string, any> | undefined;

    if (!subTablesMap || !subTablesMap[parentKey]) {
      return '&nbsp;';
    }

    // Navigate through each level of nesting
    let currentSubTable = subTablesMap[parentKey];

    for (let level = 0; level < subTablePath.length; level++) {
      const subCell = subTablePath[level];
      const isLastLevel = level === subTablePath.length - 1;

      if (isLastLevel) {
        // At the final level, get the content
        const cellKey = `${subCell.row}_${subCell.col}`;
        const content = currentSubTable.cellContents?.[cellKey];
        return (typeof content === 'string' && content.length) ? content : '&nbsp;';
      } else {
        // Navigate deeper into nested sub-tables
        const cellKey = `${subCell.row}_${subCell.col}`;
        const nestedSubTables = currentSubTable.cellSubTables as Record<string, any> | undefined;

        if (!nestedSubTables || !nestedSubTables[cellKey]) {
          return '&nbsp;';
        }

        currentSubTable = nestedSubTables[cellKey];
      }
    }

    return '&nbsp;';
  }

  /**
   * Returns sanitized HTML for rendering the cell content.
   */
  protected getCellContent(row: number, col: number): SafeHtml {
    const htmlString = this.getCellContentRaw(row, col);

    // Bypass Angular's sanitization to preserve inline styles from Quill
    // This is safe because the content comes from our own Quill editor
    return this.sanitizer.bypassSecurityTrustHtml(htmlString);
  }

  protected showCellEditor = signal(false);
  protected editorCellSelection = signal<{ row: number; col: number; subTablePath?: Array<{ row: number; col: number }> } | null>(null);

  /**
   * Launches the cell editor for the currently selected cell or sub-cell.
   */
  protected onEditCellContent(): void {
    const selection = this.designerState.selectedTableCell();
    if (!selection || selection.elementId !== this.element.id) return;
    this.editorCellSelection.set({ row: selection.row, col: selection.col, subTablePath: selection.subTablePath });
    this.showCellEditor.set(true);
    this.closeActionsToolbar();
  }

  /**
   * Shows or hides the cell actions popover.
   */
  protected toggleActionsToolbar(): void {
    this.showActionsToolbar.update(v => !v);
  }

  /**
   * Hides the actions popover.
   */
  protected closeActionsToolbar(): void {
    this.showActionsToolbar.set(false);
  }

  /**
   * Splits the selected row into evenly sized parts based on user input.
   */
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

  /**
   * Splits the selected column into evenly sized parts based on user input.
   */
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

  /**
   * Deletes the selected row, with confirmation if it contains content.
   */
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

  /**
   * Deletes the selected column, with confirmation if it contains content.
   */
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

  /**
   * Converts the selected cell into a sub-table, preserving inherited styling.
   */
  protected onSplitCellIntoSubTable(): void {
    const selection = this.designerState.selectedTableCell();
    if (!selection || selection.elementId !== this.element.id) return;

    // Determine current level and get target for split
    let currentLevel = 0;
    let targetData: any = null;
    let targetKey = '';

    if (selection.subTablePath && selection.subTablePath.length > 0) {
      // We're splitting a sub-table cell - walk through all nesting levels
      const parentKey = `${selection.row}_${selection.col}`;
      const subTablesMap = this.element.properties?.['tableCellSubTables'] as Record<string, any> | undefined;

      if (subTablesMap && subTablesMap[parentKey]) {
        let currentSubTable = subTablesMap[parentKey];
        currentLevel = currentSubTable.level || 1;

        // Walk through each level except the last one (which is the cell we're splitting)
        for (let i = 0; i < selection.subTablePath.length - 1; i++) {
          const subCell: { row: number; col: number } = selection.subTablePath[i];
          const cellKey = `${subCell.row}_${subCell.col}`;

          if (!currentSubTable.cellSubTables) {
            currentSubTable.cellSubTables = {};
          }

          if (!currentSubTable.cellSubTables[cellKey]) {
            console.error(`Sub-table path invalid at level ${i}, key: ${cellKey}`);
            this.closeActionsToolbar();
            return;
          }

          currentSubTable = currentSubTable.cellSubTables[cellKey];
          currentLevel = currentSubTable.level || currentLevel + 1;
        }

        // Now we're at the parent of the cell we want to split
        const finalSubCell = selection.subTablePath[selection.subTablePath.length - 1];
        targetKey = `${finalSubCell.row}_${finalSubCell.col}`;

        // Initialize cellSubTables if needed
        if (!currentSubTable.cellSubTables) {
          currentSubTable.cellSubTables = {};
        }

        // Check if this sub-cell already has a sub-table
        if (currentSubTable.cellSubTables[targetKey]) {
          currentLevel = currentSubTable.cellSubTables[targetKey].level || currentLevel + 1;
        }

        targetData = currentSubTable;
      }
    } else {
      // We're splitting a parent table cell
      currentLevel = this.getCurrentNestingLevel(selection.row, selection.col);
    }

    // Check nesting level
    if (currentLevel >= 5) {
      alert("Maximum nesting level (5) reached. Cannot create more nested tables.");
      this.closeActionsToolbar();
      return;
    }

    // Prompt for dimensions
    const rowsInput = window.prompt("Split into how many rows?", "2");
    if (!rowsInput) {
      this.closeActionsToolbar();
      return;
    }

    const colsInput = window.prompt("Split into how many columns?", "2");
    if (!colsInput) {
      this.closeActionsToolbar();
      return;
    }

    const rows = parseInt(rowsInput, 10);
    const cols = parseInt(colsInput, 10);

    if (!Number.isFinite(rows) || rows < 1 || !Number.isFinite(cols) || cols < 1) {
      alert("Invalid dimensions. Must be at least 1x1.");
      this.closeActionsToolbar();
      return;
    }

    // Create sub-table
    if (targetData && targetKey) {
      // Creating nested sub-table within existing sub-table
      this.createNestedSubTable(selection.row, selection.col, targetData, targetKey, rows, cols, currentLevel + 1);
    } else {
      // Creating sub-table in parent cell
      this.createSubTable(selection.row, selection.col, rows, cols, currentLevel + 1);
    }

    this.closeActionsToolbar();
  }

  /**
   * Determines whether the delete sub-table action should be available.
   */
  protected isDeleteSubTableEnabled(): boolean {
    const selection = this.designerState.selectedTableCell();
    return !!(selection && selection.elementId === this.element.id && selection.subTablePath && selection.subTablePath.length > 0);
  }

  /**
   * Removes a nested sub-table and compacts its content back into the parent cell.
   */
  protected onDeleteSubTableFromToolbar(): void {
    const selection = this.designerState.selectedTableCell();
    if (!selection || selection.elementId !== this.element.id || !selection.subTablePath || selection.subTablePath.length === 0) {
      this.closeActionsToolbar();
      return;
    }

    if (!confirm('Delete the selected sub-table?')) {
      this.closeActionsToolbar();
      return;
    }

    const parentRow = selection.row;
    const parentCol = selection.col;
    const parentKey = `${parentRow}_${parentCol}`;
    const path = selection.subTablePath;

    const subTablesMapOriginal = (this.element.properties?.['tableCellSubTables'] as Record<string, any>) || {};
    if (!subTablesMapOriginal[parentKey]) {
      this.closeActionsToolbar();
      return;
    }

    // Deep clone originals
    const subTablesMap = JSON.parse(JSON.stringify(subTablesMapOriginal));
    const contentsMapOriginal = (this.element.properties?.['tableCellContents'] as Record<string, string>) || {};
    const contentsMap = { ...contentsMapOriginal };

    // Helper to collect leaf cell contents recursively
    const collectContents = (sub: any, acc: string[]) => {
      if (!sub) return;
      const rows = sub.rows || 0;
      const cols = sub.cols || 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const key = `${r}_${c}`;
          if (sub.cellSubTables && sub.cellSubTables[key]) {
            collectContents(sub.cellSubTables[key], acc);
          } else {
            const raw = sub.cellContents?.[key];
            if (raw && raw.trim() !== '' && raw !== '&nbsp;') {
              acc.push(raw);
            }
          }
        }
      }
    };

    if (path.length === 1) {
      // First level sub-table: merge its contents into the parent cell then remove
      const subTableToRemove = subTablesMap[parentKey];
      const collected: string[] = [];
      collectContents(subTableToRemove, collected);
      delete subTablesMap[parentKey];
      contentsMap[parentKey] = collected.length ? collected.join('<br/>') : '&nbsp;';
    } else {
      // Nested sub-table: delete the sub-table containing the selected cell (path[path.length-2])
      const deletionHolder = path[path.length - 2];
      const deletionKey = `${deletionHolder.row}_${deletionHolder.col}`;

      // Navigate to the container that holds deletionKey
      let container = subTablesMap[parentKey];
      for (let i = 0; i < path.length - 2; i++) {
        const cellKey = `${path[i].row}_${path[i].col}`;
        if (!container.cellSubTables || !container.cellSubTables[cellKey]) {
          console.warn('Invalid sub-table path during delete (container traversal)', cellKey);
          this.closeActionsToolbar();
          return;
        }
        container = container.cellSubTables[cellKey];
      }

      const subTableToRemove = container.cellSubTables?.[deletionKey];
      if (subTableToRemove) {
        const collected: string[] = [];
        collectContents(subTableToRemove, collected);
        delete container.cellSubTables[deletionKey];
        if (!container.cellContents) container.cellContents = {};
        container.cellContents[deletionKey] = collected.length ? collected.join('<br/>') : '&nbsp;';
      } else {
        console.warn('Deletion target sub-table not found for key', deletionKey);
        this.closeActionsToolbar();
        return;
      }
    }

    const updatedProperties = {
      ...(this.element.properties || {}),
      tableCellSubTables: subTablesMap,
      tableCellContents: contentsMap
    } as Record<string, any>;

    this.subTableHtmlCache.clear();
    this.designerState.updateElement(this.element.id, { properties: updatedProperties });

    // Re-select parent cell (clears sub-table path)
    this.designerState.selectTableCell(this.element.id, parentRow, parentCol);
    this.closeActionsToolbar();
  }

  /** Opens custom repeat binding dialog for selected cell. */
  protected onSetRepeatBindingFromToolbar(): void {
    const selection = this.designerState.selectedTableCell();
    if (!selection || selection.elementId !== this.element.id) {
      this.closeActionsToolbar();
      return;
    }
    this.showRepeatBindingDialog.set(true);
    this.closeActionsToolbar();
  }

  /**
   * Builds a new nested sub-table inside an existing sub-table cell and migrates styles.
   */
  private createNestedSubTable(parentRow: number, parentCol: number, parentSubTable: any, subCellKey: string, rows: number, cols: number, level: number): void {
    // Get properties from parent sub-cell to inherit
    const parentContent = parentSubTable.cellContents?.[subCellKey] || '';
    const parentPadding = parentSubTable.cellPadding?.[subCellKey] || [0, 0, 0, 0];
    const parentHAlign = parentSubTable.cellHAlign?.[subCellKey] || 'left';
    const parentVAlign = parentSubTable.cellVAlign?.[subCellKey] || 'top';
    const parentBorder = this.getSubTableCellBorderSpec(parentSubTable, subCellKey, 'all');
    const parentFontFamily = parentSubTable.cellFontFamily?.[subCellKey] || '';
    const parentFontSize = parentSubTable.cellFontSize?.[subCellKey] || '';
    const parentFontWeight = parentSubTable.cellFontWeight?.[subCellKey] || '';
    const parentFontStyle = parentSubTable.cellFontStyle?.[subCellKey] || '';
    const parentLineHeight = parentSubTable.cellLineHeight?.[subCellKey] || '';
    const parentTextDecoration = parentSubTable.cellTextDecoration?.[subCellKey] || '';

    // Create nested sub-table data
    const nestedSubTable: any = {
      rows,
      cols,
      rowSizes: Array(rows).fill(1 / rows),
      colSizes: Array(cols).fill(1 / cols),
      level,
      cellContents: {},
      cellPadding: {},
      cellHAlign: {},
      cellVAlign: {},
      cellBorderWidth: {},
      cellBorderStyle: {},
      cellBorderColor: {},
      cellBorders: {},
      cellFontFamily: {},
      cellFontSize: {},
      cellFontWeight: {},
      cellFontStyle: {},
      cellLineHeight: {},
      cellTextDecoration: {}
    };

    // Move parent content to first nested sub-cell
    if (parentContent && parentContent !== '&nbsp;') {
      nestedSubTable.cellContents['0_0'] = parentContent;
    }

    // Apply inherited properties to all nested sub-cells
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const nestedKey = `${r}_${c}`;
        nestedSubTable.cellPadding[nestedKey] = parentPadding;
        nestedSubTable.cellHAlign[nestedKey] = parentHAlign;
        nestedSubTable.cellVAlign[nestedKey] = parentVAlign;
        nestedSubTable.cellBorderWidth[nestedKey] = parentBorder.width;
        nestedSubTable.cellBorderStyle[nestedKey] = parentBorder.style;
        nestedSubTable.cellBorderColor[nestedKey] = parentBorder.color;
        nestedSubTable.cellBorders[nestedKey] = { all: { ...parentBorder } };
        if (parentFontFamily) nestedSubTable.cellFontFamily[nestedKey] = parentFontFamily;
        if (parentFontSize) nestedSubTable.cellFontSize[nestedKey] = parentFontSize;
        if (parentFontWeight) nestedSubTable.cellFontWeight[nestedKey] = parentFontWeight;
        if (parentFontStyle) nestedSubTable.cellFontStyle[nestedKey] = parentFontStyle;
        if (parentLineHeight) nestedSubTable.cellLineHeight[nestedKey] = parentLineHeight;
        if (parentTextDecoration) nestedSubTable.cellTextDecoration[nestedKey] = parentTextDecoration;
      }
    }

    // Store nested sub-table
    if (!parentSubTable.cellSubTables) {
      parentSubTable.cellSubTables = {};
    }
    parentSubTable.cellSubTables[subCellKey] = nestedSubTable;

    // Clear parent sub-cell content
    if (parentSubTable.cellContents) {
      parentSubTable.cellContents[subCellKey] = '';
    }

    // Clear HTML cache for parent cell
    const cacheKey = `${this.element.id}_${parentRow}_${parentCol}`;
    this.subTableHtmlCache.delete(cacheKey);

    // Trigger update
    this.designerState.updateElement(this.element.id, this.element);
  }

  /**
   * Reports the current nesting depth for the specified cell.
   */
  private getCurrentNestingLevel(row: number, col: number): number {
    // For now, check if cell already has a sub-table
    const key = `${row}_${col}`;
    const subTablesMap = this.element.properties?.['tableCellSubTables'] as Record<string, any> | undefined;
    if (subTablesMap && subTablesMap[key]) {
      return subTablesMap[key].level || 1;
    }
    return 0; // Parent table level
  }

  /**
   * Creates a new sub-table for the selected root cell and stores it on the element.
   */
  private createSubTable(row: number, col: number, rows: number, cols: number, level: number): void {
    const key = `${row}_${col}`;

    // Initialize sub-tables map if needed
    if (!this.element.properties) {
      this.element.properties = {};
    }
    if (!this.element.properties['tableCellSubTables']) {
      this.element.properties['tableCellSubTables'] = {};
    }

    const subTablesMap = this.element.properties['tableCellSubTables'] as Record<string, any>;

    // Get parent cell properties to inherit
    const parentContent = this.getCellContentRaw(row, col);
    const parentPadding = this.getCellPadding(row, col);
    const parentHAlign = this.getCellHAlign(row, col);
    const parentVAlign = this.getCellVAlign(row, col);
    const parentBorder = this.getCellBorderProps(row, col);
    const parentFont = this.getCellFontProps(row, col);

    // Create sub-table data
    const subTable: any = {
      rows,
      cols,
      rowSizes: Array(rows).fill(1 / rows),
      colSizes: Array(cols).fill(1 / cols),
      level,
      cellContents: {},
      cellPadding: {},
      cellHAlign: {},
      cellVAlign: {},
      cellBorderWidth: {},
      cellBorderStyle: {},
      cellBorderColor: {},
      cellBorders: {},
      cellFontFamily: {},
      cellFontSize: {},
      cellFontWeight: {},
      cellFontStyle: {},
      cellLineHeight: {},
      cellTextDecoration: {}
    };

    // Move parent content to first sub-cell and inherit properties
    if (parentContent && parentContent !== '&nbsp;') {
      subTable.cellContents['0_0'] = parentContent;
    }

    // Apply inherited properties to all sub-cells
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const subKey = `${r}_${c}`;
        subTable.cellPadding[subKey] = [parentPadding.top, parentPadding.right, parentPadding.bottom, parentPadding.left];
        subTable.cellHAlign[subKey] = parentHAlign;
        subTable.cellVAlign[subKey] = parentVAlign;
        subTable.cellBorderWidth[subKey] = parentBorder.width;
        subTable.cellBorderStyle[subKey] = parentBorder.style;
        subTable.cellBorderColor[subKey] = parentBorder.color;
        subTable.cellBorders[subKey] = { all: { ...parentBorder } };
        if (parentFont.family) subTable.cellFontFamily[subKey] = parentFont.family;
        if (parentFont.size) subTable.cellFontSize[subKey] = parentFont.size;
        if (parentFont.weight) subTable.cellFontWeight[subKey] = parentFont.weight;
        if (parentFont.style) subTable.cellFontStyle[subKey] = parentFont.style;
        if (parentFont.lineHeight) subTable.cellLineHeight[subKey] = parentFont.lineHeight;
        if (parentFont.decoration) subTable.cellTextDecoration[subKey] = parentFont.decoration;
      }
    }

    // Store sub-table
    subTablesMap[key] = subTable;

    // Clear HTML cache for this cell
    const cacheKey = `${this.element.id}_${key}`;
    this.subTableHtmlCache.delete(cacheKey);

    // Clear parent cell content (now in sub-table)
    const contentsMap = this.element.properties['tableCellContents'] as Record<string, string> | undefined;
    if (contentsMap) {
      contentsMap[key] = ''; // Empty parent cell
    }

    // Trigger update
    this.designerState.updateElement(this.element.id, this.element);
  }

  /**
   * Returns the map of per-cell border configurations if present.
   */
  private getBorderConfigMap(): Record<string, TableCellBorderConfig> | undefined {
    return this.element.properties?.['tableCellBorders'] as Record<string, TableCellBorderConfig> | undefined;
  }

  /**
   * Resolves border configuration for a specific root-level cell.
   */
  private getCellBorderConfig(row: number, col: number): TableCellBorderConfig {
    const key = `${row}_${col}`;
    const configMap = this.getBorderConfigMap();
    if (configMap && configMap[key]) {
      return configMap[key];
    }

    const widthMap = this.element.properties?.['tableCellBorderWidth'] as Record<string, number> | undefined;
    const styleMap = this.element.properties?.['tableCellBorderStyle'] as Record<string, string> | undefined;
    const colorMap = this.element.properties?.['tableCellBorderColor'] as Record<string, string> | undefined;

    if ((widthMap && widthMap[key] !== undefined) || (styleMap && styleMap[key] !== undefined) || (colorMap && colorMap[key] !== undefined)) {
      return {
        all: {
          width: Number.isFinite(widthMap?.[key]) ? widthMap![key]! : 0,
          style: typeof styleMap?.[key] === 'string' ? styleMap![key]! : 'solid',
          color: typeof colorMap?.[key] === 'string' ? colorMap![key]! : '#000000'
        }
      };
    }

    return {};
  }

  /**
   * Normalizes incomplete border specs to ensure all fields exist.
   */
  private normalizeBorderSpec(spec?: TableCellBorderSpec): TableCellBorderSpec {
    if (!spec) {
      return { width: 0, style: 'solid', color: '#000000' };
    }

    return {
      width: Number.isFinite(spec.width) ? spec.width : 0,
      style: typeof spec.style === 'string' ? spec.style : 'solid',
      color: typeof spec.color === 'string' ? spec.color : '#000000'
    };
  }

  /**
   * Computes the effective border spec for a cell side, including overrides.
   */
  private getCellBorderSpec(row: number, col: number, side: BorderSide): TableCellBorderSpec {
    const config = this.getCellBorderConfig(row, col);
    const base = this.normalizeBorderSpec(config.all);

    if (side === 'all') {
      return base;
    }

    const override = (config as Record<BorderSide, TableCellBorderSpec | undefined>)[side];
    if (!override) {
      return base;
    }

    const normalizedOverride = this.normalizeBorderSpec(override);
    return normalizedOverride;
  }

  /**
   * Produces CSS snippets for the requested cell border edge.
   */
  protected getCellBorderCss(row: number, col: number, side: BorderEdge): string {
    const spec = this.getCellBorderSpec(row, col, side);
    if (spec.width <= 0 || spec.style === 'none') {
      return 'none';
    }
    return `${spec.width}px ${spec.style} ${spec.color}`;
  }

  /**
   * Returns the aggregate border properties for a cell.
   */
  private getCellBorderProps(row: number, col: number): TableCellBorderSpec {
    return this.getCellBorderSpec(row, col, 'all');
  }

  /**
   * Retrieves the border configuration for a nested sub-table cell.
   */
  private getSubTableCellBorderConfig(subTable: any, cellKey: string): TableCellBorderConfig {
    const configMap = subTable.cellBorders as Record<string, TableCellBorderConfig> | undefined;
    if (configMap && configMap[cellKey]) {
      return configMap[cellKey];
    }

    const widthMap = subTable.cellBorderWidth as Record<string, number> | undefined;
    const styleMap = subTable.cellBorderStyle as Record<string, string> | undefined;
    const colorMap = subTable.cellBorderColor as Record<string, string> | undefined;

    if ((widthMap && widthMap[cellKey] !== undefined) || (styleMap && styleMap[cellKey] !== undefined) || (colorMap && colorMap[cellKey] !== undefined)) {
      return {
        all: {
          width: Number.isFinite(widthMap?.[cellKey]) ? widthMap![cellKey]! : 0,
          style: typeof styleMap?.[cellKey] === 'string' ? styleMap![cellKey]! : 'solid',
          color: typeof colorMap?.[cellKey] === 'string' ? colorMap![cellKey]! : '#000000'
        }
      };
    }

    return {};
  }

  /**
   * Computes the effective border spec for a nested sub-table cell edge.
   */
  private getSubTableCellBorderSpec(subTable: any, cellKey: string, side: BorderSide): TableCellBorderSpec {
    const config = this.getSubTableCellBorderConfig(subTable, cellKey);
    const base = this.normalizeBorderSpec(config.all);

    if (side === 'all') {
      return base;
    }

    const override = (config as Record<BorderSide, TableCellBorderSpec | undefined>)[side];
    if (!override) {
      return base;
    }

    return this.normalizeBorderSpec(override);
  }

  /**
   * Builds border CSS for nested sub-table cells.
   */
  private getSubTableCellBorderCss(subTable: any, cellKey: string, side: BorderEdge): string {
    const spec = this.getSubTableCellBorderSpec(subTable, cellKey, side);
    if (spec.width <= 0 || spec.style === 'none') {
      return 'none';
    }
    return `${spec.width}px ${spec.style} ${spec.color}`;
  }

  /**
   * Reads combined font-related properties for a cell, including defaults.
   */
  private getCellFontProps(row: number, col: number): {
    family?: string;
    size?: number;
    weight?: string;
    style?: string;
    lineHeight?: number;
    decoration?: string;
  } {
    const key = `${row}_${col}`;
    const familyMap = this.element.properties?.['tableCellFontFamily'] as Record<string, string> | undefined;
    const sizeMap = this.element.properties?.['tableCellFontSize'] as Record<string, number> | undefined;
    const weightMap = this.element.properties?.['tableCellFontWeight'] as Record<string, string> | undefined;
    const styleMap = this.element.properties?.['tableCellFontStyle'] as Record<string, string> | undefined;
    const lineHeightMap = this.element.properties?.['tableCellLineHeight'] as Record<string, number> | undefined;
    const decorationMap = this.element.properties?.['tableCellTextDecoration'] as Record<string, string> | undefined;

    return {
      family: familyMap?.[key],
      size: sizeMap?.[key],
      weight: weightMap?.[key],
      style: styleMap?.[key],
      lineHeight: lineHeightMap?.[key],
      decoration: decorationMap?.[key]
    };
  }

  /**
   * Indicates whether the specified cell contains a nested sub-table.
   */
  protected hasSubTable(row: number, col: number): boolean {
    const key = `${row}_${col}`;
    const subTablesMap = this.element.properties?.['tableCellSubTables'] as Record<string, any> | undefined;
    return !!(subTablesMap && subTablesMap[key]);
  }

  /**
   * Returns cached or freshly generated HTML for a nested sub-table.
   */
  protected getSubTableHtml(row: number, col: number): SafeHtml {
    const key = `${row}_${col}`;

    // Check cache first
    const cacheKey = `${this.element.id}_${key}`;
    if (this.subTableHtmlCache.has(cacheKey)) {
      return this.subTableHtmlCache.get(cacheKey)!;
    }

    const subTablesMap = this.element.properties?.['tableCellSubTables'] as Record<string, any> | undefined;
    if (!subTablesMap || !subTablesMap[key]) {
      const emptyHtml = this.sanitizer.bypassSecurityTrustHtml('');
      this.subTableHtmlCache.set(cacheKey, emptyHtml);
      return emptyHtml;
    }

    const subTable = subTablesMap[key];
    const html = this.generateSubTableHtml(subTable, 0); // Start with parent cell padding = 0
    const safeHtml = this.sanitizer.bypassSecurityTrustHtml(html);

    // Cache it
    this.subTableHtmlCache.set(cacheKey, safeHtml);
    return safeHtml;
  }

  /**
   * Generates XHTML markup for a nested sub-table and caches the result.
   */
  private generateSubTableHtml(subTable: any, parentPadding: number): string {
    const level = subTable.level || 1;
    const rows = subTable.rows || 1;
    const cols = subTable.cols || 1;
    const rowSizes = subTable.rowSizes || Array(rows).fill(1 / rows);
    const colSizes = subTable.colSizes || Array(cols).fill(1 / cols);

    // Calculate selection color based on level
    const selectionColor = this.getSelectionColorForLevel(level);

    // Get repeat bindings for this sub-table
    const repeatBindings = subTable.repeatBindings as Record<string, any> | undefined;
    const tableRepeat = repeatBindings ? Object.values(repeatBindings).find(r => r.repeatedElement === 'table') : undefined;
    const tbodyRepeat = repeatBindings ? Object.values(repeatBindings).find(r => r.repeatedElement === 'tbody') : undefined;
    const trRepeat = repeatBindings ? Object.values(repeatBindings).find(r => r.repeatedElement === 'tr') : undefined;

    // Build repeat attributes
    const tableRepeatAttr = tableRepeat ? ` data-repeat-over="${this.escapeHtmlAttribute(tableRepeat.binding)}" data-repeat-var="${this.escapeHtmlAttribute(tableRepeat.iteratorName)}"` : '';
    const tbodyRepeatAttr = tbodyRepeat ? ` data-repeat-over="${this.escapeHtmlAttribute(tbodyRepeat.binding)}" data-repeat-var="${this.escapeHtmlAttribute(tbodyRepeat.iteratorName)}"` : '';
    const trRepeatAttr = trRepeat ? ` data-repeat-over="${this.escapeHtmlAttribute(trRepeat.binding)}" data-repeat-var="${this.escapeHtmlAttribute(trRepeat.iteratorName)}"` : '';

    // Wrap subtable in a positioned container for resize handles
    let html = `<div class="sub-table-wrapper" style="position:relative;width:100%;height:100%;">`;
    html += `<table class="sub-table sub-table-level-${level}" style="width:100%;height:100%;border-collapse:collapse;table-layout:fixed;"${tableRepeatAttr}>`;
    html += `<tbody${tbodyRepeatAttr}>`;

    for (let r = 0; r < rows; r++) {
      const rowHeightPercent = (rowSizes[r] * 100).toFixed(2);
      html += `<tr style="height:${rowHeightPercent}%;"${trRepeatAttr}>`;

      for (let c = 0; c < cols; c++) {
        const cellKey = `${r}_${c}`;
        const colWidthPercent = (colSizes[c] * 100).toFixed(2);

        // Get cell properties
        const content = subTable.cellContents?.[cellKey] || '';
        const padding = subTable.cellPadding?.[cellKey] || [0, 0, 0, 0];
        const hAlign = subTable.cellHAlign?.[cellKey] || 'left';
        const vAlign = subTable.cellVAlign?.[cellKey] || 'top';
        const borderTop = this.getSubTableCellBorderCss(subTable, cellKey, 'top');
        const borderRight = this.getSubTableCellBorderCss(subTable, cellKey, 'right');
        const borderBottom = this.getSubTableCellBorderCss(subTable, cellKey, 'bottom');
        const borderLeft = this.getSubTableCellBorderCss(subTable, cellKey, 'left');
        const fontFamily = subTable.cellFontFamily?.[cellKey] || 'Roboto, sans-serif';
        const fontSize = subTable.cellFontSize?.[cellKey] || 9;
        const fontWeight = subTable.cellFontWeight?.[cellKey] || '';
        const fontStyleProp = subTable.cellFontStyle?.[cellKey] || '';
        const lineHeight = subTable.cellLineHeight?.[cellKey] || '';
        const textDecoration = subTable.cellTextDecoration?.[cellKey] || '';

        const [pt, pr, pb, pl] = padding;
        const borderCss = `border-top:${borderTop};border-right:${borderRight};border-bottom:${borderBottom};border-left:${borderLeft};`;
        const fontCss = (fontFamily ? `font-family:${fontFamily};` : '') +
          (fontSize ? `font-size:${fontSize}pt;` : '') +
          (fontWeight ? `font-weight:${fontWeight};` : '') +
          (fontStyleProp ? `font-style:${fontStyleProp};` : '') +
          (lineHeight ? `line-height:${lineHeight};` : '') +
          (textDecoration ? `text-decoration:${textDecoration};` : '');

        // Apply selection color directly as background-color
        html += `<td class="sub-table-cell" data-row="${r}" data-col="${c}" data-level="${level}" `;
        html += `style="width:${colWidthPercent}%;padding:${pt}mm ${pr}mm ${pb}mm ${pl}mm;`;
        html += `text-align:${hAlign};vertical-align:${vAlign};${borderCss}${fontCss}`;
        html += `background-color:${selectionColor};">`;

        // Check for nested sub-table
        if (subTable.cellSubTables && subTable.cellSubTables[cellKey]) {
          html += this.generateSubTableHtml(subTable.cellSubTables[cellKey], padding[0]);
        } else {
          html += content || '&nbsp;';
        }

        html += '</td>';
      }
      html += '</tr>';
    }

    html += '</tbody></table>';

    // Add resize handles for rows (horizontal)
    let cumulativeTop = 0;
    for (let r = 0; r < rows - 1; r++) {
      cumulativeTop += rowSizes[r];
      const topPercent = (cumulativeTop * 100).toFixed(2);
      html += `<div class="sub-table-resize-handle horizontal" data-level="${level}" data-row="${r}" style="position:absolute;left:0;right:0;height:10px;top:${topPercent}%;transform:translateY(-50%);cursor:ns-resize;z-index:10;">`;
      html += `<span class="resize-handle resize-handle-top" aria-hidden="true"></span>`;
      html += `</div>`;
    }

    // Add resize handles for columns (vertical)
    let cumulativeLeft = 0;
    for (let c = 0; c < cols - 1; c++) {
      cumulativeLeft += colSizes[c];
      const leftPercent = (cumulativeLeft * 100).toFixed(2);
      html += `<div class="sub-table-resize-handle vertical" data-level="${level}" data-col="${c}" style="position:absolute;top:0;bottom:0;width:10px;left:${leftPercent}%;transform:translateX(-50%);cursor:ew-resize;z-index:10;">`;
      html += `<span class="resize-handle resize-handle-left" aria-hidden="true"></span>`;
      html += `</div>`;
    }

    html += '</div>'; // close wrapper
    return html;
  }

  /**
   * Returns a highlight color based on the nesting level for selection overlays.
   */
  private getSelectionColorForLevel(level: number): string {
    const colors = [
      'hsla(217, 91%, 48%, 0.4)', // Level 0 (parent) - Blue
      'hsla(142, 71%, 45%, 0.4)', // Level 1 - Green
      'hsla(48, 96%, 53%, 0.4)',  // Level 2 - Yellow
      'hsla(25, 95%, 53%, 0.4)',  // Level 3 - Orange
      'hsla(280, 67%, 55%, 0.4)', // Level 4 - Purple
      'hsla(345, 82%, 58%, 0.4)'  // Level 5 - Pink/Red
    ];
    return colors[Math.min(level, 5)] || colors[0];
  }


  /**
   * Checks whether any cell within the given row contains non-empty content.
   */
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

  /**
   * Checks whether any cell within the given column contains non-empty content.
   */
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

  /**
   * Removes orphaned properties and nested tables after deleting a row.
   */
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
      'tableCellBorders',
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

  /**
   * Removes orphaned properties and nested tables after deleting a column.
   */
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
      'tableCellBorders',
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

  /**
   * Applies the edited HTML to the appropriate cell path and closes the editor.
   */
  protected onCellEditorSaved(html: string): void {
    const selection = this.editorCellSelection();
    if (!selection) return;

    // If we have a sub-table path, save to nested structure
    if (selection.subTablePath && selection.subTablePath.length > 0) {
      this.saveNestedCellContent(selection.row, selection.col, selection.subTablePath, html);
    } else {
      // Otherwise, save to root cell content
      const key = `${selection.row}_${selection.col}`;
      const existingContents = (this.element.properties?.['tableCellContents'] as Record<string, string>) || {};
      const updatedProperties = {
        ...(this.element.properties || {}),
        tableCellContents: { ...existingContents, [key]: html }
      } as Record<string, any>;
      this.designerState.updateElement(this.element.id, { properties: updatedProperties });
    }

    // Clear cache to force re-render
    this.subTableHtmlCache.clear();
    this.showCellEditor.set(false);
  }

  /**
   * Writes content updates into deeply nested sub-table cells.
   */
  private saveNestedCellContent(parentRow: number, parentCol: number, subTablePath: Array<{row: number; col: number}>, html: string): void {
    const parentKey = `${parentRow}_${parentCol}`;
    const subTablesMap = (this.element.properties?.['tableCellSubTables'] as Record<string, any>) || {};

    if (!subTablesMap[parentKey]) {
      console.warn('No sub-table found at parent cell', parentKey);
      return;
    }

    // Deep clone the entire sub-tables structure to avoid mutation issues
    const updatedSubTablesMap = JSON.parse(JSON.stringify(subTablesMap));

    // Navigate through each level of nesting to find the target cell
    let currentSubTable = updatedSubTablesMap[parentKey];

    for (let level = 0; level < subTablePath.length; level++) {
      const subCell = subTablePath[level];
      const isLastLevel = level === subTablePath.length - 1;

      if (isLastLevel) {
        // At the final level, set the content
        const cellKey = `${subCell.row}_${subCell.col}`;
        if (!currentSubTable.cellContents) {
          currentSubTable.cellContents = {};
        }
        currentSubTable.cellContents[cellKey] = html;
      } else {
        // Navigate deeper into nested sub-tables
        const cellKey = `${subCell.row}_${subCell.col}`;

        if (!currentSubTable.cellSubTables) {
          currentSubTable.cellSubTables = {};
        }

        if (!currentSubTable.cellSubTables[cellKey]) {
          console.warn(`No nested sub-table found at level ${level}, key: ${cellKey}`);
          return;
        }

        currentSubTable = currentSubTable.cellSubTables[cellKey];
      }
    }

    // Update the element with the modified sub-tables structure
    const updatedProperties = {
      ...(this.element.properties || {}),
      tableCellSubTables: updatedSubTablesMap
    } as Record<string, any>;

    this.designerState.updateElement(this.element.id, { properties: updatedProperties });
  }

  /**
   * Cancels editing and hides the cell editor dialog.
   */
  protected onCellEditorClosed(): void {
    this.showCellEditor.set(false);
    this.editorCellSelection.set(null);
  }

  // Repeat binding dialog state
  protected showRepeatBindingDialog = signal(false);

  protected onRepeatBindingSaved(data: { binding: string; iteratorName: string; repeatedElement: 'tr' | 'tbody' | 'table' }): void {
    const selection = this.designerState.selectedTableCell();
    if (!selection || selection.elementId !== this.element.id) {
      this.showRepeatBindingDialog.set(false);
      return;
    }

    // Determine the current level based on breadcrumb
    const breadcrumb = this.getSelectedSubTableAncestors();
    const currentLevel = breadcrumb.length > 0 ? breadcrumb.length : 0;
    
    // Deep clone all properties to avoid mutation issues
    const props = JSON.parse(JSON.stringify(this.element.properties || {}));

    if (currentLevel === 0) {
      // Level 0: Save to root element properties
      if (!props['tableRepeatBindings']) {
        props['tableRepeatBindings'] = {};
      }
      const cellKey = `${selection.row}_${selection.col}`;
      
      props['tableRepeatBindings'][cellKey] = {
        binding: data.binding,
        iteratorName: data.iteratorName,
        repeatedElement: data.repeatedElement,
        level: 0
      };
      console.log('[RepeatBinding] Saved at level 0:', { cellKey, binding: data.binding, iteratorName: data.iteratorName, repeatedElement: data.repeatedElement });
    } else {
      // Level >= 1: Navigate to the sub-table and save there
      const subTablesMap = props['tableCellSubTables'];
      
      console.log('[RepeatBinding] Level >= 1 Debug:', { 
        currentLevel, 
        hasSubTablesMap: !!subTablesMap, 
        subTablesMapKeys: subTablesMap ? Object.keys(subTablesMap) : [],
        selectionRow: selection.row,
        selectionCol: selection.col,
        subTablePath: selection.subTablePath
      });
      
      if (!subTablesMap || Object.keys(subTablesMap).length === 0) {
        console.error('[RepeatBinding] No sub-tables found');
        this.showRepeatBindingDialog.set(false);
        return;
      }

      // Navigate to the sub-table at the current level
      const parentKey = `${selection.row}_${selection.col}`;
      let currentSubTable = subTablesMap[parentKey];
      
      console.log('[RepeatBinding] Looking for parent key:', parentKey, 'found:', !!currentSubTable);
      
      if (!currentSubTable) {
        console.error('[RepeatBinding] Parent sub-table not found, key:', parentKey);
        this.showRepeatBindingDialog.set(false);
        return;
      }

      // Navigate through the path to reach the sub-table at currentLevel
      console.log('[RepeatBinding] Navigating, loop iterations:', currentLevel - 1);
      for (let i = 0; i < currentLevel - 1; i++) {
        const subCell = selection.subTablePath![i];
        const cellKey = `${subCell.row}_${subCell.col}`;
        console.log('[RepeatBinding] Navigation step', i, 'looking for cellKey:', cellKey);
        if (!currentSubTable.cellSubTables || !currentSubTable.cellSubTables[cellKey]) {
          console.error(`[RepeatBinding] Sub-table not found at level ${i}, key: ${cellKey}`);
          this.showRepeatBindingDialog.set(false);
          return;
        }
        currentSubTable = currentSubTable.cellSubTables[cellKey];
        console.log('[RepeatBinding] Navigation step', i, 'success, currentSubTable level:', currentSubTable.level);
      }

      // Now currentSubTable is the sub-table at currentLevel
      console.log('[RepeatBinding] Reached target sub-table, level:', currentSubTable.level);
      
      // Initialize repeatBindings if needed
      if (!currentSubTable.repeatBindings) {
        currentSubTable.repeatBindings = {};
        console.log('[RepeatBinding] Initialized repeatBindings');
      }

      // For repeating this sub-table's elements, we use a dummy key (like "0_0")
      // since the repeat applies to the table/tbody/tr of this sub-table itself
      const cellKey = "0_0"; // Convention: use first cell as key for table-level bindings
      
      currentSubTable.repeatBindings[cellKey] = {
        binding: data.binding,
        iteratorName: data.iteratorName,
        repeatedElement: data.repeatedElement,
        level: currentLevel
      };

      console.log('[RepeatBinding] Saved at level', currentLevel, ':', { 
        cellKey, 
        binding: data.binding, 
        iteratorName: data.iteratorName, 
        repeatedElement: data.repeatedElement,
        repeatBindings: currentSubTable.repeatBindings 
      });
    }
    
    console.log('[RepeatBinding] About to call updateElement with props:', JSON.stringify(props, null, 2).substring(0, 500));
    this.designerState.updateElement(this.element.id, { properties: props });
    this.showRepeatBindingDialog.set(false);
  }

  protected onRepeatBindingClosed(): void {
    this.showRepeatBindingDialog.set(false);
  }

  protected getRepeatBindingForSelection(): { binding: string; iteratorName: string; repeatedElement: 'tr' | 'tbody' | 'table'; subTablePath?: Array<{row:number;col:number}> } | null {
    const selection = this.designerState.selectedTableCell();
    if (!selection || selection.elementId !== this.element.id) return null;
    const props = this.element.properties || {};
    
    // Determine the current level based on breadcrumb
    const breadcrumb = this.getSelectedSubTableAncestors();
    const currentLevel = breadcrumb.length > 0 ? breadcrumb.length : 0;
    
    console.log('[RepeatBinding] GET - currentLevel:', currentLevel);
    
    if (currentLevel === 0) {
      // Level 0: Look in root element properties
      const map = props['tableRepeatBindings'] as Record<string, any> | undefined;
      if (!map) return null;
      
      const key = `${selection.row}_${selection.col}`;
      const binding = map[key];
      
      console.log('[RepeatBinding] GET Level 0 - key:', key, 'binding:', binding);
      
      if (binding && binding.level === 0) {
        return binding;
      }
      return null;
    } else {
      // Level >= 1: Navigate to the sub-table and look there
      const subTablesMap = props['tableCellSubTables'] as Record<string, any> | undefined;
      if (!subTablesMap) {
        console.log('[RepeatBinding] GET Level', currentLevel, '- No subTablesMap');
        return null;
      }

      const parentKey = `${selection.row}_${selection.col}`;
      let currentSubTable = subTablesMap[parentKey];
      if (!currentSubTable) {
        console.log('[RepeatBinding] GET Level', currentLevel, '- Parent not found, key:', parentKey);
        return null;
      }

      console.log('[RepeatBinding] GET Level', currentLevel, '- Found parent, navigating...');

      // Navigate through the path to reach the sub-table at currentLevel
      for (let i = 0; i < currentLevel - 1; i++) {
        const subCell = selection.subTablePath![i];
        const cellKey = `${subCell.row}_${subCell.col}`;
        if (!currentSubTable.cellSubTables || !currentSubTable.cellSubTables[cellKey]) {
          console.log('[RepeatBinding] GET Level', currentLevel, '- Navigation failed at step', i, 'key:', cellKey);
          return null;
        }
        currentSubTable = currentSubTable.cellSubTables[cellKey];
      }

      // Now currentSubTable is the sub-table at currentLevel
      if (!currentSubTable.repeatBindings) {
        console.log('[RepeatBinding] GET Level', currentLevel, '- No repeatBindings on target sub-table');
        return null;
      }

      const cellKey = "0_0"; // Convention: use first cell as key for table-level bindings
      const binding = currentSubTable.repeatBindings[cellKey];
      
      console.log('[RepeatBinding] GET Level', currentLevel, '- repeatBindings:', currentSubTable.repeatBindings, 'binding for key', cellKey, ':', binding);
      
      if (binding && binding.level === currentLevel) {
        return binding;
      }
      console.log('[RepeatBinding] GET Level', currentLevel, '- Binding level mismatch or not found');
      return null;
    }
  }

  private repeatBindingMap(): Record<string, any> {
    return (this.element.properties?.['tableRepeatBindings'] as Record<string, any>) || {};
  }

  protected repeatTableBinding(): any {
    const map = this.repeatBindingMap();
    for (const key in map) { 
      const entry = map[key];
      if (entry.repeatedElement === 'table' && entry.level === 0) {
        return entry;
      }
    }
    return null;
  }
  protected repeatTbodyBinding(): any {
    const map = this.repeatBindingMap();
    for (const key in map) { 
      const entry = map[key];
      if (entry.repeatedElement === 'tbody' && entry.level === 0) {
        return entry;
      }
    }
    return null;
  }
  protected repeatRowBinding(rowIndex: number): any {
    const map = this.repeatBindingMap();
    for (const key in map) {
      const entry = map[key];
      if (entry.repeatedElement === 'tr' && entry.level === 0) {
        const [rStr] = key.split('_');
        const r = parseInt(rStr,10);
        if (r === rowIndex) return entry;
      }
    }
    return null;
  }

  /**
   * Handles single-click selection of root table cells.
   */
  protected onCellClick(event: MouseEvent, row: number, col: number): void {
    const target = event.target as HTMLElement;

    const subTableCell = target.closest('.sub-table-cell');
    if (subTableCell) {
      return;
    }

    this.designerState.selectElement(this.element.id);
    this.designerState.selectTableCell(this.element.id, row, col);
    this.closeContextMenu();
  }

  /**
   * Opens the editor when a cell is double-clicked.
   */
  protected onCellDoubleClick(event: MouseEvent, row: number, col: number): void {
    const target = event.target as HTMLElement;
    const subTableCell = target.closest('.sub-table-cell');
    if (subTableCell) {
      return; // Don't open editor for parent when double-clicking nested sub-table cell
    }
    this.designerState.selectElement(this.element.id);
    this.designerState.selectTableCell(this.element.id, row, col);
    this.onEditCellContent();
  }

  /**
   * Displays the contextual actions menu for a cell.
   */
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

  /**
   * Splits the selected cell horizontally using user-provided segments.
   */
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

  /**
   * Splits the selected cell vertically using user-provided segments.
   */
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

  /**
   * Closes the context menu overlay.
   */
  protected closeContextMenu(): void {
    this.showContextMenu.set(false);
    this.contextMenuCell.set(null);
  }

  /**
   * Computes the cumulative height offset for a given row resize handle.
   */
  protected getRowHandleOffset(rowSizes: number[], index: number): number {
    let sum = 0;
    for (let i = 0; i <= index; i++) {
      sum += rowSizes[i] ?? 0;
    }
    return sum * 100;
  }

  /**
   * Computes the cumulative width offset for a given column resize handle.
   */
  protected getColHandleOffset(colSizes: number[], index: number): number {
    let sum = 0;
    for (let i = 0; i <= index; i++) {
      sum += colSizes[i] ?? 0;
    }
    return sum * 100;
  }

  /**
   * Begins resizing operation for a root table row.
   */
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

  /**
   * Begins resizing operation for a root table column.
   */
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

  /**
   * Initiates resize logic for nested sub-table handles captured from the DOM.
   */
  private startSubTableResize(handle: HTMLElement, event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();

    const level = parseInt(handle.dataset['level'] || '1', 10);
    const isHorizontal = handle.classList.contains('horizontal');
    const index = parseInt(handle.dataset[isHorizontal ? 'row' : 'col'] || '0', 10);

    // Find the parent cell containing this subtable
    const subTableWrapper = handle.closest('.sub-table-wrapper') as HTMLElement;
    if (!subTableWrapper) return;

    // Ascend to top-level layout table cell (exclude nested sub-table cells)
    let parentTd = subTableWrapper.closest('td[data-row][data-col]') as HTMLElement | null;
    while (parentTd && parentTd.classList.contains('sub-table-cell')) {
      const parentTable = parentTd.closest('table');
      if (!parentTable) break;
      parentTd = parentTable.closest('td[data-row][data-col]') as HTMLElement | null;
    }
    if (!parentTd) return;

    const parentRow = parseInt(parentTd.dataset['row'] || '0', 10);
    const parentCol = parseInt(parentTd.dataset['col'] || '0', 10);

    // Build subtable path by walking DOWN from top-level cell into nested hierarchy for accurate path
    const subTablePath: Array<{row: number; col: number}> = [];
    // Walk from the wrapper up collecting sub-table-cell ancestors, then reverse to get top-down order
    const ancestors: Array<{row: number; col: number}> = [];
    let currentWrapper: HTMLElement | null = subTableWrapper;
    while (currentWrapper && currentWrapper.classList.contains('sub-table-wrapper')) {
      const parentCell = currentWrapper.closest('.sub-table-cell') as HTMLElement | null;
      if (!parentCell) break;
      const r = parseInt(parentCell.dataset['row'] || '0', 10);
      const c = parseInt(parentCell.dataset['col'] || '0', 10);
      ancestors.push({ row: r, col: c });
      currentWrapper = parentCell.closest('.sub-table-wrapper');
      if (currentWrapper === parentCell) break; // safety
    }
    // ancestors collected from innermost to outermost; reverse to get proper traversal order
    subTablePath.push(...ancestors.reverse());

    // Get the subtable data (empty path means first-level subtable under parent cell)
    const subTable = this.getSubTableAtPath(parentRow, parentCol, subTablePath);
    if (!subTable) return;

    const rowSizes = subTable.rowSizes || [];
    const colSizes = subTable.colSizes || [];

    if (isHorizontal) {
      if (index >= rowSizes.length - 1) return;
      this.activeResize = {
        type: 'subtable-row',
        parentRow,
        parentCol,
        subTablePath,
        index,
        startClientY: event.clientY,
        startRowSizes: [...rowSizes],
        level
      };
    } else {
      if (index >= colSizes.length - 1) return;
      this.activeResize = {
        type: 'subtable-col',
        parentRow,
        parentCol,
        subTablePath,
        index,
        startClientX: event.clientX,
        startColSizes: [...colSizes],
        level
      };
    }

    this.closeContextMenu();
    this.designerState.selectElement(this.element.id);
  }

  /**
   * Navigates the sub-table hierarchy to locate the requested nested table.
   */
  private getSubTableAtPath(parentRow: number, parentCol: number, path: Array<{row: number; col: number}>): any | null {
    const parentKey = `${parentRow}_${parentCol}`;
    const subTablesMap = this.element.properties?.['tableCellSubTables'] as Record<string, any> | undefined;
    if (!subTablesMap || !subTablesMap[parentKey]) return null;

    let currentSubTable = subTablesMap[parentKey];
    if (path.length === 0) {
      return currentSubTable; // first-level sub-table
    }

    for (let i = 0; i < path.length; i++) {
      const cellKey = `${path[i].row}_${path[i].col}`;
      const nestedSubTables = currentSubTable.cellSubTables;
      if (!nestedSubTables || !nestedSubTables[cellKey]) return null;
      currentSubTable = nestedSubTables[cellKey];
    }
    return currentSubTable;
  }

  /**
   * Identity trackBy used for template repeaters.
   */
  protected trackByIndex(index: number): number {
    return index;
  }

  /**
   * Indicates whether the provided handle index is currently being resized.
   */
  protected isResizing(type: 'row' | 'col', index: number): boolean {
    const active = this.activeResize;
    if (!active) return false;
    return active.type === type && active.index === index;
  }

  @HostListener('document:mousemove', ['$event'])
  /**
   * Routes document-level mousemove events to the active resize handler.
   */
  onDocumentMouseMove(event: MouseEvent): void {
    if (!this.activeResize) {
      return;
    }

    if (this.activeResize.type === 'row') {
      this.handleRowResize(event);
    } else if (this.activeResize.type === 'col') {
      this.handleColResize(event);
    } else if (this.activeResize.type === 'subtable-row') {
      this.handleSubTableRowResize(event);
    } else if (this.activeResize.type === 'subtable-col') {
      this.handleSubTableColResize(event);
    }
  }

  @HostListener('document:mouseup')
  /**
   * Clears the active resize state when the mouse button is released.
   */
  onDocumentMouseUp(): void {
    this.activeResize = null;
  }

  @HostListener('document:click', ['$event'])
  /**
   * Closes the context menu when the user clicks outside the table.
   */
  onDocumentClick(event: MouseEvent): void {
    if (!this.showContextMenu()) {
      return;
    }
    const host = this.hostRef.nativeElement;
    if (!host.contains(event.target as Node)) {
      this.closeContextMenu();
    }
  }

  /**
   * Updates row size ratios while the user drags a row handle.
   */
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

  /**
   * Updates column size ratios while the user drags a column handle.
   */
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

  /**
   * Calculates the minimum ratio permitted during row or column resizing.
   */
  private getMinRatio(tableSize: number, pairTotal: number): number {
    const minSizeMm = Math.max(2, this.gridSize, this.designerState.logicalGridSize());
    const baseRatio = minSizeMm / Math.max(tableSize, minSizeMm);
    const safeBase = Math.max(baseRatio, 0.001);
    const maxAllowed = Math.max(pairTotal - 0.001, 0.001);
    return Math.min(safeBase, maxAllowed);
  }

  /**
   * Persists new row/column ratios back to the element.
   */
  private applyTableSizes(rowSizes: number[], colSizes: number[]): void {
    const properties = withTableSizes(this.element, rowSizes, colSizes);
    this.designerState.updateElement(this.element.id, { properties });
  }

  /**
   * Escapes HTML attribute values for safe embedding in HTML strings.
   */
  private escapeHtmlAttribute(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Applies proportional resizing for nested sub-table rows.
   */
  private handleSubTableRowResize(event: MouseEvent): void {
    if (!this.activeResize || this.activeResize.type !== 'subtable-row') return;

    const start = this.activeResize;
    const deltaPx = event.clientY - start.startClientY;
    
    // Get parent cell dimensions to calculate the delta ratio
    const rowSizes = this.getRowSizes();
    const colSizes = this.getColSizes();
    const parentCellHeightMm = this.element.height * rowSizes[start.parentRow];
    const parentPadding = this.getCellPadding(start.parentRow, start.parentCol);
    const availableHeightMm = parentCellHeightMm - parentPadding.top - parentPadding.bottom;
    
    const deltaMm = deltaPx / this.mmToPx;
    const deltaRatio = deltaMm / availableHeightMm;

    const startSizes = start.startRowSizes;
    const index = start.index;
    const pairTotal = startSizes[index] + startSizes[index + 1];

    const minRatio = this.getMinRatio(availableHeightMm, pairTotal);
    let newFirst = startSizes[index] + deltaRatio;
    newFirst = Math.min(Math.max(newFirst, minRatio), pairTotal - minRatio);
    const newSecond = pairTotal - newFirst;

    const updatedRows = [...startSizes];
    updatedRows[index] = newFirst;
    updatedRows[index + 1] = newSecond;

    this.applySubTableSizes(start.parentRow, start.parentCol, start.subTablePath, updatedRows, null);
    // Clear cache for redraw
    this.subTableHtmlCache.clear();
  }

  /**
   * Applies proportional resizing for nested sub-table columns.
   */
  private handleSubTableColResize(event: MouseEvent): void {
    if (!this.activeResize || this.activeResize.type !== 'subtable-col') return;

    const start = this.activeResize;
    const deltaPx = event.clientX - start.startClientX;
    
    // Get parent cell dimensions to calculate the delta ratio
    const rowSizes = this.getRowSizes();
    const colSizes = this.getColSizes();
    const parentCellWidthMm = this.element.width * colSizes[start.parentCol];
    const parentPadding = this.getCellPadding(start.parentRow, start.parentCol);
    const availableWidthMm = parentCellWidthMm - parentPadding.left - parentPadding.right;
    
    const deltaMm = deltaPx / this.mmToPx;
    const deltaRatio = deltaMm / availableWidthMm;

    const startSizes = start.startColSizes;
    const index = start.index;
    const pairTotal = startSizes[index] + startSizes[index + 1];

    const minRatio = this.getMinRatio(availableWidthMm, pairTotal);
    let newFirst = startSizes[index] + deltaRatio;
    newFirst = Math.min(Math.max(newFirst, minRatio), pairTotal - minRatio);
    const newSecond = pairTotal - newFirst;

    const updatedCols = [...startSizes];
    updatedCols[index] = newFirst;
    updatedCols[index + 1] = newSecond;

    this.applySubTableSizes(start.parentRow, start.parentCol, start.subTablePath, null, updatedCols);
    // Clear cache for redraw
    this.subTableHtmlCache.clear();
  }

  /**
   * Writes updated size arrays into a nested sub-table structure.
   */
  private applySubTableSizes(parentRow: number, parentCol: number, path: Array<{row: number; col: number}>, rowSizes: number[] | null, colSizes: number[] | null): void {
    const parentKey = `${parentRow}_${parentCol}`;
    const subTablesMap = (this.element.properties?.['tableCellSubTables'] as Record<string, any> | undefined) || {};
    
    if (!subTablesMap[parentKey]) return;

    // Navigate to the target subtable (empty path refers to first-level subtable)
    let currentSubTable = subTablesMap[parentKey];
    for (let i = 0; i < path.length; i++) {
      const cellKey = `${path[i].row}_${path[i].col}`;
      if (!currentSubTable.cellSubTables || !currentSubTable.cellSubTables[cellKey]) return;
      currentSubTable = currentSubTable.cellSubTables[cellKey];
    }

    // Apply the new sizes
    if (rowSizes) {
      currentSubTable.rowSizes = [...rowSizes];
    }
    if (colSizes) {
      currentSubTable.colSizes = [...colSizes];
    }

    // Update element properties
    const updatedProperties = {
      ...this.element.properties,
      tableCellSubTables: { ...subTablesMap }
    };
    
    this.designerState.updateElement(this.element.id, { properties: updatedProperties });
    
    // Clear cache to force re-render (clear all nested references for simplicity)
    this.subTableHtmlCache.clear();
  }

  /**
   * Prompts the user for the number of segments to create along an axis.
   */
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
  /**
   * Builds the standard storage key for a cell coordinate.
   */
  private cellKey(row: number, col: number): string {
    return `${row}_${col}`;
  }

  /**
   * Returns padding values for the given cell coordinate, defaulting to zeros.
   */
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

  /**
   * Formats cell padding as a CSS string.
   */
  protected getCellPaddingString(row: number, col: number): string {
    const padding = this.getCellPadding(row, col);
    return `${padding.top}mm ${padding.right}mm ${padding.bottom}mm ${padding.left}mm`;
  }

  /**
   * Returns the horizontal alignment for the specified cell.
   */
  protected getCellHAlign(row: number, col: number): 'left' | 'center' | 'right' {
    const key = this.cellKey(row, col);
    const map = this.element.properties?.['tableCellHAlign'] as Record<string, string> | undefined;
    const value = map?.[key];
    return value === 'center' || value === 'right' ? value : 'left';
  }

  /**
   * Returns the vertical alignment for the specified cell.
   */
  protected getCellVAlign(row: number, col: number): 'top' | 'middle' | 'bottom' {
    const key = this.cellKey(row, col);
    const map = this.element.properties?.['tableCellVAlign'] as Record<string, string> | undefined;
    const value = map?.[key];
    return value === 'middle' || value === 'bottom' ? value : 'top';
  }

  /**
   * Maps vertical alignment to flexbox alignment values for template binding.
   */
  protected getCellVAlignFlex(row: number, col: number): 'flex-start' | 'center' | 'flex-end' {
    const v = this.getCellVAlign(row, col);
    if (v === 'middle') return 'center';
    if (v === 'bottom') return 'flex-end';
    return 'flex-start';
  }

  /**
   * Returns the font style used by the specified cell.
   */
  protected getCellFontStyle(row: number, col: number): string {
    const key = `${row}_${col}`;
    const map = this.element.properties?.['tableCellFontStyle'] as Record<string, string> | undefined;
    return map?.[key] || 'normal';
  }

  /**
   * Returns the font weight used by the specified cell.
   */
  protected getCellFontWeight(row: number, col: number): string {
    const key = `${row}_${col}`;
    const map = this.element.properties?.['tableCellFontWeight'] as Record<string, string> | undefined;
    return map?.[key] || 'normal';
  }

  /**
   * Returns the font size in CSS units for the specified cell.
   */
  protected getCellFontSize(row: number, col: number): string {
    const key = `${row}_${col}`;
    const map = this.element.properties?.['tableCellFontSize'] as Record<string, number> | undefined;
    const size = map?.[key];
    return Number.isFinite(size) ? `${size}pt` : '9pt';
  }

  /**
   * Returns the line height in CSS units for the specified cell.
   */
  protected getCellLineHeight(row: number, col: number): string {
    const key = `${row}_${col}`;
    const map = this.element.properties?.['tableCellLineHeight'] as Record<string, number> | undefined;
    const lineHeight = map?.[key];
    return Number.isFinite(lineHeight) ? String(lineHeight) : '1';
  }

  /**
   * Returns the font family for the specified cell.
   */
  protected getCellFontFamily(row: number, col: number): string {
    const key = `${row}_${col}`;
    const map = this.element.properties?.['tableCellFontFamily'] as Record<string, string> | undefined;
    return map?.[key] || 'Roboto, sans-serif';
  }

  /**
   * Returns the text decoration for the specified cell.
   */
  protected getCellTextDecoration(row: number, col: number): string {
    const key = `${row}_${col}`;
    const map = this.element.properties?.['tableCellTextDecoration'] as Record<string, string> | undefined;
    return map?.[key] || 'none';
  }
}
