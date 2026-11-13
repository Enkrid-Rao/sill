import { join } from 'node:path'
import { app } from 'electron'

/**
 * 所有路径都在这里定死，避免 Electron 用 package.json 的 name（@sill/desktop）
 * 去推导 userData，导致落到 %APPDATA%\@sill\desktop。
 *
 * 必须在 app ready 之前执行，所以这个模块要在 index.ts 的第一行导入。
 */
app.setName('Sill')
app.setPath('userData', join(app.getPath('appData'), 'Sill'))

export const USER_DATA_DIR = app.getPath('userData')
export const SETTINGS_FILE = join(USER_DATA_DIR, 'settings.json')
export const RESOURCES_DIR = join(app.getAppPath(), 'resources')
