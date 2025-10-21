import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { DesignerStateService } from './core/services/designer-state.service';
import { LayoutsApiService } from './core/services/layouts-api.service';
import { MenuBarComponent } from './layout/menu-bar/menu-bar';
import { StatusBarComponent } from './layout/status-bar/status-bar';
import { ToolbarPanelComponent } from './layout/toolbar-panel/toolbar-panel';
import { PropertyPanelComponent } from './layout/property-panel/property-panel';
import { CanvasComponent } from './designer/canvas/canvas';
import { SaveDialogComponent } from './layout/save-dialog/save-dialog';
import { OpenDialogComponent } from './layout/open-dialog/open-dialog';
import { OptionsDialogComponent } from './shared/dialogs/options-dialog/options-dialog';
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
    OptionsDialogComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.less',
  standalone: true
})
export class App {
  protected designerState = inject(DesignerStateService);
  private layoutsApi = inject(LayoutsApiService);

  // Dialog visibility signals
  protected showSaveDialog = signal(false);
  protected showOpenDialog = signal(false);
  protected showOptionsDialog = signal(false);

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

  // Dialog handlers
  async handleSave(name: string): Promise<void> {
    try {
      const layout: ReportLayout = {
        name,
        elements: this.designerState.elements(),
        gridSize: 10,
        canvasWidth: 210,
        canvasHeight: 297
      };

      await firstValueFrom(this.layoutsApi.createLayout(layout));
      this.designerState.setStatusMessage(`Layout "${name}" saved successfully`);
      this.showSaveDialog.set(false);
    } catch (err) {
      console.error('Failed to save layout:', err);
      this.designerState.setStatusMessage('Failed to save layout');
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
}
