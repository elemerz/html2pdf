import { Component, Input, inject, HostListener, HostBinding, ElementRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CanvasElement, A4_WIDTH_MM, A4_HEIGHT_MM } from '../../shared/models/schema';
import { DesignerStateService, PageGutters } from '../../core/services/designer-state.service';

@Component({
  selector: 'app-canvas-element',
  imports: [CommonModule],
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
  private isResizingWidth = false;
  private isResizingHeight = false;
  private resizeStart = { startX: 0, startY: 0, width: 0, height: 0 };

  onClick(event: MouseEvent) {
    event.stopPropagation();
    this.designerState.selectElement(this.element.id);
  }

  onMouseDown(event: MouseEvent) {
    if (event.button !== 0) return;
    event.stopPropagation();
    
    this.designerState.selectElement(this.element.id);
    this.isDragging = true;
    
    const rect = this.elementRef.nativeElement.getBoundingClientRect();
    this.dragStart = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  onHorizontalResizeMouseDown(event: MouseEvent) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    
    this.designerState.selectElement(this.element.id);
    this.isDragging = false;
    this.isResizingWidth = true;
    this.isResizingHeight = false;
    this.resizeStart = {
      startX: event.clientX,
      startY: event.clientY,
      width: this.element.width,
      height: this.element.height
    };
  }

  onVerticalResizeMouseDown(event: MouseEvent) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    
    this.designerState.selectElement(this.element.id);
    this.isDragging = false;
    this.isResizingHeight = true;
    this.isResizingWidth = false;
    this.resizeStart = {
      startX: event.clientX,
      startY: event.clientY,
      width: this.element.width,
      height: this.element.height
    };
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (this.isResizingWidth || this.isResizingHeight) {
      let updates: Partial<CanvasElement> = {};

      if (this.isResizingWidth) {
        const deltaPx = event.clientX - this.resizeStart.startX;
        let newWidth = this.resizeStart.width + deltaPx / this.mmToPx;
        newWidth = Math.max(this.gridSize, newWidth);
        const maxWidth = Math.max(
          this.gridSize,
          this.getContentRight() - this.element.x
        );
        newWidth = Math.min(newWidth, maxWidth);
        updates.width = this.snapToGrid(newWidth);
      }

      if (this.isResizingHeight) {
        const deltaPx = event.clientY - this.resizeStart.startY;
        let newHeight = this.resizeStart.height + deltaPx / this.mmToPx;
        newHeight = Math.max(this.gridSize, newHeight);
        const maxHeight = Math.max(
          this.gridSize,
          this.getContentBottom() - this.element.y
        );
        newHeight = Math.min(newHeight, maxHeight);
        updates.height = this.snapToGrid(newHeight);
      }

      if (Object.keys(updates).length) {
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

    const clamped = this.clampPosition(newX, newY, this.element.width, this.element.height);

    this.designerState.updateElement(this.element.id, {
      x: clamped.x,
      y: clamped.y,
    });
  }

  @HostListener('document:mouseup')
  onMouseUp() {
    this.isDragging = false;
    this.isResizingWidth = false;
    this.isResizingHeight = false;
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
}
