import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DesignerStateService } from '../../core/services/designer-state.service';
import { DragDropService } from '../../core/services/drag-drop.service';
import { CanvasElementComponent } from '../canvas-element/canvas-element';
import { createDefaultCanvasElement, MM_TO_PX, A4_WIDTH_MM, A4_HEIGHT_MM } from '../../shared/models/schema';

@Component({
  selector: 'app-canvas',
  imports: [CommonModule, CanvasElementComponent],
  templateUrl: './canvas.html',
  styleUrl: './canvas.less',
  standalone: true
})
export class CanvasComponent implements AfterViewInit, OnDestroy {
  private designerState = inject(DesignerStateService);
  private dragDropService = inject(DragDropService);
  
  @ViewChild('workspace', { static: true }) private workspaceRef!: ElementRef<HTMLElement>;
  @ViewChild('sheet', { static: true }) private sheetRef!: ElementRef<HTMLElement>;

  private resizeObserver: ResizeObserver | null = null;
  private scaleUpdateScheduled = false;

  protected elements = this.designerState.elements;
  protected selectedElementId = this.designerState.selectedElementId;
  protected dragState = this.dragDropService.dragState;
  protected visualGridSize = this.designerState.visualGridSize;
  protected logicalGridSize = this.designerState.logicalGridSize;
  protected canvasScale = this.designerState.canvasScale;
  protected visualGridColor = this.designerState.visualGridColor;
  protected visualGridSizePx = computed(() => this.visualGridSize() * MM_TO_PX);
  
  protected readonly MM_TO_PX = MM_TO_PX;
  protected readonly A4_WIDTH_MM = A4_WIDTH_MM;
  protected readonly A4_HEIGHT_MM = A4_HEIGHT_MM;

  private viewInitialized = false;
  private stopZoomEffect = effect(() => {
    // Track zoom mode changes and recompute scale after view init.
    this.designerState.canvasZoomMode();
    if (this.viewInitialized) {
      this.scheduleCanvasScaleUpdate();
    }
  });

  ngAfterViewInit() {
    this.viewInitialized = true;
    this.scheduleCanvasScaleUpdate();

    const workspaceEl = this.workspaceRef?.nativeElement;
    if (workspaceEl && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.scheduleCanvasScaleUpdate());
      this.resizeObserver.observe(workspaceEl);
    }
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    this.stopZoomEffect.destroy();
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.scheduleCanvasScaleUpdate();
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    const canvas = this.sheetRef?.nativeElement;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const effectiveMmToPx = MM_TO_PX * this.canvasScale();
    const xMm = this.dragDropService.pxToMm(x, effectiveMmToPx);
    const yMm = this.dragDropService.pxToMm(y, effectiveMmToPx);
    const snappedX = this.dragDropService.snapToGrid(xMm, this.logicalGridSize());
    const snappedY = this.dragDropService.snapToGrid(yMm, this.logicalGridSize());
    
    this.designerState.setCursorPosition(Math.round(snappedX), Math.round(snappedY));
    
    if (this.dragState().isDragging) {
      const pointerOffset = this.dragState().pointerOffset;
      let ghostClientX = rect.left + this.dragDropService.mmToPx(snappedX, effectiveMmToPx);
      let ghostClientY = rect.top + this.dragDropService.mmToPx(snappedY, effectiveMmToPx);
      
      if (pointerOffset) {
        ghostClientX -= pointerOffset.x;
        ghostClientY -= pointerOffset.y;
      }
      
      this.dragDropService.updateGhostPosition(ghostClientX, ghostClientY);
    }
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    const canvas = this.sheetRef?.nativeElement;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const effectiveMmToPx = MM_TO_PX * this.canvasScale();
    let xMm = this.dragDropService.pxToMm(x, effectiveMmToPx);
    let yMm = this.dragDropService.pxToMm(y, effectiveMmToPx);
    
    const pointerOffset = this.dragState().pointerOffset;
    const draggedItem = this.dragState().draggedItem;
    if (draggedItem) {
      if (pointerOffset) {
        xMm -= this.dragDropService.pxToMm(pointerOffset.x, effectiveMmToPx);
        yMm -= this.dragDropService.pxToMm(pointerOffset.y, effectiveMmToPx);
      }
      // Snap to grid using logical grid size
      xMm = this.dragDropService.snapToGrid(xMm, this.logicalGridSize());
      yMm = this.dragDropService.snapToGrid(yMm, this.logicalGridSize());
      
      // Ensure within bounds
      xMm = Math.max(0, Math.min(xMm, A4_WIDTH_MM - draggedItem.defaultWidth));
      yMm = Math.max(0, Math.min(yMm, A4_HEIGHT_MM - draggedItem.defaultHeight));
      
      const newElement = createDefaultCanvasElement(draggedItem.type, xMm, yMm, draggedItem);
      this.designerState.addElement({
        ...newElement,
        id: `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      });
    }
    
    this.dragDropService.endDrag();
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onCanvasClick() {
    this.designerState.selectElement(null);
  }

  private scheduleCanvasScaleUpdate() {
    if (this.scaleUpdateScheduled) return;
    this.scaleUpdateScheduled = true;
    const schedule = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (callback: FrameRequestCallback) => setTimeout(() => callback(0), 16);

    schedule(() => {
      this.scaleUpdateScheduled = false;
      this.updateCanvasScale();
    });
  }

  private updateCanvasScale() {
    const workspaceEl = this.workspaceRef?.nativeElement;
    if (!workspaceEl || !this.sheetRef?.nativeElement) return;

    const workspaceWidth = workspaceEl.clientWidth;
    const workspaceHeight = workspaceEl.clientHeight;
    const baseWidth = this.A4_WIDTH_MM * this.MM_TO_PX;
    const baseHeight = this.A4_HEIGHT_MM * this.MM_TO_PX;

    if (!workspaceWidth || !workspaceHeight || !baseWidth || !baseHeight) return;

    const zoomMode = this.designerState.canvasZoomMode();
    let scale: number;

    if (zoomMode === 'width') {
      scale = workspaceWidth / baseWidth;
    } else if (zoomMode === 'height') {
      scale = workspaceHeight / baseHeight;
    } else {
      scale = Math.min(workspaceWidth / baseWidth, workspaceHeight / baseHeight);
    }

    if (!isFinite(scale) || scale <= 0) return;

    this.designerState.setCanvasScale(scale);
  }
}
