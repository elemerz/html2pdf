import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DesignerStateService } from '../../core/services/designer-state.service';

@Component({
  selector: 'app-status-bar',
  imports: [CommonModule],
  templateUrl: './status-bar.html',
  styleUrl: './status-bar.less',
  standalone: true
})
export class StatusBarComponent {
  private designerState = inject(DesignerStateService);
  
  protected statusMessage = this.designerState.statusMessage;
  protected cursorPosition = this.designerState.cursorPosition;
}
