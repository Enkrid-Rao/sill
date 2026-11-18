import { describe, expect, it, vi } from 'vitest'
import type { WidgetContext } from './types'
import { runWidgetAction } from './actions'

function makeContext() {
  const mediaCommand = vi.fn(async () => null)
  const onToggleTodo = vi.fn(async () => undefined)
  const context = {
    language: 'zh',
    now: new Date(),
    snapshot: null,
    todos: [],
    mediaPosition: 0,
    mediaProgress: 0,
    mediaCommand,
    onAddTodo: vi.fn(async () => undefined),
    onToggleTodo,
    onUpdateTodo: vi.fn(async () => undefined),
    onRestoreTodo: vi.fn(async () => undefined),
    onRemoveTodo: vi.fn(async () => undefined)
  } as unknown as WidgetContext
  return { context, mediaCommand, onToggleTodo }
}

describe('runWidgetAction', () => {
  it('runs media commands only with action.media', () => {
    const { context, mediaCommand } = makeContext()
    runWidgetAction('media.playpause', undefined, context, [])
    expect(mediaCommand).not.toHaveBeenCalled()

    runWidgetAction('media.playpause', undefined, context, ['action.media'])
    expect(mediaCommand).toHaveBeenCalledWith('playpause')
  })

  it('runs todo.toggle with a string id', () => {
    const { context, onToggleTodo } = makeContext()
    runWidgetAction('todo.toggle', 'todo-1', context, ['action.todo'])
    expect(onToggleTodo).toHaveBeenCalledWith('todo-1')
  })

  it('ignores unknown actions', () => {
    const { context, mediaCommand, onToggleTodo } = makeContext()
    runWidgetAction('system.shutdown', undefined, context, ['action.media', 'action.todo'])
    expect(mediaCommand).not.toHaveBeenCalled()
    expect(onToggleTodo).not.toHaveBeenCalled()
  })
})
