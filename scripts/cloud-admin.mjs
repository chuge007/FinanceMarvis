/**
 * 云端管理员与租户管理。
 *
 *   node scripts/cloud-admin.mjs create-admin admin 'StrongPass!'
 *   node scripts/cloud-admin.mjs create-user analyst 'Pass!' analyst
 *   node scripts/cloud-admin.mjs list
 */
import { loadCloudConfig } from '../server/cloud/config.mjs'
import { createCloudDb } from '../server/cloud/db.mjs'
import { createStore } from '../server/cloud/store.mjs'

const config = loadCloudConfig()
if (!config.jwtSecret || !config.masterKey) {
  console.error('需要先设置 JWT_SECRET 与 MARVIS_MASTER_KEY 环境变量')
  process.exit(1)
}

const db = await createCloudDb(config)
const store = createStore(db, config)
const [cmd, ...args] = process.argv.slice(2)

if (cmd === 'create-admin' || cmd === 'create-user') {
  const [username, password, role] = args
  const user = await store.createUser({ username, password, role: role ?? (cmd === 'create-admin' ? 'admin' : 'viewer') })
  console.log('已创建', JSON.stringify(user))
} else if (cmd === 'list') {
  console.log(JSON.stringify(await store.listUsers(), null, 2))
} else {
  console.log('用法: create-admin <username> <password> | create-user <username> <password> [role] | list')
}

db.close()
