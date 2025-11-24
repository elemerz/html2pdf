// src/app/services/resource-loader.service.ts
import { Injectable, Inject, Optional } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { APP_BASE_HREF, DOCUMENT } from '@angular/common';
import { Observable } from 'rxjs';
import { shareReplay } from 'rxjs/operators';

type ContentType = 'text' | 'json' | 'blob' | 'arraybuffer';

/**
 * Utility for fetching static assets with caching and base-href awareness.
 */
@Injectable({ providedIn: 'root' })
export class ResourceLoaderService {
  private cache = new Map<string, Observable<unknown>>();

  /**
   * Creates a resource loader with awareness of the app base URI.
   */
  constructor(
    private http: HttpClient,
    @Optional() @Inject(APP_BASE_HREF) private baseHref?: string,
    @Inject(DOCUMENT) private doc?: Document
  ) {}

  /** Loads a resource as text using caching for repeat requests. */
  loadResource(relPath: string): Observable<string>;
  loadResource(relPath: string, contentType: 'text'): Observable<string>;
  loadResource(relPath: string, contentType: 'json'): Observable<unknown>;
  loadResource(relPath: string, contentType: 'blob'): Observable<Blob>;
  loadResource(relPath: string, contentType: 'arraybuffer'): Observable<ArrayBuffer>;
  /**
   * Fetches a resource relative to the public assets folder, caching the observable per type.
   */
  loadResource(relPath: string, contentType: ContentType = 'text'): Observable<any> {
    const url = this.resolvePublicUrl(relPath);
    const key = `${contentType}::${url}`;

    let cached = this.cache.get(key) as Observable<any> | undefined;
    if (cached) return cached;

    // Choose the correct responseType + return type
    let request$: Observable<any>;
    switch (contentType) {
      case 'text':
        request$ = this.http.get(url, { responseType: 'text' }).pipe(shareReplay(1));
        break;
      case 'blob':
        request$ = this.http.get(url, { responseType: 'blob' }).pipe(shareReplay(1));
        break;
      case 'arraybuffer':
        request$ = this.http.get(url, { responseType: 'arraybuffer' }).pipe(shareReplay(1));
        break;
      case 'json':
      default:
        // Default Angular typing for JSON (can be narrowed by callers with generics)
        request$ = this.http.get(url).pipe(shareReplay(1));
        break;
    }

    this.cache.set(key, request$);
    return request$;
  }

  /** Clears the cache for a specific resource+type (or everything if not provided). */
  clearCache(relPath?: string, contentType?: ContentType): void {
    if (!relPath) {
      this.cache.clear();
      return;
    }
    const url = this.resolvePublicUrl(relPath);
    if (contentType) {
      this.cache.delete(`${contentType}::${url}`);
    } else {
      // Remove all entries for this URL
      for (const k of Array.from(this.cache.keys())) {
        if (k.endsWith(`::${url}`)) this.cache.delete(k);
      }
    }
  }

  /** Resolves a URL relative to the app's base href so it works under subpaths. */
  private resolvePublicUrl(relPath: string): string {
    // If caller passes "/..." treat it as already rooted at the deploy base
    if (relPath.startsWith('/')) {
      // Combine with base href if provided
      const base = this.getBaseUri();
      return new URL(relPath.replace(/^\//, ''), base).toString();
    }
    // Normal case: relative to base URI
    return new URL(relPath, this.getBaseUri()).toString();
  }

  /**
   * Determines the base URI used for resolving relative asset paths.
   */
  private getBaseUri(): string {
    // Prefer document.baseURI in browser; fall back to APP_BASE_HREF; then '/'
    const fromDoc = this.doc?.baseURI;
    const base = (fromDoc || this.baseHref || '/');
    // Ensure it ends with a slash for URL resolution semantics
    return base.endsWith('/') ? base : base + '/';
  }
}
