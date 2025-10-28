import {Component, Input, Output, EventEmitter, OnInit, ElementRef, ViewChild, HostListener} from '@angular/core';
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
  @ViewChild('dialogRoot') dialogRoot!: ElementRef<HTMLDivElement>;
  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  contentValue = '';

  quillModules = {
    toolbar: [
      ['bold', 'italic', 'underline'],
      [{ 'font': [
        'arial',
        'helvetica',
        'verdana',
        'tahoma',
        'trebuchet',
        'times-new-roman',
        'georgia',
        'calibri',
        'roboto',
        'open-sans',
        'lato',
        'montserrat',
        'poppins',
        'kix-barcode'
      ] }],
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
    // Configure Quill to use inline styles instead of CSS classes
    // This ensures proper CSS cascade with generic cell properties
    try {
      // Import the StyleAttributor class from Parchment
      const Parchment: any = Quill.import('parchment');
      const StyleAttributor = Parchment.StyleAttributor || Parchment.Attributor.Style;
      
      if (!StyleAttributor) {
        throw new Error('StyleAttributor not found in Parchment');
      }
      
      // Font family mapping
      const fontMap: Record<string, string> = {
        'arial': 'Arial, Helvetica, sans-serif',
        'helvetica': 'Helvetica, sans-serif',
        'verdana': 'Verdana, Geneva, sans-serif',
        'tahoma': 'Tahoma, Geneva, sans-serif',
        'trebuchet': '"Trebuchet MS", sans-serif',
        'times-new-roman': '"Times New Roman", Times, serif',
        'georgia': 'Georgia, serif',
        'calibri': '"Calibri", sans-serif',
        'roboto': 'Roboto, sans-serif',
        'open-sans': '"Open Sans", sans-serif',
        'lato': 'Lato, sans-serif',
        'montserrat': 'Montserrat, sans-serif',
        'poppins': 'Poppins, sans-serif',
        'kix-barcode': '"KIX Barcode"'
      };

      const reverseFontMap: Record<string, string> = {
        'Arial, Helvetica, sans-serif': 'arial',
        'Helvetica, sans-serif': 'helvetica',
        'Verdana, Geneva, sans-serif': 'verdana',
        'Tahoma, Geneva, sans-serif': 'tahoma',
        '"Trebuchet MS", sans-serif': 'trebuchet',
        '"Times New Roman", Times, serif': 'times-new-roman',
        'Georgia, serif': 'georgia',
        '"Calibri", sans-serif': 'calibri',
        'Calibri, sans-serif': 'calibri',
        'Roboto, sans-serif': 'roboto',
        '"Open Sans", sans-serif': 'open-sans',
        'Lato, sans-serif': 'lato',
        'Montserrat, sans-serif': 'montserrat',
        'Poppins, sans-serif': 'poppins',
        '"KIX Barcode"': 'kix-barcode',
        'KIX Barcode': 'kix-barcode'
      };
      
      // Create custom font attributor
      class FontStyleAttributor extends StyleAttributor {
        constructor() {
          super('font', 'font-family', {
            scope: Parchment.Scope.INLINE,
            whitelist: Object.keys(fontMap)
          });
        }
        
        // When reading from DOM
        value(domNode: HTMLElement): string {
          const cssValue = super.value(domNode);
          // Map CSS font-family back to identifier for toolbar
          return reverseFontMap[cssValue] || cssValue;
        }
        
        // When writing to DOM - override to set the CSS value directly
        add(node: HTMLElement, value: string): boolean {
          // Convert identifier to CSS value
          const cssValue = fontMap[value] || value;
          // Set the style attribute directly
          if (cssValue && cssValue !== 'false' && node.style) {
            node.style.fontFamily = cssValue;
            return true;
          }
          return false;
        }
      }
      
      const FontStyle = new FontStyleAttributor();
      Quill.register(FontStyle, true);
      
      // Use style-based attributor for font-size (generates inline styles)
      const SizeStyle: any = Quill.import('attributors/style/size');
      if (SizeStyle && SizeStyle.whitelist) {
        SizeStyle.whitelist = ['6pt','7pt','8pt','9pt','10pt','11pt','12pt','13pt','14pt','15pt','16pt','17pt','18pt','20pt','24pt','28pt','32pt'];
        Quill.register(SizeStyle, true);
      }
      
      // Color and background already use inline styles by default in Quill
    } catch (e) {
      console.error('Quill configuration error:', e);
    }


    this.contentValue = this.initialContent && this.initialContent !== '&nbsp;' ? this.initialContent : '';
  }

  beginDrag(ev: MouseEvent): void {
    if (ev.button !== 0) return; // only left button
    if (!this.dialogRoot) return;
    const el = this.dialogRoot.nativeElement;
    // Keep original centered positioning (top:50%, left:50%, transform:-50%,-50%)
    // Just record starting mouse position; movement will adjust transform with pixel deltas off the centered base.
    this.dragging = true;
    this.dragOffsetX = ev.clientX;
    this.dragOffsetY = ev.clientY;
    el.style.willChange = 'transform';
    ev.preventDefault();
  }

  @HostListener('document:mouseup', ['$event'])
  endDrag(_: MouseEvent): void {
    this.dragging = false;
  }

  @HostListener('document:mousemove', ['$event'])
  onDrag(ev: MouseEvent): void {
    if (!this.dragging) return;
    const el = this.dialogRoot.nativeElement;
    const dx = ev.clientX - this.dragOffsetX;
    const dy = ev.clientY - this.dragOffsetY;
    // Apply delta relative to original centered transform
    el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
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
