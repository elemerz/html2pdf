// Element types (for printed PDF reports)
export type ElementType =
  | "text"
  | "heading"
  | "paragraph"
  | "div"
  | "section"
  | "article"
  | "image"
  | "table"
  | "list"
  | "link";

// Canvas element on the grid
export interface CanvasElement {
  id: string;
  type: ElementType;
  x: number; // position in mm
  y: number; // position in mm
  width: number; // size in mm (default: 100)
  height: number; // size in mm (default: 50)
  properties: Record<string, any>;
  content: string;
}

export interface TableCellBorderSpec {
  width: number;
  style: string;
  color: string;
}

export interface TableCellBorderConfig {
  all?: TableCellBorderSpec;
  top?: TableCellBorderSpec;
  right?: TableCellBorderSpec;
  bottom?: TableCellBorderSpec;
  left?: TableCellBorderSpec;
}

// Sub-table data structure for nested tables within cells
export interface SubTableData {
  rows: number;
  cols: number;
  rowSizes: number[];
  colSizes: number[];
  level: number; // Nesting level (1-5)
  cellContents: Record<string, string>;
  cellPadding: Record<string, number[]>;
  cellHAlign: Record<string, string>;
  cellVAlign: Record<string, string>;
  cellBorderWidth: Record<string, number>;
  cellBorderStyle: Record<string, string>;
  cellBorderColor: Record<string, string>;
  cellBorders?: Record<string, TableCellBorderConfig>;
  cellFontFamily: Record<string, string>;
  cellFontSize: Record<string, number>;
  cellFontWeight: Record<string, string>;
  cellFontStyle: Record<string, string>;
  cellLineHeight: Record<string, number>;
  cellTextDecoration: Record<string, string>;
  cellSubTables?: Record<string, SubTableData>; // Nested sub-tables
}

// Layout/Report design
export interface ReportLayout {
  id?: string;
  name: string;
  elements: CanvasElement[];
  gridSize: number; // grid size in mm (default: 10)
  canvasWidth: number; // A4 width in mm (default: 210)
  canvasHeight: number; // A4 height in mm (default: 297)
}

// Insert types (without id)
export type InsertCanvasElement = Omit<CanvasElement, 'id'>;
export type InsertReportLayout = Omit<ReportLayout, 'id'>;

// Toolbar element categories
export type ToolbarCategory = "text" | "containers" | "layout";

export interface ToolbarElement {
  type: ElementType;
  label: string;
  icon: string;
  defaultWidth: number; // in mm
  defaultHeight: number; // in mm
  category: ToolbarCategory;
}

export const toolbarElements: ToolbarElement[] = [
  // Only Table element retained
  { type: "table", label: "Table", icon: "table", defaultWidth: 200, defaultHeight: 150, category: "layout" },
];

// Helper to create default canvas element
export function createDefaultCanvasElement(
  type: ElementType,
  x: number,
  y: number,
  toolbarElement?: ToolbarElement
): InsertCanvasElement {
  const element = toolbarElement || toolbarElements.find(e => e.type === type);
  const properties: Record<string, any> = {};
  properties['elementRole'] = 'report-body';

  if (type === 'table') {
    properties['rows'] = 1;
    properties['cols'] = 1;
    properties['rowSizes'] = [1];
    properties['colSizes'] = [1];
  }

  return {
    type,
    x,
    y,
    width: element?.defaultWidth || 100,
    height: element?.defaultHeight || 50,
    properties,
    content: type === 'table' ? '' : `New ${type}`,
  };
}

// Helper to create default layout
export function createDefaultLayout(name: string = "Untitled Layout"): InsertReportLayout {
  return {
    name,
    elements: [],
    gridSize: 10, // 10mm grid
    canvasWidth: 210, // A4 width in mm
    canvasHeight: 297, // A4 height in mm
  };
}

// Constants
export const MM_TO_PX = 3.7795275591; // Conversion factor: 1mm = 3.7795275591px at 96 DPI
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const DEFAULT_GRID_SIZE_MM = 10;
