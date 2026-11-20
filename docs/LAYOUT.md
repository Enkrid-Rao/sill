# Layout

`layout.json` has two modes. New installs default to **free**; flow is still available in Settings → Panel →
Layout mode. Existing v1 files migrate to flow; `version` becomes `2`.

## flow

```json
{
  "version": 2,
  "mode": "flow",
  "order": ["hero", "system", "todo"],
  "spans": { "hero": 3 },
  "hidden": [],
  "boxes": {}
}
```

- Cards follow the sheet grid.
- `spans` is 1–3 columns.
- Drag a card onto another to swap; arrows move; span buttons change width.

## free

```json
{
  "version": 2,
  "mode": "free",
  "boxes": {
    "hero": { "x": 0, "y": 40, "w": 337, "h": 220 },
    "system": { "x": 0, "y": 272, "w": 164, "h": 210 },
    "processes": { "x": 173, "y": 272, "w": 164, "h": 210 }
  }
}
```

- `boxes` are px relative to the sheet; cards are absolutely positioned.
- Any size, any position; cards may overlap.
- `w`/`h` are clamped to 150×48 minimum.
- The sheet height is `max(y + h) + 24`.

### Enabling

Settings → Panel → **布局模式 / Layout mode**（默认自由）, or the layout bar toggle. When boxes are
missing, Sill measures the current flow layout after the first data sample and writes real boxes.
Drag the grip to move; drag the bottom-right corner to resize. **流式 / Flow** switches back.

When a new widget appears while free layout is active, it is measured in flow first, then placed.

## Why

Flow is good for a tidy rail; free is for component dashboards where the user decides where things
go. The layout model and widget runtime are independent: a web component can be 160×160 or 700×300
without changing its code.

## Limits

- Single sheet, no nested containers or free rotation.
- No snapping/guides yet.
- Resize/move persists on every pointer move; a batched commit is future work.
- Desktop-level windows / click-through / multi-monitor placement are separate from this sheet.
