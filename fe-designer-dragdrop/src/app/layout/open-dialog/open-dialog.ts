import { Component, signal, output, input, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { LayoutsApiService } from '../../core/services/layouts-api.service';
import { DesignerStateService } from '../../core/services/designer-state.service';
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
  private designerState = inject(DesignerStateService);

  isOpen = input.required<boolean>();
  onClose = output<void>();
  onOpen = output<ReportLayout>();

  layouts = signal<ReportLayout[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  selectedTab = signal<'api' | 'file'>('file'); // Default to file tab

  constructor() {
    // Reload layouts only when API tab is active
    effect(() => {
      if (this.isOpen() && this.selectedTab() === 'api') {
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

  handleFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const xhtmlContent = e.target?.result as string;
        const layout = this.designerState.parseXhtmlToLayout(xhtmlContent, file.name);
        this.onOpen.emit(layout);
        this.loading.set(false);
      } catch (err) {
        this.error.set('Failed to parse XHTML file: ' + (err as Error).message);
        console.error('Error parsing XHTML:', err);
        this.loading.set(false);
      }
    };

    reader.onerror = () => {
      this.error.set('Failed to read file');
      this.loading.set(false);
    };

    reader.readAsText(file);
    
    // Reset input so the same file can be selected again
    input.value = '';
  }
}
