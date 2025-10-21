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

  // Start dragging from toolbar
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

  // Start dragging an existing canvas element
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

  // Update ghost position during drag
  updateGhostPosition(x: number, y: number) {
    this.dragStateSignal.update(state => ({
      ...state,
      ghostPosition: { x, y }
    }));
  }

  // End drag operation
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

  // Grid snapping helper
  snapToGrid(value: number, gridSize: number): number {
    return Math.round(value / gridSize) * gridSize;
  }

  // Convert pixel to mm
  pxToMm(px: number, mmToPx: number): number {
    return px / mmToPx;
  }

  // Convert mm to pixel
  mmToPx(mm: number, mmToPx: number): number {
    return mm * mmToPx;
  }
}
