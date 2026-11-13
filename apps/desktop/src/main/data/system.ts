import os from 'node:os'

interface CpuTimes {
  idle: number
  total: number
}

function readCpu(): CpuTimes {
  let idle = 0
  let total = 0
  for (const cpu of os.cpus()) {
    const times = cpu.times
    idle += times.idle
    total += times.user + times.nice + times.sys + times.idle + times.irq
  }
  return { idle, total }
}

let previous = readCpu()

/** 面板重新打开时调用，避免把「上次打开至今」的平均值算成当前 CPU */
export function resetCpu(): void {
  previous = readCpu()
}

export interface SystemSample {
  cpu: number
  cores: number
  memPct: number
  memUsed: number
  memTotal: number
}

export function sampleSystem(): SystemSample {
  const current = readCpu()
  const idle = current.idle - previous.idle
  const total = current.total - previous.total
  previous = current

  const cpu = total > 0 ? Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100))) : 0
  const memTotal = os.totalmem() / 1024 ** 3
  const memFree = os.freemem() / 1024 ** 3
  const memUsed = Math.max(0, memTotal - memFree)

  return {
    cpu,
    cores: os.cpus().length,
    memPct: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0,
    memUsed: Math.round(memUsed * 10) / 10,
    memTotal: Math.round(memTotal * 10) / 10
  }
}
