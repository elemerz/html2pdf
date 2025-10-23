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
      [{ 'font': ['Arial','Helvetica','Verdana','Tahoma','Trebuchet MS','Times New Roman','Georgia','Roboto','Open Sans','Lato','Montserrat','Poppins'] }],
      [{ 'size': ['6pt','7pt','8pt','9pt','10pt','11pt','12pt','13pt','14pt','15pt','16pt','17pt','18pt','20pt','24pt','28pt','32pt'] }],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'lineheight': ['1','1.15','1.25','1.5','1.75','2','2.25','2.5'] }],
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
