import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ReportLayout, InsertReportLayout } from '../../shared/models/schema';

@Injectable({
  providedIn: 'root'
})
export class LayoutsApiService {
  private http = inject(HttpClient);
  private apiUrl = '/api/layouts';

  // Get all layouts
  getLayouts(): Observable<ReportLayout[]> {
    return this.http.get<ReportLayout[]>(this.apiUrl);
  }

  // Get a single layout by ID
  getLayout(id: string): Observable<ReportLayout> {
    return this.http.get<ReportLayout>(`${this.apiUrl}/${id}`);
  }

  // Create a new layout
  createLayout(layout: InsertReportLayout): Observable<ReportLayout> {
    return this.http.post<ReportLayout>(this.apiUrl, layout);
  }

  // Update an existing layout
  updateLayout(id: string, layout: Partial<ReportLayout>): Observable<ReportLayout> {
    return this.http.patch<ReportLayout>(`${this.apiUrl}/${id}`, layout);
  }

  // Delete a layout
  deleteLayout(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
