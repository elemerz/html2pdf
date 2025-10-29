import { Injectable, signal } from '@angular/core';
import { ToolbarElement } from '../../shared/models/schema';

export interface DragState {
  isDragging: boolean;
  draggedItem: ToolbarElement | null;
  ghostPosition: { x: number; y: number } | null;
  dragType: 'toolbar' | 'canvas' | null;
  draggedElementId: string | null;
  pointerOffset: { x: number; y: number } | null;
}

/**
 * Centralized drag-drop state shared between toolbar and canvas interactions.
 */
@Injectable({
  providedIn: 'root'
})
export class DragDropService {
  private dragStateSignal = signal<DragState>({
    isDragging: false,
    draggedItem: null,
    ghostPosition: null,
    dragType: null,
    draggedElementId: null,
    pointerOffset: null
  });

  readonly dragState = this.dragStateSignal.asReadonly();

  /**
   * Begins a drag originating from the toolbar palette with the given pointer offsets.
   */
  startToolbarDrag(item: ToolbarElement, x: number, y: number, offsetX: number = 0, offsetY: number = 0) {
    this.dragStateSignal.set({
      isDragging: true,
      draggedItem: item,
      ghostPosition: { x, y },
      dragType: 'toolbar',
      draggedElementId: null,
      pointerOffset: { x: offsetX, y: offsetY }
    });
  }

  /**
   * Begins a drag for an existing canvas element so it can be repositioned.
   */
  startCanvasDrag(elementId: string, x: number, y: number, offsetX: number = 0, offsetY: number = 0) {
    this.dragStateSignal.set({
      isDragging: true,
      draggedItem: null,
      ghostPosition: { x, y },
      dragType: 'canvas',
      draggedElementId: elementId,
      pointerOffset: { x: offsetX, y: offsetY }
    });
  }

  /**
   * Updates the ghost preview coordinates while dragging.
   */
  updateGhostPosition(x: number, y: number) {
    this.dragStateSignal.update(state => ({
      ...state,
      ghostPosition: { x, y }
    }));
  }

  /**
   * Clears drag state once the user drops or cancels the operation.
   */
  endDrag() {
    this.dragStateSignal.set({
      isDragging: false,
      draggedItem: null,
      ghostPosition: null,
      dragType: null,
      draggedElementId: null,
      pointerOffset: null
    });
  }

  /**
   * Snaps the provided measurement to the nearest grid increment.
   */
  snapToGrid(value: number, gridSize: number): number {
    return Math.round(value / gridSize) * gridSize;
  }

  /**
   * Converts a pixel measurement to millimeters using the provided scale factor.
   */
  pxToMm(px: number, mmToPx: number): number {
    return px / mmToPx;
  }

  /**
   * Converts a millimeter measurement to pixels using the provided scale factor.
   */
  mmToPx(mm: number, mmToPx: number): number {
    return mm * mmToPx;
  }
}
