import { Component, signal, output, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

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

  handleExportAsXhtml(): void {
    const name = this.fileName().trim();
    if (name) {
      this.onExportAsXhtml.emit(name);
      this.fileName.set('');
    }
  }

  handleCancel(): void {
    this.fileName.set('');
    this.onClose.emit();
  }

  handleBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('dialog-backdrop')) {
      this.handleCancel();
    }
  }
}
