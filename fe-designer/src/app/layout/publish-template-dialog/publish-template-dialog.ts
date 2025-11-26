import { Component, signal, output, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { DesignerStateService } from '../../core/services/designer-state.service';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-publish-template-dialog',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './publish-template-dialog.html',
  styleUrl: './publish-template-dialog.less'
})
// Handles publishing the current layout as an invoice template and auto-closing the dialog.
export class PublishTemplateDialogComponent {
  private designerState = inject(DesignerStateService);
  private http = inject(HttpClient);
  // Track the pending auto-close timers so they can be cancelled when needed.
  private closeTimeout: ReturnType<typeof setTimeout> | null = null;
  private closeInterval: ReturnType<typeof setInterval> | null = null;

  // Dialog state and user inputs.
  isOpen = signal(true);
  invoiceType = signal<number>(20);
  version = signal('1.0');
  submitting = signal(false);
  errorMessage = signal('');
  successMessage = signal('');
  closeCountdown = signal<number | null>(null);

  onClose = output<void>();
  onPublished = output<{ invoiceType: number; version: string }>();

  readonly templateIds: number[] = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,32,33,34,36,40,41,42,43,44,45,50,51,64,65,66,67,68];

  // Close immediately unless a publishing is ongoing.
  close() {
    if (this.submitting()) return;
    this.stopAutoCloseTimers();
    this.isOpen.set(false);
    this.onClose.emit();
  }

  // Publish the current layout with validation, generation, and feedback handling.
  handlePublish() {
    this.prepareForPublish();
    const version = this.sanitizedVersion();
    if (!this.isValidVersion(version)) return;

    const xhtml = this.tryGenerateXhtml();
    if (!xhtml) return;

    this.publishTemplate({
      invoiceType: this.invoiceType(),
      version,
      xhtmlTemplate: xhtml
    });
  }

  // Reset UI feedback and timers before a new submission.
  private prepareForPublish() {
    this.errorMessage.set('');
    this.successMessage.set('');
    this.stopAutoCloseTimers();
  }

  // Trim whitespace from the version input.
  private sanitizedVersion() {
    return this.version().trim();
  }

  // Ensure the version string is numeric (major.minor).
  private isValidVersion(version: string) {
    const isNumeric = /^\d+(?:\.\d+)?$/.test(version);
    if (!isNumeric) {
      this.errorMessage.set('Version must be numeric (e.g. 1.0)');
    }
    return isNumeric;
  }

  // Generate XHTML for the current layout; surface errors to the user.
  private tryGenerateXhtml(): string | null {
    try {
      return this.designerState.generateXhtmlDocument('Layout');
    } catch (e: any) {
      this.errorMessage.set(e?.message || 'Failed to generate XHTML');
      return null;
    }
  }

  // Dispatch publish request; use finalize to always clear submitting flag.
  private publishTemplate(payload: { invoiceType: number; version: string; xhtmlTemplate: string }) {
    this.submitting.set(true);
    this.http
      .put('/api/templates/publish', payload)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => this.handlePublishSuccess(payload.invoiceType, payload.version),
        error: err => this.handlePublishError(err)
      });
  }

  // On success, show feedback, emit event, and start auto-close countdown.
  private handlePublishSuccess(invoiceType: number, version: string) {
    this.successMessage.set('Published successfully');
    this.onPublished.emit({ invoiceType, version });
    this.startAutoCloseCountdown();
  }

  // Surface publish failure message to the user.
  private handlePublishError(err: any) {
    this.errorMessage.set(err?.message || 'Publish failed');
  }

  // Begin the visible countdown then close after a short delay.
  private startAutoCloseCountdown() {
    const endTime = Date.now() + 2000;
    this.closeCountdown.set(2);
    this.closeInterval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      this.closeCountdown.set(remaining);
      if (remaining <= 0 && this.closeInterval) {
        clearInterval(this.closeInterval);
        this.closeInterval = null;
      }
    }, 200);
    this.closeTimeout = setTimeout(() => this.close(), 2000);
  }

  // Clear pending close timers and reset countdown display.
  private stopAutoCloseTimers() {
    if (this.closeTimeout) {
      clearTimeout(this.closeTimeout);
      this.closeTimeout = null;
    }
    if (this.closeInterval) {
      clearInterval(this.closeInterval);
      this.closeInterval = null;
    }
    this.closeCountdown.set(null);
  }
}
