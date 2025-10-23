import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QuillModule } from 'ngx-quill';

@Component({
  selector: 'app-cell-editor-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, QuillModule],
  templateUrl: './cell-editor-dialog.html',
  styleUrl: './cell-editor-dialog.less'
})
export class CellEditorDialogComponent {
  @Input() initialContent: string = '';
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<string>();

  contentValue = '';

  quillModules = {
    toolbar: [
      ['bold', 'italic', 'underline'],
      [{ 'font': [] }],
      [{ 'size': ['small', false, 'large', 'huge'] }],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'lineheight': ['1', '1.15', '1.5', '2'] }],
      ['link', 'image']
    ]
  };

  ngOnInit(): void {
    this.contentValue = this.initialContent && this.initialContent !== '&nbsp;' ? this.initialContent : '';
  }

  save(): void {
    const html = this.contentValue && this.contentValue.trim().length ? this.contentValue : '&nbsp;';
    this.saved.emit(html);
    this.close();
  }

  close(): void {
    this.closed.emit();
  }
}
