import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ReportLayout, InsertReportLayout } from '../../shared/models/schema';

/**
 * Thin HTTP client for persisting layouts through the backend API.
 */
@Injectable({
  providedIn: 'root'
})
export class LayoutsApiService {
  private http = inject(HttpClient);
  private apiUrl = '/api/layouts';

  /**
   * Fetches all stored report layouts from the server.
   */
  getLayouts(): Observable<ReportLayout[]> {
    return this.http.get<ReportLayout[]>(this.apiUrl);
  }

  /**
   * Fetches a single layout by its identifier.
   */
  getLayout(id: string): Observable<ReportLayout> {
    return this.http.get<ReportLayout>(`${this.apiUrl}/${id}`);
  }

  /**
   * Persists a brand-new layout record.
   */
  createLayout(layout: InsertReportLayout): Observable<ReportLayout> {
    return this.http.post<ReportLayout>(this.apiUrl, layout);
  }

  /**
   * Applies partial updates to an existing layout.
   */
  updateLayout(id: string, layout: Partial<ReportLayout>): Observable<ReportLayout> {
    return this.http.patch<ReportLayout>(`${this.apiUrl}/${id}`, layout);
  }

  /**
   * Removes a layout permanently.
   */
  deleteLayout(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
