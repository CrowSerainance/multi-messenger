import { useMemo } from 'react';

import {
  useColorScheme,
} from 'react-native';

/**
 * Light and dark palettes.
 *
 * The app follows the system appearance: `useColorScheme()` picks
 * the palette, and screens build their styles through
 * `useThemedStyles` so a change of appearance restyles them without
 * a reload. Do not read `colors` inside a `StyleSheet.create` at
 * module scope — that snapshot is evaluated once and would stay
 * light forever.
 */

export const lightColors = {
  background: '#F4F6F8',
  surface: '#FFFFFF',
  surfacePressed: '#EEF2FF',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  text: '#0F172A',
  textMuted: '#64748B',
  textSubtle: '#94A3B8',
  primary: '#0A7CFF',
  primaryPressed: '#0866D6',
  primarySoft: '#E8F2FF',
  primaryBorder: '#BFDBFE',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  success: '#059669',
  successSoft: '#D1FAE5',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  neutralSoft: '#E2E8F0',
  overlay: 'rgba(15, 23, 42, 0.45)',
  /** Full-screen busy/switching veil over content. */
  scrim: 'rgba(255, 255, 255, 0.82)',
} as const;

export type ThemeColors = {
  [Key in keyof typeof lightColors]: string;
};

export const darkColors: ThemeColors = {
  background: '#0B1220',
  surface: '#141C2B',
  surfacePressed: '#1B2740',
  border: '#243146',
  borderStrong: '#33415C',
  text: '#E8EEF9',
  textMuted: '#9AA8BE',
  textSubtle: '#6B7A93',
  primary: '#4CA0FF',
  primaryPressed: '#3B84D9',
  primarySoft: '#152740',
  primaryBorder: '#27466F',
  danger: '#F87171',
  dangerSoft: '#3A1B1F',
  success: '#34D399',
  successSoft: '#0F2E26',
  warning: '#FBBF24',
  warningSoft: '#33280F',
  neutralSoft: '#243146',
  overlay: 'rgba(2, 6, 23, 0.62)',
  scrim: 'rgba(11, 18, 32, 0.86)',
};

export type ThemeName = 'light' | 'dark';

export function useThemeName(): ThemeName {
  return useColorScheme() === 'dark'
    ? 'dark'
    : 'light';
}

export function useThemeColors(): ThemeColors {
  return useThemeName() === 'dark'
    ? darkColors
    : lightColors;
}

/**
 * Builds a StyleSheet for the active appearance. Pass a
 * module-level factory so the memo key stays stable.
 */
export function useThemedStyles<T>(
  factory: (colors: ThemeColors) => T,
): T {
  const themeColors = useThemeColors();

  return useMemo(
    () => factory(themeColors),
    [factory, themeColors],
  );
}

/**
 * Light palette kept as the module-level default for code that
 * cannot use hooks. Prefer `useThemeColors()` in components.
 */
export const colors: ThemeColors = lightColors;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;
