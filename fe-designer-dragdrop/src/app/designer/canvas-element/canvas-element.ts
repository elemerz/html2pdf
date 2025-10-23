import { Component, Input, inject, HostListener, HostBinding, ElementRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CanvasElement, A4_WIDTH_MM, A4_HEIGHT_MM } from '../../shared/models/schema';
import { DesignerStateService, PageGutters } from '../../core/services/designer-state.service';
import { TableElementComponent } from '../table-element/table-element';

type ResizeHandle =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'top-right'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-left';

@Component({
  selector: 'app-canvas-element',
  imports: [CommonModule, TableElementComponent],
  templateUrl: './canvas-element.html',
  styleUrl: './canvas-element.less',
  standalone: true,
  host: {
    '[class.selected]': 'isSelected',
  }
})
export class CanvasElementComponent {
  @Input({ required: true }) element!: CanvasElement;
  @Input() isSelected: boolean = false;
  @Input() gridSize: number = 10;
  @Input() mmToPx: number = 3.7795275591;
  @Input() pageGutters: PageGutters = { top: 0, right: 0, bottom: 0, left: 0 };
  
  @HostBinding('style.left') get left() { return `${this.element.x}mm`; }
  @HostBinding('style.top') get top() { return `${this.element.y}mm`; }
  @HostBinding('style.width') get width() { return `${this.element.width}mm`; }
  @HostBinding('style.height') get height() { return `${this.element.height}mm`; }
  
  private elementRef = inject(ElementRef);
  private designerState = inject(DesignerStateService);
  
  protected showContextMenu = signal(false);
  protected contextMenuPosition = signal({ x: 0, y: 0 });
  
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private activeResizeHandle: ResizeHandle | null = null;
  private resizeStart = { startX: 0, startY: 0, x: 0, y: 0, width: 0, height: 0 };

  onClick(event: MouseEvent) {
    event.stopPropagation();
    this.designerState.selectElement(this.element.id);
  }

  onMouseDown(event: MouseEvent) {
    if (event.button !== 0) return;
    event.stopPropagation();
    
    this.designerState.selectElement(this.element.id);
    this.isDragging = true;
    this.activeResizeHandle = null;
    
    const rect = this.elementRef.nativeElement.getBoundingClientRect();
    this.dragStart = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  onResizeMouseDown(handle: ResizeHandle, event: MouseEvent) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();

    this.designerState.selectElement(this.element.id);
    this.isDragging = false;
    this.activeResizeHandle = handle;
    this.resizeStart = {
      startX: event.clientX,
      startY: event.clientY,
      x: this.element.x,
      y: this.element.y,
      width: this.element.width,
      height: this.element.height
    };
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (this.activeResizeHandle) {
      const deltaX = (event.clientX - this.resizeStart.startX) / this.mmToPx;
      const deltaY = (event.clientY - this.resizeStart.startY) / this.mmToPx;
      const updates = this.calculateResizeUpdates(this.activeResizeHandle, deltaX, deltaY);
      if (updates) {
        this.designerState.updateElement(this.element.id, updates);
      }
      return;
    }

    if (!this.isDragging) return;
    
    const parent = this.elementRef.nativeElement.parentElement;
    if (!parent) return;
    
    const canvasRect = parent.getBoundingClientRect();
    const pxX = event.clientX - canvasRect.left - this.dragStart.x;
    const pxY = event.clientY - canvasRect.top - this.dragStart.y;
    
    const mmX = pxX / this.mmToPx;
    const mmY = pxY / this.mmToPx;
    
    const newX = this.snapToGrid(mmX);
    const newY = this.snapToGrid(mmY);

    // Apply snapping to nearby elements (edge snap) & prevent overlap
    const snapped = this.applyElementSnapping(newX, newY, this.element.width, this.element.height);
    const clamped = this.clampPosition(snapped.x, snapped.y, this.element.width, this.element.height);

    this.designerState.updateElement(this.element.id, {
      x: clamped.x,
      y: clamped.y,
    });
  }

