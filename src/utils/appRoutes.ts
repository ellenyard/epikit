/**
 * One address per tool: linelist.org/app/epicurve/, /app/maps/ and so on.
 *
 * The app used to stay at /app/ whatever tool was open, so a link could only
 * ever open the home screen, the browser's Back button left the app instead of
 * returning to the previous tool, and page analytics could not tell which
 * tools were used. These paths fix all three.
 *
 * The site is static (GitHub Pages), so each path must exist as a file. The
 * build copies app/index.html into a folder per tool (see vite.config.ts),
 * using TOOL_SLUGS below, which keeps the list of folders and the router in
 * step.
 */

/** Every screen of the app. 'dashboard' is the home screen at /app/. */
export type AppModule = 'dashboard' | 'review' | 'epicurve' | 'maps' | 'analysis' | 'visualize';

/** Path segment for each tool, in navigation order. */
export const TOOL_SLUGS = {
  review: 'review',
  epicurve: 'epicurve',
  maps: 'maps',
  analysis: 'analysis',
  visualize: 'visualize',
} as const satisfies Record<Exclude<AppModule, 'dashboard'>, string>;

export const APP_BASE_PATH = '/app/';

/** The address for a module, always with a trailing slash. */
export function pathForModule(module: AppModule): string {
  return module === 'dashboard' ? APP_BASE_PATH : `${APP_BASE_PATH}${TOOL_SLUGS[module]}/`;
}

/**
 * The module an address points to, or null when it is not an app address.
 *
 * Accepts the path with or without a trailing slash or index.html, in any
 * letter case, since people retype links from slides and messages. An
 * unknown segment under /app/ opens the home screen rather than failing.
 */
export function moduleFromPath(pathname: string): AppModule | null {
  const clean = pathname.toLowerCase().replace(/\/index\.html$/, '/').replace(/\/+$/, '');
  if (clean === '/app') return 'dashboard';
  if (!clean.startsWith('/app/')) return null;
  const segment = clean.slice('/app/'.length).split('/')[0];
  const match = (Object.keys(TOOL_SLUGS) as (keyof typeof TOOL_SLUGS)[])
    .find((module) => TOOL_SLUGS[module] === segment);
  return match ?? 'dashboard';
}
