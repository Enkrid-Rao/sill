import { app, screen } from 'electron'
import { release } from 'node:os'
import { listInstalled, listSkins } from './widgets/package'
import { COMPONENTS_DIR } from './layout'
import { SKINS_DIR } from './skins'
import { loadSettings } from './settings'

/** 诊断文本只放版本 / 环境 / 组件清单，不包含待办、媒体标题或路径中的用户名。 */
export function diagnosticsText(): string {
  const settings = loadSettings()
  const displays = screen.getAllDisplays().map((display) => ({
    id: display.id,
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor
  }))
  const installed = listInstalled(COMPONENTS_DIR).map((item) => `${item.id}@${item.version}`)
  const skins = listSkins(SKINS_DIR).map((item) => item.id)
  return [
    `Sill ${app.getVersion()}`,
    `Electron ${process.versions.electron} / Chromium ${process.versions.chrome} / Node ${process.versions.node}`,
    `Windows ${release()} ${process.arch}`,
    `locale ${app.getLocale()} · language ${settings.language}`,
    `panel ${settings.panelWidth}×${settings.panelHeight || 'fill'} · ${settings.side} · gap ${settings.edgeGap}`,
    `monitor ${settings.monitorIntervalMs}ms · hotkey ${settings.hotkey}`,
    `privacyAsked ${settings.privacyAsked} · networkConsent ${settings.networkConsent} · weatherNetwork ${settings.weatherNetwork}`,
    `autoUpdate ${settings.autoUpdate} · settingsInWindow ${settings.settingsInWindow}`,
    `displays ${JSON.stringify(displays)}`,
    `components ${installed.length ? installed.join(', ') : '(none)'}`,
    `skins ${skins.length ? skins.join(', ') : '(none)'}`,
    'dataDir %APPDATA%\\Sill'
  ].join('\n')
}
