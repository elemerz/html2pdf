import { Component, signal, output, input, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { LayoutsApiService } from '../../core/services/layouts-api.service';
import { ReportLayout } from '../../shared/models/schema';

@Component({
  selector: 'app-open-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './open-dialog.html',
  styleUrl: './open-dialog.less'
})
export class OpenDialogComponent {
  private layoutsApi = inject(LayoutsApiService);

  isOpen = input.required<boolean>();
  onClose = output<void>();
  onOpen = output<ReportLayout>();

  layouts = signal<ReportLayout[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  constructor() {
    // Reload layouts whenever dialog is opened
    effect(() => {
      if (this.isOpen()) {
        this.loadLayouts();
      }
    });
  }

  async loadLayouts(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    
    try {
      const layouts = await firstValueFrom(this.layoutsApi.getLayouts());
      this.layouts.set(layouts);
    } catch (err) {
      this.error.set('Failed to load layouts');
      console.error('Error loading layouts:', err);
    } finally {
      this.loading.set(false);
    }
  }

  handleOpen(layout: ReportLayout): void {
    this.onOpen.emit(layout);
  }

  handleCancel(): void {
    this.onClose.emit();
  }

  handleBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('dialog-backdrop')) {
      this.handleCancel();
    }
  }

  async handleDelete(event: Event, layoutId: string): Promise<void> {
    event.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this layout?')) {
      return;
    }

    try {
      await firstValueFrom(this.layoutsApi.deleteLayout(layoutId));
      await this.loadLayouts();
    } catch (err) {
      this.error.set('Failed to delete layout');
      console.error('Error deleting layout:', err);
    }
  }
}
