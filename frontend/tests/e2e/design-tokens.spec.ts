import { expect, test } from '@playwright/test';

/**
 * Guards the badge palette against contrast regressions.
 *
 * Every semantic badge colour was once picked ad-hoc per component, and because
 * that work happened in dark mode the light-mode variants were never checked —
 * they measured 1.7–3.5 against a 4.5 requirement. The tones are centralised in
 * `lib/issue-meta.ts` now; this pins them so the next hand-rolled recipe fails
 * here instead of shipping.
 */

// Every class string the app uses for a semantic badge, mirroring issue-meta.ts.
const RECIPES: [string, string][] = [
  ['BADGE_TONE.success', 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/20'],
  ['BADGE_TONE.info', 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/20'],
  ['BADGE_TONE.warning', 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/20'],
  ['BADGE_TONE.danger', 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/20'],
  ['TEXT_TONE.success', 'text-emerald-700 dark:text-emerald-400'],
  ['TEXT_TONE.warning', 'text-amber-700 dark:text-amber-400'],
  ['TEXT_TONE.danger', 'text-red-700 dark:text-red-400'],
  ['STATUS NEW', 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300'],
  ['STATUS IN_PROGRESS', 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300'],
  ['STATUS ON_HOLD', 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-400/15 dark:text-slate-300'],
  ['STATUS RESOLVED', 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300'],
  ['STATUS CLOSED', 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-400/12 dark:text-zinc-400'],
  ['STATUS REOPENED', 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300'],
  ['PRIORITY LOW', 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-400/15 dark:text-slate-300'],
  ['PRIORITY MEDIUM', 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300'],
  ['PRIORITY HIGH', 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300'],
  ['PRIORITY CRITICAL', 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300'],
];

test.describe('badge palette contrast (WCAG AA)', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`all semantic badge tones pass AA in ${theme} mode`, async ({ page }) => {
      // The sign-in page loads the same stylesheet, so no login is needed — and
      // POST /api/auth/login is throttled to 10/min, which the rest of the suite
      // already nearly exhausts.
      await page.goto('/staff');
      await page.waitForLoadState('networkidle');
      await page.evaluate((t) => {
        localStorage.setItem('vite-ui-theme', t);
        document.documentElement.classList.toggle('dark', t === 'dark');
      }, theme);
      await page.waitForTimeout(300);

      const results = await page.evaluate((recipes) => {
        // Resolve any CSS colour — including the oklch() the tokens use, which
        // Chrome keeps verbatim in computed styles — by painting one pixel.
        const cv = document.createElement('canvas');
        cv.width = 1; cv.height = 1;
        const ctx = cv.getContext('2d', { willReadFrequently: true })!;
        const parse = (s: string) => {
          if (!s || s === 'transparent') return null;
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = '#000000';
          const before = ctx.fillStyle;
          ctx.fillStyle = s;
          if (ctx.fillStyle === before && !/^(#000000|rgb\(0, 0, 0\))$/.test(s)) return null;
          ctx.fillRect(0, 0, 1, 1);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          const a = d[3] / 255;
          return a === 0 ? null : { rgb: [d[0], d[1], d[2]], a };
        };
        const srgb = (c: number) => {
          const v = c / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        const lum = (c: number[]) => 0.2126 * srgb(c[0]) + 0.7152 * srgb(c[1]) + 0.0722 * srgb(c[2]);
        const over = (fg: number[], bg: number[], a: number) => fg.map((c, i) => c * a + bg[i] * (1 - a));

        const host = document.createElement('div');
        host.className = 'bg-background';
        host.style.cssText = 'position:fixed;left:0;top:0;z-index:99999';
        document.body.appendChild(host);

        const out: { name: string; ratio: number }[] = [];
        for (const [name, cls] of recipes) {
          const el = document.createElement('span');
          el.className = `${cls} inline-block px-2 py-0.5 text-xs`;
          el.textContent = 'Sample';
          host.appendChild(el);

          const cs = getComputedStyle(el);
          const pageBg = parse(getComputedStyle(document.body).backgroundColor)!.rgb;
          const own = parse(cs.backgroundColor);
          const bg = own ? over(own.rgb, pageBg, own.a) : pageBg;
          const fgp = parse(cs.color)!;
          const fg = fgp.a < 1 ? over(fgp.rgb, bg, fgp.a) : fgp.rgb;
          const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
          out.push({ name, ratio: Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100 });
        }
        host.remove();
        return out;
      }, RECIPES);

      const failures = results.filter((r) => r.ratio < 4.5);
      expect(
        failures,
        `Below AA (4.5:1) in ${theme}: ${failures.map((f) => `${f.name}=${f.ratio}`).join(', ')}`,
      ).toEqual([]);
    });
  }
});
