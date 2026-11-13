import type { Theme } from '../../../shared/theme'

/**
 * Theme → CSS 变量。所有玻璃层只认这 7 个数字，
 * 所以换主题 = 改这 7 个值，不重排 DOM、不换贴图。
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  const style = root.style

  style.setProperty('--hue', String(theme.hue))
  style.setProperty('--tint-s', `${theme.tintSat}%`)
  style.setProperty('--accent-h', String(theme.accentHue))
  style.setProperty('--glass-alpha', (0.28 + (theme.glassOpacity / 100) * 0.55).toFixed(3))
  style.setProperty('--atmo-k', (theme.atmosphere ? theme.atmoStrength / 100 : 0).toFixed(3))
  style.setProperty('--halo-k', (theme.halo ? theme.haloStrength / 100 : 0).toFixed(3))
  style.setProperty('--grain-k', theme.grain ? '1' : '0')
  root.dataset.atmo = theme.atmoStyle
}
