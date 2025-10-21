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
  protected expandedCategory = signal<ToolbarCategory | null>('text');
  
  protected categories: { id: ToolbarCategory; label: string }[] = [
    { id: 'text', label: 'Text Elements' },
    { id: 'containers', label: 'Containers' },
    { id: 'layout', label: 'Layout' },
  ];

  getElementsForCategory(category: ToolbarCategory): ToolbarElement[] {
    return this.toolbarElements.filter(el => el.category === category);
  }

  toggleCategory(category: ToolbarCategory) {
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
