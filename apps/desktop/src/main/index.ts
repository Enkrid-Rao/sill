import './paths'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Menu, app } from 'electron'
import { applyAutostart } from './autostart'
import { bindHotkey, disposeHotkeys } from './hotkey'
import { registerIpc } from './ipc'
import {
  applyPinned,
  createPanel,
  getPanelWindow,
  hidePanel,
  isPanelVisible,
  rememberPosition,
  showPanel
} from './panel'
import { loadSettings, updateSettings, type Settings } from './settings'
import { createTray, destroyTray, refreshTray } from './tray'

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
  rememberPosition()
  disposeHotkeys()
  destroyTray()
})

function onToggle(): void {
  if (isPanelVisible()) hidePanel()
  else showPanel()
}

/** 设置变更后贴到系统上的副作用（热键改名、自启、置顶、托盘菜单） */
function applySideEffects(settings: Settings, patch: Partial<Settings>): void {
  if ('hotkey' in patch) bindHotkey(settings.hotkey, onToggle)
  if ('startAtLogin' in patch) applyAutostart(settings.startAtLogin)
  if ('pinned' in patch) applyPinned(settings.pinned)
  refreshTray()
}

async function boot(): Promise<void> {
  const settings = loadSettings()

  Menu.setApplicationMenu(null)
  registerIpc({ apply: applySideEffects })
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
      },
      setPinned: (pinned) => {
        const next = updateSettings({ pinned })
        applyPinned(next.pinned)
        refreshTray()
      }
    })

    // 只在开启时重贴一次，顺手修复「项目被移动导致自启路径失效」
    if (settings.startAtLogin) applyAutostart(true)
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
  const out = join(app.getAppPath(), 'out', 'smoke.png')
  writeFileSync(out, image.toPNG())
  console.log(`[sill] smoke 截图已写入 ${out}`)
  setTimeout(() => app.quit(), 150)
}
