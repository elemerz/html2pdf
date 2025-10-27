import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DesignerStateService } from './core/services/designer-state.service';
import { MenuBarComponent } from './layout/menu-bar/menu-bar';
import { StatusBarComponent } from './layout/status-bar/status-bar';
import { ToolbarPanelComponent } from './layout/toolbar-panel/toolbar-panel';
import { PropertyPanelComponent } from './layout/property-panel/property-panel';
import { CanvasComponent } from './designer/canvas/canvas';
import { SaveDialogComponent } from './layout/save-dialog/save-dialog';
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
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xhtml,.html,.xml';
    
    input.onchange = (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const xhtmlContent = e.target?.result as string;
          const layout = this.designerState.parseXhtmlToLayout(xhtmlContent, file.name);
          this.designerState.loadLayout(layout);
          this.designerState.setStatusMessage(`Layout "${layout.name}" loaded`);
        } catch (err) {
          console.error('Error parsing XHTML:', err);
          this.designerState.setStatusMessage('Failed to parse XHTML file: ' + (err as Error).message);
        }
      };

      reader.onerror = () => {
        this.designerState.setStatusMessage('Failed to read file');
      };

      reader.readAsText(file);
    };

    input.click();
  }

  onCloseLayout(): void {
    if (confirm('Close the current layout?')) {
      this.designerState.clearLayout();
      this.designerState.setStatusMessage('Layout closed');
    }
  }

  onSaveDesign(): void {
    const defaultName = this.designerState.currentLayout().name || 'layout';
    const entered = prompt('Enter report design file name', defaultName);
    const fileNameBase = (entered || defaultName).trim() || 'layout';
    const json = this.designerState.exportDesign();
    this.triggerDownload(`${fileNameBase}.report-design.json`, json, 'application/json');
    this.designerState.setStatusMessage('Report design saved');
  }

  onLoadDesign(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const jsonContent = e.target?.result as string;
          this.designerState.importDesign(jsonContent);
          this.designerState.setStatusMessage('Report design loaded');
        } catch (err) {
          console.error('Error loading design:', err);
          this.designerState.setStatusMessage('Failed to load design: ' + (err as Error).message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
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
      const errorMessage = error instanceof Error ? error.message : 'Failed to export layout';
      this.designerState.setStatusMessage(errorMessage);
      // Don't close dialog on validation error so user can fix it
      if (errorMessage.includes('Validation Error')) {
        alert(errorMessage);
      } else {
        this.showSaveDialog.set(false);
      }
    }
  }

  closeSaveDialog(): void {
    this.showSaveDialog.set(false);
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
