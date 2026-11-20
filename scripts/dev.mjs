import { spawn } from 'node:child_process'

// 有些终端（包括 DSH 宿主）会带 ELECTRON_RUN_AS_NODE=1；Electron 会被当成 Node 跑，
// 启动时报 "electron.app.setName is not a function"。dev 入口统一清掉再转给 electron-vite。
delete process.env.ELECTRON_RUN_AS_NODE

const child = spawn('pnpm', ['--filter', '@sill/desktop', 'dev'], {
  stdio: 'inherit',
  env: process.env,
  shell: true
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
