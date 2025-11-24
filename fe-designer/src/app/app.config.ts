import {
  ApplicationConfig,
  importProvidersFrom,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

import { routes } from './app.routes';
import { A4_STYLES_PRELOAD_PROVIDER } from './core/startup/a4-styles.preload';
import { MANAGED_FONTS_PRELOAD_PROVIDER } from './core/startup/managed-fonts.preload';
import {QuillModule} from 'ngx-quill';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi()),
    importProvidersFrom(QuillModule.forRoot()),
    A4_STYLES_PRELOAD_PROVIDER,
    MANAGED_FONTS_PRELOAD_PROVIDER
  ]
};
