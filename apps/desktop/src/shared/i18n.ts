/**
 * 界面文案。主进程（托盘）与渲染进程（面板、设置）共用一份。
 *
 * 只放「界面语言」，不放用户内容：占位天气、待办这些假数据也在这里，
 * 因为 M0 面板本来就是一张有文案的草图。
 */

export type Language = 'en' | 'zh'

export const LANGUAGES: readonly { id: Language; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'zh', label: '中文' }
]

const en = {
  'weather.condition': 'Partly cloudy',
  'weather.range': 'H 17° · L 9°',
  'weather.city': 'Shanghai',

  'system.title': 'System',
  'system.cores': '8 cores',
  'system.coresUnit': 'cores',
  'metric.cpu': 'CPU',
  'metric.memory': 'Memory',
  'metric.gpu': 'GPU',
  'metric.network': 'Network',
  'system.topRam': 'Top RAM',
  'system.topGpu': 'Top GPU',
  'system.memory': 'Memory',
  'media.nowPlaying': 'Now playing',
  'media.nothing': 'Nothing playing',
  'media.paused': 'Paused',
  'todo.today': 'Today',
  'todo.open': 'open',
  'todo.add': 'Add a task',
  'todo.empty': 'No tasks yet',
  'todo.one': 'Reply to Mira about the studio keys',
  'todo.two': 'Book the Friday train north',
  'todo.three': 'Send the field notes to Noor',
  'footer.dismiss': 'Esc to dismiss',
  'footer.version': 'sill · m0',

  'settings.title': 'Settings',
  'settings.tagline': 'Make it yours.',
  'tab.appearance': 'Appearance',
  'tab.behavior': 'Behavior',
  'tab.general': 'General',

  'appearance.presets': 'Presets',
  'appearance.accent': 'Accent',
  'appearance.details': 'Details',
  'theme.atmosphere': 'Atmosphere',
  'theme.atmosphereNote': 'Light field inside the glass',
  'theme.intensity': 'Intensity',
  'theme.hue': 'Hue',
  'theme.tint': 'Tint strength',
  'theme.opacity': 'Glass opacity',
  'theme.halo': 'Halo',
  'theme.haloNote': 'Top-left light across the glass',
  'theme.haloStrength': 'Halo strength',
  'theme.grain': 'Grain',
  'theme.grainNote': 'Soft light-field texture in the glass',
  'appearance.note':
    'Clear by default: neutral glass over a soft dark floor, so text survives any wallpaper. No live blur — the panel never samples the desktop.',

  'behavior.panel': 'Panel',
  'behavior.system': 'System',
  'behavior.shortcut': 'Shortcut',
  'behavior.shortcutNote': 'Bring the rail in, or put it away',
  'behavior.shape': 'Panel shape',
  'behavior.shapeNote': 'Width, height and column count',
  'shape.rail': 'Rail',
  'shape.compact': 'Compact',
  'shape.board': 'Board',
  'shape.wide': 'Wide',
  'behavior.recording': 'Press a key combo…',
  'behavior.shortcutTaken': 'That combo is taken by the system or another app',
  'behavior.dock': 'Dock side',
  'behavior.dockNote': 'Slides in from this edge',
  'behavior.left': 'Left',
  'behavior.right': 'Right',
  'behavior.edge': 'Edge distance',
  'behavior.edgeNote': 'Gap between the rail and the screen edge',
  'behavior.startup': 'Start with Windows',
  'behavior.startupNote': 'Launch quiet, ready in the tray',
  'behavior.onTop': 'Keep on top',
  'behavior.onTopNote': 'Float above other windows',

  'general.interface': 'Interface',
  'general.language': 'Language',
  'general.languageNote': 'Applies to the panel and the tray',
  'general.about': 'About',
  'general.version': 'Version',
  'general.updates': 'Updates',
  'general.autoUpdate': 'Check for updates automatically',
  'general.autoUpdateNote': 'Ask GitHub once a day and at launch',
  'general.checkNow': 'Check now',
  'general.updateStatus': 'Update status',
  'general.checking': 'Checking…',
  'general.upToDate': 'Up to date',
  'general.updateAvailable': 'New version',
  'general.updateFailed': 'Check failed',
  'general.updatePrivate': 'Repository is private — cannot check',

  'footer.appearance': 'Changes save locally',
  'footer.behavior': 'Behaviour changes apply immediately',
  'footer.general': 'Preferences save locally',
  'footer.reset': 'Reset',

  'tray.showHide': 'Show / hide',
  'tray.slideLeft': 'Slide from left',
  'tray.autostart': 'Start with Windows',
  'tray.pinned': 'Always on top',
  'tray.settings': 'Open settings file',
  'tray.quit': 'Quit'
} as const

