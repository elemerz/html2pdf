import { APP_INITIALIZER, Provider } from '@angular/core';

/**
 * Preloads managed .woff2 fonts so Quill can immediately render selected font families.
 * Fonts are also declared via @font-face in styles.less; this initializer eagerly loads them.
 */
function preloadManagedFonts(): Promise<void> {
  if (typeof document === 'undefined' || !(document as any).fonts) {
    return Promise.resolve();
  }

  // Dynamically collect any @font-face declarations that reference /managed-fonts/*.woff2
  const discovered: Array<{ family: string; url: string; descriptors?: FontFaceDescriptors }> = [];
  const seen = new Set<string>();
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try { rules = sheet.cssRules; } catch { continue; } // cross-origin / inaccessible
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule) {
        const src = rule.style.getPropertyValue('src');
        if (src && src.includes('/managed-fonts/') && src.includes('.woff2')) {
          const famRaw = rule.style.getPropertyValue('font-family').trim();
          const fam = famRaw.replace(/^['"]|['"]$/g, '');
          if (!seen.has(fam)) {
            // Extract first managed-fonts url
            const match = src.match(/url\(([^)]+)\)/);
            const url = match ? match[1].replace(/['"]/g, '') : '';
            if (url) {
              discovered.push({ family: fam, url });
              seen.add(fam);
            }
          }
        }
      }
    }
  }
  // Fallback: if no fonts discovered (e.g. styles not yet parsed), attempt known files
  if (!discovered.length) {
    const fallbackFiles = ['KIXBarcode.woff2', 'Roboto-Regular.woff2', 'PublicSans-Regular.woff2'];
    for (const file of fallbackFiles) {
      const fam = file.split('.')[0].replace(/[-_](Regular|Bold|Medium|Light|Italic)$/i, '');
      if (!seen.has(fam)) {
        discovered.push({ family: fam === 'KIXBarcode' ? 'KIX Barcode' : fam, url: `/managed-fonts/${file}` });
        seen.add(fam);
      }
    }
  }
  const loads = discovered.map(meta => {
    try {
      const face = new FontFace(meta.family, `url(${meta.url})`, meta.descriptors);
      return face.load().then(f => { (document as any).fonts.add(f); });
    } catch { return Promise.resolve(); }
  });
  return Promise.all(loads).then(() => void 0);
}

export const MANAGED_FONTS_PRELOAD_PROVIDER: Provider = {
  provide: APP_INITIALIZER,
  multi: true,
  // Factory waits a tick to allow other preloaders (e.g., A4 styles) to inject @font-face rules
  useFactory: () => () => new Promise<void>(resolve => {
    // Schedule after microtasks so a4-common-styles.css has been loaded & parsed
    setTimeout(() => { preloadManagedFonts().then(resolve).catch(() => resolve()); }, 0);
  })
};
