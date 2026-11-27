/**
 * 任务队列：内存实现 + 可选 BullMQ。
 *
 * Wind 长任务 2-15 分钟、回填、CSV 抓取、研报生成都走这里。
 * 没装 bullmq 时用内存队列，单实例可用；装了并设置 REDIS_URL 后自动切换。
 */
import crypto from 'node:crypto'

export function createQueue(config, { log = () => {} } = {}) {
  let bull = null
  let queue = null

  async function init() {
    if (!config.redisUrl) return 'memory'
    try {
      const { Queue } = await import('bullmq')
      queue = new Queue('marvis', { connection: { url: config.redisUrl } })
      bull = Queue
      return 'bullmq'
    } catch {
      return 'memory'
    }
  }

  const workers = new Map()
  const jobs = new Map()
  const waiting = []

  function register(kind, handler, concurrency = 1) {
    workers.set(kind, { handler, concurrency, active: 0 })
  }

  function pump() {
    for (const [kind, worker] of workers) {
      while (worker.active < worker.concurrency) {
        const idx = waiting.findIndex((j) => j.kind === kind && j.status === 'waiting' && j.runAt <= Date.now())
        if (idx < 0) break
        const job = waiting.splice(idx, 1)[0]
        job.status = 'running'
        job.startedAt = Date.now()
        worker.active += 1
        void worker
          .handler(job.payload, job)
          .then((result) => {
            job.status = 'done'
            job.result = result
            job.updatedAt = Date.now()
          })
          .catch((err) => {
            job.attempts += 1
            job.error = err?.message ?? String(err)
            if (job.attempts < job.maxAttempts) {
              job.status = 'waiting'
              job.runAt = Date.now() + Math.min(60_000, 1000 * 2 ** job.attempts)
            } else {
              job.status = 'failed'
            }
            job.updatedAt = Date.now()
          })
          .finally(() => {
            worker.active -= 1
            pump()
          })
      }
    }
  }

  async function enqueue(kind, payload, opts = {}) {
    const id = opts.id ?? crypto.randomUUID()
    const job = {
      id,
      kind,
      payload,
      status: 'waiting',
      attempts: 0,
      maxAttempts: opts.attempts ?? 3,
      runAt: Date.now() + (opts.delayMs ?? 0),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    if (bull && queue) {
      await queue.add(kind, { ...payload, id }, { jobId: id, delay: opts.delayMs ?? 0, attempts: job.maxAttempts })
    } else {
      jobs.set(id, job)
      waiting.push(job)
      pump()
    }
    return id
  }

  function get(id) {
    const job = jobs.get(id)
    if (!job) return null
    return {
      id: job.id,
      kind: job.kind,
      status: job.status,
      attempts: job.attempts,
      result: job.result ?? null,
      error: job.error ?? null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }
  }

  function list(userId) {
    return [...jobs.values()]
      .filter((j) => !userId || j.payload?.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 100)
      .map((j) => get(j.id))
  }

  const timer = setInterval(pump, 1000)
  timer.unref?.()

  return {
    init,
    register,
    enqueue,
    get,
    list,
    get mode() {
      return bull ? 'bullmq' : 'memory'
    },
    close() {
      clearInterval(timer)
      if (queue) void queue.close()
    },
  }
}
