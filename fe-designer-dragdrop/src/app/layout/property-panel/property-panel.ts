import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DesignerStateService } from '../../core/services/designer-state.service';
import { CanvasElement } from '../../shared/models/schema';

@Component({
  selector: 'app-property-panel',
  imports: [CommonModule, FormsModule],
  templateUrl: './property-panel.html',
  styleUrl: './property-panel.less',
  standalone: true
})
export class PropertyPanelComponent {
  private designerState = inject(DesignerStateService);
  
  protected selectedElement = this.designerState.selectedElement;
  
  // Create local mutable copy for editing
  protected editingElement = computed(() => {
    const el = this.selectedElement();
    return el ? { ...el } : null;
  });

  updateElement(updates: Partial<CanvasElement>) {
    const el = this.selectedElement();
    if (el) {
      this.designerState.updateElement(el.id, updates);
    }
  }

  updatePosition(x: number, y: number) {
    this.updateElement({ x, y });
  }

  updateSize(width: number, height: number) {
    this.updateElement({ width, height });
  }

  updateContent(content: string) {
    this.updateElement({ content });
  }

  deleteElement() {
    const el = this.selectedElement();
    if (el) {
      this.designerState.removeElement(el.id);
    }
  }
}
