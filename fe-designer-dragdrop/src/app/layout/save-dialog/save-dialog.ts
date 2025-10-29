import { Component, signal, output, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * Dialog for exporting the current layout to XHTML with a user-provided filename.
 */
@Component({
  selector: 'app-save-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './save-dialog.html',
  styleUrl: './save-dialog.less'
})
export class SaveDialogComponent {
  isOpen = input.required<boolean>();
  onClose = output<void>();
  onExportAsXhtml = output<string>();

  fileName = signal('');

  /**
   * Emits the export event when a non-empty filename is provided.
   */
  handleExportAsXhtml(): void {
    const name = this.fileName().trim();
    if (name) {
      this.onExportAsXhtml.emit(name);
      this.fileName.set('');
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
