import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'

const run = promisify(execFile)
const CLASSES = 'HKCU\\Software\\Classes'
const EXT_KEY = `${CLASSES}\\.sill`
const PROG_ID = 'Sill.WidgetPackage'
const PROG_KEY = `${CLASSES}\\${PROG_ID}`

async function regAdd(key: string, valueName: string | null, value: string, type = 'REG_SZ') {
  const args = ['add', key]
  if (valueName === null) args.push('/ve')
  else args.push('/v', valueName)
  args.push('/t', type, '/d', value, '/f')
  await run('reg', args, { windowsHide: true })
}

/** Explorer 不会立刻重读注册表，通知一次 Shell。 */
async function refreshShell(): Promise<void> {
  const script =
    'Add-Type -Namespace SillWin32 -Name Shell -MemberDefinition ' +
    "'[DllImport(\"shell32.dll\")] public static extern void SHChangeNotify(int eventId, uint flags, System.IntPtr item1, System.IntPtr item2);';" +
    '[SillWin32.Shell]::SHChangeNotify(0x08000000,0x1000,[IntPtr]::Zero,[IntPtr]::Zero)'
  try {
    await run('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true })
  } catch {
    // 刷新失败不影响注册本身；重启资源管理器后仍会生效。
  }
}

/** 从命令行参数里挑出真实存在的 .sill 文件。第二实例的 argv 首项可能是工作目录。 */
export function sillFileArgs(argv: readonly string[]): string[] {
  return argv.filter((arg) => /\.sill$/i.test(arg) && existsSync(arg))
}

export async function isSillAssociation(): Promise<boolean> {
  try {
    const { stdout } = await run('reg', ['query', EXT_KEY, '/ve'], { windowsHide: true })
    return stdout.includes(PROG_ID)
  } catch {
    return false
  }
}

/**
 * 注册当前用户级的 .sill 关联。安装版由 NSIS 自动做；
 * 绿色版通过设置里的按钮显式注册，不偷偷改注册表。
 */
export async function registerSillAssociation(exePath: string): Promise<void> {
  const command = `"${exePath}" "%1"`
  await regAdd(EXT_KEY, null, PROG_ID)
  await regAdd(`${EXT_KEY}\\OpenWithProgids`, PROG_ID, '', 'REG_NONE')
  await regAdd(PROG_KEY, null, 'Sill component package')
  await regAdd(`${PROG_KEY}\\DefaultIcon`, null, `${exePath},0`)
  await regAdd(`${PROG_KEY}\\shell`, null, 'open')
  await regAdd(`${PROG_KEY}\\shell\\open`, null, 'Install with Sill')
  await regAdd(`${PROG_KEY}\\shell\\open\\command`, null, command)
  await refreshShell()
}

export async function unregisterSillAssociation(): Promise<void> {
  try {
    const { stdout } = await run('reg', ['query', EXT_KEY, '/ve'], { windowsHide: true })
    if (stdout.includes(PROG_ID)) {
      await run('reg', ['delete', EXT_KEY, '/f'], { windowsHide: true })
    } else {
      await run(
        'reg',
        ['delete', `${EXT_KEY}\\OpenWithProgids`, '/v', PROG_ID, '/f'],
        { windowsHide: true }
      ).catch(() => undefined)
    }
  } catch {
    // 没有关联时按成功处理。
  }
  await run('reg', ['delete', PROG_KEY, '/f'], { windowsHide: true }).catch(() => undefined)
  await refreshShell()
}
