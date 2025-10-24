import {Component, Input, Output, EventEmitter, OnInit} from '@angular/core';
import Quill from 'quill';
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
export class CellEditorDialogComponent implements OnInit {
  @Input() initialContent: string = '';
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<string>();

  quill!: Quill;
  contentValue = '';

  quillModules = {
    toolbar: [
      ['bold', 'italic', 'underline'],
      [{ 'font': ['arial','helvetica','verdana','tahoma','trebuchet','times-new-roman','georgia','roboto','open-sans','lato','montserrat','poppins'] }],
      [{ 'size': ['6pt','7pt','8pt','9pt','10pt','11pt','12pt','13pt','14pt','15pt','16pt','17pt','18pt','20pt','24pt','28pt','32pt'] }],
      [{ 'color': [] }, { 'background': [] }],
      // lineheight pending proper custom toolbar module, removed for now
      ['link', 'image']
    ]
  };

  onEditorCreated(q: Quill) {
    this.quill = q;
  }
  private quillHtmlToXhtml(html: string): string {
    //replace all <br> instances with their self-closing counterpart: <br/>:
    return html.replaceAll('<br>', '<br/>');
  }

  ngOnInit(): void {
    // Dynamic registration (in case global setup not loaded)
    try {
      const Font: any = Quill.import('formats/font');
      if (Font && Font.whitelist) {
        Font.whitelist = ['arial','helvetica','verdana','tahoma','trebuchet','times-new-roman','georgia','roboto','open-sans','lato','montserrat','poppins'];
        Quill.register(Font, true);
      }
      const SizeStyle: any = Quill.import('attributors/style/size');
      if (SizeStyle && SizeStyle.whitelist) {
        SizeStyle.whitelist = ['6pt','7pt','8pt','9pt','10pt','11pt','12pt','13pt','14pt','15pt','16pt','17pt','18pt','20pt','24pt','28pt','32pt'];
        Quill.register(SizeStyle, true);
      }
    } catch {}


    this.contentValue = this.initialContent && this.initialContent !== '&nbsp;' ? this.initialContent : '';
  }

  save(): void {
    //const raw = this.contentValue && this.contentValue.trim().length ? this.contentValue : '&nbsp;';
    const raw = this.contentValue && this.contentValue.trim().length ? this.quill.root.innerHTML : '&nbsp;';
    let xhtml = raw;
    try {
      xhtml = this.quillHtmlToXhtml(raw);
    } catch {
      // fallback to raw if parsing fails
    }
    this.saved.emit(xhtml);
    this.close();
  }

  close(): void {
    this.closed.emit();
  }
}
