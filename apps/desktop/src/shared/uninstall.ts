/**
 * 卸载相关的共享类型。
 *
 * 安装版（NSIS）和绿色版（ZIP 文件夹）的「卸载」根本不是同一件事：
 * - 安装版：交给 `Uninstall Sill.exe`，用户数据在 `%APPDATA%\Sill`，默认保留；
 * - 绿色版：数据就在 exe 旁的 `Sill-data`，删掉整个文件夹才算卸载干净。
 * 渲染进程不该猜这些，只读主进程算好的 `UninstallInfo`。
 */

export type UninstallMode = 'installed' | 'portable' | 'unsupported'

export interface UninstallInfo {
  mode: UninstallMode
  /** 程序所在目录：安装版是安装目录，绿色版是解压目录 */
  installDir: string
  /** 用户数据目录：`%APPDATA%\Sill` 或 `<exe 所在目录>\Sill-data` */
  dataDir: string
  /** 用户数据是否就在程序目录里（绿色版为 true） */
  dataInInstallDir: boolean
  /** 安装版才有；绿色版 / 开发态为 null */
  uninstaller: string | null
  canUninstall: boolean
  /** 不能卸载的原因：dev = 开发态，unpacked = 没有卸载器，unsafe = 目录不安全 */
  reason?: 'dev' | 'unpacked' | 'unsafe'
}

export interface UninstallResult {
  ok: boolean
  mode?: UninstallMode
  error?: 'unsupported' | 'spawn'
}
