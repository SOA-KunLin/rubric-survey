import { SiteConfig } from './types';

/** Apply the site theme from survey config: preset via data-theme + optional custom CSS vars. */
export function applyTheme(site?: SiteConfig | null) {
  if (typeof document === 'undefined') return;
  const theme = site?.theme || 'light';
  document.documentElement.dataset.theme = theme;
  const root = document.documentElement.style;
  // reset custom overrides first
  for (const v of ['--bg', '--card', '--ink', '--muted', '--line', '--brand', '--brand-soft']) {
    root.removeProperty(v);
  }
  if (site?.themeColors) {
    for (const [k, v] of Object.entries(site.themeColors)) {
      root.setProperty(k.startsWith('--') ? k : `--${k}`, v);
    }
  }
}
