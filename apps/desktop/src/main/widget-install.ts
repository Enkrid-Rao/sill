import { dialog, type BrowserWindow } from 'electron'
import type { MessageBoxOptions } from 'electron'
import { broadcast } from './broadcast'
import { COMPONENTS_DIR, getLayout, invalidateLayout } from './layout'
import { inspectPackage, installPackage } from './widgets/package'
import type { InstallOutcome } from '../shared/widgets'

/** 组件安装/卸载后，布局与组件列表一起刷新。 */
export function afterWidgetsChanged(): void {
  invalidateLayout()
  broadcast('widgets:changed', null)
  broadcast('layout:changed', getLayout())
}

/**
 * 安装一个本地 .sill。设置里的文件选择框和 Explorer 右键/双击共用这一条路径，
 * 保证确认文案、权限提示和落盘行为完全一致。
 */
export async function installWidgetFile(
  file: string,
  win?: BrowserWindow | null
): Promise<InstallOutcome> {
  const inspected = inspectPackage(file)
  if (!inspected.ok || !inspected.widget) return inspected

  const widget = inspected.widget
  const permissions = widget.permissions.length ? widget.permissions.join('\n') : '无'
  const detail = [
    `id: ${widget.id}`,
    `版本: ${widget.version}`,
    `作者: ${widget.author}`,
    `类型: ${widget.kind === 'web' ? 'web（独立窗口）' : 'template（面板内，可带 JS）'}`,
    `信任: ${
      widget.kind === 'template'
        ? '在面板页面内运行，和 Sill 同等权限'
        : widget.trust === 'trusted'
          ? '完全信任（可读写文件、执行命令、访问网络）'
          : '沙箱（只通过组件桥）'
    }`,
    `权限: ${permissions}`,
    '',
    widget.trust === 'trusted'
      ? '这个组件拥有和 Sill 相同的本机权限。只安装你信任的来源。'
      : '只安装你信任的组件。'
  ].join('\n')

  const confirmOptions: MessageBoxOptions = {
    type: 'question',
    title: '安装组件',
    message: `${widget.name} ${widget.version}`,
    detail,
    buttons: ['安装', '取消'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  }
  const confirmed = win
    ? await dialog.showMessageBox(win, confirmOptions)
    : await dialog.showMessageBox(confirmOptions)
  if (confirmed.response !== 0) return { ok: false, error: '已取消' }

  const result = installPackage(file, COMPONENTS_DIR)
  if (result.ok) afterWidgetsChanged()
  return result
}
