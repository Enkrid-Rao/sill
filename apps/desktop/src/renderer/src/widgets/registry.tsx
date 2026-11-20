import { ShelfWidget } from '../components/ShelfWidget'
import { MediaWidget } from '../components/widgets/MediaWidget'
import { TodoWidget } from '../components/widgets/TodoWidget'
import { HeroWidget } from './HeroWidget'
import type { WidgetDefinition } from './types'

/**
 * 内置 React 组件注册表：hero / media / shelf / todo。
 *
 * system / processes 已经迁到 `resources/builtin-widgets/`，由
 * WidgetRegistryProvider 从模板包注册，不再在这里留一份 React 兜底。
 */
export const BUILTIN_WIDGETS: readonly WidgetDefinition[] = [
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
    id: 'media',
    nameKey: 'widget.media',
    spanFor: () => 1,
    render: (context) => (
      <MediaWidget
        media={context.snapshot?.media ?? null}
        mediaKnown={Boolean(context.snapshot?.mediaAt)}
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
    id: 'shelf',
    nameKey: 'widget.shelf',
    spanFor: () => 1,
    render: (context) => <ShelfWidget language={context.language} />
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
