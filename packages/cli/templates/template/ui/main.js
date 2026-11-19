// ui/main.js 在面板页面里执行一次。宿主注入两个参数：
//   sill —— 数据 / 存储 / 动作 / 生命周期
//   root —— 这张卡的 shadow root
// 保存文件会自动热重载；面板上按 F12 打开 DevTools 看 console。

const timeEl = root.getElementById("time")
const dateEl = root.getElementById("date")
const counterEl = root.getElementById("counter")

// 1) 数据：manifest 里 data[].id 就是这里的 key（示例是 now）
sill.onData(({ data }) => {
  if (timeEl) timeEl.textContent = data.now?.time ?? "--:--"
  if (dateEl) dateEl.textContent = data.now?.dateLabel ?? ""
})

// 2) 私有存储：<userData>/widget-data/<id>.json
let clicks = 0
sill.storage.get().then((saved) => {
  clicks = Number(saved.clicks) || 0
  if (counterEl) counterEl.textContent = String(clicks)
})

counterEl?.addEventListener("click", () => {
  clicks += 1
  counterEl.textContent = String(clicks)
  sill.storage.patch({ clicks })
})

// 3) 清理：卡片卸载或热重载前调用，定时器 / 监听写在这里
const onResize = () => {
  root.host?.toggleAttribute("data-narrow", (root.host?.clientWidth ?? 0) < 240)
}
window.addEventListener("resize", onResize)
sill.onDispose(() => window.removeEventListener("resize", onResize))
