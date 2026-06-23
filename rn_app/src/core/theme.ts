export const Colors = {
  // Brand (exact design colors)
  green: '#2fc665',   greenDark: '#23a052',
  blue: '#2f6bfe',    blueDark: '#1f50c9',
  purple: '#8b5cf6',  purpleDark: '#6d3fd6',
  // Utility
  teal: '#2fd0c0',    amber: '#ffc83d',
  orange: '#ff8a3d',  red: '#ff4d5e',
  ink: '#16204a',
  // Surface
  bg: '#f5f7fa',      surface: '#ffffff',
  border: '#e8ecf5',  muted: '#8a92ab',
  track: '#eef1f8',
  // Game accents (unchanged from existing screens)
  duel: '#6366F1',    sprint: '#14B8A6',
  compound: '#8B5CF6', daily: '#F59E0B',
};

export const Radius = {
  card: 16,
  button: 16,
  chip: 10,
  pill: 999,
};

export const Shadow3D = (color: string) => ({
  shadowColor: color,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 1,
  shadowRadius: 0,
  elevation: 4,
});

export const Font = {
  display: 'Baloo2_700Bold',
  displayMedium: 'Baloo2_600SemiBold',
  body: 'Nunito_600SemiBold',
  bodyRegular: 'Nunito_400Regular',
};

export const XP_LEVEL_THRESHOLDS = [0, 500, 1500, 3000, 5500, 9000, 14000, 21000, 30000, 42000];

export function xpToLevel(totalXp: number): number {
  let level = 1;
  for (let i = 0; i < XP_LEVEL_THRESHOLDS.length; i++) {
    if (totalXp >= XP_LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return level;
}

export function xpProgressInLevel(totalXp: number): { current: number; needed: number; pct: number } {
  const level = xpToLevel(totalXp);
  const idx = level - 1;
  const start = XP_LEVEL_THRESHOLDS[idx] ?? 0;
  const end = XP_LEVEL_THRESHOLDS[idx + 1] ?? XP_LEVEL_THRESHOLDS[idx] + 10000;
  const current = totalXp - start;
  const needed = end - start;
  return { current, needed, pct: Math.min(1, current / needed) };
}
