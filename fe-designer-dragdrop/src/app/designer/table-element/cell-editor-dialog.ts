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
  currentFontSize: number = 12; // pt default
  @ViewChild('dialogRoot') dialogRoot!: ElementRef<HTMLDivElement>;
  private dragging = false;
  private dragOffsetX = 0; // distance from dialog origin when using absolute mode (legacy)
  private dragOffsetY = 0;
  private dragStartMouseX = 0;
  private dragStartMouseY = 0;
  private dragAccumX = 0; // accumulated transform translation
  private dragAccumY = 0;
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

      [{ 'color': [] }, { 'background': [] }],
      // lineheight pending proper custom toolbar module, removed for now
      ['link', 'image']
    ]
  };

  onEditorCreated(q: Quill) {
    this.quill = q;
    // Track selection to update spinner
    // Inject custom font size spinner into toolbar after font picker
    try {
      const toolbarEl = q.container.parentElement?.querySelector('.ql-toolbar');
      if (toolbarEl) {
        const fontPicker = toolbarEl.querySelector('.ql-font');
        // Locate the formats group containing the font picker
        const formatsGroups = Array.from(toolbarEl.querySelectorAll(':scope > .ql-formats')) as HTMLElement[];
        const formatsGroup = formatsGroups.find(g => g.querySelector('.ql-font'));
        // Create label before the formats group if not already
        if (formatsGroup && formatsGroup.parentElement && !formatsGroup.parentElement.querySelector('.ql-font-label')) {
          const fontLabel = document.createElement('span');
          fontLabel.className = 'ql-font-label';
          fontLabel.style.cssText = 'font-size:11px;font-weight:600;margin-right:4px;display:inline-flex;align-items:center;';
          fontLabel.textContent = 'Font';
          formatsGroup.before(fontLabel);
        }
        // Create spinner wrapper AFTER the formats group (sibling)
        const spinnerWrapper = document.createElement('span');
        spinnerWrapper.className = 'ql-custom-size';
        spinnerWrapper.style.display = 'inline-flex';
        spinnerWrapper.style.alignItems = 'center';
        spinnerWrapper.style.gap = '4px';
        spinnerWrapper.innerHTML = `<input type=\"number\" min=\"1\" max=\"120\" step=\"0.25\" value=\"${this.currentFontSize}\" style=\"width:60px;padding:2px 4px;font-size:11px;\" /> <span style=\"font-size:11px;\">pt</span>`;
        const inputEl = spinnerWrapper.querySelector('input') as HTMLInputElement;
        inputEl.addEventListener('input', () => {
          const v = parseFloat(inputEl.value);
          if (!Number.isFinite(v)) return;
          this.currentFontSize = Math.min(120, Math.max(1, v));
          this.applyFontSize();
          inputEl.value = this.currentFontSize.toString();
        });
        if (formatsGroup && formatsGroup.nextSibling) {
          formatsGroup.parentElement!.insertBefore(spinnerWrapper, formatsGroup.nextSibling);
        } else if (formatsGroup) {
          // fallback to original insertion method
          fontPicker ? fontPicker.after(spinnerWrapper) : toolbarEl.appendChild(spinnerWrapper);
        }
      }
    } catch {}

    this.quill.on('selection-change', () => {
      const range = this.quill.getSelection();
      if (!range) return;
      const format = this.quill.getFormat(range);
      const size = format['size'];
      if (typeof size === 'string') {
        const match = /^(\d+(?:\.\d+)?)pt$/.exec(size);
        if (match) this.currentFontSize = parseFloat(match[1]);
      }
    });
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
      // Flexible size attributor allowing arbitrary pt values
      const ParchmentAny: any = Quill.import('parchment');
      class FlexibleSizeAttributor extends ParchmentAny.StyleAttributor {
        constructor() { super('size', 'font-size', { scope: ParchmentAny.Scope.INLINE }); }
        add(node: HTMLElement, value: string): boolean {
          if (!value) return false;
          let v = value.toString();
          if (/^\d+(\.\d+)?$/.test(v)) v = v + 'pt';
          node.style.fontSize = v;
          return true;
        }
      }
      Quill.register(new FlexibleSizeAttributor(), true);
      
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
    // Keep initial centering transform; we add our own translate after it to avoid jump.
    // Extract existing transform (e.g., 'translateX(-50%)') and append custom translate.
    const existing = getComputedStyle(el).transform; // may be 'none'
    // Reset any inline left/top previously set by older dragging attempts
    if (el.style.left) el.style.left = '50%';
    if (el.style.top) el.style.top = '32px';
    this.dragging = true;
    this.dragStartMouseX = ev.clientX;
    this.dragStartMouseY = ev.clientY;
    // Read previously accumulated values from data attributes
    const prevX = parseFloat(el.getAttribute('data-drag-x') || '0');
    const prevY = parseFloat(el.getAttribute('data-drag-y') || '0');
    this.dragAccumX = Number.isFinite(prevX) ? prevX : 0;
    this.dragAccumY = Number.isFinite(prevY) ? prevY : 0;
    el.style.willChange = 'transform';
    ev.preventDefault();
  }

  @HostListener('document:mouseup', ['$event'])
  endDrag(_: MouseEvent): void {
    if (this.dragging) {
      // finalize accumulated movement
      const el = this.dialogRoot?.nativeElement;
      if (el) {
        el.style.willChange = 'auto';
      }
    }
    this.dragging = false;
  }

  @HostListener('document:mousemove', ['$event'])
  onDrag(ev: MouseEvent): void {
    if (!this.dragging) return;
    const el = this.dialogRoot.nativeElement;
    const dx = ev.clientX - this.dragStartMouseX;
    const dy = ev.clientY - this.dragStartMouseY;
    const tx = this.dragAccumX + dx;
    const ty = this.dragAccumY + dy;
    // Store accum so next drag starts from here
    el.setAttribute('data-drag-x', tx.toString());
    el.setAttribute('data-drag-y', ty.toString());
    // Compose transform: keep original translateX(-50%) plus our translate
    el.style.transform = `translateX(-50%) translate(${tx}px, ${Math.max(0, ty)}px)`;
  }

  applyFontSize(): void {
    if (!this.quill) return;
    const sizeVal = Math.min(120, Math.max(1, this.currentFontSize));
    this.currentFontSize = sizeVal;
    this.quill.format('size', sizeVal + 'pt');
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
