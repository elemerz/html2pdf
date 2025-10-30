import {Component, Input, Output, EventEmitter, OnInit, ElementRef, ViewChild, HostListener, OnDestroy} from '@angular/core';
import Quill from 'quill';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QuillModule } from 'ngx-quill';
import QRCode from 'qrcode-svg';

const SYMBOL_CODE_RANGES: Array<[number, number]> = [
  [0x00A1, 0x00FF],
  [0x2010, 0x203A],
  [0x20A0, 0x20CF],
  [0x2100, 0x214F],
  [0x2150, 0x218F],
  [0x2190, 0x21FF],
  [0x2200, 0x22FF],
  [0x2300, 0x23FF],
  [0x2460, 0x24FF],
  [0x2500, 0x257F],
  [0x25A0, 0x25FF],
  [0x2600, 0x26FF],
  [0x2700, 0x27BF],
  [0x2B00, 0x2BFF]
];

const FALLBACK_SYMBOLS = Array.from('•‣◦▪▫‥…—–―‘’“”„†‡‰′″‹›§¶©®™°±×÷←→↑↓↔↕↖↗↘↙⇐⇒⇑⇓⇔∀∂∃∅∇∈∉∋∏∑√∞∠∧∨∩∪≈≠≤≥⊂⊃⊆⊇⊕⊗⊥⋂⋃⌂⌘⌛⌨⌫⏎◆◇◈◉○●◎☎☏☑☒☓☕☘☙☚☛☜☝☞☟☺☹☻♠♡♢♣♤♥♦♪♫♩♬♭♮♯⚐⚑⚡⚙⚖⚗⚕⚜⛏⛑✁✂✃✄✆✇✈✉✍✎✏✑✒✓✔✕✖✗✘✚✛✜✢✣✤✥✧✩✪✫✬✭✮✯❀❁❂❃❄❅❆❇❈❉❊❖❘❙❚❝❞❡❦❧');

const ARROW_SYMBOLS = Array.from('←→↑↓↔↕↖↗↘↙⇐⇒⇑⇓⇔↠↦↩↪↺↻↢↣↤↥↦↧↨↩↪↫↬↭↮↯↰↱↲↳↴↵↶↷↸↹↺↻⇀⇁⇂⇃⇄⇅⇆⇇⇈⇉⇊⇋⇌⇍⇎⇏⇐⇑⇓⇒⇔⇖⇗⇘⇙⇚⇛⇜⇝⇞⇟⇠⇡⇢⇣⇤⇥⇦⇧⇨⇩⇪');
const CARD_SYMBOLS = Array.from('♠♣♥♦♤♧♡♢♣♠♥♦');
const REPLACEMENT_SYMBOLS = Array.from(new Set([...ARROW_SYMBOLS, ...CARD_SYMBOLS]));

const SYMBOL_SET = buildSymbolSet(256);

function buildSymbolSet(limit: number): string[] {
  const symbols: string[] = [];
  const seen = new Set<string>();
  let replacementCursor = 0;

  const pushSymbol = (char: string) => {
    if (!char || seen.has(char) || symbols.length >= limit) {
      return;
    }
    seen.add(char);
    symbols.push(char);
  };

  const pushReplacement = () => {
    if (!REPLACEMENT_SYMBOLS.length) {
      return false;
    }
    for (let offset = 0; offset < REPLACEMENT_SYMBOLS.length; offset++) {
      const candidate = REPLACEMENT_SYMBOLS[(replacementCursor + offset) % REPLACEMENT_SYMBOLS.length];
      if (!seen.has(candidate)) {
        pushSymbol(candidate);
        replacementCursor = (replacementCursor + offset + 1) % REPLACEMENT_SYMBOLS.length;
        return true;
      }
    }
    return false;
  };

  for (const [start, end] of SYMBOL_CODE_RANGES) {
    for (let code = start; code <= end; code++) {
      if (symbols.length >= limit) {
        return symbols;
      }
      const char = String.fromCodePoint(code);
      if (!isUsableSymbol(code, char)) {
        continue;
      }
      if (isDiacriticalLetter(code, char)) {
        if (!pushReplacement()) {
          continue;
        }
        continue;
      }
      pushSymbol(char);
    }
  }

  for (const char of FALLBACK_SYMBOLS) {
    if (symbols.length >= limit) {
      break;
    }
    const code = char.codePointAt(0) ?? 0;
    if (isDiacriticalLetter(code, char)) {
      if (!pushReplacement()) {
        continue;
      }
      continue;
    }
    pushSymbol(char);
  }

  while (symbols.length < limit) {
    symbols.push('•');
  }

  return symbols;
}

