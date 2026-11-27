/**
 * 兼容层：因子计算已上移到 core/domain/factors.mjs，本地与云端共用。
 * 旧 import 路径继续可用，但不再是第二份实现。
 */
export * from '../../core/domain/factors.mjs'
