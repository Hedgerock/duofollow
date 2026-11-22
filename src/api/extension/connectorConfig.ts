import { getBrowserInfo } from '@duofollow/src/browser';

/** Edge may use a separate store ID; unpacked installs can share the default ID. */
export function getConnectorExtensionId(): string {
  const defaultId = import.meta.env.VITE_DUOFOLLOW_EXTENSION_ID?.trim() || '';
  if (getBrowserInfo().id !== 'edge') return defaultId;
  return import.meta.env.VITE_DUOFOLLOW_EDGE_EXTENSION_ID?.trim() || defaultId;
}
