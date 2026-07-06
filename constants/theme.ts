import { Platform } from 'react-native';

import { rootineThemes } from './rootine-theme';

export const Colors = {
  light: {
    text: rootineThemes.light.colors.text,
    background: rootineThemes.light.colors.background,
    tint: rootineThemes.light.colors.primary,
    icon: rootineThemes.light.colors.textMuted,
    tabIconDefault: rootineThemes.light.colors.textSubtle,
    tabIconSelected: rootineThemes.light.colors.primary,
  },
  dark: {
    text: rootineThemes.dark.colors.text,
    background: rootineThemes.dark.colors.background,
    tint: rootineThemes.dark.colors.primary,
    icon: rootineThemes.dark.colors.textMuted,
    tabIconDefault: rootineThemes.dark.colors.textSubtle,
    tabIconSelected: rootineThemes.dark.colors.primary,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
