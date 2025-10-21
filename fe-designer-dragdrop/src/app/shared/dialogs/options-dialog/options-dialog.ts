import { Component, EventEmitter, Output, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DesignerStateService } from '../../../core/services/designer-state.service';

@Component({
  selector: 'app-options-dialog',
  imports: [CommonModule, FormsModule],
  templateUrl: './options-dialog.html',
  styleUrl: './options-dialog.less',
  standalone: true
})
export class OptionsDialogComponent implements OnInit {
  @Output() close = new EventEmitter<void>();
  
  private designerState = inject(DesignerStateService);
  
  protected visualGridSize = signal(10);
  protected logicalGridSize = signal(10);
  protected visualGridColor = signal('#c2c7d1');

  ngOnInit() {
    this.visualGridSize.set(this.designerState.visualGridSize());
    this.logicalGridSize.set(this.designerState.logicalGridSize());
    this.visualGridColor.set(this.designerState.visualGridColor());
  }

  onCancel() {
    this.close.emit();
  }

  onSave() {
    this.designerState.setVisualGridSize(this.visualGridSize());
    this.designerState.setLogicalGridSize(this.logicalGridSize());
    this.designerState.setVisualGridColor(this.visualGridColor());
    this.close.emit();
  }

  onOverlayClick() {
    this.close.emit();
  }

  onDialogClick(event: MouseEvent) {
    event.stopPropagation();
  }
}
