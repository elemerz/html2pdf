import { Component, Input, Output, EventEmitter } from '@angular/core';
import Quill from 'quill';
import '../../quill-setup';
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
      [{ 'font': ['arial','helvetica','verdana','tahoma','trebuchet','times-new-roman','georgia','roboto','open-sans','lato','montserrat','poppins'] }],
      [{ 'size': ['6','7','8','9','10','11','12','13','14','15','16','17','18','20','24','28','32'] }],
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
