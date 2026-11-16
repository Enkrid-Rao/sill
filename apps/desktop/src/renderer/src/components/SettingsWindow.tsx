import { useEffect } from 'react'
import { useSillSettings } from '../lib/useSillSettings'
import { CustomizeSheet } from './CustomizeSheet'

/**
 * 独立设置窗口的根。
 *
 * 它和面板共用 `useSillSettings`，所以主题、尺寸、语言、组件显隐都是同一份状态；
 * 主进程在写盘后广播，面板会即时跟着变。窗口本身是透明无边框的，玻璃层复用
 * 面板的 .rail 配方，拖拽区域只放在设置页标题栏。
 */
export function SettingsWindow(): React.JSX.Element {
  const settings = useSillSettings()
  const close = (): void => {
    // 滑杆的 220ms 防抖可能还没落盘；关窗前把最后一帧写掉
    settings.flushTheme()
    void window.sill?.closeSettingsWindow()
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        settings.flushTheme()
        void window.sill?.closeSettingsWindow()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settings.flushTheme])

  return (
    <div className="rail settings-window" data-visible="true" data-customizing="true">
      <span className="rail__atmo" aria-hidden="true" />
      <span className="rail__grain" aria-hidden="true" />
      <span className="rail__halo" aria-hidden="true" />
      <span className="rail__sheen" aria-hidden="true" />
      <span className="rail__rim" aria-hidden="true" />

      <CustomizeSheet
        theme={settings.theme}
        onChange={settings.updateTheme}
        onClose={close}
        onReset={settings.resetTheme}
        hotkey={settings.hotkey}
        onHotkeyChange={settings.changeHotkey}
        panelWidth={settings.panelWidth}
        panelHeight={settings.panelHeight}
        maxWidth={settings.limits.maxWidth}
        maxHeight={settings.limits.maxHeight}
        onPanelWidthChange={settings.changePanelWidth}
        onPanelHeightChange={settings.changePanelHeight}
        onPanelSizeChange={settings.changePanelSize}
        onResetSize={settings.resetPanelSize}
        side={settings.side}
        onSideChange={settings.changeSide}
        edgeGap={settings.edgeGap}
        onEdgeGapChange={settings.changeEdgeGap}
        language={settings.language}
        onLanguageChange={settings.changeLanguage}
        settingsInWindow={settings.settingsInWindow}
        onSettingsInWindowChange={settings.changeSettingsInWindow}
        weatherLocation={settings.weatherLocation}
        onWeatherLocationChange={settings.changeWeatherLocation}
        monitorIntervalMs={settings.monitorIntervalMs}
        onMonitorIntervalChange={settings.changeMonitorIntervalMs}
        startAtLogin={settings.startAtLogin}
        onStartAtLoginChange={settings.changeStartAtLogin}
        autoUpdate={settings.autoUpdate}
        onAutoUpdateChange={settings.changeAutoUpdate}
        update={settings.update}
        onCheckUpdate={settings.checkUpdate}
        onEditLayout={() => void window.sill?.editLayout()}
        widgets={settings.widgets}
        onToggleWidget={settings.toggleWidget}
        version={settings.version}
        columns={settings.panelColumns}
        standalone
      />
    </div>
  )
}
