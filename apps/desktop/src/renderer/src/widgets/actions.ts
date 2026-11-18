import type { WidgetContext } from './types'

/** Host-side allowlist. A template or web guest can only call these. */
export function runWidgetAction(
  action: string,
  arg: unknown,
  context: WidgetContext,
  permissions: readonly string[]
): void {
  if (action.startsWith('media.') && !permissions.includes('action.media')) return
  if (action.startsWith('todo.') && !permissions.includes('action.todo')) return

  switch (action) {
    case 'media.playpause':
      void context.mediaCommand('playpause')
      break
    case 'media.next':
      void context.mediaCommand('next')
      break
    case 'media.prev':
      void context.mediaCommand('prev')
      break
    case 'media.mute':
      void context.mediaCommand('mute')
      break
    case 'todo.toggle':
      if (typeof arg === 'string') void context.onToggleTodo(arg)
      break
    default:
      break
  }
}
