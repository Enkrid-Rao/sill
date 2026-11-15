import type { CardId } from '../../../shared/layout'
import { MediaWidget } from '../components/widgets/MediaWidget'
import { TodoWidget } from '../components/widgets/TodoWidget'
import { HeroWidget } from './HeroWidget'
import { ProcessesWidget } from './ProcessesWidget'
import { SystemWidget } from './SystemWidget'
import type { WidgetDefinition } from './types'

/**
 * 内置组件注册表。
 *
 * 面板不再知道「hero / system / ...」长什么样：它只按 layout.order 查这张表，
 * 把 context 交给 render()。新增内置组件 = 加一个 definition + 一个 i18n 名字 +
 * 在 shared/layout 的 CARD_IDS 里加 id；App.tsx 不需要改。
 */
export const WIDGETS: readonly WidgetDefinition[] = [
  {
    id: 'hero',
    nameKey: 'widget.hero',
    className: 'card--hero',
    spanFor: () => 3,
    render: (context) => (
      <HeroWidget
        now={context.now}
        language={context.language}
        weather={context.snapshot?.weather ?? null}
      />
    )
  },
  {
    id: 'system',
    nameKey: 'widget.system',
    spanFor: () => 1,
    render: (context) => (
      <SystemWidget snapshot={context.snapshot} language={context.language} />
    )
  },
  {
    id: 'processes',
    nameKey: 'widget.processes',
    spanFor: () => 1,
    render: (context) => (
      <ProcessesWidget snapshot={context.snapshot} language={context.language} />
    )
  },
  {
    id: 'media',
    nameKey: 'widget.media',
    spanFor: () => 1,
    render: (context) => (
      <MediaWidget
        media={context.snapshot?.media ?? null}
        position={context.mediaPosition}
        progress={context.mediaProgress}
        volume={context.snapshot?.volume ?? -1}
        muted={context.snapshot?.muted ?? false}
        language={context.language}
        onCommand={context.mediaCommand}
      />
    )
  },
  {
    id: 'todo',
    nameKey: 'widget.todo',
    className: 'card--grow',
    // 三列时待办默认独占整行；两列时和媒体并排
    spanFor: (columns) => (columns === 3 ? 3 : 1),
    render: (context) => (
      <TodoWidget
        items={context.todos}
        language={context.language}
        onAdd={context.onAddTodo}
        onToggle={context.onToggleTodo}
        onUpdate={context.onUpdateTodo}
        onRestore={context.onRestoreTodo}
        onRemove={context.onRemoveTodo}
      />
    )
  }
]

export const WIDGET_BY_ID = Object.fromEntries(WIDGETS.map((widget) => [widget.id, widget])) as Record<
  CardId,
  WidgetDefinition
>
