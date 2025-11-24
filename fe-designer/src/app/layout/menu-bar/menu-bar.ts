import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DesignerStateService, CanvasZoomMode } from '../../core/services/designer-state.service';

/**
 * Top menu bar that exposes application commands and delegates to the root component.
 */
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
  protected layoutDisplayName = this.designerState.layoutDisplayName;

  // Output events
  onNew = output<void>();
  onExportAsXhtml = output<void>();
  onPublishTemplate = output<void>();
  onSaveDesign = output<void>();
  onLoadDesign = output<void>();
  onOpen = output<void>();
  onClose = output<void>();
  onUndo = output<void>();
  onRedo = output<void>();
  onSettings = output<void>();
  onZoomChange = output<CanvasZoomMode>();
  onCalibrate = output<void>();

  /**
   * Expands or collapses the requested menu depending on its current state.
   */
  toggleMenu(menu: string) {
    this.openMenu.update(current => current === menu ? null : menu);
  }

  /**
   * Collapses any open menu flyout.
   */
  closeMenu() {
    this.openMenu.set(null);
  }

  /**
   * Emits the new-layout action and closes the menu.
   */
  handleNew() {
    this.onNew.emit();
    this.closeMenu();
  }
  /**
   * Emits the XHTML export action and closes the menu.
   */
  handleExportAsXhtml() {
    this.onExportAsXhtml.emit();
    this.closeMenu();
  }
  /**
   * Emits the publish-template action and closes the menu.
   */
  handlePublishTemplate() {
    this.onPublishTemplate.emit();
    this.closeMenu();
  }

  /**
   * Emits the save-design action and closes the menu.
   */
  handleSaveDesign() {
    this.onSaveDesign.emit();
    this.closeMenu();
  }

  /**
   * Emits the load-design action and closes the menu.
   */
  handleLoadDesign() {
    this.onLoadDesign.emit();
    this.closeMenu();
  }

  /**
   * Emits the close-layout action and closes the menu.
   */
  handleClose() {
    // Warn if there are unsaved changes
    if (this.designerState.isDesignDirty() && !confirm('You have unsaved changes. Close without saving?')) {
      return;
    }
    this.onClose.emit();
    this.closeMenu();
  }

  /**
   * Emits the undo action and closes the menu.
   */
  handleUndo() {
    this.onUndo.emit();
    this.closeMenu();
  }

  /**
   * Emits the redo action and closes the menu.
   */
  handleRedo() {
    this.onRedo.emit();
    this.closeMenu();
  }

  /**
   * Opens the settings dialog and closes the menu.
   */
  handleSettings() {
    this.onSettings.emit();
    this.closeMenu();
  }

  /**
   * Requests the screen calibration dialog and closes the menu.
   */
  openCalibration() {
    this.onCalibrate.emit();
    this.closeMenu();
  }

  /**
   * Applies the selected zoom mode and notifies listeners.
   */
  handleZoom(mode: CanvasZoomMode) {
    this.designerState.setCanvasZoomMode(mode);
    this.onZoomChange.emit(mode);
    this.closeMenu();
  }
}
