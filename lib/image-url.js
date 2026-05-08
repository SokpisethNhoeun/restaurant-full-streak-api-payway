const FALLBACK_IMAGE = '/logo.png';
const MENU_IMAGE_PROXY_PREFIX = '/api/public/uploads/menu-images/';

export function displayImageUrl(url) {
  const value = String(url || '').trim();
  if (!value) return FALLBACK_IMAGE;

  const proxyPath = menuImageProxyPath(value);
  if (proxyPath) {
    return proxyPath;
  }

  return value;
}

export function replaceBrokenImage(event) {
  if (event.currentTarget.src.endsWith(FALLBACK_IMAGE)) return;
  event.currentTarget.src = FALLBACK_IMAGE;
}

function menuImageProxyPath(value) {
  try {
    const parsed = new URL(value);
    return publicUploadPath(parsed.pathname);
  } catch {
    return publicUploadPath(value);
  }
}

function publicUploadPath(path) {
  const parts = pathParts(path);
  const prefixParts = MENU_IMAGE_PROXY_PREFIX.split('/').filter(Boolean);
  if (parts.length !== prefixParts.length + 1) return '';
  const hasUploadPrefix = prefixParts.every((part, index) => parts[index] === part);
  if (!hasUploadPrefix) return '';
  return proxyPathForObjectName(parts[prefixParts.length]);
}

function pathParts(path) {
  return String(path || '')
    .split('?')[0]
    .split('#')[0]
    .split('/')
    .filter(Boolean)
    .map(safeDecode);
}

function proxyPathForObjectName(objectName) {
  if (!objectName || objectName.includes('\\') || objectName.includes('/') || objectName.includes('..')) {
    return '';
  }
  return `${MENU_IMAGE_PROXY_PREFIX}${encodeURIComponent(objectName)}`;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
