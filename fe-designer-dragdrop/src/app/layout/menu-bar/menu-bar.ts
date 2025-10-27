import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DesignerStateService, CanvasZoomMode } from '../../core/services/designer-state.service';

@Component({
  selector: 'app-menu-bar',
  imports: [CommonModule],
  templateUrl: './menu-bar.html',
  styleUrl: './menu-bar.less',
  standalone: true
})
export class MenuBarComponent {
  private designerState = inject(DesignerStateService);

  protected openMenu = signal<string | null>(null);
  protected canUndo = this.designerState.canUndo;
  protected canRedo = this.designerState.canRedo;
  protected canvasZoomMode = this.designerState.canvasZoomMode;

  // Output events
  onNew = output<void>();
  onExportAsXhtml = output<void>();
  onSaveDesign = output<void>();
  onLoadDesign = output<void>();
  onOpen = output<void>();
  onClose = output<void>();
  onUndo = output<void>();
  onRedo = output<void>();
  onOptions = output<void>();
  onZoomChange = output<CanvasZoomMode>();
  onCalibrate = output<void>();

  toggleMenu(menu: string) {
    this.openMenu.update(current => current === menu ? null : menu);
  }

  closeMenu() {
    this.openMenu.set(null);
  }

  handleNew() {
    this.onNew.emit();
    this.closeMenu();
  }
  handleExportAsXhtml() {
    this.onExportAsXhtml.emit();
    this.closeMenu();
  }

  handleSaveDesign() {
    this.onSaveDesign.emit();
    this.closeMenu();
  }

  handleLoadDesign() {
    this.onLoadDesign.emit();
    this.closeMenu();
  }

  handleClose() {
    this.onClose.emit();
    this.closeMenu();
  }

  handleUndo() {
    this.onUndo.emit();
    this.closeMenu();
  }

  handleRedo() {
    this.onRedo.emit();
    this.closeMenu();
  }

  handleOptions() {
    this.onOptions.emit();
    this.closeMenu();
  }

  openCalibration() {
    this.onCalibrate.emit();
    this.closeMenu();
  }

  handleZoom(mode: CanvasZoomMode) {
    this.designerState.setCanvasZoomMode(mode);
    this.onZoomChange.emit(mode);
    this.closeMenu();
  }
}
