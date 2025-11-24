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

  getFieldPaths(): string[] {
    return this.extractFieldPaths(this.reportDataModelSignal(), '');
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

  private extractFieldPaths(obj: any, prefix: string): string[] {
    const paths: string[] = [];
    
    if (!obj || typeof obj !== 'object') {
      return paths;
    }

    for (const key in obj) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      paths.push(fullPath);
      
      const value = obj[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        paths.push(...this.extractFieldPaths(value, fullPath));
      } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
        paths.push(...this.extractFieldPaths(value[0], fullPath));
      }
    }

    return paths;
  }
}
