// web 组件在独立 guest 里运行；trust: trusted 时可以直接用 Node。
const os = require("node:os")

sill.ready(({ data }) => {
  document.getElementById("time").textContent = data.now?.time ?? "--:--"
  document.getElementById("date").textContent = os.hostname()
})
