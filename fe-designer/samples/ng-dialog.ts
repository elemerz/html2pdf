import { Component, ElementRef, EventEmitter, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

type NewItem = { title: string; qty: number; due?: string; notes?: string };

@Component({
  selector: 'app-new-item-popover',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './component.html',
  styleUrls: ['./component.css']
})
export default class NewItemPopoverComponent {
  @ViewChild('pop', { static: true }) pop!: ElementRef<HTMLDivElement>;
  @Output() completed = new EventEmitter<NewItem | null>();

  model: NewItem = { title: '', qty: 1, due: '', notes: '' };

  open() {
    // Reset model each time if you like
    this.model = { title: '', qty: 1, due: '', notes: '' };
    this.pop.nativeElement.showPopover();
  }

  cancel() {
    this.pop.nativeElement.hidePopover();
    this.completed.emit(null);
  }

  submit() {
    this.pop.nativeElement.hidePopover();
    // qty from ngModel is string until used; coerce to number:
    const payload: NewItem = { ...this.model, qty: Number(this.model.qty) };
    this.completed.emit(payload);
  }
}
