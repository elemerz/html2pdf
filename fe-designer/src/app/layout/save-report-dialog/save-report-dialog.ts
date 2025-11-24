import { Component, ElementRef, OnDestroy, ViewChild, signal, output } from '@angular/core';


@Component({
  selector: 'app-save-report-dialog',
  imports: [],
  templateUrl: './save-report-dialog.html',
  styleUrl: './save-report-dialog.less',
  standalone: true
})
export class SaveReportDialogComponent implements OnDestroy {
  private userEditedFileName = false;
  private closingInternally = false;
  private toggleListener = (event: Event) => this.handleToggle(event);
  protected isOpen = signal(false);

  private dialogFormRef?: ElementRef<HTMLFormElement>;

  @ViewChild('dialogForm', { read: ElementRef })
  set dialogForm(ref: ElementRef<HTMLFormElement> | undefined) {
    if (this.dialogFormRef) {
      this.dialogFormRef.nativeElement.removeEventListener('toggle', this.toggleListener);
    }
    if (ref) {
      this.dialogFormRef = ref;
      this.dialogFormRef.nativeElement.addEventListener('toggle', this.toggleListener);
    } else {
      this.dialogFormRef = undefined;
    }
  }

  @ViewChild('layoutInput', { read: ElementRef })
  private layoutInputRef?: ElementRef<HTMLInputElement>;

  @ViewChild('fileInput', { read: ElementRef })
  private fileInputRef?: ElementRef<HTMLInputElement>;

  protected layoutName = signal('Untitled Layout');
  protected fileName = signal('untitled-layout');
  protected validationMessage = signal('');

  onSave = output<{ layoutName: string; fileName: string }>();
  onCancel = output<void>();

  open(layoutName: string, fileBase: string) {
    this.userEditedFileName = false;
    this.layoutName.set(layoutName);
    this.fileName.set(fileBase);
    this.validationMessage.set('');
    const form = this.dialogFormRef?.nativeElement;
    if (!form) return;
    this.isOpen.set(true);
    form.removeAttribute('hidden');
    if (typeof (form as any).showPopover === 'function') {
      form.showPopover();
    } else {
      form.classList.add('fallback-open');
    }
    queueMicrotask(() => {
      this.layoutInputRef?.nativeElement.focus();
      this.layoutInputRef?.nativeElement.select();
    });
  }

  close() {
    const form = this.dialogFormRef?.nativeElement;
    if (form && form.matches(':popover-open')) {
      this.closingInternally = true;
      form.hidePopover();
      queueMicrotask(() => {
        this.closingInternally = false;
      });
    } else if (form) {
      form.classList.remove('fallback-open');
    }
    this.isOpen.set(false);
    form?.setAttribute('hidden', '');
  }

  onSubmit(event: Event) {
    event.preventDefault();
    const layout = this.layoutName().trim() || 'Untitled Layout';
    const rawFile = this.fileName().trim();
    if (!rawFile.length) {
      this.validationMessage.set('File name is required.');
      queueMicrotask(() => this.fileInputRef?.nativeElement.focus());
      return;
    }
    const normalizedFile = this.normalizeFileBase(rawFile);
    this.fileName.set(normalizedFile);
    this.onSave.emit({ layoutName: layout, fileName: normalizedFile });
    this.close();
  }

  onCancelClick() {
    this.close();
    this.onCancel.emit();
  }

  onLayoutNameInput(value: string) {
    this.layoutName.set(value);
    if (!this.userEditedFileName) {
      this.fileName.set(this.normalizeFileBase(value));
    }
  }

  onFileNameInput(value: string) {
    this.userEditedFileName = true;
    this.fileName.set(value);
  }

  private normalizeFileBase(raw: string): string {
    let trimmed = raw.trim().toLowerCase();
    if (!trimmed.length) {
      return 'untitled-layout';
    }
    trimmed = trimmed.replace(/\.json$/, '');
    const slug = trimmed
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/--+/g, '-');
    return slug.length ? slug : 'untitled-layout';
  }

  private handleToggle(event: Event) {
    const form = event.target as HTMLFormElement;
    if (!form.matches(':popover-open') && !this.closingInternally) {
      form.classList.remove('fallback-open');
      this.isOpen.set(false);
      this.onCancel.emit();
    }
  }

  ngOnDestroy(): void {
    if (this.dialogFormRef) {
      this.dialogFormRef.nativeElement.removeEventListener('toggle', this.toggleListener);
    }
  }
}
