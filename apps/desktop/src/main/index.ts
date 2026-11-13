import './paths'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Menu, app } from 'electron'
import { applyAutostart } from './autostart'
import { bindHotkey, disposeHotkeys } from './hotkey'
import { registerIpc } from './ipc'
import {
  createPanel,
  getPanelWindow,
  hidePanel,
  isPanelVisible,
  reanchor,
  showPanel
} from './panel'
import { loadSettings, updateSettings, type Settings } from './settings'
import { createTray, destroyTray, refreshTray } from './tray'
import { checkForUpdates } from './updates'
import type { UpdateState } from '../shared/update'

const SMOKE = process.argv.includes('--smoke')

app.setAppUserModelId('com.sill.app')

const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (app.isReady()) showPanel()
  })
  app.whenReady().then(boot).catch((error) => {
    console.error('[sill] 启动失败：', error)
    app.quit()
  })
}

// 面板只隐藏不关闭；托盘常驻，所以任何窗口关闭都不退出
app.on('window-all-closed', () => {})

app.on('before-quit', () => {
  disposeHotkeys()
  destroyTray()
})

function onToggle(): void {
  if (isPanelVisible()) hidePanel()
  else showPanel()
}

/** 换热键：先试着注册，失败就保留旧键、不写盘 */
function changeHotkey(accel: string): { ok: boolean; hotkey: string } {
  const next = accel.trim()
  if (!next) return { ok: false, hotkey: loadSettings().hotkey }
  if (!bindHotkey(next, onToggle)) return { ok: false, hotkey: loadSettings().hotkey }
  updateSettings({ hotkey: next })
  refreshTray()
  return { ok: true, hotkey: next }
}

/** 设置变更后贴到系统上的副作用（自启、置顶、停靠边、托盘菜单） */
function applySideEffects(settings: Settings, patch: Partial<Settings>): void {
  if ('startAtLogin' in patch) applyAutostart(settings.startAtLogin)
  if ('side' in patch) reanchor()
  if ('autoUpdate' in patch && settings.autoUpdate) {
    void checkForUpdates().then(publishUpdate)
  }
  refreshTray()
}

function publishUpdate(state: UpdateState): void {
  getPanelWindow()?.webContents.send('update:state', state)
}

/** 启动 15 秒后查一次，之后每 6 小时一次；关掉自动检查就跳过 */
function scheduleUpdateChecks(): void {
  const run = async (): Promise<void> => {
    if (!loadSettings().autoUpdate) return
    publishUpdate(await checkForUpdates())
  }
  setTimeout(() => void run(), 15000)
  setInterval(() => void run(), 6 * 60 * 60 * 1000)
}

async function boot(): Promise<void> {
  const settings = loadSettings()

  Menu.setApplicationMenu(null)
  registerIpc({ apply: applySideEffects, setHotkey: changeHotkey })
  createPanel()

  if (!SMOKE) {
    bindHotkey(settings.hotkey, onToggle)

    createTray({
      toggle: onToggle,
      setSide: (side) => {
        updateSettings({ side })
        refreshTray()
        // 面板开着就换到新的一侧：先收起，再按新方向滑入
        if (isPanelVisible()) hidePanel(() => showPanel())
      },
      setAutostart: (enabled) => {
        const next = updateSettings({ startAtLogin: enabled })
        applyAutostart(next.startAtLogin)
        refreshTray()
      }
    })

    // 只在开启时重贴一次，顺手修复「项目被移动导致自启路径失效」
    if (settings.startAtLogin) applyAutostart(true)

    scheduleUpdateChecks()
  }

  if (SMOKE) await runSmoke()
}

/** 自检：唤起面板 → 截图 → 退出，验证 M0 的窗口与渲染 */
async function runSmoke(): Promise<void> {
  showPanel()
  await new Promise((resolve) => setTimeout(resolve, 1000))
  const win = getPanelWindow()
  if (!win) throw new Error('面板窗口没有创建')
  const image = await win.webContents.capturePage()
  // 打包态的 app.getAppPath() 在 app.asar 里面，写不进去，改落到 userData
  const out = app.isPackaged
    ? join(app.getPath('userData'), 'smoke.png')
    : join(app.getAppPath(), 'out', 'smoke.png')
  writeFileSync(out, image.toPNG())
  console.log(`[sill] smoke 截图已写入 ${out}`)
  setTimeout(() => app.quit(), 150)
}
