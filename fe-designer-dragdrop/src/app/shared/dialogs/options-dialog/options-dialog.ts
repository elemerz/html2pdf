import { Component, EventEmitter, Output, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DesignerStateService, PageGutters } from '../../../core/services/designer-state.service';

type OptionsSection = 'page' | 'grid';

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
    grid: false
  });

  protected visualGridSize = signal(10);
  protected logicalGridSize = signal(1);
  protected visualGridColor = signal('#1d4ed8');
  protected pageGutterTop = signal(10);
  protected pageGutterRight = signal(10);
  protected pageGutterBottom = signal(10);
  protected pageGutterLeft = signal(10);

  ngOnInit() {
    this.visualGridSize.set(this.designerState.visualGridSize());
    this.logicalGridSize.set(this.designerState.logicalGridSize());
    this.visualGridColor.set(this.designerState.visualGridColor());
    this.setPageGutterSignals(this.designerState.pageGutters());
  }

  onCancel() {
    this.close.emit();
  }

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
    this.close.emit();
  }

  onOverlayClick() {
    this.close.emit();
  }

  onDialogClick(event: MouseEvent) {
    event.stopPropagation();
  }

  toggleSection(section: OptionsSection) {
    this.expandedSections.update(current => ({
      ...current,
      [section]: !current[section]
    }));
  }

  isSectionExpanded(section: OptionsSection): boolean {
    return this.expandedSections()[section];
  }

  private setPageGutterSignals(gutters: PageGutters) {
    this.pageGutterTop.set(gutters.top);
    this.pageGutterRight.set(gutters.right);
    this.pageGutterBottom.set(gutters.bottom);
    this.pageGutterLeft.set(gutters.left);
  }

  protected coerceNumber(value: string | number | null | undefined): number {
    if (typeof value === 'number') {
      return Number.isNaN(value) ? 0 : value;
    }
    const parsed = Number(value ?? 0);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
}
