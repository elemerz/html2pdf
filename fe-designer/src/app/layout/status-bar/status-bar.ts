import { Component, inject } from '@angular/core';

import { DesignerStateService } from '../../core/services/designer-state.service';

/**
 * Footer status bar that reflects cursor coordinates and contextual messages.
 */
@Component({
  selector: 'app-status-bar',
  imports: [],
  templateUrl: './status-bar.html',
  styleUrl: './status-bar.less',
  standalone: true
})
export class StatusBarComponent {
  private designerState = inject(DesignerStateService);
  
  protected statusMessage = this.designerState.statusMessage;
  protected cursorPosition = this.designerState.cursorPosition;
}