type Key = keyof typeof en

const zh: Record<Key, string> = {
  'weather.condition': '局部多云',
  'weather.range': '高 17° · 低 9°',
  'weather.city': '上海',

  'system.title': '系统',
  'system.cores': '8 核',
  'system.coresUnit': '核',
  'metric.cpu': 'CPU',
  'metric.memory': '内存',
  'metric.gpu': 'GPU',
  'metric.network': '网络',
  'system.topRam': '内存占用',
  'system.topGpu': 'GPU 占用',
  'system.memory': '内存',
  'media.nowPlaying': '正在播放',
  'media.nothing': '未在播放',
  'media.paused': '已暂停',
  'todo.today': '今天',
  'todo.open': '项待办',
  'todo.add': '添加待办',
  'todo.empty': '还没有待办',
  'todo.one': '回复 Mira 关于工作室钥匙的事',
  'todo.two': '订周五北上的火车票',
  'todo.three': '把田野笔记发给 Noor',
  'footer.dismiss': 'Esc 收起',
  'footer.version': 'sill · m0',

  'settings.title': '设置',
  'settings.tagline': '按你的来。',
  'tab.appearance': '外观',
  'tab.behavior': '行为',
  'tab.general': '通用',

  'appearance.presets': '预设',
  'appearance.accent': '强调色',
  'appearance.details': '细节',
  'theme.atmosphere': '氛围',
  'theme.atmosphereNote': '玻璃里的光场',
  'theme.intensity': '强度',
  'theme.hue': '色相',
  'theme.tint': '上色强度',
  'theme.opacity': '玻璃不透明度',
  'theme.halo': '顶光',
  'theme.haloNote': '左上角掠过玻璃的光',
  'theme.haloStrength': '顶光强度',
  'theme.grain': '颗粒',
  'theme.grainNote': '玻璃里的柔光纹理',
  'appearance.note':
    '默认中性：没有色相，只有一层柔和的暗底保证文字可读。不做实时模糊——面板不采样桌面。',

  'behavior.panel': '面板',
  'behavior.system': '系统',
  'behavior.shortcut': '快捷键',
  'behavior.shortcutNote': '唤出或收起侧边廊',
  'behavior.shape': '面板形状',
  'behavior.shapeNote': '宽高与内容列数',
  'shape.rail': '侧廊',
  'shape.compact': '紧凑',
  'shape.board': '板式',
  'shape.wide': '宽屏',
  'behavior.recording': '按下组合键…',
  'behavior.shortcutTaken': '这个组合被系统或其他程序占用了',
  'behavior.dock': '停靠边',
  'behavior.dockNote': '从这个方向滑入',
  'behavior.left': '左',
  'behavior.right': '右',
  'behavior.edge': '边缘距离',
  'behavior.edgeNote': '面板与屏幕边缘的间距',
  'behavior.startup': '开机自启',
  'behavior.startupNote': '静默启动，常驻托盘',
  'behavior.onTop': '始终置顶',
  'behavior.onTopNote': '浮在其他窗口之上',

  'general.interface': '界面',
  'general.language': '语言',
  'general.languageNote': '同时作用于面板与托盘',
  'general.about': '关于',
  'general.version': '版本',
  'general.updates': '更新',
  'general.autoUpdate': '自动检查更新',
  'general.autoUpdateNote': '启动时与每天向 GitHub 查询一次',
  'general.checkNow': '立即检查',
  'general.updateStatus': '更新状态',
  'general.checking': '检查中…',
  'general.upToDate': '已是最新',
  'general.updateAvailable': '发现新版本',
  'general.updateFailed': '检查失败',
  'general.updatePrivate': '仓库未公开，无法检查',

  'footer.appearance': '改动保存在本地',
  'footer.behavior': '行为设置立即生效',
  'footer.general': '偏好设置保存在本地',
  'footer.reset': '重置',

  'tray.showHide': '显示 / 隐藏',
  'tray.slideLeft': '从左侧滑出',
  'tray.autostart': '开机自启',
  'tray.pinned': '置顶',
  'tray.settings': '打开设置文件',
  'tray.quit': '退出'
}

export function t(language: Language, key: Key): string {
  return (language === 'zh' ? zh : en)[key]
}

/** 面板里的日期：英文用 en-GB 的 "Thursday 13 November"，中文用 "11月13日星期四" */
export function formatDate(date: Date, language: Language): string {
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(date)
}
