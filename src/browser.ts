type BrowserNavigator = {
  userAgent?: string;
  userAgentData?: { brands?: readonly { brand: string }[] };
};

/** Selects browser-specific instructions; access checks still use extension APIs. */
export function getBrowserInfo(info: BrowserNavigator = globalThis.navigator ?? {}) {
  const isEdge =
    info.userAgentData?.brands?.some(({ brand }) => brand === 'Microsoft Edge') ||
    /\bEdg\//.test(info.userAgent ?? '');

  return isEdge
    ? ({ id: 'edge', name: 'Microsoft Edge', extensionsUrl: 'edge://extensions' } as const)
    : ({ id: 'chrome', name: 'Chrome', extensionsUrl: 'chrome://extensions' } as const);
}
