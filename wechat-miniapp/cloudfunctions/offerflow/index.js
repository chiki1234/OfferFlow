let runtime

async function dependencies() {
  if (!runtime) {
    runtime = Promise.all([import('wx-server-sdk'), import('node:crypto'), import('./domain.js')]).then(([sdk, crypto, domain]) => {
      const cloud = sdk.default
      cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
      return { cloud, crypto, domain: domain.default, db: cloud.database() }
    })
  }
  return runtime
}

function publicState(document) {
  const state = { ...document.state }
  delete state.receipts
  delete state.garbage
  return { state, owner: document.owner, revision: document.revision, cleanupPending: document.state.garbage.length > 0 }
}

async function sweep(cloud, state) {
  if (!state.garbage.length) return
  try {
    const result = await cloud.deleteFile({ fileList: state.garbage.slice(0, 50) })
    const removed = new Set(result.fileList.filter(item => item.status === 0).map(item => item.fileID))
    state.garbage = state.garbage.filter(fileID => !removed.has(fileID))
  } catch {
    return
  }
}

exports.main = async (event = {}) => {
  try {
    const { cloud, crypto, domain, db } = await dependencies()
    const identity = cloud.getWXContext()
    if (!identity.OPENID || !identity.APPID) domain.fail('请在微信中打开', 'AUTH')
    if (!process.env.WECHAT_APP_ID || identity.APPID !== process.env.WECHAT_APP_ID) domain.fail('小程序未关联此服务', 'CONFIG')
    const owner = crypto.createHash('sha256').update(`${identity.APPID}:${identity.OPENID}`).digest('hex')
    const collection = db.collection('offerflow_workspaces')
    const load = async () => {
      const result = await collection.where({ _id: owner, owner }).limit(1).get()
      return result.data[0]
    }
    let document = await load()
    if (!document) {
      try {
        await collection.add({ data: { _id: owner, owner, revision: 0, state: domain.empty(), updatedAt: new Date().toISOString() } })
      } catch (error) {
        document = await load()
        if (!document) throw error
      }
      document = document || await load()
    }
    const action = domain.text(event.action, 40, '操作', true)
    if (action === 'load') return { ok: true, ...publicState(document) }
    const requestId = domain.text(event.requestId, 80, '请求标识', true)
    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)) domain.fail('请求标识无效')
    const operationId = crypto.createHash('sha256').update(`${owner}:${requestId}`).digest('hex').slice(0, 32)
    if (document.state.receipts.includes(requestId)) return { ok: true, operationId, ...publicState(document) }
    if (!Number.isInteger(event.revision) || event.revision !== document.revision) domain.fail('数据有更新，请刷新后重试', 'STALE')
    const input = event.input || {}
    if (typeof input !== 'object' || Array.isArray(input) || Buffer.byteLength(JSON.stringify(input)) > 80000) domain.fail('提交内容过大或格式错误')
    const context = { owner, now: new Date().toISOString(), id: operationId }
    if (action === 'finishUpload' || action === 'discardUpload') {
      const upload = domain.find(document.state.uploads, input.id)
      const fileID = domain.text(input.fileID, 1000, '文件', true)
      const env = identity.ENV || process.env.TCB_ENV || process.env.SCF_NAMESPACE
      if (!env || !fileID.startsWith(`cloud://${env}.`) || !fileID.endsWith(`/${upload.path}`)) domain.fail('文件不属于当前账户')
      if (action === 'finishUpload') {
        const downloaded = await cloud.downloadFile({ fileID })
        const bytes = downloaded.fileContent
        if (bytes.length > 5 * 1024 * 1024) domain.fail('请选择 5 MB 以内的文件')
        const extension = upload.name.split('.').pop().toLowerCase()
        const signatures = { pdf: bytes.subarray(0, 5).toString() === '%PDF-', png: bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', jpg: bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255, jpeg: bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255, txt: bytes.length <= 1024 * 1024 && !bytes.includes(0) && !bytes.toString('utf8').includes('\ufffd') }
        if (!signatures[extension]) domain.fail('文件内容与格式不符，文本请使用 UTF-8')
        context.file = { id: upload.id, fileID, size: bytes.length }
      } else context.file = { id: upload.id, fileID }
    }
    await sweep(cloud, document.state)
    const state = domain.apply(document.state, action, input, context)
    state.receipts = [...state.receipts, requestId].slice(-64)
    if (Buffer.byteLength(JSON.stringify(state), 'utf8') > 700 * 1024) domain.fail('资料空间已满，请导出并整理旧记录', 'CAPACITY')
    const next = { state, revision: document.revision + 1, updatedAt: context.now }
    const saved = await collection.where({ _id: owner, owner, revision: document.revision }).update({ data: next })
    if (saved.stats.updated !== 1) domain.fail('数据有更新，请刷新后重试', 'STALE')
    let cleanupPending = false
    if (state.garbage.length) {
      await sweep(cloud, state)
      const cleanup = await collection.where({ _id: owner, owner, revision: next.revision }).update({ data: { 'state.garbage': state.garbage } }).catch(() => null)
      cleanupPending = !cleanup || state.garbage.length > 0
    }
    return { ok: true, operationId, ...publicState({ ...next, owner }), cleanupPending }
  } catch (error) {
    if (error.publicCode) return { ok: false, code: error.publicCode, message: error.message }
    console.error('offerflow', { code: error.errCode || error.code || 'INTERNAL' })
    return { ok: false, code: 'SERVICE', message: '暂时无法连接，请稍后重试' }
  }
}
