import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DesignerStateService, TableCellSelection } from '../../core/services/designer-state.service';
import { CanvasElement, TableCellBorderConfig, TableCellBorderSpec } from '../../shared/models/schema';
import { reconcileSizeArray, withTableSizes } from '../../shared/utils/table-utils';

type BorderSide = 'all' | 'top' | 'right' | 'bottom' | 'left';
type BorderPart = 'width' | 'style' | 'color';

/**
 * Side panel that surfaces editable properties for the selected element or cell.
 */
@Component({
  selector: 'app-property-panel',
  imports: [CommonModule, FormsModule],
  templateUrl: './property-panel.html',
  styleUrl: './property-panel.less',
  standalone: true
})
export class PropertyPanelComponent {
  protected collapsedSections: Record<string, boolean> = { general: false, table: false, cell: false };
  protected collapsedSubsections: Record<string, boolean> = { 
    alignment: false, 
    cellBorder: false, 
    font: false 
  };

  /**
   * Returns whether the requested accordion section is collapsed.
   */
  collapsed(id: string): boolean { return !!this.collapsedSections[id]; }

  /**
   * Returns whether the requested subsection is collapsed.
   */
  collapsedSubsection(id: string): boolean { return !!this.collapsedSubsections[id]; }

  /**
   * Toggles the expansion state for a panel section.
   */
  toggleSection(id: string): void { this.collapsedSections[id] = !this.collapsedSections[id]; }

  /**
   * Toggles the given subsection (collapsed <-> expanded).
   */
  toggleSubsection(id: string): void { this.collapsedSubsections[id] = !this.collapsedSubsections[id]; }
  private designerState = inject(DesignerStateService);
  
  protected selectedElement = this.designerState.selectedElement;
  protected selectedTableCell = this.designerState.selectedTableCell;
  protected activeBorderPopover: BorderSide | null = null;
  protected borderStyleOptions: string[] = ['none', 'solid', 'dashed', 'dotted', 'double'];
  
  /**
   * Applies a partial update to the currently selected element.
   */
  updateElement(updates: Partial<CanvasElement>) {
    const el = this.selectedElement();
    if (el) {
      this.designerState.updateElement(el.id, updates);
    }
  }

  /**
   * Merges the provided properties into the selected element's property bag.
   */
  updateElementProperties(patch: Record<string, any>) {
    const el = this.selectedElement();
    if (!el) return;
    const nextProps = { ...(el.properties||{}), ...patch };
    this.updateElement({ properties: nextProps });
  }

  /**
   * Updates the position fields for the selected element, clamping invalid values.
   */
  updatePosition(x: number, y: number) {
    const el = this.selectedElement();
    if (!el) return;
    const safeX = this.normalizeNumber(x, el.x);
    const safeY = this.normalizeNumber(y, el.y);
    if (safeX === el.x && safeY === el.y) return;
    this.updateElement({ x: safeX, y: safeY });
  }

  /**
   * Updates the dimensions of the selected element with basic validation.
   */
  updateSize(width: number, height: number) {
    const el = this.selectedElement();
    if (!el) return;
    const safeWidth = Math.max(1, this.normalizeNumber(width, el.width));
    const safeHeight = Math.max(1, this.normalizeNumber(height, el.height));
    if (safeWidth === el.width && safeHeight === el.height) return;
    this.updateElement({ width: safeWidth, height: safeHeight });
  }

  /**
   * Stores arbitrary string content on the selected element.
   */
  updateContent(content: string) {
    const el = this.selectedElement();
    if (!el || el.content === content) return;
    this.updateElement({ content });
  }

  /**
   * Resolves the custom element identifier property.
   */
  getElementId(element: CanvasElement): string {
    return element.properties?.['elementId'] || '';
  }

  /**
   * Persists the user-entered element identifier with trimming and length limits.
   */
  updateElementId(value: string) {
    const el = this.selectedElement();
    if (!el) return;
    const trimmed = value.trim().substring(0, 20);
    this.updateElementProperties({ elementId: trimmed });
  }

  /**
   * Retrieves the semantic role assigned to the element.
   */
  getElementRole(element: CanvasElement): string {
    const role = element.properties?.['elementRole'];
    if (role === 'report-header' || role === 'report-footer') {
      return role;
    }
    return 'report-body';
  }

