import type { PanelSnapshot } from '../../../shared/data'
import { t, type Language } from '../../../shared/i18n'

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

/** CPU / 内存 / GPU / 网络。数据来自主进程 1.5s 一次的快照。 */
export function SystemWidget({ snapshot, language }: Props): React.JSX.Element {
  const gpuValue = snapshot?.gpu != null ? `${snapshot.gpu}%` : '—'

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
          value={snapshot ? `${snapshot.cpu}%` : '—'}
          pct={snapshot?.cpu ?? 0}
        />
        <Bar
          label={t(language, 'metric.memory')}
          value={snapshot ? `${snapshot.memPct}% · ${snapshot.memUsed.toFixed(1)} GB` : '—'}
          pct={snapshot?.memPct ?? 0}
        />
        <Bar label={t(language, 'metric.gpu')} value={gpuValue} pct={snapshot?.gpu ?? 0} warm />
        <Bar
          label={t(language, 'metric.network')}
          value={snapshot ? `↓ ${formatRate(snapshot.down)}` : '—'}
          pct={snapshot ? Math.min(100, (snapshot.down / (1024 ** 2)) * 20) : 0}
        />
      </div>
    </>
  )
}
