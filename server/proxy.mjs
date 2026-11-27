/**
 * 兼容壳。
 *
 * 旧入口 `node server/proxy.mjs` 仍可用，但逻辑已全部迁到 server/index.mjs：
 *   - 路由表 → server/upstream/registry.mjs（单一真源）
 *   - 转发   → server/upstream/forward.mjs（含 TTL 缓存与熔断）
 *   - 静态   → server/http/static.mjs
 *   - AI 网关 → server/ai-gateway.mjs
 *
 * 保留这个文件是为了不破坏 README、旧脚本与用户习惯；新代码请直接用 index.mjs。
 */
import './index.mjs'
