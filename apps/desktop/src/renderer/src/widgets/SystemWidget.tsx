import type { PanelSnapshot } from '../../../shared/data'
import { t, type Language } from '../../../shared/i18n'
import { useSmoothNumber } from '../lib/useSmoothNumber'

export function formatRate(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B/s'
  if (bytes < 1024) return `${Math.round(bytes)} B/s`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB/s`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB/s`
}

function Bar({
  label,
  value,
  pct,
  warm = false
}: {
  label: string
  value: string
  pct: number
  warm?: boolean
}): React.JSX.Element {
  return (
    <div>
      <div className="row lbl">
        <span>{label}</span>
        <span className="val">{value}</span>
      </div>
      <div className={`bar${warm ? ' bar--warm' : ''}`} style={{ marginTop: 6 }}>
        <i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
    </div>
  )
}

interface Props {
  snapshot: PanelSnapshot | null
  language: Language
}

/** CPU / 内存 / GPU / 网络。数据来自主进程按设置间隔推来的快照。 */
export function SystemWidget({ snapshot, language }: Props): React.JSX.Element {
  const cpu = useSmoothNumber(snapshot?.cpu ?? 0)
  const memPct = useSmoothNumber(snapshot?.memPct ?? 0)
  const memUsed = useSmoothNumber(snapshot?.memUsed ?? 0)
  const gpu = useSmoothNumber(snapshot?.gpu ?? 0)
  const down = useSmoothNumber(snapshot?.down ?? 0)
  const gpuValue = snapshot?.gpu != null ? `${Math.round(gpu)}%` : '—'

  return (
    <>
      <div className="row" style={{ marginBottom: 13 }}>
        <span className="cap">{t(language, 'system.title')}</span>
        <span className="cap">
          {snapshot ? `${snapshot.cores} ${t(language, 'system.coresUnit')}` : '—'}
        </span>
      </div>
      <div className="system__bars">
        <Bar
          label={t(language, 'metric.cpu')}
          value={snapshot ? `${Math.round(cpu)}%` : '—'}
          pct={snapshot ? cpu : 0}
        />
        <Bar
          label={t(language, 'metric.memory')}
          value={snapshot ? `${Math.round(memPct)}% · ${memUsed.toFixed(1)} GB` : '—'}
          pct={snapshot ? memPct : 0}
        />
        <Bar
          label={t(language, 'metric.gpu')}
          value={gpuValue}
          pct={snapshot?.gpu != null ? gpu : 0}
          warm
        />
        <Bar
          label={t(language, 'metric.network')}
          value={snapshot ? `↓ ${formatRate(down)}` : '—'}
          pct={snapshot ? Math.min(100, (down / (1024 ** 2)) * 20) : 0}
        />
      </div>
    </>
  )
}
