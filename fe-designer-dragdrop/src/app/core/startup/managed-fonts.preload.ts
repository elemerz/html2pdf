import { APP_INITIALIZER, Provider } from '@angular/core';

/**
 * Preloads managed .woff2 fonts so Quill can immediately render selected font families.
 * Fonts are also declared via @font-face in styles.less; this initializer eagerly loads them.
 */
function preloadManagedFonts(): Promise<void> {
  if (typeof document === 'undefined' || !(document as any).fonts) {
    return Promise.resolve();
  }

  const fonts: Array<{ family: string; url: string; descriptors?: FontFaceDescriptors }> = [
    { family: 'KIX Barcode', url: '/managed-fonts/KIXBarcode.woff2', descriptors: { style: 'normal', weight: '400' } },
    { family: 'Roboto', url: '/managed-fonts/Roboto-Regular.woff2', descriptors: { style: 'normal', weight: '400' } }
  ];

  const loads = fonts.map(meta => {
    try {
      const face = new FontFace(meta.family, `url(${meta.url})`, meta.descriptors);
      return face.load().then(f => { (document as any).fonts.add(f); });
    } catch {
      return Promise.resolve();
    }
  });

  return Promise.all(loads).then(() => void 0);
}

export const MANAGED_FONTS_PRELOAD_PROVIDER: Provider = {
  provide: APP_INITIALIZER,
  multi: true,
  useFactory: () => preloadManagedFonts
};
