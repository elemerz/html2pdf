import { Component, EventEmitter, Output, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DesignerStateService } from '../../../core/services/designer-state.service';

// KEY used in localStorage for persistence
const CALIBRATION_KEY = 'trueSizeScale';

@Component({
  selector: 'app-screen-calibration-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './screen-calibration-dialog.html',
  styleUrl: './screen-calibration-dialog.less'
})
export class ScreenCalibrationDialogComponent implements OnInit {
  @Output() close = new EventEmitter<void>();
  private designerState = inject(DesignerStateService);

  // The measured length entered by the user (in mm)
  protected measuredLength = signal<number | null>(null);
  protected readonly referenceMm = 100;
  // Current applied scale factor
  protected scaleFactor = signal(1.0); //will be overridden in ngOnInit
  private scaleFactorInitial: number = 1; //will be overridden in ngOnInit

  ngOnInit(): void {
    const saved = localStorage.getItem(CALIBRATION_KEY);
    if (saved) {
      const parsed = parseFloat(saved);
      if (Number.isFinite(parsed) && parsed > 0) {
        this.scaleFactor.set(parsed);
      }
    }
    // Pre-populate measured value based on scale: measured = reference / scale
    const currentScale = this.scaleFactor();
    this.scaleFactorInitial = currentScale;
    const measured = this.referenceMm / currentScale;
    this.measuredLength.set(Math.round(measured * 100) / 100);
  }

  applyCalibration(): void {
    const measured = this.measuredLength();
    if (!measured || measured <= 0) return;
    // Target reference length is 100mm; scale = target / measured
    const scale = this.referenceMm / measured;
    this.scaleFactor.set(scale);
    localStorage.setItem(CALIBRATION_KEY, String(scale));
    this.designerState.setCalibrationScale(scale);
  }

  resetCalibration(): void {
    this.scaleFactor.set(this.scaleFactorInitial);
    localStorage.removeItem(CALIBRATION_KEY);
    this.designerState.setCalibrationScale(1);
    // Reset measured value to reference
    this.measuredLength.set(this.referenceMm);
    localStorage.setItem(CALIBRATION_KEY, String(this.scaleFactor()));
  }

  onOverlayClick() { this.close.emit(); } // Clicking outside closes
  onDialogClick(event: MouseEvent) { event.stopPropagation(); }
}
