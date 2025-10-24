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
  // Current applied scale factor
  protected scaleFactor = signal(1);

  ngOnInit(): void {
    const saved = localStorage.getItem(CALIBRATION_KEY);
    if (saved) {
      const parsed = parseFloat(saved);
      if (Number.isFinite(parsed) && parsed > 0) {
        this.scaleFactor.set(parsed);
      }
    }
  }

  applyCalibration(): void {
    const measured = this.measuredLength();
    if (!measured || measured <= 0) return;
    // Target reference length is 50mm; scale = target / measured
    const scale = 50 / measured;
    this.scaleFactor.set(scale);
    localStorage.setItem(CALIBRATION_KEY, String(scale));
    this.close.emit();
  }

  resetCalibration(): void {
    this.scaleFactor.set(1);
    localStorage.removeItem(CALIBRATION_KEY);
    this.close.emit();
  }

  onOverlayClick() { this.close.emit(); }
  onDialogClick(event: MouseEvent) { event.stopPropagation(); }
}
