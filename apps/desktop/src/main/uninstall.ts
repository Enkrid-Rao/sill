import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, parse, relative, resolve } from 'node:path'
import { app, shell } from 'electron'
import type { UninstallInfo, UninstallResult } from '../shared/uninstall'
import { applyAutostart } from './autostart'
import { USER_DATA_DIR } from './paths'

/**
 * 卸载。两套发布形态，两条简单路径：
 *
 * - 安装版：退出后打开 NSIS 官方卸载器。设置里勾了「同时删除用户数据」就带
 *   `--delete-app-data`（electron-builder 卸载器自带支持），不带就保留 `%APPDATA%\Sill`。
 * - 绿色版：数据就在 exe 旁的 `Sill-data`，退出后删掉整个文件夹即可，没有安装器/注册表项。
 *
 * 退出和删除之间用一个很小的 cmd helper 过渡：Windows 不允许删正在运行的 exe，
 * 而 detached 的 PowerShell 在无控制台环境下会静默退出、不执行脚本（实测），所以用 cmd。
 * 路径全部通过环境变量传入，脚本本体保持 ASCII，避免中文/空格路径的代码页问题。
 */

const UNINSTALLER_NAMES = ['Uninstall Sill.exe', 'Uninstall.exe']
const PORTABLE_MARKERS = ['Sill.exe', 'portable.flag', join('resources', 'app.asar')]

function installDir(): string {
  return dirname(app.getPath('exe'))
}

function findUninstaller(dir: string): string | null {
  for (const name of UNINSTALLER_NAMES) {
    const file = join(dir, name)
    if (existsSync(file)) return file
  }
  return null
}

/** child 是否在 parent 目录里（含相等） */
function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (rel !== '' && !rel.startsWith('..') && !isAbsolute(rel))
}

/** 绿色版的三个标记缺一不可：只有真·绿色包才允许整目录删除 */
function isPortableFolder(dir: string): boolean {
  return PORTABLE_MARKERS.every((marker) => existsSync(join(dir, marker)))
}

/** 拒绝盘符根目录这种「删了就是灾难」的目标 */
function isDeletableDir(dir: string): boolean {
  const resolved = resolve(dir)
  return resolved !== parse(resolved).root
}

export function getUninstallInfo(): UninstallInfo {
  const dir = installDir()
  const deletable = isDeletableDir(dir)
  const portable = isPortableFolder(dir) && deletable
  const uninstaller = portable ? null : findUninstaller(dir)
  const mode = portable ? 'portable' : uninstaller ? 'installed' : 'unsupported'

  let reason: UninstallInfo['reason']
  if (mode === 'unsupported') {
    reason = !app.isPackaged ? 'dev' : isPortableFolder(dir) && !deletable ? 'unsafe' : 'unpacked'
  }

  return {
    mode,
    installDir: dir,
    dataDir: USER_DATA_DIR,
    dataInInstallDir: isInside(USER_DATA_DIR, dir),
    uninstaller,
    canUninstall: mode !== 'unsupported',
    reason
  }
}

export function openDataFolder(): Promise<string> {
  return shell.openPath(USER_DATA_DIR)
}

function buildHelper(): string {
  return [
    '@echo off',
    'setlocal',
    'cd /d "%TEMP%"',
    // 等 Sill 真正退出，再删目录 / 打开卸载器
    'ping -n 3 127.0.0.1 >nul',
    'if /I "%SILL_UNINSTALL_MODE%"=="portable" call :remove "%SILL_UNINSTALL_TARGET%"',
    'if /I "%SILL_UNINSTALL_MODE%"=="installed" start "" "%SILL_UNINSTALL_EXE%" %SILL_UNINSTALL_ARGS%',
    '(goto) 2>nul & del "%~f0"',
    'exit /b 0',
    '',
    ':remove',
    'if not exist "%~1" exit /b 0',
    'for /l %%i in (1,1,10) do (',
    '  rmdir /s /q "%~1" >nul 2>&1',
    '  if not exist "%~1" exit /b 0',
    '  ping -n 2 127.0.0.1 >nul',
    ')',
    'exit /b 0'
  ].join('\r\n')
}

function commandProcessor(): string {
  if (process.env.ComSpec) return process.env.ComSpec
  return join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe')
}

export function startUninstall(deleteData: boolean): UninstallResult {
  const info = getUninstallInfo()
  if (!info.canUninstall) return { ok: false, error: 'unsupported' }

  try {
    applyAutostart(false)
    const helperFile = join(tmpdir(), `sill-uninstall-${process.pid}-${Date.now()}.cmd`)
    writeFileSync(helperFile, buildHelper(), 'ascii')

    const child = spawn(commandProcessor(), ['/d', '/s', '/c', helperFile], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: {
        ...process.env,
        SILL_UNINSTALL_MODE: info.mode,
        SILL_UNINSTALL_TARGET: info.installDir,
        SILL_UNINSTALL_EXE: info.uninstaller ?? '',
        SILL_UNINSTALL_ARGS: deleteData ? '--delete-app-data' : ''
      }
    })
    child.on('error', (error) => console.error('[sill] 卸载 helper 启动失败：', error))
    child.unref()
    return { ok: true, mode: info.mode }
  } catch (error) {
    console.error('[sill] 无法启动卸载程序：', error)
    return { ok: false, error: 'spawn' }
  }
}
