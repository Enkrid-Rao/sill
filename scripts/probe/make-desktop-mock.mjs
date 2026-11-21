/**
 * 用 Playwright 的 Chromium 把 desktop-mock.html 截成一张「假桌面」，
 * 给 SILL_GLASS_BACKDROP 用 —— 这样玻璃截图可复现，也不会把真实桌面拍进去。
 *
 *   node scripts/probe/make-desktop-mock.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const playwrightCore = process.env.PLAYWRIGHT_CORE
if (!playwrightCore) {
  console.error('需要 PLAYWRIGHT_CORE 指向 playwright-core 的 index.mjs')
  process.exit(1)
}
const { chromium } = await import(pathToFileURL(playwrightCore).href)

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
const out = join(root, 'apps/desktop/out/glass-probe')
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--force-device-scale-factor=1', '--hide-scrollbars']
})
const page = await browser.newPage({ viewport: { width: 1707, height: 1067 }, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(join(here, 'desktop-mock.html')).href)
await page.waitForTimeout(300)
const file = join(out, 'desktop-mock.png')
writeFileSync(file, await page.screenshot({ type: 'png' }))
await browser.close()
console.log('written', file)
