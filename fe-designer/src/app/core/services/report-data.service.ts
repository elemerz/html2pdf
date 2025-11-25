import { Injectable, signal } from '@angular/core';

/**
 * Shared service for managing the report data model used across the designer.
 */
@Injectable({
  providedIn: 'root'
})
export class ReportDataService {
  private reportDataModelSignal = signal<any>({});

  readonly reportDataModel = this.reportDataModelSignal.asReadonly();

  setReportDataModel(data: any) {
    this.reportDataModelSignal.set(data);
  }

  getFieldsAtPath(path: string): string[] {
    const data = this.reportDataModelSignal();
    if (!path) {
      return Object.keys(data);
    }

    const parts = path.split('.');
    let current: any = data;

    for (const part of parts) {
      if (current && typeof current === 'object') {
        if (Array.isArray(current) && !isNaN(Number(part))) {
          current = current[Number(part)];
        } else {
          current = current[part];
        }
      } else {
        return [];
      }
    }

    if (!current || typeof current !== 'object') {
      return [];
    }

    if (Array.isArray(current)) {
      return current.length > 0 ? Object.keys(current[0]) : [];
    }

    return Object.keys(current);
  }
}
