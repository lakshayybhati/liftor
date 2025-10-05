// Red Theme Pack
export const theme = {
  color: {
    bg: "#0C0C0D",
    card: "#131316",
    ink: "#F7F7F8",
    muted: "#A6A6AD",
    line: "#26262B",
    accent: {
      primary: "#FF4444",
      green: "#7EE08A",
      yellow: "#FFD25E",
      blue: "#6FB7FF"
    },
    luxe: {
      champagne: "#FF6666",
      orchid: "#D78BEB",
      hairline: "#2A2A30",
      specular: "#FFFFFF12"
    }
  },
  radius: {
    md: 24,
    lg: 28,
    pill: 999
  },
  space: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48
  },
  font: {
    display: "Space Grotesk",
    ui: "Inter"
  },
  size: {
    h1: 44,
    h2: 30,
    body: 16,
    label: 12
  },
  motion: {
    pressScale: 0.96,
    enterMs: 240
  }
};

// Legacy support
const tintColorLight = theme.color.accent.primary;

export default {
  light: {
    text: theme.color.ink,
    background: theme.color.bg,
    tint: tintColorLight,
    tabIconDefault: theme.color.muted,
    tabIconSelected: tintColorLight,
  },
};