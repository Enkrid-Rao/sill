import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { DevWidgetPayload } from '../../../shared/dev-widget'
import { TemplateWidget } from '../components/TemplateWidget'
import { BUILTIN_WIDGETS } from './registry'
import type { WidgetDefinition } from './types'

export interface WidgetRegistry {
  widgets: readonly WidgetDefinition[]
  byId: Record<string, WidgetDefinition>
  ids: string[]
  /** Dev widget folder has been read (or skipped) once. */
  ready: boolean
}

const WidgetRegistryContext = createContext<WidgetRegistry | null>(null)

export function WidgetRegistryProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [dev, setDev] = useState<DevWidgetPayload | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    const loading = window.sill?.getDevWidget()
    if (!loading) {
      setReady(true)
      return
    }
    void loading
      .then((next) => {
        if (alive && next) setDev(next)
      })
      .catch((error) => console.error('[sill] dev widget:', error))
      .finally(() => {
        if (alive) setReady(true)
      })
    return () => {
      alive = false
    }
  }, [])

  const registry = useMemo<WidgetRegistry>(() => {
    const widgets: WidgetDefinition[] = [...BUILTIN_WIDGETS]
    if (dev) {
      widgets.push({
        id: dev.id,
        label: dev.name,
        spanFor: () => dev.span,
        render: (context) => (
          <TemplateWidget widget={dev} now={context.now} language={context.language} />
        )
      })
    }
    return {
      widgets,
      byId: Object.fromEntries(widgets.map((widget) => [widget.id, widget])),
      ids: widgets.map((widget) => widget.id),
      ready
    }
  }, [dev, ready])

  return <WidgetRegistryContext.Provider value={registry}>{children}</WidgetRegistryContext.Provider>
}

export function useWidgetRegistry(): WidgetRegistry {
  const registry = useContext(WidgetRegistryContext)
  if (!registry) throw new Error('useWidgetRegistry must be used inside WidgetRegistryProvider')
  return registry
}
