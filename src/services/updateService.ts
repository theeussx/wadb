import { APP } from '../config/app';

const RELEASES_API = 'https://api.github.com/repos/theeussx/wadb/releases/latest';
const TAGS_API = 'https://api.github.com/repos/theeussx/wadb/tags?per_page=1';
const REPOSITORY_URL = 'https://github.com/theeussx/wadb';

export interface UpdateInfo {
  version: string;
  url: string;
  name: string | null;
}

function versionParts(version: string): [number, number, number] | null {
  const match = version.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

export function isNewerVersion(current: string, latest: string): boolean {
  const currentParts = versionParts(current);
  const latestParts = versionParts(latest);
  if (!currentParts || !latestParts) return false;
  for (let i = 0; i < currentParts.length; i += 1) {
    if (latestParts[i] !== currentParts[i]) return latestParts[i] > currentParts[i];
  }
  return false;
}

/**
 * Checks release metadata only. It never downloads or installs an update.
 * A failed/offline check is intentionally silent so the app remains local-first.
 */
export async function checkForUpdate(currentVersion = APP.version): Promise<UpdateInfo | null> {
  const requestInit: RequestInit = {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(8000),
  };
  const response = await fetch(RELEASES_API, requestInit);
  let data: {
    tag_name?: unknown;
    name?: unknown;
    html_url?: unknown;
    draft?: unknown;
    prerelease?: unknown;
  } = response.ok ? await response.json() : {};
  if (!response.ok && response.status === 404) {
    const tagsResponse = await fetch(TAGS_API, requestInit);
    if (tagsResponse.ok) {
      const tags = (await tagsResponse.json()) as Array<{ name?: unknown }>;
      const tag = tags[0]?.name;
      if (typeof tag === 'string') {
        data = { tag_name: tag, html_url: `${REPOSITORY_URL}/tree/${tag}` };
      }
    }
  }
  const version = typeof data.tag_name === 'string' ? data.tag_name.replace(/^v/i, '') : '';
  const url = typeof data.html_url === 'string' ? data.html_url : '';
  if (!version || !url || data.draft === true || data.prerelease === true || !isNewerVersion(currentVersion, version)) {
    return null;
  }
  return {
    version,
    url,
    name: typeof data.name === 'string' && data.name.trim() ? data.name : null,
  };
}
