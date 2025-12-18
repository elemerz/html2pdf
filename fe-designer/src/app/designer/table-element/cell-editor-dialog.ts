import {Component, Input, Output, EventEmitter, OnInit, ElementRef, ViewChild, HostListener, OnDestroy, AfterViewInit, Renderer2, inject} from '@angular/core';
import Quill from 'quill';

import { FormsModule } from '@angular/forms';
import { QuillModule } from 'ngx-quill';
import QRCode from 'qrcode-svg';
import { ReportDataService } from '../../core/services/report-data.service';

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
  return code !== 0x00AD;

}

function isLetter(char: string): boolean {
  if (!char) return false;
  const lower = char.toLowerCase();
  const upper = char.toUpperCase();
  return lower !== upper;

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
  imports: [FormsModule, QuillModule],
  templateUrl: './cell-editor-dialog.html',
  styleUrl: './cell-editor-dialog.less'
})
export class CellEditorDialogComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() initialContent: string = ''; // initial HTML
  @Input() repeatBinding?: { binding: string; iteratorName: string; repeatedElement: 'tr' | 'tbody' | 'table'; subTablePath?: Array<{row:number;col:number}> };
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<string>();

  private reportDataService = inject(ReportDataService);

  quill!: Quill;
  currentFontSize: number = 12; // pt default
  @ViewChild('dialogRoot') dialogRoot!: ElementRef<HTMLDivElement>;
  private dragging = false;// distance from dialog origin when using absolute mode (legacy)
  private dragStartMouseX = 0;
  private dragStartMouseY = 0;
  private dragAccumX = 0; // accumulated transform translation
  private dragAccumY = 0;
  contentValue = '';
  placeholderErrorMsg: string | null = null; // set when validation of ${} paths fails

  private intellisenseDropdownEl: HTMLDivElement | null = null;
  private intellisenseVisible = false;
  private intellisenseItems: string[] = [];
  private intellisenseSelectedIndex = 0;
  private intellisenseCurrentPath = '';
  private intellisenseInsertIndex = 0;
  private boundQuillKeydown = (event: KeyboardEvent) => this.handleQuillKeydown(event);
  private hostRef = inject(ElementRef<HTMLElement>);
  private renderer = inject(Renderer2);
  private hostRelocated = false;

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
    const defaultRoboto = this.isContentEmpty();
    if (defaultRoboto) {
      try {
        const rootEl = this.quill.root as HTMLElement;
        rootEl.style.fontFamily = 'Roboto, sans-serif';
        this.quill.formatText(0, this.quill.getLength(), 'font', 'roboto', 'silent');
      } catch {}
    }
    this.normalizeLogoPlaceholders();
    this.bindLogoPlaceholderSelection();
    // Autofocus editor so user can type immediately (ensure contenteditable root gets focus)
    setTimeout(() => { try { this.quill.focus(); (this.quill.root as HTMLElement).focus(); } catch {} }, 0);

    // Attach keydown listener for intellisense in CAPTURE phase to intercept before Quill
    (this.quill.root as HTMLElement).addEventListener('keydown', this.boundQuillKeydown, true);
    // Intercept paste events to ensure plain-text insertion inside ${} expressions
    (this.quill.root as HTMLElement).addEventListener('paste', (e: ClipboardEvent) => {
      try {
        const range = this.quill.getSelection();
        if (!range) return; // let default
        const textBeforeCursor = this.quill.getText(0, range.index);
        const textAfterCursor = this.quill.getText(range.index, this.quill.getLength());
        const ctx = this.detectExpressionContext(textBeforeCursor, textAfterCursor);
        if (!ctx.isInside) return; // only modify when inside ${...}
        // Prevent rich content paste
        e.preventDefault();
        e.stopPropagation();
        // Acquire plain text
        const plain = e.clipboardData?.getData('text/plain') ?? '';
        if (!plain) return;
        // Sanitize: allow only [A-Za-z0-9_.] removing spaces and other formatting characters
        const sanitized = plain.replace(/[^A-Za-z0-9_.]/g, '');
        if (!sanitized) return;
        // Insert at cursor
        this.quill.insertText(range.index, sanitized, 'user');
        this.quill.setSelection(range.index + sanitized.length, 0, 'silent');
      } catch {}
    }, true);

    // Also add Quill keyboard bindings to handle Enter when intellisense is visible
    const keyboard = this.quill.getModule('keyboard') as any;
    if (keyboard) {
      keyboard.addBinding({
        key: 'Enter'
      }, (context: any) => {
        return !this.intellisenseVisible;
      });
    }

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
          // Inject Logo Placeholder button right after image button
          const existingLogo = toolbarEl.querySelector('button.ql-logo-placeholder');
          if (imageBtn && !existingLogo) {
            const logoBtn = document.createElement('button');
            logoBtn.type = 'button';
            logoBtn.className = 'ql-logo-placeholder';
            logoBtn.setAttribute('aria-label', 'Insert Logo Placeholder');
            logoBtn.innerHTML = '<span class="ql-logo-icon" style="font-size:11px;font-weight:600;letter-spacing:.5px">LG</span>';
            logoBtn.addEventListener('click', () => this.openLogoDialog());
            imageBtn.after(logoBtn);
            console.debug('[CellEditorDialog] Logo placeholder button injected after image button');
          }
          // Inject QR button after logo (or image if logo absent)
          const existingQr = toolbarEl.querySelector('button.ql-qr');
          if (imageBtn && !existingQr) {
            const qrBtn = document.createElement('button');
            qrBtn.type = 'button';
            qrBtn.className = 'ql-qr';
            qrBtn.setAttribute('aria-label', 'Insert QR Code');
            qrBtn.innerHTML = '<span class="ql-qr-icon" style="font-size:11px;font-weight:600;letter-spacing:.5px">QR</span>';
            qrBtn.addEventListener('click', () => this.openQrDialog());
            const afterEl = (toolbarEl.querySelector('button.ql-logo-placeholder') as HTMLElement) || imageBtn;
            afterEl.after(qrBtn);
            console.debug('[CellEditorDialog] QR button injected after', afterEl.className);
          } else {
            console.debug('[CellEditorDialog] QR button already exists or image button missing', { hasImage: !!imageBtn, hasQr: !!existingQr });
          }
        } catch (e) { console.warn('[CellEditorDialog] QR/logo injection error', e); }
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
        // Apply size only when user confirms (Enter) or leaves the field, to prevent focus loss mid-typing (e.g., typing 12)
        const commitSize = () => {
          const v = parseFloat(inputEl.value);
          if (!Number.isFinite(v)) return;
          this.currentFontSize = Math.min(120, Math.max(1, v));
          this.applyFontSize();
          inputEl.value = this.currentFontSize.toString();
        };
        inputEl.addEventListener('keydown', (e) => {
          // Keep typing inside input; do not let Quill intercept toolbar key events
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            commitSize();
            inputEl.blur();
          }
        });
        inputEl.addEventListener('change', () => commitSize());
        inputEl.addEventListener('blur', () => commitSize());
        if (formatsGroup && formatsGroup.nextSibling) {
          formatsGroup.parentElement!.insertBefore(spinnerWrapper, formatsGroup.nextSibling);
        } else if (formatsGroup) {
          // fallback to original insertion method
          fontPicker ? fontPicker.after(spinnerWrapper) : toolbarEl.appendChild(spinnerWrapper);
        }
        if (defaultRoboto) {
          const fontSelect = toolbarEl.querySelector('select.ql-font') as HTMLSelectElement | null;
          if (fontSelect) {
            fontSelect.value = 'roboto';
            fontSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }
    } catch {}

    this.quill.on('selection-change', () => {
      const range = this.quill.getSelection();
      if (!range) {
        this.hideSymbolPalette();
        this.hideIntellisense();
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
    // Enable image resize support (adds click listener for IMG elements)
    this.initImageResizeSupport();
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

  private handleQuillKeydown(event: KeyboardEvent): void {
    // Delete selected logo placeholder
    if (event.key === 'Delete' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
      const root = this.quill?.root;
      if (root) {
        const sel = root.querySelector('p[data-type="logo-placeholder"].lp-selected') as HTMLParagraphElement | null;
        if (sel) {
          try {
            const blot = this.quill.scroll.find(sel);
            if (blot) {
              const index = this.quill.getIndex(blot);
              const length = blot.length();
              this.quill.deleteText(index, length, 'user');
            }
          } catch {}
          sel.remove();
          event.preventDefault();
          return;
        }
      }
    }

    // Ctrl+Space to trigger intellisense
    if (event.ctrlKey && event.key === ' ') {
      event.preventDefault();
      this.showIntellisense();
      return;
    }

    // Escape key - hide intellisense if visible
    if (event.key === 'Escape') {
      if (this.intellisenseVisible) {
        event.preventDefault();
        this.hideIntellisense();
        return;
      }
    }

    // Handle intellisense dropdown navigation
    if (this.intellisenseVisible) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        this.intellisenseSelectedIndex = Math.min(this.intellisenseSelectedIndex + 1, this.intellisenseItems.length - 1);
        this.updateIntellisenseSelection();
        return;
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        this.intellisenseSelectedIndex = Math.max(this.intellisenseSelectedIndex - 1, 0);
        this.updateIntellisenseSelection();
        return;
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        this.insertIntellisenseSelection();
        return;
      }
    }

    // Auto-trigger intellisense on dot character
    if (event.key === '.' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      setTimeout(() => this.showIntellisense(), 50);
    }
  }

  private showIntellisense(): void {
    if (!this.quill) return;

    const range = this.quill.getSelection();
    if (!range) return;

    const textBeforeCursor = this.quill.getText(0, range.index);
    const textAfterCursor = this.quill.getText(range.index, this.quill.getLength());

    // Check if we're editing inside an existing ${} expression
    const insideExpression = this.detectExpressionContext(textBeforeCursor, textAfterCursor);

    const currentPath = this.extractPathBeforeCursor(textBeforeCursor, insideExpression);

    // Map iterator variable (cycle variable) to underlying data path when present
    let underlyingPath = currentPath;
    const iteratorName = this.repeatBinding?.iteratorName?.trim();
    const bindingPath = this.repeatBinding?.binding?.trim();

    if (iteratorName && bindingPath && currentPath) {
      if (currentPath === iteratorName) {
        // At the iterator root -> use binding collection path to fetch item fields
        underlyingPath = bindingPath;
      } else if (currentPath.startsWith(iteratorName + '.')) {
        // Translate iteratorName.remainder -> bindingPath.remainder
        const remainder = currentPath.slice(iteratorName.length + 1);
        underlyingPath = remainder ? `${bindingPath}.${remainder}` : bindingPath;
      }
    }

    let fields = this.reportDataService.getFieldsAtPath(underlyingPath);

    // Inject iterator variable itself at root suggestions (only once)
    if (iteratorName && (!currentPath || currentPath === '')) {
      if (!fields.includes(iteratorName)) {
        fields = [iteratorName, ...fields];
      }
    }

    if (fields.length === 0) {
      this.hideIntellisense();
      return;
    }

    this.intellisenseItems = fields;
    this.intellisenseCurrentPath = currentPath; // keep the user's typed path (may be iteratorName.*)
    this.intellisenseInsertIndex = range.index;
    this.intellisenseSelectedIndex = 0;

    if (!this.intellisenseDropdownEl) {
      this.intellisenseDropdownEl = this.buildIntellisenseDropdown();
      document.body.appendChild(this.intellisenseDropdownEl);
    }

    this.updateIntellisenseContent();
    this.positionIntellisenseDropdown();
    this.intellisenseDropdownEl.style.display = 'block';
    this.intellisenseDropdownEl.classList.add('show');
    this.intellisenseVisible = true;
  }

  private hideIntellisense(): void {
    if (!this.intellisenseVisible) return;

    if (this.intellisenseDropdownEl) {
      this.intellisenseDropdownEl.classList.remove('show');
      this.intellisenseDropdownEl.style.display = 'none';
    }
    this.intellisenseVisible = false;
  }

  private buildIntellisenseDropdown(): HTMLDivElement {
    const dropdown = document.createElement('div');
    dropdown.className = 'intellisense-dropdown';
    dropdown.style.cssText = 'position:fixed;z-index:10000;background:#fff;border:1px solid #ccc;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.15);max-height:200px;overflow-y:auto;min-width:150px;display:none;';
    return dropdown;
  }

  private updateIntellisenseContent(): void {
    if (!this.intellisenseDropdownEl) return;

    this.intellisenseDropdownEl.innerHTML = '';

    this.intellisenseItems.forEach((item, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'intellisense-item';
      itemEl.textContent = item;
      itemEl.style.cssText = 'padding:4px 8px;cursor:pointer;font-size:12px;';

      if (index === this.intellisenseSelectedIndex) {
        itemEl.style.backgroundColor = '#0078d4';
        itemEl.style.color = '#fff';
      }

      itemEl.addEventListener('mouseenter', () => {
        this.intellisenseSelectedIndex = index;
        this.updateIntellisenseSelection();
      });

      itemEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.insertIntellisenseSelection();
      });

      itemEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      this.intellisenseDropdownEl!.appendChild(itemEl);
    });
  }

  private updateIntellisenseSelection(): void {
    if (!this.intellisenseDropdownEl) return;

    const items = this.intellisenseDropdownEl.querySelectorAll('.intellisense-item') as NodeListOf<HTMLElement>;
    items.forEach((item, index) => {
      if (index === this.intellisenseSelectedIndex) {
        item.style.backgroundColor = '#0078d4';
        item.style.color = '#fff';
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.style.backgroundColor = '';
        item.style.color = '';
      }
    });
  }

  private insertIntellisenseSelection(): void {
    if (!this.quill || this.intellisenseItems.length === 0) return;

    const selectedField = this.intellisenseItems[this.intellisenseSelectedIndex];
    const range = this.quill.getSelection();
    if (!range) return;

    const textBeforeCursor = this.quill.getText(0, range.index);
    const textAfterCursor = this.quill.getText(range.index, this.quill.getLength());

    // Detect if we're inside an existing ${} expression
    const insideExpression = this.detectExpressionContext(textBeforeCursor, textAfterCursor);

    // Hide dropdown immediately
    this.hideIntellisense();

    // Small delay to ensure Quill is ready
    setTimeout(() => {
      if (!this.quill) return;

      if (insideExpression.isInside) {
        // We're editing inside an existing expression
        // Just insert the field name at current position
        const fullPath = this.intellisenseCurrentPath ? `${this.intellisenseCurrentPath}.${selectedField}` : selectedField;

        // Delete the partial path we've typed and insert the complete field
        const deleteStart = insideExpression.pathStart!;
        const deleteLength = range.index - deleteStart;

        this.quill.deleteText(deleteStart, deleteLength, 'user');
        this.quill.insertText(deleteStart, fullPath, 'user');
        this.quill.setSelection(deleteStart + fullPath.length, 0, 'user');
      } else {
        // New expression - wrap in ${}
        const fullPath = this.intellisenseCurrentPath ? `${this.intellisenseCurrentPath}.${selectedField}` : selectedField;
        const wrappedText = `\${${fullPath}}`;

        // Find and delete any partial path before cursor
        const partialMatch = /[\w.]*$/.exec(textBeforeCursor);
        if (partialMatch && partialMatch[0].length > 0) {
          const deleteStart = range.index - partialMatch[0].length;
          this.quill.deleteText(deleteStart, partialMatch[0].length, 'user');
          this.quill.insertText(deleteStart, wrappedText, 'user');
          this.quill.setSelection(deleteStart + wrappedText.length, 0, 'user');
        } else {
          this.quill.insertText(range.index, wrappedText, 'user');
          this.quill.setSelection(range.index + wrappedText.length, 0, 'user');
        }
      }

      this.quill.focus();
    }, 10);
  }

  private positionIntellisenseDropdown(): void {
    if (!this.quill || !this.intellisenseDropdownEl) return;

    const range = this.quill.getSelection();
    if (!range) return;

    const bounds = this.quill.getBounds(range.index);
    if (!bounds) return;

    const editorRect = this.quill.root.getBoundingClientRect();

    this.intellisenseDropdownEl.style.left = `${editorRect.left + bounds.left}px`;
    this.intellisenseDropdownEl.style.top = `${editorRect.top + bounds.bottom + 2}px`;
  }

  private extractPathBeforeCursor(text: string, insideExpression: { isInside: boolean; pathStart?: number; openBrace?: number }): string {
    // If we're inside a ${} expression, extract the path from after ${
    if (insideExpression.isInside && insideExpression.openBrace !== undefined) {
      const expressionContent = text.substring(insideExpression.openBrace + 2); // +2 to skip ${

      // If expression content ends with a dot, return everything before the dot as the path
      if (expressionContent.endsWith('.')) {
        return expressionContent.slice(0, -1);
      }

      // Otherwise, find the last dot and return everything before it
      const lastDotIndex = expressionContent.lastIndexOf('.');
      if (lastDotIndex === -1) {
        // No dot found, so we're at root level inside ${}
        return '';
      }

      return expressionContent.slice(0, lastDotIndex);
    }

    // Not inside expression - look for partial path at cursor
    const match = /[\w.]+$/.exec(text);
    if (!match) return '';

    const fullMatch = match[0];
    if (fullMatch.endsWith('.')) {
      return fullMatch.slice(0, -1);
    }

    const lastDotIndex = fullMatch.lastIndexOf('.');
    if (lastDotIndex === -1) {
      return '';
    }

    return fullMatch.slice(0, lastDotIndex);
  }

  private detectExpressionContext(textBefore: string, textAfter: string): { isInside: boolean; pathStart?: number; openBrace?: number } {
    // Look backwards for ${ and forwards for }
    const lastOpenBrace = textBefore.lastIndexOf('${');
    const lastCloseBrace = textBefore.lastIndexOf('}');

    // Check if there's an unclosed ${ before cursor
    if (lastOpenBrace !== -1 && (lastCloseBrace === -1 || lastOpenBrace > lastCloseBrace)) {
      // Check if there's a } after cursor
      const nextCloseBrace = textAfter.indexOf('}');
      if (nextCloseBrace !== -1) {
        // We're inside a ${} expression
        // Find where the path starts (after ${)
        const pathStart = lastOpenBrace + 2;
        return { isInside: true, pathStart, openBrace: lastOpenBrace };
      }
    }

    return { isInside: false };
  }

  /**
   * Normalizes Quill output to XHTML-friendly markup.
   */
  private quillHtmlToXhtml(html: string): string {
    //replace all <br> instances with their self-closing counterpart: <br/>:
    return html.replaceAll('<br>', '<br/>');
  }

  private isContentEmpty(): boolean {
    const html = this.contentValue || this.initialContent || '';
    const normalized = html
      .replace(/&nbsp;/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, '')
      .trim();
    return normalized.length === 0;
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
        'kix-barcode': "'KIX Barcode'", // single quotes to avoid &quot; in XHTML
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
        "'KIX Barcode'": 'kix-barcode',
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
          let cssValue = fontMap[value] || value;
          // Force single quotes for font families with spaces to avoid &quot; serialization
          if (/\s/.test(cssValue)) {
            // Normalize any double quotes to single quotes
            cssValue = cssValue.replace(/"/g, "'");
          }
          if (cssValue && cssValue !== 'false' && node.style) {
            // Directly set attribute string to preserve single quotes during Quill's HTML serialization
            // Some browsers may normalize style.fontFamily to double quotes; setting style attribute avoids that.
            const existing = node.getAttribute('style') || '';
            const cleaned = existing.replace(/font-family:[^;]*;?/gi,'').trim();
            const prefix = cleaned.length ? (cleaned.endsWith(';') ? cleaned : cleaned + ';') : '';
            node.setAttribute('style', `${prefix}font-family:${cssValue};`);
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
    // After content loaded, attach QR handlers for existing images
    setTimeout(() => this.attachQrHandlers(), 0);
  }

  ngAfterViewInit(): void {
    this.relocateHostToBody();
  }

  private relocateHostToBody(): void {
    try {
      const hostEl = this.hostRef?.nativeElement;
      const body = hostEl?.ownerDocument?.body;
      if (!hostEl || !body || hostEl.parentElement === body) {
        this.hostRelocated = !!hostEl && !!body && hostEl.parentElement === body;
        return;
      }
      // Move host to body so canvas zoom transforms do not scale the dialog/backdrop.
      body.appendChild(hostEl);
      this.hostRelocated = true;
    } catch {
      this.hostRelocated = false;
    }
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

  // State for QR code dialog
  showQrDialog: boolean = false;
  qrForm = { data: '', size: 32, ec: 'M', margin: 2 };
  private qrEditImg: HTMLImageElement | null = null; // currently edited QR image
  private qrEditMode: boolean = false; // true when editing existing QR
  private attachQrHandlers() {
    if (!this.quill) return;
    const imgs = Array.from(this.quill.root.querySelectorAll('img[data-type="application/qrcode"]')) as HTMLImageElement[];
    imgs.forEach(img => {
      if ((img as any)._qrDblBound) return;
      img.addEventListener('dblclick', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        this.openQrDialog(img);
      });
      (img as any)._qrDblBound = true;
    });
  }

  openQrDialog(existingImg?: HTMLImageElement): void {
    if (existingImg) {
      // Edit mode
      this.qrEditImg = existingImg;
      this.qrEditMode = true;
      const data = existingImg.getAttribute('data-data') || '';
      const sizeMmStr = existingImg.getAttribute('data-size') || '32';
      const ec = existingImg.getAttribute('data-ec') || 'M';
      const marginStr = existingImg.getAttribute('data-margin') || '2';
      this.qrForm = {
        data,
        size: Math.max(1, parseFloat(sizeMmStr) || 32),
        ec: ec || 'M',
        margin: Math.max(0, parseInt(marginStr, 10) || 2)
      };
    } else {
      // Insert mode
      this.qrEditImg = null;
      this.qrEditMode = false;
      this.qrForm = { data: '', size: 32, ec: 'M', margin: 2 }; // reset each time (size now in mm)
    }
    this.showQrDialog = true;
  }

  cancelQrDialog(): void {
    this.showQrDialog = false;
  }

  submitQrDialog(): void {
    if (!this.quill) { this.showQrDialog = false; return; }
    const { data, size, ec, margin } = this.qrForm;
    if (!data || size <= 0) { this.showQrDialog = false; return; }
    try {
      const mm = size; // size in millimeters
      const pxPerMm = 96 / 25.4; // nominal CSS px per mm
      const sizePx = Math.max(1, Math.round(mm * pxPerMm));
      const svg = new (QRCode as any)({ content: data, padding: margin, width: sizePx, height: sizePx, color: '#000', background: 'transparent', ecl: ec }).svg();
      const dataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);

      if (this.qrEditMode && this.qrEditImg) {
        // Update existing image
        this.qrEditImg.src = dataUrl;
        this.qrEditImg.setAttribute('data-data', data);
        this.qrEditImg.setAttribute('data-size', mm.toString());
        this.qrEditImg.setAttribute('data-ec', ec);
        this.qrEditImg.setAttribute('data-margin', margin.toString());
      } else {
        // Insert new image
        const range = this.quill.getSelection(true);
        const index = range ? range.index : this.quill.getLength();
       // Insert newline to isolate placeholder so Quill doesn't wrap text in span
       this.quill.insertText(index, '\n', 'silent');
        this.quill.insertEmbed(index, 'image', dataUrl, 'user');
        this.quill.setSelection(index + 1, 0, 'silent');
        setTimeout(() => {
          try {
            const img = this.quill.root.querySelector(`img[src="${dataUrl}"]`) as HTMLImageElement | null;
            if (img) {
              img.setAttribute('data-type', 'application/qrcode');
              img.setAttribute('data-data', data);
              img.setAttribute('data-size', mm.toString());
              img.setAttribute('data-ec', ec);
              img.setAttribute('data-margin', margin.toString());
              this.attachQrHandlers(); // bind dblclick
            }
          } catch {}
        }, 0);
      }
    } catch (e) {
      console.error('QR generation failed', e);
    }
    this.showQrDialog = false;
    this.qrEditImg = null;
    this.qrEditMode = false;
  }

  // Logo placeholder dialog state & handlers
  showLogoDialog: boolean = false;
  logoForm = { width: 32, height: 16 };
  openLogoDialog(): void {
    this.logoForm = { width: 32, height: 16 }; // reset defaults each time
    this.showLogoDialog = true;
  }
  cancelLogoDialog(): void { this.showLogoDialog = false; }
  private bindLogoPlaceholderSelection(): void {
    if (!this.quill) return;
    const root = this.quill.root;
    // Click to select
    root.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;
      const p = t.closest('p[data-type="logo-placeholder"]') as HTMLParagraphElement | null;
      Array.from(root.querySelectorAll('p[data-type="logo-placeholder"].lp-selected')).forEach(el => el.classList.remove('lp-selected'));
      if (p) {
        p.classList.add('lp-selected');
      }
    });
  }

  private normalizeLogoPlaceholders(): void {
    if (!this.quill) return;
    const paras = Array.from(this.quill.root.querySelectorAll('p')) as HTMLParagraphElement[];
    paras.forEach(p => {
      if (!p.textContent) return;
      const txt = p.textContent.trim();
      const m = /^(\d+)\s*x\s*(\d+)\s*mm$/i.exec(txt);
      if (!m) return;
      p.setAttribute('data-type','logo-placeholder');
      if (!p.classList.contains('lg-placeholder')) p.classList.add('lg-placeholder');
      p.style.border = '2px solid #ffcc00';
      p.style.width = m[1] + 'mm';
      p.style.height = m[2] + 'mm';
      p.style.display = 'flex';
      p.style.justifyContent = 'center';
      p.style.alignItems = 'center';
      p.style.fontSize = '11px';
      p.style.fontFamily = 'Arial, Helvetica, sans-serif';
      p.style.backgroundColor = 'transparent';
      p.style.textAlign = 'center';
    });
  }

  submitLogoDialog(): void {
    this.normalizeLogoPlaceholders();
    // Remove Quill alignment auto-format on plain line before insertion
    try {
      const rangePre = this.quill?.getSelection();
      if (rangePre) {
        this.quill.formatLine(rangePre.index, 1, { align: false });
      }
    } catch {}

    if (!this.quill) { this.showLogoDialog = false; return; }
    const { width, height } = this.logoForm;
    if (width <= 0 || height <= 0) { this.showLogoDialog = false; return; }
    // Build placeholder div with mm dimensions and centered label
    const html = `<p data-type=\"logo-placeholder\">${width} x ${height} mm</p>`;
    try {
      const range = this.quill.getSelection(true);
      const index = range ? range.index : this.quill.getLength();
      (this.quill.clipboard as any).dangerouslyPasteHTML(index, html);
      this.quill.setSelection(index + 1, 0, 'silent');
      // Force placeholder element styling via direct DOM mutation (Quill strips custom classes on paste)
      const [line] = this.quill.getLine(index);
      if (line && line.domNode && line.domNode.tagName === 'P') {
        const el = line.domNode as HTMLElement;
        el.setAttribute('data-type','logo-placeholder');
        // Preserve existing alignment class if Quill added it, then add placeholder class
        if (el.classList.contains('ql-align-center')) {
          el.classList.add('lg-placeholder');
        } else {
          el.classList.add('lg-placeholder');
        }
        el.style.border = '2px solid #ffcc00';
        el.style.height = height + 'mm';
        el.style.width = width + 'mm';
        el.style.display = 'flex';
        el.style.justifyContent = 'center';
        el.style.alignItems = 'center';
        el.style.fontSize = '11px';
        el.style.fontFamily = 'Arial, Helvetica, sans-serif';
        el.style.backgroundColor = 'transparent';
        el.style.textAlign = 'center';
      }
    } catch (e) { console.warn('Logo placeholder insertion failed', e); }
    this.showLogoDialog = false;
  }

  ngOnDestroy(): void {
    this.teardownSymbolPalette();
    this.qrEditImg = null;

    if (this.quill && this.quill.root) {
      (this.quill.root as HTMLElement).removeEventListener('keydown', this.boundQuillKeydown, true);
    }

    if (this.intellisenseDropdownEl) {
      this.intellisenseDropdownEl.remove();
      this.intellisenseDropdownEl = null;
    }

    this.removeHostFromBody();
  }

  /**
   * Emits sanitized editor contents and closes the dialog.
   */
  save(): void {
    this.placeholderErrorMsg = null;
    const raw = this.contentValue && this.contentValue.trim().length ? this.quill.root.innerHTML : '&nbsp;';
    let xhtml = raw;
    try {
      xhtml = this.quillHtmlToXhtml(raw);
      // Sanitize ${} expressions using only the leading valid path (discard any injected markup/styles)
      // This avoids cases where Quill wraps expression text in <span> tags, producing concatenated artifacts like spanstylefontfamily...
      xhtml = xhtml.replace(/\$\{([^}]*)\}/g, (m, inner) => {
        let rawInner = (inner || '').trim();
        // Strip any HTML tags Quill may have injected inside the ${ } expression
        const noTags = rawInner.replace(/<[^>]*>/g, ' ');
        // Find first valid dotted identifier path (e.g. t.date or t.treatmentProvider)
        const pathMatch = /([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)/.exec(noTags);
        const cleaned = pathMatch ? pathMatch[1] : '';
        return '${' + cleaned + '}';
      });
      // Validate placeholders using plain text (avoids markup pollution)
      const dataModel = this.reportDataService.reportDataModel();
      const plainText = this.quill.getText();
      const placeholderRegex = /\$\{([^}]+)\}/g;
      const self = this;
      let match;
      while ((match = placeholderRegex.exec(plainText))) {
        const rawPath = match[1].trim();
        const cleanedPath = rawPath.replace(/[^\w.]/g, '');
        if (cleanedPath && !pathExists(dataModel, cleanedPath)) {
          const textIndex = match.index ?? plainText.indexOf(match[0]);
          if (textIndex >= 0) {
            try { this.quill.setSelection(textIndex + 2, cleanedPath.length); } catch {}
          }
          this.placeholderErrorMsg = `Unknown data path: ${cleanedPath}`;
          return; // prevent closing & emitting
        }
      }
      function pathExists(obj: any, path: string): boolean {
        if (!path) return false;
        const iteratorName = self.repeatBinding?.iteratorName;
        const repeatBindingPath = self.repeatBinding?.binding;
        if (iteratorName && (path === iteratorName || path.startsWith(iteratorName + '.'))) {
          let repeatObj: any = obj;
          if (repeatBindingPath) {
            const baseParts = repeatBindingPath.split('.').filter(p => p.length);
            for (const bp of baseParts) {
              if (repeatObj == null) return false;
              repeatObj = repeatObj[bp];
            }
            if (Array.isArray(repeatObj)) repeatObj = repeatObj[0];
          }
            if (path === iteratorName) return repeatObj != null;
            path = path.substring(iteratorName.length + 1);
            obj = repeatObj;
        }
        if (!obj) return false;
        path = path.replace(/\[(\d+)\]/g, '.$1');
        const parts = path.split('.').filter(p => p.length);
        let current: any = obj;
        for (const part of parts) {
          if (current == null) return false;
          if (Array.isArray(current)) {
            if (/^\d+$/.test(part)) { current = current[Number(part)]; continue; }
            current = current[0] && current[0][part];
            continue;
          }
          if (!Object.prototype.hasOwnProperty.call(current, part)) return false;
          current = current[part];
        }
        return current !== undefined;
      }
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
    this.deactivateImageResize();
    this.closed.emit();
  }

  // Image resize support
  private resizingImage: HTMLImageElement | null = null;
  private imageResizeHandleEl: HTMLDivElement | null = null;
  private imageResizeLabelEl: HTMLDivElement | null = null;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;

  private initImageResizeSupport(): void {
    if (!this.quill) return;
    const root = this.quill.root as HTMLElement;
    if ((root as any)._imageResizeBound) return;
    (root as any)._imageResizeBound = true;
    root.addEventListener('click', (ev) => this.handleImageClick(ev), true);
  }

  private handleImageClick(ev: MouseEvent): void {
    const t = ev.target as HTMLElement | null;
    if (!t) return;
    if (t.tagName === 'IMG') {
      this.activateImageResize(t as HTMLImageElement);
    } else if (this.resizingImage && this.imageResizeHandleEl && !this.imageResizeHandleEl.contains(t)) {
      // clicked elsewhere
      this.deactivateImageResize();
    }
  }

  private activateImageResize(img: HTMLImageElement): void {
    if (this.resizingImage === img && this.imageResizeHandleEl) return;
    this.deactivateImageResize();
    this.resizingImage = img;
    this.createImageResizeHandle();
    this.positionImageResizeHandle();
  }

  private deactivateImageResize(): void {
    this.resizingImage = null;
    if (this.imageResizeHandleEl) { this.imageResizeHandleEl.remove(); this.imageResizeHandleEl = null; }
    if (this.imageResizeLabelEl) { this.imageResizeLabelEl.remove(); this.imageResizeLabelEl = null; }
    document.removeEventListener('mousemove', this.onImageResizeMoveBound, true);
    document.removeEventListener('mouseup', this.onImageResizeEndBound, true);
  }

  private createImageResizeHandle(): void {
    if (!this.resizingImage) return;
    const handle = document.createElement('div');
    handle.className = 'cell-editor-image-resize-handle';
    // Inline styles to avoid Angular view encapsulation issues (element appended outside template)
    handle.style.cssText = 'position:fixed;width:12px;height:12px;background:#0078d4;border:2px solid #fff;box-shadow:0 0 2px rgba(0,0,0,.4);border-radius:2px;cursor:nwse-resize;z-index:10000;user-select:none;';
    handle.addEventListener('mousedown', (ev) => this.onImageResizeStart(ev));
    document.body.appendChild(handle);
    this.imageResizeHandleEl = handle;
  }

  private positionImageResizeHandle(): void {
    if (!this.resizingImage || !this.imageResizeHandleEl) return;
    const rect = this.resizingImage.getBoundingClientRect();
    this.imageResizeHandleEl.style.left = (rect.right - 6) + 'px';
    this.imageResizeHandleEl.style.top = (rect.bottom - 6) + 'px';
  }

  private ensureImageResizeLabel(): void {
    if (this.imageResizeLabelEl) return;
    const label = document.createElement('div');
    label.className = 'cell-editor-image-resize-label';
    // Inline styles ensure visibility despite style encapsulation
    label.style.cssText = 'position:fixed;font-size:11px;padding:2px 6px;background:rgba(0,0,0,.75);color:#fff;border-radius:4px;pointer-events:none;z-index:10001;font-family:Arial,Helvetica,sans-serif;';
    document.body.appendChild(label);
    this.imageResizeLabelEl = label;
  }

  private onImageResizeStart(ev: MouseEvent): void {
    if (ev.button !== 0 || !this.resizingImage) return;
    ev.preventDefault(); ev.stopPropagation();
    this.resizeStartX = ev.clientX;
    this.resizeStartY = ev.clientY;
    this.resizeStartWidth = this.resizingImage.width || this.resizingImage.getBoundingClientRect().width;
    this.resizeStartHeight = this.resizingImage.height || this.resizingImage.getBoundingClientRect().height;
    this.ensureImageResizeLabel();
    this.updateImageResizeLabel(this.resizeStartWidth, this.resizeStartHeight, ev);
    document.addEventListener('mousemove', this.onImageResizeMoveBound, true);
    document.addEventListener('mouseup', this.onImageResizeEndBound, true);
  }

  private onImageResizeMoveBound = (ev: MouseEvent) => this.onImageResizeMove(ev);
  private onImageResizeEndBound = (ev: MouseEvent) => this.onImageResizeEnd(ev);

  private onImageResizeMove(ev: MouseEvent): void {
    if (!this.resizingImage) return;
    const dx = ev.clientX - this.resizeStartX;
    const dy = ev.clientY - this.resizeStartY;
    const newW = Math.max(8, Math.round(this.resizeStartWidth + dx));
    const newH = Math.max(8, Math.round(this.resizeStartHeight + dy));
    this.resizingImage.style.width = newW + 'px';
    this.resizingImage.style.height = newH + 'px';
    this.positionImageResizeHandle();
    this.updateImageResizeLabel(newW, newH, ev);
  }

  private onImageResizeEnd(_: MouseEvent): void {
    this.deactivateImageResize();
  }

  private updateImageResizeLabel(w: number, h: number, ev: MouseEvent): void {
    if (!this.imageResizeLabelEl) return;
    this.imageResizeLabelEl.textContent = `${w} x ${h}`;
    this.imageResizeLabelEl.style.left = (ev.clientX + 12) + 'px';
    this.imageResizeLabelEl.style.top = (ev.clientY + 12) + 'px';
  }

  private removeHostFromBody(): void {
    if (!this.hostRelocated) return;
    try {
      const hostEl = this.hostRef?.nativeElement;
      const body = hostEl?.ownerDocument?.body;
      if (hostEl && body?.contains(hostEl)) {
        this.renderer.removeChild(body, hostEl);
      }
    } catch {
      // ignore cleanup failures
    } finally {
      this.hostRelocated = false;
    }
  }
}
