import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { DevWidgetPayload } from '../../../shared/dev-widget'
import type { InstalledWidgetInfo } from '../../../shared/widgets'
import { TemplateWidget } from '../components/TemplateWidget'
import { WebWidget } from '../components/WebWidget'
import { BUILTIN_WIDGETS } from './registry'
import type { WidgetDefinition } from './types'

export interface WidgetRegistry {
  widgets: readonly WidgetDefinition[]
  byId: Record<string, WidgetDefinition>
  ids: string[]
  installed: readonly InstalledWidgetInfo[]
  /** Dev widget + installed packages have been read once. */
  ready: boolean
}

const WidgetRegistryContext = createContext<WidgetRegistry | null>(null)

interface LoadedInstalled {
  info: InstalledWidgetInfo
  payload: DevWidgetPayload
}

/** 内置模板和官方安装包沿用原有的 i18n 名称，第三方组件用 manifest 的 name。 */
const BUILTIN_NAME_KEYS: Partial<Record<string, WidgetDefinition['nameKey']>> = {
  system: 'widget.system',
  processes: 'widget.processes',
  'sill.clock': 'widget.clock',
  'sill.calendar': 'widget.calendar',
  'sill.weather': 'widget.weather',
  'sill.rings': 'widget.rings'
}

/**
 * 热重载时只替换「真的变了」的组件：payload 内容一致就复用旧对象。
 * 否则保存一个文件会让所有卡片重建 DOM、重跑 main.js、重置 CSS 过渡。
 */
function samePayload(a: DevWidgetPayload, b: DevWidgetPayload): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.kind === b.kind &&
    a.trust === b.trust &&
    a.span === b.span &&
    a.height === b.height &&
    a.dir === b.dir &&
    a.html === b.html &&
    a.css === b.css &&
    a.js === b.js &&
    JSON.stringify(a.data) === JSON.stringify(b.data) &&
    JSON.stringify(a.permissions) === JSON.stringify(b.permissions) &&
    JSON.stringify(a.settings) === JSON.stringify(b.settings) &&
    JSON.stringify(a.strings) === JSON.stringify(b.strings)
  )
}

export function WidgetRegistryProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [dev, setDev] = useState<DevWidgetPayload | null>(null)
  const [builtin, setBuiltin] = useState<DevWidgetPayload[]>([])
  const [installed, setInstalled] = useState<InstalledWidgetInfo[]>([])
  const [loaded, setLoaded] = useState<LoadedInstalled[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true

    const load = async (): Promise<void> => {
      const [devPayload, list, builtins] = await Promise.all([
        window.sill?.getDevWidget(),
        window.sill?.getInstalledWidgets(),
        window.sill?.getBuiltinWidgets()
      ])
      const payloads = await Promise.all(
        (list ?? []).map(async (info) => ({
          info,
          payload: await window.sill?.getInstalledWidget(info.id)
        }))
      )
      if (!alive) return
      setDev((previous) =>
        previous && devPayload && samePayload(previous, devPayload) ? previous : (devPayload ?? null)
      )
      setBuiltin((previous) => {
        if (previous.length === (builtins ?? []).length) {
          const same = previous.every((item, index) => {
            const next = (builtins ?? [])[index]
            return next && samePayload(item, next)
          })
          if (same) return previous
        }
        return builtins ?? []
      })
      setInstalled(list ?? [])
      setLoaded((previous) => {
        const byId = new Map(previous.map((item) => [item.info.id, item]))
        return payloads
          .filter(
            (item): item is LoadedInstalled => item.payload !== null && item.payload !== undefined
          )
          .map((item) => {
            const old = byId.get(item.info.id)
            return old && samePayload(old.payload, item.payload) ? old : item
          })
      })
      setReady(true)
    }

    void load().catch((error) => {
      console.error('[sill] installed widgets:', error)
      if (alive) setReady(true)
    })

    const off = window.sill?.onWidgetsChanged(() => {
      void load().catch((error) => console.error('[sill] installed widgets:', error))
    })

    return () => {
      alive = false
      off?.()
    }
  }, [])

  const registry = useMemo<WidgetRegistry>(() => {
    const widgets: WidgetDefinition[] = []
    const byId: Record<string, WidgetDefinition> = {}
    const push = (definition: WidgetDefinition): void => {
      if (byId[definition.id]) return
      widgets.push(definition)
      byId[definition.id] = definition
    }

    // 1. 随应用发布的内置模板（system / processes）
    for (const payload of builtin) {
      const nameKey = BUILTIN_NAME_KEYS[payload.id]
      push({
        id: payload.id,
        ...(nameKey ? { nameKey } : { label: payload.name }),
        spanFor: () => payload.span,
        render: (context) =>
          payload.kind === 'web' ? (
            <WebWidget widget={payload} context={context} />
          ) : (
            <TemplateWidget widget={payload} context={context} />
          )
      })
    }

    // 2. 仍是 React 的内置组件（hero / media / shelf / todo）兜底
    for (const widget of BUILTIN_WIDGETS) push(widget)

    // 3. 安装的组件
    for (const { info, payload } of loaded) {
      const nameKey = BUILTIN_NAME_KEYS[info.id]
      push({
        id: info.id,
        ...(nameKey ? { nameKey } : { label: info.name }),
        spanFor: () => info.span,
        render: (context) =>
          payload.kind === 'web' ? (
            <WebWidget widget={payload} context={context} />
          ) : (
            <TemplateWidget widget={payload} context={context} />
          )
      })
    }

    // 4. 开发中的单文件夹组件
    if (dev) {
      push({
        id: dev.id,
        label: dev.name,
        spanFor: () => dev.span,
        render: (context) =>
          dev.kind === 'web' ? (
            <WebWidget widget={dev} context={context} />
          ) : (
            <TemplateWidget widget={dev} context={context} />
          )
      })
    }

    return {
      widgets,
      byId,
      ids: widgets.map((widget) => widget.id),
      installed,
      ready
    }
  }, [dev, builtin, loaded, installed, ready])

  return <WidgetRegistryContext.Provider value={registry}>{children}</WidgetRegistryContext.Provider>
}

export function useWidgetRegistry(): WidgetRegistry {
  const registry = useContext(WidgetRegistryContext)
  if (!registry) throw new Error('useWidgetRegistry must be used inside WidgetRegistryProvider')
  return registry
}




