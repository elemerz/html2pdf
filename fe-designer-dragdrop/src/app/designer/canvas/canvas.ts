import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, effect, inject, signal } from '@angular/core';
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
  protected pageGutters = this.designerState.pageGutters;
  protected pageContentMetrics = computed(() => {
    const gutters = this.pageGutters();
    const contentWidthMm = Math.max(0, this.A4_WIDTH_MM - gutters.left - gutters.right);
    const contentHeightMm = Math.max(0, this.A4_HEIGHT_MM - gutters.top - gutters.bottom);
    const scale = this.canvasScale();
    const mmToPx = this.MM_TO_PX * scale;

    return {
      widthMm: contentWidthMm,
      heightMm: contentHeightMm,
      leftPx: gutters.left * mmToPx,
      topPx: gutters.top * mmToPx,
      widthPx: contentWidthMm * mmToPx,
      heightPx: contentHeightMm * mmToPx
    };
  });
  
  protected readonly MM_TO_PX = MM_TO_PX;
  protected readonly A4_WIDTH_MM = A4_WIDTH_MM;
  protected readonly A4_HEIGHT_MM = A4_HEIGHT_MM;
  protected readonly shouldCenterCanvas = signal(true);
  protected readonly screenCalibrationScale = this.designerState.calibrationScale;

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

    let clampedX = snappedX;
    let clampedY = snappedY;

    const dragState = this.dragState();
    let widthForClamp = 0;
    let heightForClamp = 0;

    const draggedItem = dragState.draggedItem;
    if (draggedItem) {
      widthForClamp = draggedItem.defaultWidth;
      heightForClamp = draggedItem.defaultHeight;
    } else if (dragState.dragType === 'canvas' && dragState.draggedElementId) {
      const element = this.elements().find(el => el.id === dragState.draggedElementId);
      if (element) {
        widthForClamp = element.width;
        heightForClamp = element.height;
      }
    }

    const clampedPosition = this.clampToContentArea(snappedX, snappedY, widthForClamp, heightForClamp);
    clampedX = clampedPosition.x;
    clampedY = clampedPosition.y;

    this.designerState.setCursorPosition(Math.round(clampedX), Math.round(clampedY));

    if (dragState.isDragging) {
      const pointerOffset = dragState.pointerOffset;
      let ghostClientX = rect.left + this.dragDropService.mmToPx(clampedX, effectiveMmToPx);
      let ghostClientY = rect.top + this.dragDropService.mmToPx(clampedY, effectiveMmToPx);
      
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

      const clampedPosition = this.clampToContentArea(xMm, yMm, draggedItem.defaultWidth, draggedItem.defaultHeight);
      let newElement = createDefaultCanvasElement(draggedItem.type, clampedPosition.x, clampedPosition.y, draggedItem);
      if (draggedItem.type === 'table') {
        // Layout table defaults: full available width and fixed height 40mm, positioned after previous element or at top margin
        const gutters = this.pageGutters();
        const contentWidth = Math.max(1, this.A4_WIDTH_MM - gutters.left - gutters.right);
        const existing = this.elements();
        const nextY = existing.length ? existing[existing.length - 1].y + existing[existing.length - 1].height : gutters.top;
        newElement = { ...newElement, x: gutters.left, y: nextY, width: contentWidth, height: 40 };
      }
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

    if (zoomMode === 'actual') {
      // 1:1 scale; top-left visible; horizontal centering handled by flex container.
      scale = 1;
      workspaceEl.scrollTop = 0;
      // Disable vertical centering regardless of available space.
      this.shouldCenterCanvas.set(false);
    } else if (zoomMode === 'width') {
      scale = workspaceWidth / baseWidth;
    } else if (zoomMode === 'height') {
      scale = workspaceHeight / baseHeight;
    } else {
      scale = Math.min(workspaceWidth / baseWidth, workspaceHeight / baseHeight);
    }

    if (!isFinite(scale) || scale <= 0) return;

    const scaledHeight = baseHeight * scale;
    if (zoomMode !== 'actual') {
      this.shouldCenterCanvas.set(scaledHeight <= workspaceHeight);
    }

    this.designerState.setCanvasScale(scale);
  }

  private clampToContentArea(x: number, y: number, width: number, height: number) {
    const gutters = this.pageGutters();
    const contentWidth = Math.max(0, this.A4_WIDTH_MM - gutters.left - gutters.right);
    const contentHeight = Math.max(0, this.A4_HEIGHT_MM - gutters.top - gutters.bottom);

    const adjustedWidth = Math.min(Math.max(width, 0), contentWidth);
    const adjustedHeight = Math.min(Math.max(height, 0), contentHeight);

    const minX = gutters.left;
    const minY = gutters.top;
    const maxX = gutters.left + Math.max(contentWidth - adjustedWidth, 0);
    const maxY = gutters.top + Math.max(contentHeight - adjustedHeight, 0);

    let clampedX = Math.min(Math.max(x, minX), maxX);
    let clampedY = Math.min(Math.max(y, minY), maxY);

    clampedX = this.snapWithinBounds(clampedX, minX, maxX);
    clampedY = this.snapWithinBounds(clampedY, minY, maxY);

    return {
      x: clampedX,
      y: clampedY
    };
  }

  private snapWithinBounds(value: number, min: number, max: number): number {
    const step = this.logicalGridSize();
    if (max <= min) {
      return min;
    }
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
