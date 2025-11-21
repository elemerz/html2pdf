import { APP_INITIALIZER, Provider, inject } from '@angular/core';
import { ResourceLoaderService } from '../services/resource-loader-service';
import { DesignerStateService } from '../services/designer-state.service';
import { firstValueFrom } from 'rxjs';

async function preloadA4Styles(): Promise<void> {
  const loader = inject(ResourceLoaderService);
  const designer = inject(DesignerStateService);
  try {
    const rawCss = await firstValueFrom(loader.loadResource('styles/a4-common-styles.css', 'text'));
    const normalizedCss = rawCss
      .replace(
        /\/\* MARGINS: __TOP__ __RIGHT__ __BOTTOM__ __LEFT__ \*\//g,
        'margin: 0 0 0 0;'
      )
      .replace(/margin:\s*0\s*\/\*[^*]*\*\/;/g, 'margin: 0 0 0 0;');
    designer.setA4CommonStyles(normalizedCss, rawCss);
  } catch (err) {
    console.warn('[A4StylesPreload] Failed to load a4-common-styles.css, using fallback.', err);
  }
}

export const A4_STYLES_PRELOAD_PROVIDER: Provider = {
  provide: APP_INITIALIZER,
  multi: true,
  useFactory: () => preloadA4Styles
};
