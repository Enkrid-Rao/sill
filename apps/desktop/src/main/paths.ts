import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

/**
 * 所有路径都在这里定死，避免 Electron 用 package.json 的 name（@sill/desktop）
 * 去推导 userData，导致落到 %APPDATA%\@sill\desktop。
 *
 * 必须在 app ready 之前执行，所以这个模块要在 index.ts 的第一行导入。
 */
app.setName('Sill')

// 绿色版：electron-builder portable 目标会注入 PORTABLE_EXECUTABLE_DIR；
// 目录版（zip）则用 exe 旁边的 portable.flag 显式标记。
// 便携模式下设置 / 待办 / 布局 / 天气缓存全部落在 exe 旁边的 Sill-data。
const portableDir = process.env.PORTABLE_EXECUTABLE_DIR?.trim()
const portableFlag =
  app.isPackaged && existsSync(join(dirname(process.execPath), 'portable.flag'))
export const IS_PORTABLE = Boolean(portableDir) || portableFlag
export const PORTABLE_EXECUTABLE =
  process.env.PORTABLE_EXECUTABLE_FILE?.trim() || (portableFlag ? process.execPath : null)

// 测试/截图时可以用 SILL_USER_DATA 指一个临时目录，别碰真实设置
const userData =
  process.env.SILL_USER_DATA?.trim() ||
  (IS_PORTABLE
    ? join(portableDir || dirname(process.execPath), 'Sill-data')
    : join(app.getPath('appData'), 'Sill'))

// electron-builder 的 portable wrapper 会先塞一个 --user-data-dir（指向 exe 目录），
// 只调 app.setPath 会被 Chromium 的 command line 覆盖；这里先移除再指到 Sill-data。
if (IS_PORTABLE) {
  app.commandLine.removeSwitch('user-data-dir')
  app.commandLine.appendSwitch('user-data-dir', userData)
}
app.setPath('userData', userData)

export const USER_DATA_DIR = app.getPath('userData')
export const SETTINGS_FILE = join(USER_DATA_DIR, 'settings.json')
// 打包后图标在 asar 外面（electron-builder 的 extraResources），dev 态在源码 resources 下。
// 不要把图标放进 asar：nativeImage 读 asar 内文件的行为不可靠。
export const RESOURCES_DIR = app.isPackaged
  ? join(process.resourcesPath, 'resources')
  : join(app.getAppPath(), 'resources')
