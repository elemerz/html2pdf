import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DesignerStateService } from './core/services/designer-state.service';
import { MenuBarComponent } from './layout/menu-bar/menu-bar';
import { StatusBarComponent } from './layout/status-bar/status-bar';
import { ToolbarPanelComponent } from './layout/toolbar-panel/toolbar-panel';
import { PropertyPanelComponent } from './layout/property-panel/property-panel';
import { CanvasComponent } from './designer/canvas/canvas';
import { SaveDialogComponent } from './layout/save-dialog/save-dialog';
import { OpenDialogComponent } from './layout/open-dialog/open-dialog';
import { OptionsDialogComponent } from './shared/dialogs/options-dialog/options-dialog';
import { ScreenCalibrationDialogComponent } from './shared/dialogs/screen-calibration/screen-calibration-dialog';
import { ReportLayout } from './shared/models/schema';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    MenuBarComponent,
    StatusBarComponent,
    ToolbarPanelComponent,
    PropertyPanelComponent,
    CanvasComponent,
    SaveDialogComponent,
    OpenDialogComponent,
    OptionsDialogComponent,
    ScreenCalibrationDialogComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.less',
  standalone: true
})
export class App {
  protected designerState = inject(DesignerStateService);

  // Dialog visibility signals
  protected showSaveDialog = signal(false);
  protected showOpenDialog = signal(false);
  protected showOptionsDialog = signal(false);
  protected showCalibrationDialog = signal(false);

  // Expose signals to template
  protected westCollapsed = this.designerState.westCollapsed;
  protected eastCollapsed = this.designerState.eastCollapsed;
  protected westWidth = this.designerState.westWidth;
  protected eastWidth = this.designerState.eastWidth;
  protected statusMessage = this.designerState.statusMessage;
  protected cursorPosition = this.designerState.cursorPosition;
  protected selectedElement = this.designerState.selectedElement;
  protected elements = this.designerState.elements;
  protected canUndo = this.designerState.canUndo;
  protected canRedo = this.designerState.canRedo;

  // Menu bar handlers
  onNewLayout(): void {
    if (confirm('Clear the current layout?')) {
      this.designerState.clearLayout();
      this.designerState.setStatusMessage('New layout created');
    }
  }

  onSaveLayout(): void {
    this.showSaveDialog.set(true);
  }

  onOpenLayout(): void {
    this.showOpenDialog.set(true);
  }

  onCloseLayout(): void {
    if (confirm('Close the current layout?')) {
      this.designerState.clearLayout();
      this.designerState.setStatusMessage('Layout closed');
    }
  }

  onUndo(): void {
    this.designerState.undo();
  }

  onRedo(): void {
    this.designerState.redo();
  }

  onOptions(): void {
    this.showOptionsDialog.set(true);
  }

  onCalibrateScreen(): void {
    this.showCalibrationDialog.set(true);
  }

  // Dialog handlers
  handleSave(name: string): void {
    const trimmedName = name.trim() || 'layout';
    try {
      const xhtml = this.designerState.generateXhtmlDocument(trimmedName);
      this.triggerDownload(`${trimmedName}.xhtml`, xhtml, 'application/xhtml+xml');
      this.designerState.setStatusMessage(`Layout "${trimmedName}" exported`);
      this.showSaveDialog.set(false);
    } catch (error) {
      console.error('Failed to export layout:', error);
      this.designerState.setStatusMessage('Failed to export layout');
    }
  }

  handleOpen(layout: ReportLayout): void {
    this.designerState.loadLayout(layout);
    this.designerState.setStatusMessage(`Layout "${layout.name}" loaded`);
    this.showOpenDialog.set(false);
  }

  closeSaveDialog(): void {
    this.showSaveDialog.set(false);
  }

  closeOpenDialog(): void {
    this.showOpenDialog.set(false);
  }

  closeOptionsDialog(): void {
    this.showOptionsDialog.set(false);
  }

  closeCalibrationDialog(): void {
    this.showCalibrationDialog.set(false);
  }

  private triggerDownload(filename: string, content: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
