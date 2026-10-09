import { config } from '../config'

export async function call(action, input = {}, revision = 0, requestId = '') {
  if (!getApp().ready) {
    const error = new Error('服务尚未连接')
    error.code = 'CONFIG'
    throw error
  }
  let response
  try {
    response = await wx.cloud.callFunction({ name: config.functionName, data: { action, input, revision, requestId } })
  } catch {
    const error = new Error('连接中断，请重试')
    error.code = 'NETWORK'
    throw error
  }
  const result = response.result
  if (!result || !result.ok) {
    const error = new Error(result && result.message || '暂时无法连接')
    error.code = result && result.code || 'SERVICE'
    throw error
  }
  return result
}

export function requestId() {
  return 'wx_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}
