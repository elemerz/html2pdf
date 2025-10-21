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
  onSave = output<string>();

  layoutName = signal('');

  handleSave(): void {
    const name = this.layoutName().trim();
    if (name) {
      this.onSave.emit(name);
      this.layoutName.set('');
    }
  }

  handleCancel(): void {
    this.layoutName.set('');
    this.onClose.emit();
  }

  handleBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('dialog-backdrop')) {
      this.handleCancel();
    }
  }
}