function isUsableSymbol(code: number, char: string): boolean {
  if (!char || /[\u0000-\u001F\u007F]/.test(char)) {
    return false;
  }
  if (/\s/.test(char)) {
    return false;
  }
  if (code >= 0x00A1 && code <= 0x00FF && /[A-Za-z0-9]/.test(char)) {
    return false;
  }
  if (code === 0x00AD) {
    return false;
  }
  return true;
}

function isLetter(char: string): boolean {
  if (!char) return false;
  const lower = char.toLowerCase();
  const upper = char.toUpperCase();
  if (lower === upper) {
    return false;
  }
  return true;
}

function isDiacriticalLetter(code: number, char: string): boolean {
  if (!isLetter(char)) {
    return false;
  }
  if (/[A-Za-z]/.test(char)) {
    return false;
  }
  if (code >= 0x00C0 && code <= 0x02AF) {
    return true;
  }
  const normalized = char.normalize('NFD');
  return normalized !== char && /[\u0300-\u036F]/.test(normalized);
}

/**
 * Draggable dialog that provides rich text editing for table cells via Quill.
 */
@Component({
  selector: 'app-cell-editor-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, QuillModule],
  templateUrl: './cell-editor-dialog.html',
  styleUrl: './cell-editor-dialog.less'
})
export class CellEditorDialogComponent implements OnInit, OnDestroy {
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
    toolbar: {
      container: [
        ['bold', 'italic', 'underline', 'symbol'],
        [{
          'font': [
            'arial',
            'calibri',
            'helvetica',
            'kix-barcode',
            'open-sans',
            'bariol',
            'roboto',
            'times-new-roman'
          ]
        }],
        [{ 'color': [] }, { 'background': [] }],
        // lineheight pending proper custom toolbar module, removed for now
        ['link', 'image'], // removed 'qr' so we can inject manually for reliability
      ],
      handlers: {
        symbol: () => this.toggleSymbolPalette()
        // qr handler bound manually when injecting button
      }
    }
  };

  private symbolButtonEl: HTMLButtonElement | null = null;
  private symbolPaletteEl: HTMLDivElement | null = null;
  private symbolPaletteVisible = false;
  private boundDocumentClick = (event: MouseEvent) => this.handleDocumentClick(event);
  private boundDocumentKeydown = (event: KeyboardEvent) => this.handleDocumentKeydown(event);

  /**
   * Captures the Quill instance and decorates the toolbar with custom controls.
   */
  onEditorCreated(q: Quill) {
    this.quill = q;
    // Autofocus editor so user can type immediately (ensure contenteditable root gets focus)
    setTimeout(() => { try { this.quill.focus(); (this.quill.root as HTMLElement).focus(); } catch {} }, 0);
    // Track selection to update spinner
    // Inject custom font size spinner into toolbar after font picker
    try {
      const toolbarModule: any = q.getModule('toolbar');
      const toolbarEl = (toolbarModule?.container as HTMLElement) ?? (q.container.parentElement?.querySelector('.ql-toolbar') as HTMLElement | null);
      if (toolbarEl) {
        this.setupSymbolToolbar(toolbarEl);
        // Ensure a QR button exists even if Quill did not auto-generate one for custom handler
        try {
          const imageBtn = toolbarEl.querySelector('button.ql-image');
          const existingQr = toolbarEl.querySelector('button.ql-qr');
          if (imageBtn && !existingQr) {
            const qrBtn = document.createElement('button');
            qrBtn.type = 'button';
            qrBtn.className = 'ql-qr';
            qrBtn.setAttribute('aria-label', 'Insert QR Code');
            qrBtn.innerHTML = '<span class="ql-qr-icon" style="font-size:11px;font-weight:600;letter-spacing:.5px">QR</span>';
            qrBtn.addEventListener('click', () => this.insertQrCode());
            imageBtn.after(qrBtn); // place directly after image button
            console.debug('[CellEditorDialog] QR button injected after image button');
          } else {
            console.debug('[CellEditorDialog] QR button already exists or image button missing', { hasImage: !!imageBtn, hasQr: !!existingQr });
          }
        } catch (e) { console.warn('[CellEditorDialog] QR injection error', e); }
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
      if (!range) {
        this.hideSymbolPalette();
        return;
      }
      const format = this.quill.getFormat(range);

      // Update font size spinner
      let sizeVal: number | null = null;
      const sizeFmt = format['size'];
      if (typeof sizeFmt === 'string') {
        const match = /^(\d+(?:\.\d+)?)pt$/.exec(sizeFmt);
        if (match) sizeVal = parseFloat(match[1]);
      }
      if (sizeVal == null) {
        // Fallback: read computed style at cursor position
        try {
          const leaf = this.quill.getLeaf(range.index)?.[0] as any;
          const node: HTMLElement | null = leaf?.domNode || null;
          if (node) {
            const cs = getComputedStyle(node);
            const fs = cs.fontSize; // typically in px
            const pxMatch = /^(\d+(?:\.\d+)?)px$/.exec(fs);
            if (pxMatch) {
              // Convert px to pt (1pt = 1.3333px) => pt = px * 72 / 96
              const px = parseFloat(pxMatch[1]);
              sizeVal = Math.round((px * 72 / 96) * 100) / 100;
            }
            const ptMatch = /^(\d+(?:\.\d+)?)pt$/.exec(fs);
            if (ptMatch) sizeVal = parseFloat(ptMatch[1]);
          }
        } catch {}
      }
      const inputEl = (this.quill.container.parentElement?.querySelector('.ql-custom-size input') as HTMLInputElement | null);
      if (sizeVal != null) {
        this.currentFontSize = sizeVal;
        if (inputEl) inputEl.value = this.currentFontSize.toString();
      } else {
        // Completely neutral (no explicit size format) -> derive from computed style of leaf or editor root
        try {
          const leafNeutral = this.quill.getLeaf(range.index)?.[0] as any;
          let elNeutral: HTMLElement | null = leafNeutral?.domNode instanceof HTMLElement ? leafNeutral.domNode : null;
          if (!elNeutral && leafNeutral?.domNode?.parentElement) {
            elNeutral = leafNeutral.domNode.parentElement as HTMLElement;
          }
          const csNeutral = elNeutral ? getComputedStyle(elNeutral) : getComputedStyle(this.quill.root);
          const fsNeutral = csNeutral.fontSize;
          const pxMatchNeutral = /^(\d+(?:\.\d+)?)px$/.exec(fsNeutral);
          if (pxMatchNeutral) {
            const px = parseFloat(pxMatchNeutral[1]);
            this.currentFontSize = Math.round((px * 72 / 96) * 100) / 100; // convert px->pt
            if (inputEl) inputEl.value = this.currentFontSize.toString();
          }
        } catch {}
      }

      // Update font dropdown to reflect current selection font
      const toolbarEl = this.quill.container.parentElement?.querySelector('.ql-toolbar') as HTMLElement | null;
      if (toolbarEl) {
        const fontSelect = toolbarEl.querySelector('select.ql-font') as HTMLSelectElement | null;
        const fontFmt = format['font'];
        if (fontSelect && typeof fontFmt === 'string' && fontFmt.length) {
          fontSelect.value = fontFmt;
        } else if (fontSelect) {
          // Derive from computed style (inherited case)
          try {
            const leaf2 = this.quill.getLeaf(range.index)?.[0] as any;
            const node2: HTMLElement | null = leaf2?.domNode || null;
            let el: HTMLElement | null = node2 instanceof HTMLElement ? node2 : null;
            if (!el && node2 && node2.parentElement) {
              el = node2.parentElement as HTMLElement; // ascend from text node
            }
            const cs = el ? getComputedStyle(el) : getComputedStyle(this.quill.root);
            const fam = cs.fontFamily.toLowerCase();
            const candidates: Record<string,string[]> = {
              'arial': ['arial'],
              'calibri': ['calibri'],
              'helvetica': ['helvetica'],
              'kix-barcode': ['kix barcode','kix-barcode'],
              'open-sans': ['Open Sans','open-sans'],
              'bariol': ['Bariol','bariol'],
              'roboto': ['roboto'],
              'times-new-roman': ['times new roman','times-new-roman','times']
            };
            for (const key of Object.keys(candidates)) {
              if (candidates[key].some(token => fam.includes(token))) {
                if (fontSelect.value !== key) {
                  fontSelect.value = key;
                  fontSelect.dispatchEvent(new Event('change'));
                }
                break;
              }
            }

            // Inherited font-size fallback (px -> use numeric px as pt for spinner display)
            const fs = cs.fontSize;
            const pxMatch2 = /^(\d+(?:\.\d+)?)px$/.exec(fs);
            if (!sizeVal && pxMatch2) {
              // Convert inherited px to pt for display consistency
              const pxInherited = parseFloat(pxMatch2[1]);
              this.currentFontSize = Math.round((pxInherited * 72 / 96) * 100) / 100;
              const inputEl2 = (this.quill.container.parentElement?.querySelector('.ql-custom-size input') as HTMLInputElement | null);
              if (inputEl2) inputEl2.value = this.currentFontSize.toString();
            }
          } catch {}
        }
        // Quill auto-updates button active states for bold/italic/underline/color
      }
    });
  }

  private setupSymbolToolbar(toolbarEl: HTMLElement) {
    const computedPosition = getComputedStyle(toolbarEl).position;
    if (computedPosition === 'static') {
      toolbarEl.style.position = 'relative';
    }

    this.symbolButtonEl = toolbarEl.querySelector('button.ql-symbol') as HTMLButtonElement | null;
    if (this.symbolButtonEl) {
      this.symbolButtonEl.setAttribute('type', 'button');
      this.symbolButtonEl.setAttribute('aria-label', 'Insert symbol');
       this.symbolButtonEl.setAttribute('aria-haspopup', 'true');
       this.symbolButtonEl.setAttribute('aria-expanded', 'false');
      if (!this.symbolButtonEl.innerHTML.trim()) {
        this.symbolButtonEl.innerHTML = '<span class="ql-symbol-icon">Ω</span>';
      }
    }

    if (!this.symbolPaletteEl) {
      this.symbolPaletteEl = this.buildSymbolPalette();
    }

    if (this.symbolPaletteEl && !toolbarEl.contains(this.symbolPaletteEl)) {
      toolbarEl.appendChild(this.symbolPaletteEl);
    }
  }

  private buildSymbolPalette(): HTMLDivElement {
    const palette = document.createElement('div');
    palette.className = 'ql-symbol-palette';
    palette.setAttribute('aria-hidden', 'true');
    palette.setAttribute('role', 'menu');
    palette.setAttribute('tabindex', '-1');

    const grid = document.createElement('div');
    grid.className = 'ql-symbol-grid';
    palette.appendChild(grid);

    SYMBOL_SET.forEach(symbol => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ql-symbol-option';
      button.title = `Insert ${symbol}`;
      button.textContent = symbol;
      button.addEventListener('click', () => this.insertSymbol(symbol));
      grid.appendChild(button);
    });

    return palette;
  }

  private toggleSymbolPalette(): void {
    if (!this.ensureSymbolPaletteElements()) {
      return;
    }
    if (this.symbolPaletteVisible) {
      this.hideSymbolPalette();
    } else {
      this.showSymbolPalette();
    }
  }

  private ensureSymbolPaletteElements(): boolean {
    if (this.symbolButtonEl && this.symbolPaletteEl) {
      return true;
    }
    if (!this.quill) {
      return false;
    }
    const toolbarModule: any = this.quill.getModule('toolbar');
    const toolbarEl = toolbarModule?.container as HTMLElement | undefined;
    if (toolbarEl) {
      this.setupSymbolToolbar(toolbarEl);
    }
    return !!(this.symbolButtonEl && this.symbolPaletteEl);
  }

  private showSymbolPalette(): void {
    if (!this.symbolButtonEl || !this.symbolPaletteEl) {
      return;
    }
    const toolbarEl = this.symbolButtonEl.closest('.ql-toolbar') as HTMLElement | null;
    if (!toolbarEl) {
      return;
    }

    const buttonRect = this.symbolButtonEl.getBoundingClientRect();
    const toolbarRect = toolbarEl.getBoundingClientRect();

    this.symbolPaletteEl.style.left = `${buttonRect.left - toolbarRect.left}px`;
    this.symbolPaletteEl.style.top = `${buttonRect.bottom - toolbarRect.top + 4}px`;
    this.symbolPaletteEl.classList.add('show');
    this.symbolPaletteEl.setAttribute('aria-hidden', 'false');
    this.symbolButtonEl.classList.add('ql-active');
    this.symbolButtonEl.setAttribute('aria-expanded', 'true');
    this.symbolPaletteVisible = true;
    document.addEventListener('mousedown', this.boundDocumentClick, true);
    document.addEventListener('keydown', this.boundDocumentKeydown, true);
  }

  private hideSymbolPalette(): void {
    if (!this.symbolPaletteVisible || !this.symbolPaletteEl) {
      this.symbolPaletteVisible = false;
      return;
    }
    this.symbolPaletteEl.classList.remove('show');
    this.symbolPaletteEl.setAttribute('aria-hidden', 'true');
    this.symbolButtonEl?.classList.remove('ql-active');
    this.symbolButtonEl?.setAttribute('aria-expanded', 'false');
    this.symbolPaletteVisible = false;
    document.removeEventListener('mousedown', this.boundDocumentClick, true);
    document.removeEventListener('keydown', this.boundDocumentKeydown, true);
  }

  private handleDocumentClick(event: MouseEvent): void {
    if (!this.symbolPaletteVisible) {
      return;
    }
    const target = event.target as Node | null;
    if (!target) {
      return;
    }
    if (this.symbolPaletteEl?.contains(target) || this.symbolButtonEl?.contains(target)) {
      return;
    }
    this.hideSymbolPalette();
  }

  private handleDocumentKeydown(event: KeyboardEvent): void {
    if (!this.symbolPaletteVisible) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.hideSymbolPalette();
      this.symbolButtonEl?.focus();
    }
  }

  private insertSymbol(symbol: string): void {
    if (!this.quill) {
      return;
    }
    const range = this.quill.getSelection(true);
    if (range) {
      this.quill.insertText(range.index, symbol, 'user');
      this.quill.setSelection(range.index + symbol.length, 0, 'silent');
    } else {
      const index = this.quill.getLength() - 1;
      this.quill.insertText(index, symbol, 'user');
      this.quill.setSelection(index + symbol.length, 0, 'silent');
    }
    this.quill.focus();
    this.hideSymbolPalette();
  }

  private teardownSymbolPalette(): void {
    this.hideSymbolPalette();
    if (this.symbolPaletteEl) {
      this.symbolPaletteEl.remove();
    }
    this.symbolPaletteEl = null;
    this.symbolButtonEl = null;
  }

  /**
   * Normalizes Quill output to XHTML-friendly markup.
   */
  private quillHtmlToXhtml(html: string): string {
    //replace all <br> instances with their self-closing counterpart: <br/>:
    return html.replaceAll('<br>', '<br/>');
  }

  /**
   * Configures custom Quill attributors and seeds dialog state.
   */
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
        'calibri': '"Calibri", sans-serif',
        'helvetica': 'Helvetica, sans-serif',
        'kix-barcode': '"KIX Barcode"',
        'open-sans': '"Open Sans", sans-serif',
        'bariol': '"Bariol", sans-serif',
        'roboto': 'Roboto, sans-serif',
        'times-new-roman': '"Times New Roman", Times, serif'
      };

      const reverseFontMap: Record<string, string> = {
        'Arial, Helvetica, sans-serif': 'arial',
        'Calibri, sans-serif': 'calibri',
        '"Calibri", sans-serif': 'calibri',
        'Helvetica, Arial, sans-serif': 'helvetica',
        'Helvetica, sans-serif': 'helvetica',
        '"KIX Barcode"': 'kix-barcode',
        'KIX Barcode': 'kix-barcode',
        '"Open Sans", sans-serif': 'open-sans',
        '"Bariol", sans-serif': 'bariol',
        'Roboto, sans-serif': 'roboto',
        '"Times New Roman", Times, serif': 'times-new-roman'
      };

      // Create custom font attributor
      class FontStyleAttributor extends StyleAttributor {
        constructor() {
          super('font', 'font-family', {
            scope: Parchment.Scope.INLINE // Removed whitelist so Quill preserves existing inline font-family values
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

  /**
   * Starts tracking mouse movement to drag the dialog.
   */
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
  /**
   * Stops dragging and persists the accumulated translation.
   */
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
  /**
   * Applies live drag translations while the pointer moves.
   */
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

  /**
   * Applies the currently selected font size to the Quill selection.
   */
  applyFontSize(): void {
    if (!this.quill) return;
    const sizeVal = Math.min(120, Math.max(1, this.currentFontSize));
    this.currentFontSize = sizeVal;
    this.quill.format('size', sizeVal + 'pt');
  }

  insertQrCode(): void {
    if (!this.quill) return;
    const text = window.prompt('QR Code content:', '');
    if (!text) return;
    try {
      // Generate SVG QR code then embed as an image (Quill strips raw <svg> markup)
      const svg = new (QRCode as any)({ content: text, padding: 0, width: 128, height: 128, color: '#000', background: 'transparent', ecl: 'M' }).svg();
      const dataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
      const range = this.quill.getSelection(true);
      const index = range ? range.index : this.quill.getLength();
      this.quill.insertEmbed(index, 'image', dataUrl, 'user');
      this.quill.setSelection(index + 1, 0, 'silent');
    } catch (e) {
      console.error('QR generation failed', e);
    }
  }

  ngOnDestroy(): void {
    this.teardownSymbolPalette();
  }

  /**
   * Emits sanitized editor contents and closes the dialog.
   */
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

  /**
   * Emits the close event without persisting changes.
   */
  close(): void {
    this.hideSymbolPalette();
    this.closed.emit();
  }
}