  /**
   * Assigns a semantic role to the selected element.
   */
  updateElementRole(value: string) {
    const el = this.selectedElement();
    if (!el) return;
    const normalized = value === 'report-header' || value === 'report-footer' ? value : 'report-body';
    const current = el.properties?.['elementRole'];
    if (current === normalized) return;
    this.updateElementProperties({ elementRole: normalized });
  }

  /**
   * Adjusts row or column counts on table elements and reconciles size ratios.
   */
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

  /**
   * Reads a numeric table dimension from element properties, applying defaults.
   */
  tableProperty(element: CanvasElement, property: 'rows' | 'cols'): number {
    const value = element.properties?.[property];
    const parsed = typeof value === 'number' ? value : parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }

  /**
   * Indicates whether the provided element is a table.
   */
  isTable(element: CanvasElement | null): boolean {
    return !!element && element.type === 'table';
  }

  // Cell properties helpers
  /**
   * Builds the storage key used for cell-specific maps.
   */
  private cellKey(row: number, col: number): string { return `${row}_${col}`; }

  /**
   * Traverses nested sub-table metadata to resolve the active cell context.
   */
  private resolveNestedCellContext(el: CanvasElement, selection: TableCellSelection): { table: any; cellKey: string } | null {
    if (!selection.subTablePath || selection.subTablePath.length === 0) {
      return null;
    }

    const parentKey = this.cellKey(selection.row, selection.col);
    const subTables = el.properties?.['tableCellSubTables'] as Record<string, any> | undefined;
    if (!subTables || !subTables[parentKey]) {
      return null;
    }

    let currentTable = subTables[parentKey];

    for (let i = 0; i < selection.subTablePath.length; i++) {
      const step = selection.subTablePath[i];
      const key = this.cellKey(step.row, step.col);
      const isLast = i === selection.subTablePath.length - 1;

      if (isLast) {
        return { table: currentTable, cellKey: key };
      }

      const nested = currentTable.cellSubTables as Record<string, any> | undefined;
      if (!nested || !nested[key]) {
        return null;
      }
      currentTable = nested[key];
    }

    return null;
  }

  /**
   * Retrieves padding for the currently selected cell, defaulting to zeros.
   */
  getSelectedCellPadding(): { top: number; right: number; bottom: number; left: number } | null {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return null;

    const normalize = (raw: unknown) => {
      if (Array.isArray(raw) && raw.length === 4) {
        const [top, right, bottom, left] = raw.map(v => (Number.isFinite(v) ? v : 0));
        return { top, right, bottom, left };
      }
      return { top: 0, right: 0, bottom: 0, left: 0 };
    };

    if (selection.subTablePath && selection.subTablePath.length > 0) {
      const context = this.resolveNestedCellContext(el, selection);
      if (!context) {
        return { top: 0, right: 0, bottom: 0, left: 0 };
      }
      const nested = context.table.cellPadding as Record<string, number[]> | undefined;
      return normalize(nested?.[context.cellKey]);
    }

    const map = el.properties?.['tableCellPadding'] as Record<string, number[]> | undefined;
    return normalize(map?.[this.cellKey(selection.row, selection.col)]);
  }

  /**
   * Resolves the horizontal alignment applied to the selected cell, including nested cells.
   */
  getSelectedCellHAlign(): 'left' | 'center' | 'right' | null {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return null;
    if (selection.subTablePath && selection.subTablePath.length > 0) {
      const context = this.resolveNestedCellContext(el, selection);
      if (!context) {
        return 'left';
      }
      const nestedMap = context.table.cellHAlign as Record<string, string> | undefined;
      const nestedValue = nestedMap?.[context.cellKey];
      return nestedValue === 'center' || nestedValue === 'right' ? nestedValue : 'left';
    }

    const map = el.properties?.['tableCellHAlign'] as Record<string, string> | undefined;
    const value = map?.[this.cellKey(selection.row, selection.col)];
    return value === 'center' || value === 'right' ? value : 'left';
  }

  /**
   * Resolves the vertical alignment applied to the selected cell, including nested cells.
   */
  getSelectedCellVAlign(): 'top' | 'middle' | 'bottom' | null {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return null;
    if (selection.subTablePath && selection.subTablePath.length > 0) {
      const context = this.resolveNestedCellContext(el, selection);
      if (!context) {
        return 'top';
      }
      const nestedMap = context.table.cellVAlign as Record<string, string> | undefined;
      const nestedValue = nestedMap?.[context.cellKey];
      return nestedValue === 'middle' || nestedValue === 'bottom' ? nestedValue : 'top';
    }

    const map = el.properties?.['tableCellVAlign'] as Record<string, string> | undefined;
    const value = map?.[this.cellKey(selection.row, selection.col)];
    return value === 'middle' || value === 'bottom' ? value : 'top';
  }