  @HostListener('document:mouseup')
  onMouseUp() {
    this.isDragging = false;
    this.activeResizeHandle = null;
  }

  onContextMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuPosition.set({ x: event.clientX, y: event.clientY });
    this.showContextMenu.set(true);
  }

  closeContextMenu() {
    this.showContextMenu.set(false);
  }

  onDelete() {
    this.designerState.removeElement(this.element.id);
    this.closeContextMenu();
  }

  onProperties() {
    this.designerState.selectElement(this.element.id);
    this.closeContextMenu();
  }

  private snapToGrid(value: number): number {
    return Math.round(value / this.gridSize) * this.gridSize;
  }

  private calculateResizeUpdates(handle: ResizeHandle, deltaX: number, deltaY: number): Partial<CanvasElement> | null {
    const resizeLeft = handle === 'left' || handle === 'top-left' || handle === 'bottom-left';
    const resizeRight = handle === 'right' || handle === 'top-right' || handle === 'bottom-right';
    const resizeTop = handle === 'top' || handle === 'top-left' || handle === 'top-right';
    const resizeBottom = handle === 'bottom' || handle === 'bottom-left' || handle === 'bottom-right';

    const start = this.resizeStart;
    const minSize = this.gridSize;

    const contentLeft = this.pageGutters.left;
    const contentTop = this.pageGutters.top;
    const contentRight = this.getContentRight();
    const contentBottom = this.getContentBottom();

    const maxWidthToRight = Math.max(minSize, contentRight - start.x);
    const maxWidthToLeft = Math.max(minSize, start.x + start.width - contentLeft);
    const maxHeightToBottom = Math.max(minSize, contentBottom - start.y);
    const maxHeightToTop = Math.max(minSize, start.y + start.height - contentTop);

    let newX = start.x;
    let newY = start.y;
    let newWidth = start.width;
    let newHeight = start.height;

    if (resizeRight) {
      newWidth = start.width + deltaX;
    }
    if (resizeLeft) {
      newWidth = start.width - deltaX;
    }
    if (resizeBottom) {
      newHeight = start.height + deltaY;
    }
    if (resizeTop) {
      newHeight = start.height - deltaY;
    }

    if (resizeRight && !resizeLeft) {
      newWidth = Math.min(newWidth, maxWidthToRight);
    }
    if (resizeLeft) {
      newWidth = Math.min(newWidth, maxWidthToLeft);
    }
    if (resizeBottom && !resizeTop) {
      newHeight = Math.min(newHeight, maxHeightToBottom);
    }
    if (resizeTop) {
      newHeight = Math.min(newHeight, maxHeightToTop);
    }

    newWidth = Math.max(minSize, newWidth);
    newHeight = Math.max(minSize, newHeight);

    newWidth = Math.max(minSize, this.snapToGrid(newWidth));
    newHeight = Math.max(minSize, this.snapToGrid(newHeight));

    const rightEdge = start.x + start.width;
    const bottomEdge = start.y + start.height;

    if (resizeLeft) {
      newX = rightEdge - newWidth;
    } else if (resizeRight) {
      newX = start.x;
    }

    if (resizeTop) {
      newY = bottomEdge - newHeight;
    } else if (resizeBottom) {
      newY = start.y;
    }

    const clamped = this.clampPosition(newX, newY, newWidth, newHeight);
    newX = clamped.x;
    newY = clamped.y;

    const updates: Partial<CanvasElement> = {};
    if (resizeLeft || resizeRight) {
      updates.x = newX;
      updates.width = newWidth;
    }
    if (resizeTop || resizeBottom) {
      updates.y = newY;
      updates.height = newHeight;
    }

    if (Object.keys(updates).length === 0) {
      return null;
    }

    return updates;
  }

  private clampPosition(x: number, y: number, width: number, height: number) {
    const availableWidth = Math.max(0, this.getContentRight() - this.pageGutters.left);
    const availableHeight = Math.max(0, this.getContentBottom() - this.pageGutters.top);

    const minX = this.pageGutters.left;
    const minY = this.pageGutters.top;
    const maxX = this.pageGutters.left + Math.max(availableWidth - width, 0);
    const maxY = this.pageGutters.top + Math.max(availableHeight - height, 0);

    const clampedX = this.snapWithinBounds(x, minX, maxX);
    const clampedY = this.snapWithinBounds(y, minY, maxY);

    return {
      x: clampedX,
      y: clampedY
    };
  }

  private getContentRight(): number {
    return A4_WIDTH_MM - this.pageGutters.right;
  }

  private getContentBottom(): number {
    return A4_HEIGHT_MM - this.pageGutters.bottom;
  }

  private snapWithinBounds(value: number, min: number, max: number): number {
    if (max <= min) {
      return min;
    }
    const step = this.gridSize;
    if (step <= 0) {
      return Math.min(Math.max(value, min), max);
    }

    const offset = value - min;
    const rawSteps = Math.round(offset / step);
    const maxSteps = Math.floor((max - min) / step);
    const clampedSteps = Math.min(Math.max(rawSteps, 0), maxSteps);
    return min + clampedSteps * step;
  }

  // Snap element edges to nearby other element edges if within threshold; prevent overlap.
  private applyElementSnapping(x: number, y: number, width: number, height: number): { x: number; y: number } {
    const threshold = Math.max(1, this.gridSize); // snap threshold in mm
    const elements = this.designerState.elements();
    const currentId = this.element.id;

    let snapX = x;
    let snapY = y;

    // Compute proposed bounds
    const proposedLeft = x;
    const proposedTop = y;
    const proposedRight = x + width;
    const proposedBottom = y + height;

    // Iterate existing elements for snapping & overlap prevention
    for (const el of elements) {
      if (el.id === currentId) continue;
      const left = el.x;
      const top = el.y;
      const right = el.x + el.width;
      const bottom = el.y + el.height;

      // Horizontal snapping: align left/right edges
      if (Math.abs(proposedLeft - right) <= threshold) {
        snapX = right; // snap left edge to other's right edge
      } else if (Math.abs(proposedRight - left) <= threshold) {
        snapX = left - width; // snap right edge to other's left edge
      } else if (Math.abs(proposedLeft - left) <= threshold) {
        snapX = left; // align left edges
      } else if (Math.abs(proposedRight - right) <= threshold) {
        snapX = right - width; // align right edges
      }

      // Vertical snapping: align top/bottom edges
      if (Math.abs(proposedTop - bottom) <= threshold) {
        snapY = bottom; // snap top to other's bottom
      } else if (Math.abs(proposedBottom - top) <= threshold) {
        snapY = top - height; // snap bottom to other's top
      } else if (Math.abs(proposedTop - top) <= threshold) {
        snapY = top; // align top edges
      } else if (Math.abs(proposedBottom - bottom) <= threshold) {
        snapY = bottom - height; // align bottom edges
      }

      // Update proposed bounds after snapping for overlap check
      const newLeft = snapX;
      const newTop = snapY;
      const newRight = snapX + width;
      const newBottom = snapY + height;

      const horizontalOverlap = newLeft < right && newRight > left;
      const verticalOverlap = newTop < bottom && newBottom > top;
      if (horizontalOverlap && verticalOverlap) {
        // Resolve overlap by pushing out minimally based on which side we approached
        // Prefer preserving original movement direction (simple heuristic)
        if (x >= right) {
          snapX = right; // place to the right
        } else if (x + width <= left) {
          snapX = left - width; // place to left
        } else if (y >= bottom) {
          snapY = bottom; // place below
        } else if (y + height <= top) {
          snapY = top - height; // place above
        } else {
          // Fallback: choose side with smallest penetration
          const overlapLeft = right - newLeft;
          const overlapRight = newRight - left;
          const overlapTop = bottom - newTop;
          const overlapBottom = newBottom - top;
          const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
          if (minOverlap === overlapLeft) snapX = right;
          else if (minOverlap === overlapRight) snapX = left - width;
          else if (minOverlap === overlapTop) snapY = bottom;
          else snapY = top - height;
        }
      }
    }

    return { x: snapX, y: snapY };
  }

}

