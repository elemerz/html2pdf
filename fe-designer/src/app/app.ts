import { Component, ViewChild, inject, signal, HostListener } from '@angular/core';

import { DesignerStateService } from './core/services/designer-state.service';
import { MenuBarComponent } from './layout/menu-bar/menu-bar';
import { StatusBarComponent } from './layout/status-bar/status-bar';
import { ToolbarPanelComponent } from './layout/toolbar-panel/toolbar-panel';
import { PropertyPanelComponent } from './layout/property-panel/property-panel';
import { CanvasComponent } from './designer/canvas/canvas';
import { SaveDialogComponent } from './layout/save-dialog/save-dialog';
import { OptionsDialogComponent } from './shared/dialogs/options-dialog/options-dialog';
import { ScreenCalibrationDialogComponent } from './shared/dialogs/screen-calibration/screen-calibration-dialog';
import { PublishTemplateDialogComponent } from './layout/publish-template-dialog/publish-template-dialog';
import { SaveReportDialogComponent } from './layout/save-report-dialog/save-report-dialog';

/**
 * Root application shell responsible for wiring together layout chrome and handling global menu actions.
 */
@Component({
  selector: 'app-root',
  imports: [
    MenuBarComponent,
    StatusBarComponent,
    ToolbarPanelComponent,
    PropertyPanelComponent,
    CanvasComponent,
    SaveDialogComponent,
    SaveReportDialogComponent,
    OptionsDialogComponent,
    ScreenCalibrationDialogComponent,
    PublishTemplateDialogComponent
],
  templateUrl: './app.html',
  styleUrl: './app.less',
  standalone: true
})
export class App {
  protected designerState = inject(DesignerStateService);
  @ViewChild(SaveReportDialogComponent) private saveReportDialog?: SaveReportDialogComponent;

  // Dialog visibility signals
  protected showSaveDialog = signal(false);
  protected showSettingsDialog = signal(false);
  protected showCalibrationDialog = signal(false);
  protected showPublishDialog = signal(false);
  protected exportDefaultFileName = signal('');

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
  /**
   * Resets the current layout after user confirmation and clears designer state.
   */
  onNewLayout(): void {
    this.designerState.clearLayout();
    this.designerState.setStatusMessage('New layout created');
  }

  /**
   * Opens the save dialog to capture export parameters.
   */
  onSaveLayout(): void {
    const currentLayoutName = this.designerState.currentLayout().name?.trim() || 'Untitled Layout';
    this.exportDefaultFileName.set(this.computeDefaultFileBase(currentLayoutName));
    this.showSaveDialog.set(true);
  }

  /**
   * Prompts the user for an XHTML file and loads it into the designer state.
   */
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

  /**
   * Clears the current layout when the user confirms closing it.
   */
  onCloseLayout(): void {
    this.designerState.clearLayout();
    this.designerState.setStatusMessage('Layout closed');
  }

  /**
   * Exports the current design as JSON for later re-import.
   */
  onSaveDesign(): void {
    const dialog = this.saveReportDialog;
    if (!dialog) {
      console.warn('Save report dialog is unavailable.');
      return;
    }
    const currentLayoutName = this.designerState.currentLayout().name?.trim() || 'Untitled Layout';
    dialog.open(currentLayoutName, this.computeDefaultFileBase(currentLayoutName));
  }

  /**
   * Loads a previously exported design JSON file into the designer.
   */
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
          this.designerState.importDesign(jsonContent, file.name);
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

  /**
   * Steps the undo stack back by one entry.
   */
  onUndo(): void {
    this.designerState.undo();
  }

  /**
   * Reapplies the most recent undone action.
   */
  onRedo(): void {
    this.designerState.redo();
  }

  /**
   * Shows the options dialog so the user can adjust global settings.
   */
  onSettings(): void {
    this.showSettingsDialog.set(true);
  }

  /**
   * Opens the screen calibration dialog to adjust true-to-size rendering.
   */
  onCalibrateScreen(): void {
    this.showCalibrationDialog.set(true);
  }

