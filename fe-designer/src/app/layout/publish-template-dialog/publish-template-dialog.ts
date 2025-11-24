import { Component, signal, output, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { DesignerStateService } from '../../core/services/designer-state.service';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-publish-template-dialog',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './publish-template-dialog.html',
  styleUrl: './publish-template-dialog.less'
})
export class PublishTemplateDialogComponent {
  private designerState = inject(DesignerStateService);
  private http = inject(HttpClient);

  isOpen = signal(true);
  invoiceType = signal<number>(1);
  version = signal('1.0');
  submitting = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  onClose = output<void>();
  onPublished = output<{ invoiceType: number; version: string }>();

  readonly templateIds: number[] = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,32,33,34,36,40,41,42,43,44,45,50,51,64,65,66,67,68];

  close() {
    if (this.submitting()) return;
    this.isOpen.set(false);
    this.onClose.emit();
  }

  handlePublish() {
    this.errorMessage.set('');
    this.successMessage.set('');
    const version = this.version().trim();
    if (!/^\d+(?:\.\d+)?$/.test(version)) {
      this.errorMessage.set('Version must be numeric (e.g. 1.0)');
      return;
    }
    let xhtml: string;
    try {
      xhtml = this.designerState.generateXhtmlDocument('Layout');
    } catch (e:any) {
      this.errorMessage.set(e?.message || 'Failed to generate XHTML');
      return;
    }
    this.submitting.set(true);
    this.http.put('/api/templates', null, {
      params: {
        invoicetype: this.invoiceType().toString(),
        xhtmlTemplate: xhtml,
        version
      }
    }).subscribe({
      next: () => {
        this.successMessage.set('Published successfully');
        this.submitting.set(false);
        this.onPublished.emit({ invoiceType: this.invoiceType(), version });
      },
      error: err => {
        this.errorMessage.set(err?.message || 'Publish failed');
        this.submitting.set(false);
      }
    });
  }
}
