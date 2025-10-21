import { Component, Input, Output, EventEmitter, inject, HostListener, HostBinding, ElementRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CanvasElement } from '../../shared/models/schema';
import { DesignerStateService } from '../../core/services/designer-state.service';

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
      const parent = this.elementRef.nativeElement.parentElement;
      if (!parent) return;
      
      const parentRect = parent.getBoundingClientRect();
      const parentWidthMm = parentRect.width / this.mmToPx;
      const parentHeightMm = parentRect.height / this.mmToPx;

      let updates: Partial<CanvasElement> = {};

      if (this.isResizingWidth) {
        const deltaPx = event.clientX - this.resizeStart.startX;
        let newWidth = this.resizeStart.width + deltaPx / this.mmToPx;
        newWidth = Math.max(this.gridSize, newWidth);
        const maxWidth = Math.max(this.gridSize, parentWidthMm - this.element.x);
        newWidth = Math.min(newWidth, maxWidth);
        updates.width = this.snapToGrid(newWidth);
      }

      if (this.isResizingHeight) {
        const deltaPx = event.clientY - this.resizeStart.startY;
        let newHeight = this.resizeStart.height + deltaPx / this.mmToPx;
        newHeight = Math.max(this.gridSize, newHeight);
        const maxHeight = Math.max(this.gridSize, parentHeightMm - this.element.y);
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

    this.designerState.updateElement(this.element.id, {
      x: Math.max(0, newX),
      y: Math.max(0, newY),
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
}
