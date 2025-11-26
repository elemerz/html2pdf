import { CanvasElement } from '../models/schema';

type TableDimension = 'rows' | 'cols';

const EPSILON = 1e-9;

function toPositiveNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function createEqualRatios(length: number): number[] {
  if (length <= 0) {
    return [];
  }
  const ratio = 1 / length;
  return Array.from({ length }, () => ratio);
}
export function normalizeRatios(values: number[]): number[] {
  if (!values.length) {
    return [];
  }
  const sanitized = values.map(value => {
    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }
    return value;
  });
  const total = sanitized.reduce((sum, value) => sum + value, 0);
  if (total <= EPSILON) {
    return createEqualRatios(values.length);
  }
  const normalized = sanitized.map(value => value / total);
  const normalizedTotal = normalized.reduce((sum, value) => sum + value, 0);
  const correction = 1 - normalizedTotal;
  normalized[normalized.length - 1] += correction;
  return normalized;
}

export function reconcileSizeArray(values: unknown, targetLength: number): number[] {
  if (targetLength <= 0) {
    return [];
  }

  if (!Array.isArray(values) || values.length === 0) {
    return createEqualRatios(targetLength);
  }

  const normalized = normalizeRatios(values.map(value => toPositiveNumber(value)));
  if (normalized.length === targetLength) {
    return normalized;
  }

  return createEqualRatios(targetLength);
}

export function getTableDimension(element: CanvasElement, dimension: TableDimension): number {
  const value = element.properties?.[dimension];
  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  return Math.floor(parsed);
}

export function getTableRowSizes(element: CanvasElement): number[] {
  const rows = getTableDimension(element, 'rows');
  return reconcileSizeArray(element.properties?.['rowSizes'], rows);
}

export function getTableColSizes(element: CanvasElement): number[] {
  const cols = getTableDimension(element, 'cols');
  return reconcileSizeArray(element.properties?.['colSizes'], cols);
}

export function withTableSizes(
  element: CanvasElement,
  rowSizes: number[],
  colSizes: number[]
): Record<string, any> {
  const normalizedRows = normalizeRatios(rowSizes.length ? rowSizes : createEqualRatios(1));
  const normalizedCols = normalizeRatios(colSizes.length ? colSizes : createEqualRatios(1));

  return {
    ...(element.properties ?? {}),
    rows: normalizedRows.length || 1,
    cols: normalizedCols.length || 1,
    rowSizes: normalizedRows,
    colSizes: normalizedCols,
  };
}
