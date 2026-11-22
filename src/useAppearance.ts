import { useEffect, useRef, useState } from 'react';

export const fontSizes = { standard: 1, large: 1.125, 'extra-large': 1.25 } as const;
export const fontFamilies = ['system', 'wide', 'serif'] as const;

type FontSize = keyof typeof fontSizes;
type FontFamily = (typeof fontFamilies)[number];

interface Appearance {
  fontSize: FontSize;
  fontFamily: FontFamily;
  colorVision: boolean;
  tooltips: boolean;
}

const storageKey = 'duofollow.appearance';
const defaults: Appearance = {
  fontSize: 'standard',
  fontFamily: 'system',
  colorVision: false,
  tooltips: true,
};

function readAppearance(): Appearance {
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(storageKey) ?? 'null',
    ) as Partial<Appearance> | null;
    const { fontSize, fontFamily, colorVision, tooltips } = saved ?? {};
    return {
      fontSize:
        typeof fontSize === 'string' && Object.hasOwn(fontSizes, fontSize)
          ? fontSize
          : defaults.fontSize,
      fontFamily:
        fontFamily && fontFamilies.includes(fontFamily) ? fontFamily : defaults.fontFamily,
      colorVision: colorVision === true,
      tooltips: tooltips !== false,
    };
  } catch {
    return defaults;
  }
}

export function useAppearance() {
  const [appearance, setAppearance] = useState(readAppearance);
  const initialAppearance = useRef(appearance);

  useEffect(() => {
    if (appearance === initialAppearance.current) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(appearance));
    } catch {
      // The preferences still apply to the current page.
    }
  }, [appearance]);

  function updateAppearance(change: Partial<Appearance>) {
    setAppearance((previous) => ({ ...previous, ...change }));
  }

  return { appearance, updateAppearance };
}
