import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { WidgetTier } from '../shared/widgets'
import { USER_DATA_DIR } from './paths'

/**
 * 记住用户「确认过」的组件：同 id、档位不升，就不再弹提示。
 * 只记档位和版本，不记内容哈希——组件的授权对象是作者，不是某一次的文件。
 */
const TRUST_NAME = 'trust.json'

function trustFile(): string {
  return join(USER_DATA_DIR, TRUST_NAME)
}

const RANK: Record<WidgetTier, number> = {
  static: 0,
  isolated: 1,
  script: 2,
  node: 3
}

interface TrustRecord {
  tier: WidgetTier
  version: string
  at: number
}

type TrustMap = Record<string, TrustRecord>

let cache: TrustMap | null = null

function load(): TrustMap {
  if (cache) return cache
  try {
    const raw = JSON.parse(readFileSync(trustFile(), 'utf8')) as unknown
    cache =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as TrustMap) : {}
  } catch {
    cache = {}
  }
  return cache
}

function persist(map: TrustMap): void {
  try {
    mkdirSync(dirname(trustFile()), { recursive: true })
    const tmp = `${trustFile()}.tmp`
    writeFileSync(tmp, `${JSON.stringify(map, null, 2)}\n`, 'utf8')
    renameSync(tmp, trustFile())
  } catch (error) {
    console.error('[sill] 无法写入信任记录：', error)
  }
}

export function trustFileExists(): boolean {
  return existsSync(trustFile())
}

export function trustedTier(id: string): WidgetTier | null {
  const record = load()[id]
  if (!record || !(record.tier in RANK)) return null
  return record.tier
}

/** 这个 id 已经确认过、且确认过的档位不低于当前包。 */
export function isAlreadyTrusted(id: string, tier: WidgetTier): boolean {
  const known = trustedTier(id)
  return known !== null && RANK[known] >= RANK[tier]
}

export function rememberTrust(id: string, tier: WidgetTier, version: string): void {
  const map = load()
  const previous = map[id]
  // 装低权限版本时不要把更高的历史档位降级
  if (previous && RANK[previous.tier] > RANK[tier]) return
  map[id] = { tier, version, at: Date.now() }
  persist(map)
}

/** 仅测试使用：清掉进程内缓存，下次重新读盘。 */
export function resetTrustCache(): void {
  cache = null
}