  // Dialog handlers
  /**
   * Generates the XHTML export for the provided name and triggers file download.
   */
  async handleSave(payload: string | { fileName: string; minify: boolean }): Promise<void> {
    const trimmedName = (typeof payload === 'string' ? payload : payload.fileName).trim() || 'layout';
    const shouldMinify = typeof payload === 'object' && !!payload.minify;
    try {
      let xhtml = this.designerState.generateXhtmlDocument(trimmedName);
      if (shouldMinify) {
        console.log(`HTML Minification call will be put here...`);
        try {
          const response = await fetch('/api/templates/compress', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            body: xhtml
          });
          if (response.ok) {
            xhtml = await response.text();
          } else {
            console.warn('HTML compression failed, skipping minification.', response.statusText);
          }
        } catch (compressionError) {
          console.error('Error calling compression endpoint:', compressionError);
        }
      }
      this.triggerDownload(`${trimmedName}.html`, xhtml, 'application/xhtml+xml');
      this.designerState.setStatusMessage(`Layout "${trimmedName}" exported${shouldMinify ? ' (minified)' : ''}`);
      this.showSaveDialog.set(false);
    } catch (error) {
      console.error('Failed to export layout:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to export layout';
      this.designerState.setStatusMessage(errorMessage);
      if (errorMessage.includes('Validation Error')) {
        alert(errorMessage);
      } else {
        this.showSaveDialog.set(false);
      }
    }
  }

  handleSaveReport(payload: { layoutName: string; fileName: string }): void {
    const sanitizedLayoutName = payload.layoutName.trim() || 'Untitled Layout';
    const safeFileBase = this.normalizeFileBase(payload.fileName);
    this.designerState.updateLayoutName(sanitizedLayoutName);
    const json = this.designerState.exportDesign();
    this.triggerDownload(`${safeFileBase}.json`, json, 'application/json');
    this.designerState.setStatusMessage('Report design saved');
    this.designerState.markDesignSaved();
  }

  handleCancelSaveReport(): void {
    this.designerState.setStatusMessage('Report save cancelled');
  }

  private computeDefaultFileBase(layoutName: string): string {
    if (!layoutName.trim() || layoutName.trim() === 'Untitled Layout') {
      return 'untitled-layout';
    }
    return this.normalizeFileBase(layoutName);
  }

  private normalizeFileBase(raw: string): string {
    const trimmed = raw.trim().toLowerCase().replace(/\.json$/i, '');
    if (!trimmed.length) {
      return 'untitled-layout';
    }
    const slug = trimmed
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/--+/g, '-');
    return slug.length ? slug : 'untitled-layout';
  }

  /**
   * Hides the save dialog without performing any action.
   */
  closeSaveDialog(): void {
    this.showSaveDialog.set(false);
  }

  /**
   * Dismisses the options dialog overlay.
   */
  closeOptionsDialog(): void {
    this.showSettingsDialog.set(false);
  }

  /**
   * Dismisses the screen calibration dialog overlay.
   */
  closeCalibrationDialog(): void {
    this.showCalibrationDialog.set(false);
  }

  /**
   * Emits a synthetic download for the provided payload using a temporary anchor element.
   */
  private triggerDownload(filename: string, content: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  // Global keyboard shortcuts mapping to menu actions.
  @HostListener('document:keydown', ['$event'])
  handleGlobalKeydown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    const ctrl = event.ctrlKey || event.metaKey; // meta for Mac support
    const alt = event.altKey;
    const shift = event.shiftKey;

    // Prevent default browser actions for handled shortcuts.
    const prevent = () => { event.preventDefault(); event.stopPropagation(); };

    if (ctrl && !alt && !shift) {
      switch (key) {
        case 'n': prevent(); this.onNewLayout(); return;
        case 'o': prevent(); this.onLoadDesign(); return;
        case 's': prevent(); this.onSaveDesign(); return;
        case 'e': prevent(); this.onSaveLayout(); return;
        case 'p': prevent(); this.onPublishTemplate(); return;
        case 'w': prevent(); this.onCloseLayout(); return;
        case 'z': prevent(); this.onUndo(); return;
        case 'y': prevent(); this.onRedo(); return;
      }
    }

    // Ctrl+Alt+S (Settings)
    if (ctrl && alt && key === 's') { prevent(); this.onSettings(); return; }

    // F4 (Zoom to Fit)
    if (!ctrl && !alt && !shift && event.key === 'F4') { prevent(); this.designerState.setCanvasZoomMode('fit'); return; }

    // Shift+F4 (Zoom 1:1)
    if (shift && !ctrl && !alt && event.key === 'F4') { prevent(); this.designerState.setCanvasZoomMode('actual'); return; }

    // Ctrl+F12 (Calibrate Screen)
    if (ctrl && !alt && !shift && event.key === 'F12') { prevent(); this.onCalibrateScreen(); return; }
  }

  // Publish dialog handlers
  onPublishTemplate(): void {
    this.showPublishDialog.set(true);
  }
  handlePublishDialogClosed(): void {
    this.showPublishDialog.set(false);
  }
}
