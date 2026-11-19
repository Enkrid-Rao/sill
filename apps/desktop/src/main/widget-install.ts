import { dialog, type BrowserWindow, type MessageBoxOptions } from 'electron'
import type { WidgetTier } from '../shared/widgets'
import { broadcast } from './broadcast'
import { COMPONENTS_DIR, getLayout, invalidateLayout } from './layout'
import { rememberTrust, isAlreadyTrusted } from './trust'
import { inspectPackage, installPackage } from './widgets/package'
import type { InstallOutcome } from '../shared/widgets'

/** 组件安装/卸载后，布局与组件列表一起刷新。 */
export function afterWidgetsChanged(): void {
  invalidateLayout()
  broadcast('widgets:changed', null)
  broadcast('layout:changed', getLayout())
}

/** 档位决定要不要打扰用户；文案只描述「它到底会做什么」。 */
function tierCopy(tier: WidgetTier): { trust: string; note: string } {
  switch (tier) {
    case 'static':
      return { trust: '静态（不执行代码）', note: '只读数据并渲染 HTML/CSS。' }
    case 'isolated':
      return {
        trust: '隔离（独立 webview，无 Node）',
        note: '在独立 guest 里运行，只能通过组件桥读数据、触发动作。'
      }
    case 'script':
      return {
        trust: '脚本（在面板页面里执行代码）',
        note: 'ui/main.js 与 Sill 同页运行，权限和 Sill 本身相同：能读写设置、调用宿主 IPC、联网。'
      }
    case 'node':
      return {
        trust: '插件（完整 Node / Windows API）',
        note: '可以读写文件、执行命令、访问网络，和本机普通程序没有区别。'
      }
  }
}

function installNow(
  outcome: InstallOutcome,
  widgetId: string,
  tier: WidgetTier,
  version: string
): InstallOutcome {
  if (!outcome.ok) return outcome
  rememberTrust(widgetId, tier, version)
  afterWidgetsChanged()
  return outcome
}

/**
 * 安装一个本地 .sill。设置里的文件选择框、Explorer 双击和 .sill 关联共用这一条路径。
 *
 * 信任规则（Rainmeter 式）：
 * - static 不执行代码 → 不弹窗；
 * - 已确认过的 id 且档位没升 → 不再弹；
 * - 其余按档位弹一次确认，确认后记住。
 */
export async function installWidgetFile(
  file: string,
  win?: BrowserWindow | null
): Promise<InstallOutcome> {
  const inspected = inspectPackage(file)
  if (!inspected.ok || !inspected.widget) return inspected

  const widget = inspected.widget
  const tier = widget.tier
  const { trust, note } = tierCopy(tier)

  if (tier === 'static' || isAlreadyTrusted(widget.id, tier)) {
    return installNow(
      installPackage(file, COMPONENTS_DIR),
      widget.id,
      tier,
      widget.version
    )
  }

  const permissions = widget.permissions.length ? widget.permissions.join('\n') : '无'
  const detail = [
    `id: ${widget.id}`,
    `版本: ${widget.version}`,
    `作者: ${widget.author}`,
    `能力: ${trust}`,
    `读取: ${permissions}`,
    '',
    note,
    '',
    '确认后记住这个选择；同一个组件（能力不变）以后不再询问。'
  ].join('\n')

  const confirmOptions: MessageBoxOptions = {
    type: tier === 'isolated' ? 'question' : 'warning',
    title: '安装组件',
    message: `${widget.name} ${widget.version}`,
    detail,
    buttons: ['安装', '取消'],
    defaultId: tier === 'node' ? 1 : 0,
    cancelId: 1,
    noLink: true,
    ...(tier === 'node'
      ? { checkboxLabel: '我了解这个组件拥有完整本机权限', checkboxChecked: false }
      : {})
  }
  const confirmed = win
    ? await dialog.showMessageBox(win, confirmOptions)
    : await dialog.showMessageBox(confirmOptions)

  if (confirmed.response !== 0) return { ok: false, error: '已取消' }
  if (tier === 'node' && confirmed.checkboxChecked !== true) {
    return { ok: false, error: '需要勾选确认完全访问' }
  }

  return installNow(
    installPackage(file, COMPONENTS_DIR),
    widget.id,
    tier,
    widget.version
  )
}

