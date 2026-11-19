/**
 * 主题变量：内置卡直接用 CSS 变量，第三方组件通过 tokens 对象拿同一份值。
 * 加新变量时只改这里，WebWidget / TemplateWidget 都跟着走。
 */
export const THEME_TOKENS = [
  '--sans',
  '--serif',
  '--hue',
  '--tint-s',
  '--accent-h',
  '--glass-alpha',
  '--atmo-k',
  '--halo-k',
  '--grain-k',
  '--accent',
  '--accent-pale',
  '--accent-wash',
  '--accent-ink',
  '--accent-2',
  '--accent-soft',
  '--accent-glow',
  '--ink',
  '--ink-soft',
  '--ink-dim',
  '--ink-faint',
  '--mint',
  '--apricot',
  '--ease-out',
  '--ease-soft',
  '--radius',
  '--radius-card'
] as const

export function readTokens(): Record<string, string> {
  if (typeof document === 'undefined') return {}
  const style = getComputedStyle(document.documentElement)
  const tokens: Record<string, string> = {}
  for (const name of THEME_TOKENS) tokens[name] = style.getPropertyValue(name).trim()
  return tokens
}
