import { Component, EventEmitter, Output, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DesignerStateService, PageGutters } from '../../../core/services/designer-state.service';

type OptionsSection = 'page' | 'grid' | 'layout';

/**
 * Modal dialog that allows tuning canvas grid and page gutter settings.
 */
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
  
  protected expandedSections = signal<Record<OptionsSection, boolean>>({
    page: false,
    grid: false,
    layout: false
  });

  protected visualGridSize = signal(10);
  protected logicalGridSize = signal(1);
  protected visualGridColor = signal('#1d4ed8');
  protected pageGutterTop = signal(10);
  protected pageGutterRight = signal(10);
  protected pageGutterBottom = signal(10);
  protected pageGutterLeft = signal(10);
  protected allowVerticalResizeOnly = signal(true);

  /**
   * Seeds local signals with the current designer configuration.
   */
  ngOnInit() {
    this.visualGridSize.set(this.designerState.visualGridSize());
    this.logicalGridSize.set(this.designerState.logicalGridSize());
    this.visualGridColor.set(this.designerState.visualGridColor());
    this.setPageGutterSignals(this.designerState.pageGutters());
    this.allowVerticalResizeOnly.set(this.designerState.allowVerticalResizeOnly());
  }

  /**
   * Closes the dialog without persisting changes.
   */
  onCancel() {
    this.close.emit();
  }

  /**
   * Writes the edited settings back into designer state.
   */
  onSave() {
    this.designerState.setVisualGridSize(this.visualGridSize());
    this.designerState.setLogicalGridSize(this.logicalGridSize());
    this.designerState.setVisualGridColor(this.visualGridColor());
    this.designerState.setPageGutters({
      top: this.pageGutterTop(),
      right: this.pageGutterRight(),
      bottom: this.pageGutterBottom(),
      left: this.pageGutterLeft()
    });
    this.designerState.setAllowVerticalResizeOnly(this.allowVerticalResizeOnly());
    this.close.emit();
  }

  /**
   * Dismisses the dialog when the backdrop is clicked.
   */
  onOverlayClick() {
    this.close.emit();
  }

  /**
   * Prevents dialog body clicks from bubbling to the overlay.
   */
  onDialogClick(event: MouseEvent) {
    event.stopPropagation();
  }

  /**
   * Expands or collapses a configuration accordion section.
   */
  toggleSection(section: OptionsSection) {
    this.expandedSections.update(current => ({
      ...current,
      [section]: !current[section]
    }));
  }

  /**
   * Indicates whether a section is currently expanded.
   */
  isSectionExpanded(section: OptionsSection): boolean {
    return this.expandedSections()[section];
  }

  /**
   * Synchronizes gutter signals with the provided value object.
   */
  private setPageGutterSignals(gutters: PageGutters) {
    this.pageGutterTop.set(gutters.top);
    this.pageGutterRight.set(gutters.right);
    this.pageGutterBottom.set(gutters.bottom);
    this.pageGutterLeft.set(gutters.left);
  }

  /**
   * Coerces various input types into a numeric value with safe fallbacks.
   */
  protected coerceNumber(value: string | number | null | undefined): number {
    if (typeof value === 'number') {
      return Number.isNaN(value) ? 0 : value;
    }
    const parsed = Number(value ?? 0);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
}
