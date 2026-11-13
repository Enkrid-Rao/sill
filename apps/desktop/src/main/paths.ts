import { join } from 'node:path'
import { app } from 'electron'

/**
 * 所有路径都在这里定死，避免 Electron 用 package.json 的 name（@sill/desktop）
 * 去推导 userData，导致落到 %APPDATA%\@sill\desktop。
 *
 * 必须在 app ready 之前执行，所以这个模块要在 index.ts 的第一行导入。
 */
app.setName('Sill')
// 测试/截图时可以用 SILL_USER_DATA 指一个临时目录，别碰真实设置
const userData = process.env.SILL_USER_DATA?.trim() || join(app.getPath('appData'), 'Sill')
app.setPath('userData', userData)

export const USER_DATA_DIR = app.getPath('userData')
export const SETTINGS_FILE = join(USER_DATA_DIR, 'settings.json')
// 打包后图标在 asar 外面（electron-builder 的 extraResources），dev 态在源码 resources 下。
// 不要把图标放进 asar：nativeImage 读 asar 内文件的行为不可靠。
export const RESOURCES_DIR = app.isPackaged
  ? join(process.resourcesPath, 'resources')
  : join(app.getAppPath(), 'resources')
