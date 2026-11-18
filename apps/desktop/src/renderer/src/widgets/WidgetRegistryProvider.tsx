import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { DevWidgetPayload } from '../../../shared/dev-widget'
import type { InstalledWidgetInfo } from '../../../shared/widgets'
import { TemplateWidget } from '../components/TemplateWidget'
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
      setDev(devPayload ?? null)
      setInstalled(list ?? [])
      setLoaded(
        payloads.filter(
          (item): item is LoadedInstalled => item.payload !== null && item.payload !== undefined
        )
      )
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
          <TemplateWidget widget={payload} context={context} />
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
          <TemplateWidget widget={dev} context={context} />
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