  /**
   * Updates padding for a specific side of the selected cell.
   */
  updateSelectedCellPadding(side: 'top' | 'right' | 'bottom' | 'left', value: number) {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return;
    const indexMap: Record<'top' | 'right' | 'bottom' | 'left', number> = { top: 0, right: 1, bottom: 2, left: 3 };
    const index = indexMap[side];
    const safeValue = Math.max(0, Number.isFinite(value) ? value : 0);

    if (selection.subTablePath && selection.subTablePath.length > 0) {
      const parentKey = this.cellKey(selection.row, selection.col);
      const subTables = (el.properties?.['tableCellSubTables'] as Record<string, any>) || {};
      if (!subTables[parentKey]) {
        return;
      }

      const clonedSubTables = JSON.parse(JSON.stringify(subTables)) as Record<string, any>;
      let currentTable = clonedSubTables[parentKey];

      for (let i = 0; i < selection.subTablePath.length; i++) {
        const step = selection.subTablePath[i];
        const stepKey = this.cellKey(step.row, step.col);
        const isLast = i === selection.subTablePath.length - 1;

        if (isLast) {
          const paddingMap = (currentTable.cellPadding as Record<string, number[]>) || {};
          const raw = paddingMap[stepKey];
          const base = Array.isArray(raw) && raw.length === 4 ? raw : [0, 0, 0, 0];
          const nextPadding = [...base];
          nextPadding[index] = safeValue;
          currentTable.cellPadding = { ...paddingMap, [stepKey]: nextPadding };
        } else {
          const nestedTables = currentTable.cellSubTables as Record<string, any> | undefined;
          if (!nestedTables || !nestedTables[stepKey]) {
            return;
          }
          currentTable = nestedTables[stepKey];
        }
      }

      const nextProps = { ...(el.properties || {}), tableCellSubTables: clonedSubTables };
      this.updateElement({ properties: nextProps });
      return;
    }

    const key = this.cellKey(selection.row, selection.col);
    const existing = (el.properties?.['tableCellPadding'] as Record<string, number[]>) || {};
    const raw = existing[key];
    const base = Array.isArray(raw) && raw.length === 4 ? raw : [0, 0, 0, 0];
    const next = [...base];
    next[index] = safeValue;
    const updated = { ...(el.properties||{}), tableCellPadding: { ...existing, [key]: next } };
    this.updateElement({ properties: updated });
  }

  /**
   * Persists horizontal or vertical alignment for the selected cell, honoring nested tables.
   */
  updateSelectedCellAlignment(kind: 'h' | 'v', value: string) {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return;
    const key = this.cellKey(selection.row, selection.col);
    if (selection.subTablePath && selection.subTablePath.length > 0) {
      const parentKey = this.cellKey(selection.row, selection.col);
      const subTables = (el.properties?.['tableCellSubTables'] as Record<string, any>) || {};
      if (!subTables[parentKey]) {
        return;
      }

      const clonedSubTables = JSON.parse(JSON.stringify(subTables)) as Record<string, any>;
      let currentSubTable = clonedSubTables[parentKey];

      for (let i = 0; i < selection.subTablePath.length; i++) {
        const step = selection.subTablePath[i];
        const stepKey = this.cellKey(step.row, step.col);
        const isLast = i === selection.subTablePath.length - 1;

        if (isLast) {
          const nestedProp = kind === 'h' ? 'cellHAlign' : 'cellVAlign';
          if (!currentSubTable[nestedProp]) {
            currentSubTable[nestedProp] = {};
          }
          currentSubTable[nestedProp][stepKey] = value;
        } else {
          const nestedTables = currentSubTable.cellSubTables as Record<string, any> | undefined;
          if (!nestedTables || !nestedTables[stepKey]) {
            return;
          }
          currentSubTable = nestedTables[stepKey];
        }
      }

      const nextProps = {
        ...(el.properties || {}),
        tableCellSubTables: clonedSubTables
      };

      this.updateElement({ properties: nextProps });
      return;
    }

    const propName = kind === 'h' ? 'tableCellHAlign' : 'tableCellVAlign';
    const existing = (el.properties?.[propName] as Record<string, string>) || {};
    const updated = { ...(el.properties||{}), [propName]: { ...existing, [key]: value } };
    this.updateElement({ properties: updated });
  }

