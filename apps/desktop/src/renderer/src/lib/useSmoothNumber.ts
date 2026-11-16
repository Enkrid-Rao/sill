import { useEffect, useRef, useState } from 'react'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * 把监测快照里的离散数字过渡到目标值。
 * 采样间隔可以到 5s；如果数值直接跳，面板会像“突然坏了一下”。
 */
export function useSmoothNumber(target: number, duration = 560): number {
  const safeTarget = Number.isFinite(target) ? target : 0
  const [value, setValue] = useState(safeTarget)
  const valueRef = useRef(safeTarget)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const from = valueRef.current
    const delta = safeTarget - from

    if (Math.abs(delta) < 0.01 || duration <= 0 || prefersReducedMotion()) {
      valueRef.current = safeTarget
      setValue(safeTarget)
      return
    }

    const started = performance.now()
    const step = (now: number): void => {
      const progress = Math.min(1, (now - started) / duration)
      // easeOutCubic：快进慢收，读数变化看起来更像连续测量
      const eased = 1 - (1 - progress) ** 3
      const next = from + delta * eased
      valueRef.current = next
      setValue(next)
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step)
      } else {
        valueRef.current = safeTarget
        setValue(safeTarget)
        frameRef.current = null
      }
    }

    frameRef.current = requestAnimationFrame(step)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [safeTarget, duration])

  return value
}
