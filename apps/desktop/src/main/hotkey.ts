import { globalShortcut } from 'electron'

let hotkeyAccel: string | null = null
let escapeBound = false

/** 绑定唤出热键；换键失败时把旧键恢复回来，不留下「热键全没了」的状态 */
export function bindHotkey(accel: string, handler: () => void): boolean {
  if (hotkeyAccel === accel && globalShortcut.isRegistered(accel)) return true
  const previous = hotkeyAccel
  if (previous) {
    globalShortcut.unregister(previous)
    hotkeyAccel = null
  }
  let ok = false
  try {
    ok = globalShortcut.register(accel, handler)
  } catch (error) {
    console.error('[sill] 热键注册异常：', error)
  }
  if (ok) {
    hotkeyAccel = accel
    return true
  }
  console.error(`[sill] 热键 ${accel} 被其他程序占用，保留原热键`)
  if (previous) {
    try {
      if (globalShortcut.register(previous, handler)) hotkeyAccel = previous
    } catch (error) {
      console.error('[sill] 恢复原热键失败：', error)
    }
  }
  return false
}

/**
 * 面板显示期间临时接管 Esc。
 * 面板不抢焦点，所以 Esc 收不到窗口的 keydown，只能全局注册；
 * 面板一收起就立刻解绑，不长期占着系统按键。
 */
export function bindEscape(handler: () => void): void {
  if (escapeBound) return
  escapeBound = globalShortcut.register('Escape', handler)
  if (!escapeBound) console.error('[sill] Esc 被其他程序占用，只能用热键或托盘收起')
}

export function unbindEscape(): void {
  if (!escapeBound) return
  globalShortcut.unregister('Escape')
  escapeBound = false
}

export function disposeHotkeys(): void {
  globalShortcut.unregisterAll()
  hotkeyAccel = null
  escapeBound = false
}
