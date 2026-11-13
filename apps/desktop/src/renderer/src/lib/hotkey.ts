/** 'Alt+Q' → 'Alt + Q'，只用于界面显示；真值仍是 accelerator 字符串 */
export function formatHotkey(accel: string): string {
  return accel
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' + ')
}
