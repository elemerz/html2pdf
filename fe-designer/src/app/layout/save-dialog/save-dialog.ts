import { Component, signal, output, input, effect } from '@angular/core';

import { FormsModule } from '@angular/forms';

/**
 * Dialog for exporting the current layout to XHTML with a user-provided filename.
 */
@Component({
  selector: 'app-save-dialog',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './save-dialog.html',
  styleUrl: './save-dialog.less'
})
export class SaveDialogComponent {
  isOpen = input.required<boolean>();
  initialFileName = input<string>();
  onClose = output<void>();
  onExportAsXhtml = output<{fileName: string; minify: boolean}>();

  fileName = signal('');
  minifyXhtml = signal(false);
  private previousOpen = false;
  constructor() {
    effect(() => {
      const open = this.isOpen();
      if (open && !this.previousOpen) {
        const init = this.initialFileName?.();
        if (typeof init === 'string' && init.trim().length) {
          this.fileName.set(init.trim());
        }
      }
      this.previousOpen = open;
    });
  }

  /**
   * Emits the export event when a non-empty filename is provided.
   */
  handleExportAsXhtml(): void {
    const name = this.fileName().trim();
    if (name) {
      this.onExportAsXhtml.emit({ fileName: name, minify: this.minifyXhtml() });
      this.fileName.set('');
      this.minifyXhtml.set(false);
    }
  }

  /**
   * Resets the form and closes the dialog without exporting.
   */
  handleCancel(): void {
    this.fileName.set('');
    this.onClose.emit();
  }

  /**
   * Closes the dialog when the backdrop itself is clicked.
   */
  handleBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('dialog-backdrop')) {
      this.handleCancel();
    }
  }
}
