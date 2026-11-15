import type { PanelSnapshot } from '../../../shared/data'
import { t, type Language } from '../../../shared/i18n'

interface Props {
  snapshot: PanelSnapshot | null
  language: Language
}

/** TOP RAM + TOP GPU。 */
export function ProcessesWidget({ snapshot, language }: Props): React.JSX.Element {
  const vramValue =
    snapshot?.gpuMem != null
      ? `${(snapshot.gpuMem / 1024).toFixed(1)} / ${((snapshot.gpuTotal ?? 0) / 1024).toFixed(1)} GB`
      : '—'

  return (
    <>
      <div className="row" style={{ marginBottom: 9 }}>
        <span className="cap">{t(language, 'system.topRam')}</span>
        <span className="cap">{t(language, 'system.memory')}</span>
      </div>
      {(snapshot?.procs ?? []).slice(0, 2).map((proc) => (
        <div className="proc" key={proc.name}>
          <b>{proc.name}</b>
          <span>{(proc.mb / 1024).toFixed(1)} GB</span>
        </div>
      ))}
      {!snapshot?.procs?.length ? <div className="proc proc--empty">—</div> : null}
      <div className="row" style={{ marginTop: 11 }}>
        <span className="cap">{t(language, 'system.topGpu')}</span>
        <span className="cap">{vramValue}</span>
      </div>
    </>
  )
}
