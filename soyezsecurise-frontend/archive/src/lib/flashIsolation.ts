import type { ExternalHosts } from '../types';

// These hosts serve the application and its authenticated services. Contributor
// code must never receive allowlist access, even through a different subdomain.
const protectedHosts = ['soyezsecurise.com'];
function protectedHost(host: string, roots: readonly string[]) {
  return roots.some(root => host === root || host.endsWith(`.${root}`));
}
export function externalHostError(hosts: ExternalHosts | undefined): string | undefined {
  const roots = [...protectedHosts, ...(import.meta.env?.VITE_ARCHIVE_PROTECTED_HOSTS ?? '').split(',').map((host: string) => host.trim().toLowerCase()).filter(Boolean)];
  if (typeof location !== 'undefined') roots.push(location.hostname.toLowerCase());
  const api = import.meta.env?.VITE_ARCHIVE_API_URL;
  if (api) { try { roots.push(new URL(api).hostname.toLowerCase()); } catch { return 'Invalid Archive API configuration'; } }
  for (const origins of Object.values(hosts ?? {})) {
    for (const origin of origins) {
      try {
        if (!/^https:\/\/[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?(?::[0-9]{1,5})?$/.test(origin)) return 'Invalid external origin';
        const host = new URL(origin).hostname.toLowerCase().replace(/\.$/, '');
        if (protectedHost(host, roots)) return 'Flash external hosts cannot include application or authentication hosts';
      } catch { return 'Invalid external origin'; }
    }
  }
}

const sensitiveFeatures = [
  'accelerometer', 'ambient-light-sensor', 'autoplay', 'bluetooth', 'browsing-topics',
  'camera', 'clipboard-read', 'clipboard-write', 'compute-pressure', 'display-capture',
  'encrypted-media', 'fullscreen', 'gamepad', 'geolocation', 'gyroscope', 'hid',
  'identity-credentials-get', 'idle-detection', 'keyboard-map', 'local-fonts',
  'magnetometer', 'microphone', 'midi', 'otp-credentials', 'payment', 'picture-in-picture',
  'publickey-credentials-create', 'publickey-credentials-get', 'screen-wake-lock',
  'serial', 'speaker-selection', 'storage-access', 'usb', 'web-share',
  'window-management', 'xr-spatial-tracking',
];
export function framePermissions(): string {
  const policy = (document as Document & { featurePolicy?: { features(): string[] } }).featurePolicy;
  // Deny every feature known to this browser, including future features exposed
  // by its policy API. Keep explicit denials when feature enumeration is absent.
  const features = policy ? policy.features() : sensitiveFeatures;
  return [...new Set(features)].map(feature => `${feature} 'none'`).join('; ');
}
export function supportsFlashIsolation(): boolean {
  return typeof HTMLIFrameElement !== 'undefined' && 'credentialless' in HTMLIFrameElement.prototype;
}