  /**
   * Indicates whether a table cell is currently selected.
   */
  hasSelectedCell(): boolean {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    return !!selection && !!el && selection.elementId === el.id && el.type === 'table';
  }

  /**
   * Removes the currently selected canvas element.
   */
  deleteElement() {
    const el = this.selectedElement();
    if (el) {
      this.designerState.removeElement(el.id);
    }
  }

  // Removed table-level border helpers (migrated to cell-level)

  // Cell border helpers
  /**
   * Returns whether the border popover for the specified edge is visible.
   */
  protected isBorderPopoverOpen(side: BorderSide): boolean {
    return this.activeBorderPopover === side;
  }

  /**
   * Toggles the visibility of an individual border popover.
   */
  protected toggleBorderPopover(side: BorderSide, event: MouseEvent): void {
    event.stopPropagation();
    this.activeBorderPopover = this.activeBorderPopover === side ? null : side;
  }

  /**
   * Prevents popover clicks from bubbling and closing the editor.
   */
  protected onBorderPopoverClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  /**
   * Computes the effective border specification for the active cell and side.
   */
  protected getBorderSpec(side: BorderSide): TableCellBorderSpec {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) {
      return this.defaultBorderSpec();
    }

    if (selection.subTablePath && selection.subTablePath.length > 0) {
      const context = this.resolveNestedCellContext(el, selection);
      if (!context) {
        return this.defaultBorderSpec();
      }
      const configMap = context.table.cellBorders as Record<string, TableCellBorderConfig> | undefined;
      const config = configMap?.[context.cellKey];
      const legacy = this.legacyBorderSpecForNested(context.table, context.cellKey);
      return this.composeBorderSpec(config, legacy, side);
    }

