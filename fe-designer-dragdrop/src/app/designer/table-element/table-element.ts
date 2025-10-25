import { Component, HostListener, Input, signal, inject, ElementRef, AfterViewInit, AfterViewChecked, OnDestroy } from '@angular/core';
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
export class TableElementComponent implements AfterViewInit, AfterViewChecked, OnDestroy {
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

  ngAfterViewInit(): void {
    // Add DOCUMENT-level listener first for debugging
    const docListener = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('.sub-table-cell')) {
        console.log('🟢 DOCUMENT-LEVEL: Sub-table cell click detected!', target);
        console.log('🟢 Closest sub-table-cell:', target.closest('.sub-table-cell'));
      }
    };
    document.addEventListener('click', docListener, true);
    
    // Add click listener at capture phase to intercept ALL clicks including sub-table cells
    this.clickListener = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      console.log('🔴 NATIVE CLICK EVENT CAPTURED!', target);
      console.log('🔴 Event phase:', event.eventPhase, 'CAPTURING=1, AT_TARGET=2, BUBBLING=3');
      console.log('🔴 Current target:', event.currentTarget);
      this.handleNativeClick(event);
    };
    
    // Use capture phase to intercept before any other handlers
    this.hostRef.nativeElement.addEventListener('click', this.clickListener, true);
    
    console.log('✅ Native click listener attached to:', this.hostRef.nativeElement);
  }

  ngOnDestroy(): void {
    if (this.clickListener) {
      this.hostRef.nativeElement.removeEventListener('click', this.clickListener, true);
    }
  }

  ngAfterViewChecked(): void {
    // No need to attach handlers anymore - the capture-phase listener handles everything
  }

  private handleNativeClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    
    console.log('🔴 Click detected on:', target, 'classes:', target.className);
    
    // Check if click was on or inside a sub-table cell
    const subTableCell = target.closest('.sub-table-cell') as HTMLElement;
    
    console.log('🔴 Closest .sub-table-cell:', subTableCell);
    
    if (subTableCell) {
      event.stopPropagation();
      
      const subRow = parseInt(subTableCell.dataset['row'] || '0', 10);
      const subCol = parseInt(subTableCell.dataset['col'] || '0', 10);
      const level = parseInt(subTableCell.dataset['level'] || '1', 10);
      
      console.log('🔴 Sub-table cell data:', { subRow, subCol, level });
      
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
      
      console.log('🔴 Parent TD found:', parentTd);
      
      if (!parentTd) return;
      
      // Find parent row and col by searching through the table structure
      const mainTable = this.hostRef.nativeElement.querySelector('table:first-of-type');
      if (!mainTable) return;
      
      const allTds = Array.from(mainTable.querySelectorAll(':scope > tbody > tr > td'));
      const parentIndex = allTds.indexOf(parentTd);
      
      console.log('🔴 Parent TD index:', parentIndex, 'Total TDs:', allTds.length);
      
      if (parentIndex === -1) return;
      
      const colSizes = this.getColSizes();
      const parentRow = Math.floor(parentIndex / colSizes.length);
      const parentCol = parentIndex % colSizes.length;
      
      console.log('🔴 Calculated parent position:', { parentRow, parentCol });
      console.log('🔴 SubTablePath (full):', subTablePath);
      
      // Build path and select - pass the FULL subTablePath to support all nesting levels
      this.designerState.selectElement(this.element.id);
      this.designerState.selectTableCell(this.element.id, parentRow, parentCol, subTablePath.length > 0 ? subTablePath : undefined);
      
      console.log(`✅ Sub-table cell selected: parent[${parentRow},${parentCol}] sub[${subRow},${subCol}] level:${level}`);
      return;
    }
    
    // Check if click was on a parent cell (not sub-table)
    const parentTd = target.closest('td[data-row]') as HTMLElement;
    if (parentTd && !parentTd.classList.contains('sub-table-cell')) {
      const row = parseInt(parentTd.dataset['row'] || '0', 10);
      const col = parseInt(parentTd.dataset['col'] || '0', 10);
      
      console.log('🔵 Parent cell clicked:', { row, col });
      
      this.designerState.selectElement(this.element.id);
      this.designerState.selectTableCell(this.element.id, row, col);
      this.closeContextMenu();
      return;
    }
    
    console.log('🔴 Not a cell click');
  }

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

    console.log('getSelectedCellOffsets - selection:', selection);

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
      
      console.log('Sub-table path detected:', selection.subTablePath, 'parentKey:', parentKey);
      console.log('subTablesMap:', subTablesMap);
      
      if (subTablesMap && subTablesMap[parentKey]) {
        // Add parent cell padding once at the start
        const parentPadding = this.getCellPadding(selection.row, selection.col);
        top += parentPadding.top;
        left += parentPadding.left;
        
        // Walk through each level of nesting
        let currentSubTable = subTablesMap[parentKey];
        let currentWidth = width;
        let currentHeight = height;
        
        for (let level = 0; level < selection.subTablePath.length; level++) {
          const subCell: { row: number; col: number } = selection.subTablePath[level];
          const subRowSizes = currentSubTable.rowSizes || [];
          const subColSizes = currentSubTable.colSizes || [];
          
          console.log(`Processing level ${level}, subCell:`, subCell, 'sizes:', { subRowSizes, subColSizes });
          
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
        console.log('Final nested cell offset calculated:', { left, top, width });
      }
    }

    const result = { left, top, width };
    console.log('Returning offset:', result);
    return result;
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

  private createNestedSubTable(parentRow: number, parentCol: number, parentSubTable: any, subCellKey: string, rows: number, cols: number, level: number): void {
    console.log(`Creating nested sub-table: level=${level}, rows=${rows}, cols=${cols}, parentLevel=${parentSubTable.level}, subCellKey=${subCellKey}`);
    
    // Get properties from parent sub-cell to inherit
    const parentContent = parentSubTable.cellContents?.[subCellKey] || '';
    const parentPadding = parentSubTable.cellPadding?.[subCellKey] || [0, 0, 0, 0];
    const parentHAlign = parentSubTable.cellHAlign?.[subCellKey] || 'left';
    const parentVAlign = parentSubTable.cellVAlign?.[subCellKey] || 'top';
    const parentBorderWidth = parentSubTable.cellBorderWidth?.[subCellKey] || 1;
    const parentBorderStyle = parentSubTable.cellBorderStyle?.[subCellKey] || 'solid';
    const parentBorderColor = parentSubTable.cellBorderColor?.[subCellKey] || '#000000';
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
        nestedSubTable.cellBorderWidth[nestedKey] = parentBorderWidth;
        nestedSubTable.cellBorderStyle[nestedKey] = parentBorderStyle;
        nestedSubTable.cellBorderColor[nestedKey] = parentBorderColor;
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

  private getCurrentNestingLevel(row: number, col: number): number {
    // For now, check if cell already has a sub-table
    const key = `${row}_${col}`;
    const subTablesMap = this.element.properties?.['tableCellSubTables'] as Record<string, any> | undefined;
    if (subTablesMap && subTablesMap[key]) {
      return subTablesMap[key].level || 1;
    }
    return 0; // Parent table level
  }

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

  private getCellBorderProps(row: number, col: number): { width: number; style: string; color: string } {
    const key = `${row}_${col}`;
    const widthMap = this.element.properties?.['tableCellBorderWidth'] as Record<string, number> | undefined;
    const styleMap = this.element.properties?.['tableCellBorderStyle'] as Record<string, string> | undefined;
    const colorMap = this.element.properties?.['tableCellBorderColor'] as Record<string, string> | undefined;
    
    return {
      width: widthMap?.[key] || 1,
      style: styleMap?.[key] || 'solid',
      color: colorMap?.[key] || '#000000'
    };
  }

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

  protected hasSubTable(row: number, col: number): boolean {
    const key = `${row}_${col}`;
    const subTablesMap = this.element.properties?.['tableCellSubTables'] as Record<string, any> | undefined;
    return !!(subTablesMap && subTablesMap[key]);
  }

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

  private generateSubTableHtml(subTable: any, parentPadding: number): string {
    const level = subTable.level || 1;
    const rows = subTable.rows || 1;
    const cols = subTable.cols || 1;
    const rowSizes = subTable.rowSizes || Array(rows).fill(1 / rows);
    const colSizes = subTable.colSizes || Array(cols).fill(1 / cols);

    // Calculate selection color based on level
    const selectionColor = this.getSelectionColorForLevel(level);

    let html = `<table class="sub-table sub-table-level-${level}" style="width:100%;height:100%;border-collapse:collapse;table-layout:fixed;">`;
    html += '<tbody>';

    for (let r = 0; r < rows; r++) {
      const rowHeightPercent = (rowSizes[r] * 100).toFixed(2);
      html += `<tr style="height:${rowHeightPercent}%;">`;

      for (let c = 0; c < cols; c++) {
        const cellKey = `${r}_${c}`;
        const colWidthPercent = (colSizes[c] * 100).toFixed(2);

        // Get cell properties
        const content = subTable.cellContents?.[cellKey] || '';
        const padding = subTable.cellPadding?.[cellKey] || [0, 0, 0, 0];
        const hAlign = subTable.cellHAlign?.[cellKey] || 'left';
        const vAlign = subTable.cellVAlign?.[cellKey] || 'top';
        const borderWidth = subTable.cellBorderWidth?.[cellKey] || 1;
        const borderStyle = subTable.cellBorderStyle?.[cellKey] || 'solid';
        const borderColor = subTable.cellBorderColor?.[cellKey] || '#000000';
        const fontFamily = subTable.cellFontFamily?.[cellKey] || '';
        const fontSize = subTable.cellFontSize?.[cellKey] || '';
        const fontWeight = subTable.cellFontWeight?.[cellKey] || '';
        const fontStyleProp = subTable.cellFontStyle?.[cellKey] || '';
        const lineHeight = subTable.cellLineHeight?.[cellKey] || '';
        const textDecoration = subTable.cellTextDecoration?.[cellKey] || '';

        const [pt, pr, pb, pl] = padding;
        const borderCss = `border:${borderWidth}px ${borderStyle} ${borderColor};`;
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
    return html;
  }

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
    const target = event.target as HTMLElement;
    
    // Check if click is on or inside a sub-table cell
    const subTableCell = target.closest('.sub-table-cell');
    if (subTableCell) {
      // Let the native handler deal with sub-table cells
      console.log('🟢 Click on sub-table cell detected in onCellClick, skipping');
      return; // Don't stop propagation, don't select parent cell
    }
    
    // Normal cell click - DON'T stop propagation so native handler can process
    console.log('🔵 Normal cell click, selecting parent cell');
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

