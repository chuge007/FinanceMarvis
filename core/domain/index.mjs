/**
 * 领域内核统一出口。本地 exe 与云端服务都只从这里 import，
 * 不允许绕过它各自实现因子/风控口径。
 */
export * from './contracts.mjs'
export * from './factors.mjs'
export * from './regime.mjs'
export * from './attribution.mjs'
export * from './riskRules.mjs'
