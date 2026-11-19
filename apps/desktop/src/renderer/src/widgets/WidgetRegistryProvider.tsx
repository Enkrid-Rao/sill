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
    JSON.stringify(a.strings) === JSON.stringify(b.strings)
  )
}

export function WidgetRegistryProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [dev, setDev] = useState<DevWidgetPayload | null>(null)
  const [installed, setInstalled] = useState<InstalledWidgetInfo[]>([])
  const [loaded, setLoaded] = useState<LoadedInstalled[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true

    const load = async (): Promise<void> => {
      const [devPayload, list] = await Promise.all([
        window.sill?.getDevWidget(),
        window.sill?.getInstalledWidgets()
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
    const widgets: WidgetDefinition[] = [...BUILTIN_WIDGETS]
    const byId: Record<string, WidgetDefinition> = Object.fromEntries(
      widgets.map((widget) => [widget.id, widget])
    )

    for (const { info, payload } of loaded) {
      if (byId[info.id]) continue
      const definition: WidgetDefinition = {
        id: info.id,
        label: info.name,
        spanFor: () => info.span,
        render: (context) => (
          payload.kind === 'web' ? (
            <WebWidget widget={payload} context={context} />
          ) : (
            <TemplateWidget widget={payload} context={context} />
          )
        )
      }
      widgets.push(definition)
      byId[info.id] = definition
    }

    if (dev && !byId[dev.id]) {
      const definition: WidgetDefinition = {
        id: dev.id,
        label: dev.name,
        spanFor: () => dev.span,
        render: (context) => (
          dev.kind === 'web' ? (
            <WebWidget widget={dev} context={context} />
          ) : (
            <TemplateWidget widget={dev} context={context} />
          )
        )
      }
      widgets.push(definition)
      byId[dev.id] = definition
    }

    return {
      widgets,
      byId,
      ids: widgets.map((widget) => widget.id),
      installed,
      ready
    }
  }, [dev, loaded, installed, ready])

  return <WidgetRegistryContext.Provider value={registry}>{children}</WidgetRegistryContext.Provider>
}

export function useWidgetRegistry(): WidgetRegistry {
  const registry = useContext(WidgetRegistryContext)
  if (!registry) throw new Error('useWidgetRegistry must be used inside WidgetRegistryProvider')
  return registry
}
