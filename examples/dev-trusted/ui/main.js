const os = require('node:os')
const { execSync } = require('node:child_process')

document.querySelector('#host').textContent = os.hostname()
document.querySelector('#meta').textContent = `node ${process.versions.node} · ${execSync('whoami').toString().trim()}`

sill.ready(({ data }) => {
  document.querySelector('#time').textContent = data.now?.time ?? '--:--'
})