    const key = this.cellKey(selection.row, selection.col);
    const configMap = el.properties?.['tableCellBorders'] as Record<string, TableCellBorderConfig> | undefined;
    const config = configMap?.[key];
    const legacy = this.legacyBorderSpecForRoot(el, key);
    return this.composeBorderSpec(config, legacy, side);
  }

  /**
   * Handles inline editing events for border width, style, or color.
   */
  protected onBorderInput(side: BorderSide, part: BorderPart, value: any): void {
    this.updateBorderSpec(side, part, value);
  }

  @HostListener('document:click')
  /**
   * Closes any active border popover when the user clicks elsewhere.
   */
  closeBorderPopoverOnOutsideClick(): void {
    this.activeBorderPopover = null;
  }

  /**
   * Applies mutations to the border configuration maps for the selected cell.
   */
  private updateBorderSpec(side: BorderSide, part: BorderPart, value: any): void {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) {
      return;
    }

    const current = this.getBorderSpec(side);
    const next: TableCellBorderSpec = { ...current };

    if (part === 'width') {
      next.width = Math.max(0, Number(value) || 0);
    } else if (part === 'style') {
      next.style = String(value || 'none');
    } else if (part === 'color') {
      next.color = typeof value === 'string' && value ? value : '#000000';
    }

    if (selection.subTablePath && selection.subTablePath.length > 0) {
      this.applyNestedBorderSpec(selection, el, side, next);
    } else {
      this.applyRootBorderSpec(selection, el, side, next);
    }
  }

  /**
   * Writes border settings for root-level table cells.
   */
  private applyRootBorderSpec(selection: TableCellSelection, el: CanvasElement, side: BorderSide, spec: TableCellBorderSpec): void {
    const key = this.cellKey(selection.row, selection.col);
    const existingMap = (el.properties?.['tableCellBorders'] as Record<string, TableCellBorderConfig>) || {};
    const existingConfig = existingMap[key];
    const baseSpec = side === 'all' ? spec : this.composeBorderSpec(existingConfig, this.legacyBorderSpecForRoot(el, key), 'all');

    const nextConfig: TableCellBorderConfig = { ...(existingConfig || {}) };

    if (side === 'all') {
      nextConfig.all = { ...spec };
      delete nextConfig.top;
      delete nextConfig.right;
      delete nextConfig.bottom;
      delete nextConfig.left;
    } else {
      nextConfig.all = nextConfig.all ? { ...nextConfig.all } : { ...baseSpec };
      nextConfig[side] = { ...spec };
      if (this.borderSpecsEqual(nextConfig[side], nextConfig.all)) {
        delete nextConfig[side];
      }
    }

    const nextMap: Record<string, TableCellBorderConfig> = { ...existingMap };
    const hasOverrides = !!(nextConfig.top || nextConfig.right || nextConfig.bottom || nextConfig.left);
    const hasAll = !!nextConfig.all && !this.borderSpecsEqual(nextConfig.all, this.defaultBorderSpec());

    if (hasAll || hasOverrides) {
      nextMap[key] = nextConfig;
    } else {
      delete nextMap[key];
    }

    const nextProps: Record<string, any> = { ...(el.properties || {}) };
    if (Object.keys(nextMap).length > 0) {
      nextProps['tableCellBorders'] = nextMap;
    } else if (nextProps['tableCellBorders']) {
      delete nextProps['tableCellBorders'];
    }

    if (side === 'all') {
      const widthMap = { ...(el.properties?.['tableCellBorderWidth'] as Record<string, number> || {}) };
      const styleMap = { ...(el.properties?.['tableCellBorderStyle'] as Record<string, string> || {}) };
      const colorMap = { ...(el.properties?.['tableCellBorderColor'] as Record<string, string> || {}) };

      if (hasAll || hasOverrides) {
        widthMap[key] = spec.width;
        styleMap[key] = spec.style;
        colorMap[key] = spec.color;
      } else {
        delete widthMap[key];
        delete styleMap[key];
        delete colorMap[key];
      }

      if (Object.keys(widthMap).length > 0) {
        nextProps['tableCellBorderWidth'] = widthMap;
      } else if (nextProps['tableCellBorderWidth']) {
        delete nextProps['tableCellBorderWidth'];
      }

      if (Object.keys(styleMap).length > 0) {
        nextProps['tableCellBorderStyle'] = styleMap;
      } else if (nextProps['tableCellBorderStyle']) {
        delete nextProps['tableCellBorderStyle'];
      }

      if (Object.keys(colorMap).length > 0) {
        nextProps['tableCellBorderColor'] = colorMap;
      } else if (nextProps['tableCellBorderColor']) {
        delete nextProps['tableCellBorderColor'];
      }
    }

    this.updateElement({ properties: nextProps });
  }

  /**
   * Writes border settings for nested sub-table cells.
   */
  private applyNestedBorderSpec(selection: TableCellSelection, el: CanvasElement, side: BorderSide, spec: TableCellBorderSpec): void {
    const parentKey = this.cellKey(selection.row, selection.col);
    const subTables = (el.properties?.['tableCellSubTables'] as Record<string, any>) || {};
    if (!subTables[parentKey]) {
      return;
    }

    const subPath = selection.subTablePath;
    if (!subPath || subPath.length === 0) {
      return;
    }

    const clonedSubTables: Record<string, any> = JSON.parse(JSON.stringify(subTables));
    let currentTable = clonedSubTables[parentKey];

    for (let i = 0; i < subPath.length; i++) {
      const step = subPath[i];
      const stepKey = this.cellKey(step.row, step.col);
      const isLast = i === subPath.length - 1;

      if (isLast) {
        const existingConfig = currentTable.cellBorders?.[stepKey] as TableCellBorderConfig | undefined;
        const legacy = this.legacyBorderSpecForNested(currentTable, stepKey);
        const baseSpec = side === 'all' ? spec : this.composeBorderSpec(existingConfig, legacy, 'all');

        const nextConfig: TableCellBorderConfig = { ...(existingConfig || {}) };
        if (side === 'all') {
          nextConfig.all = { ...spec };
          delete nextConfig.top;
          delete nextConfig.right;
          delete nextConfig.bottom;
          delete nextConfig.left;
        } else {
          nextConfig.all = nextConfig.all ? { ...nextConfig.all } : { ...baseSpec };
          nextConfig[side] = { ...spec };
          if (this.borderSpecsEqual(nextConfig[side], nextConfig.all)) {
            delete nextConfig[side];
          }
        }

        if (!currentTable.cellBorders) {
          currentTable.cellBorders = {};
        }

        const hasOverrides = !!(nextConfig.top || nextConfig.right || nextConfig.bottom || nextConfig.left);
        const hasAll = !!nextConfig.all && !this.borderSpecsEqual(nextConfig.all, this.defaultBorderSpec());

        if (hasAll || hasOverrides) {
          currentTable.cellBorders[stepKey] = nextConfig;
        } else if (currentTable.cellBorders[stepKey]) {
          delete currentTable.cellBorders[stepKey];
        }

        if (currentTable.cellBorders && Object.keys(currentTable.cellBorders).length === 0) {
          delete currentTable.cellBorders;
        }

        if (side === 'all') {
          const widthMap = { ...(currentTable.cellBorderWidth || {}) };
          const styleMap = { ...(currentTable.cellBorderStyle || {}) };
          const colorMap = { ...(currentTable.cellBorderColor || {}) };

          if (hasAll || hasOverrides) {
            widthMap[stepKey] = spec.width;
            styleMap[stepKey] = spec.style;
            colorMap[stepKey] = spec.color;
          } else {
            delete widthMap[stepKey];
            delete styleMap[stepKey];
            delete colorMap[stepKey];
          }

          currentTable.cellBorderWidth = widthMap;
          currentTable.cellBorderStyle = styleMap;
          currentTable.cellBorderColor = colorMap;

          if (Object.keys(widthMap).length === 0) {
            delete currentTable.cellBorderWidth;
          }
          if (Object.keys(styleMap).length === 0) {
            delete currentTable.cellBorderStyle;
          }
          if (Object.keys(colorMap).length === 0) {
            delete currentTable.cellBorderColor;
          }
        }
      } else {
        if (!currentTable.cellSubTables || !currentTable.cellSubTables[stepKey]) {
          return;
        }
        currentTable = currentTable.cellSubTables[stepKey];
      }
    }

    const nextProps: Record<string, any> = { ...(el.properties || {}) };
    nextProps['tableCellSubTables'] = clonedSubTables;
    this.updateElement({ properties: nextProps });
  }

  /**
   * Adapts legacy flat border maps for root-level cells into the new config structure.
   */
  private legacyBorderSpecForRoot(el: CanvasElement, key: string): TableCellBorderSpec | null {
    const widthMap = el.properties?.['tableCellBorderWidth'] as Record<string, number> | undefined;
    const styleMap = el.properties?.['tableCellBorderStyle'] as Record<string, string> | undefined;
    const colorMap = el.properties?.['tableCellBorderColor'] as Record<string, string> | undefined;
    if (widthMap?.[key] === undefined && styleMap?.[key] === undefined && colorMap?.[key] === undefined) {
      return null;
    }
    return {
      width: Number.isFinite(widthMap?.[key]) ? widthMap![key]! : 0,
      style: typeof styleMap?.[key] === 'string' ? styleMap![key]! : 'solid',
      color: typeof colorMap?.[key] === 'string' ? colorMap![key]! : '#000000'
    };
  }

  /**
   * Adapts legacy flat border maps for nested cells into the new config structure.
   */
  private legacyBorderSpecForNested(table: any, key: string): TableCellBorderSpec | null {
    const widthMap = table.cellBorderWidth as Record<string, number> | undefined;
    const styleMap = table.cellBorderStyle as Record<string, string> | undefined;
    const colorMap = table.cellBorderColor as Record<string, string> | undefined;
    if (widthMap?.[key] === undefined && styleMap?.[key] === undefined && colorMap?.[key] === undefined) {
      return null;
    }
    return {
      width: Number.isFinite(widthMap?.[key]) ? widthMap![key]! : 0,
      style: typeof styleMap?.[key] === 'string' ? styleMap![key]! : 'solid',
      color: typeof colorMap?.[key] === 'string' ? colorMap![key]! : '#000000'
    };
  }

  /**
   * Combines explicit overrides and inherited defaults for a particular border side.
   */
  private composeBorderSpec(config: TableCellBorderConfig | undefined, legacy: TableCellBorderSpec | null, side: BorderSide): TableCellBorderSpec {
    const base = this.normalizeBorderSpec(config?.all ?? legacy ?? this.defaultBorderSpec());
    if (side === 'all') {
      return base;
    }
    const override = config?.[side];
    if (!override) {
      return base;
    }
    return this.normalizeBorderSpec(override);
  }

  /**
   * Fills in missing border fields with safe defaults.
   */
  private normalizeBorderSpec(spec?: TableCellBorderSpec | null): TableCellBorderSpec {
    if (!spec) {
      return this.defaultBorderSpec();
    }
    return {
      width: Number.isFinite(spec.width) ? spec.width : 0,
      style: typeof spec.style === 'string' ? spec.style : 'solid',
      color: typeof spec.color === 'string' ? spec.color : '#000000'
    };
  }

  /**
   * Provides the default border shape used when nothing is configured.
   */
  private defaultBorderSpec(): TableCellBorderSpec {
    return { width: 0, style: 'solid', color: '#000000' };
  }

  /**
   * Compares two border specs for value equality.
   */
  private borderSpecsEqual(a?: TableCellBorderSpec, b?: TableCellBorderSpec): boolean {
    if (!a || !b) {
      return false;
    }
    return a.width === b.width && a.style === b.style && a.color === b.color;
  }

  // Cell font helpers
  /**
   * Returns the font style for the selected cell or a sensible default.
   */
  getSelectedCellFontStyle(): string | null {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return null;
    const map = el.properties?.['tableCellFontStyle'] as Record<string, string> | undefined;
    const v = map?.[this.cellKey(selection.row, selection.col)];
    return typeof v === 'string' ? v : 'normal';
  }
  /**
   * Returns the font weight for the selected cell or a sensible default.
   */
  getSelectedCellFontWeight(): string | null {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return null;
    const map = el.properties?.['tableCellFontWeight'] as Record<string, string> | undefined;
    const v = map?.[this.cellKey(selection.row, selection.col)];
    return typeof v === 'string' ? v : 'normal';
  }
  /**
   * Returns the font size applied to the selected cell content.
   */
  getSelectedCellFontSize(): number | null {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return null;
    const map = el.properties?.['tableCellFontSize'] as Record<string, number> | undefined;
    const v = map?.[this.cellKey(selection.row, selection.col)];
    return Number.isFinite(v) ? v! : 9;
  }
  /**
   * Returns the line height configured for the selected cell.
   */
  getSelectedCellLineHeight(): number | null {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return null;
    const map = el.properties?.['tableCellLineHeight'] as Record<string, number> | undefined;
    const v = map?.[this.cellKey(selection.row, selection.col)];
    return Number.isFinite(v) ? v! : 1;
  }
  /**
   * Returns the font family for the selected cell, defaulting to Roboto.
   */
  getSelectedCellFontFamily(): string | null {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return null;
    const map = el.properties?.['tableCellFontFamily'] as Record<string, string> | undefined;
    const v = map?.[this.cellKey(selection.row, selection.col)];
    return typeof v === 'string' && v.length > 0 ? v : 'Roboto, sans-serif';
  }
  /**
   * Returns the text decoration set for the selected cell.
   */
  getSelectedCellTextDecoration(): string | null {
    const selection = this.selectedTableCell();
    const el = this.selectedElement();
    if (!selection || !el || el.id !== selection.elementId) return null;
    const map = el.properties?.['tableCellTextDecoration'] as Record<string, string> | undefined;
    const v = map?.[this.cellKey(selection.row, selection.col)];
    return typeof v === 'string' ? v : 'none';
  }
  /**
   * Updates a specific font-related attribute for the selected cell.
   */
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
      nextProps['tableCellFontSize'] = { ...map, [key]: Math.max(1, Number(value) || 9) };
    } else if (part === 'lineHeight') {
      const map = (el.properties?.['tableCellLineHeight'] as Record<string, number>) || {};
      nextProps['tableCellLineHeight'] = { ...map, [key]: Math.max(0.5, Number(value) || 1) };
    } else if (part === 'family') {
      const map = (el.properties?.['tableCellFontFamily'] as Record<string, string>) || {};
      const normalized = String(value || '').trim();
      const updatedMap = { ...map };
      if (normalized.length === 0 || normalized === 'Roboto, sans-serif') {
        delete updatedMap[key];
      } else {
        updatedMap[key] = normalized;
      }
      if (Object.keys(updatedMap).length > 0) {
        nextProps['tableCellFontFamily'] = updatedMap;
      } else if (nextProps['tableCellFontFamily']) {
        delete nextProps['tableCellFontFamily'];
      }
    } else if (part === 'decoration') {
      const map = (el.properties?.['tableCellTextDecoration'] as Record<string, string>) || {};
      nextProps['tableCellTextDecoration'] = { ...map, [key]: String(value) };
    }
    this.updateElement({ properties: nextProps });
  }

  /**
   * Sanitizes numeric input, falling back when the value is not finite.
   */
  private normalizeNumber(value: number, fallback: number = 0): number {
    if (Number.isFinite(value)) {
      return value;
    }
    return fallback;
  }
}
