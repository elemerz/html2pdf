import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toolbarElements, ToolbarElement, ToolbarCategory } from '../../shared/models/schema';
import { DragDropService } from '../../core/services/drag-drop.service';

@Component({
  selector: 'app-toolbar-panel',
  imports: [CommonModule],
  templateUrl: './toolbar-panel.html',
  styleUrl: './toolbar-panel.less',
  standalone: true
})
export class ToolbarPanelComponent {
  private dragDropService = inject(DragDropService);

  protected toolbarElements = toolbarElements;
  protected expandedCategory = signal<string | null>('layout'); // allow passive categories

  protected categories: { id: string; label: string; passive?: boolean }[] = [
    { id: 'layout', label: 'Layout' },
    { id: 'manage-fonts', label: 'Manage Fonts', passive: true },
    { id: 'manage-images', label: 'Manage Images', passive: true }
  ];

  getElementsForCategory(category: string): ToolbarElement[] {
    return this.toolbarElements.filter(el => el.category === category);
  }

  toggleCategory(category: string) {
    this.expandedCategory.update(current => current === category ? null : category);
  }

  onDragStart(event: DragEvent, element: ToolbarElement) {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('application/json', JSON.stringify(element));
    }
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    this.dragDropService.startToolbarDrag(
      element,
      event.clientX,
      event.clientY,
      offsetX,
      offsetY
    );
  }

  onDragEnd() {
    this.dragDropService.endDrag();
  }
}
