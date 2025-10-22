import { APP_INITIALIZER, Provider, inject } from '@angular/core';
import { ResourceLoaderService } from '../services/resource-loader-service';
import { DesignerStateService } from '../services/designer-state.service';
import { firstValueFrom } from 'rxjs';

async function preloadA4Styles(): Promise<void> {
  const loader = inject(ResourceLoaderService);
  const designer = inject(DesignerStateService);
  try {
    const css = await firstValueFrom(loader.loadResource('a4-common-styles.css', 'text'));
    designer.setA4CommonStyles(css);
  } catch (err) {
    console.warn('[A4StylesPreload] Failed to load a4-common-styles.css, using fallback.', err);
  }
}

export const A4_STYLES_PRELOAD_PROVIDER: Provider = {
  provide: APP_INITIALIZER,
  multi: true,
  useFactory: () => preloadA4Styles
};
