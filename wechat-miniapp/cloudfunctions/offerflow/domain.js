const stages = ['planned', 'applied', 'assessment', 'interview', 'offer', 'closed']
const stageNames = { planned: '待投递', applied: '已投递', assessment: '测评中', interview: '面试中', offer: '已获 Offer', closed: '已结束' }

function fail(message, code = 'INVALID') {
  const error = new Error(message)
  error.publicCode = code
  throw error
}

function text(value, max, label, required = false) {
  if (value != null && typeof value !== 'string') fail(`${label}格式不正确`)
  const result = (value || '').trim()
  if (required && !result) fail(`请填写${label}`)
  if (result.length > max) fail(`${label}最多 ${max} 字`)
  return result
}

function choice(value, values, label) {
  if (!values.includes(value)) fail(`${label}无效`)
  return value
}

function find(items, id) {
  const item = items.find(entry => entry.id === id)
  if (!item) fail('记录已不存在，请刷新', 'NOT_FOUND')
  return item
}

function date(value) {
  const result = text(value, 40, '时间', true)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(result) || !Number.isFinite(Date.parse(result))) fail('请选择有效时间')
  return new Date(result).toISOString()
}

function link(value) {
  const result = text(value, 1500, '链接')
  if (result && !/^https?:\/\/[^\s]+$/i.test(result)) fail('链接需以 https:// 或 http:// 开头')
  return result
}

function empty() {
  return { schemaVersion: 1, jobs: [], agenda: [], notes: [], resumes: [], assets: [], uploads: [], events: [], receipts: [], garbage: [] }
}

function event(state, jobId, title, now, id) {
  state.events.unshift({ id, jobId, title, at: now })
}

function apply(state, action, input, context) {
  const { now, id } = context
  const jobFor = jobId => jobId ? find(state.jobs, jobId) : null
  const noteFor = noteId => {
    if (noteId && find(state.notes, noteId).kind !== 'experience') fail('请选择一条经历')
    return noteId || ''
  }
  if (action === 'saveJob') {
    const existing = input.id ? find(state.jobs, input.id) : null
    const resumeId = text(input.resumeId, 80, '简历')
    if (resumeId) find(state.resumes, resumeId)
    const item = {
      id: existing ? existing.id : id,
      company: text(input.company, 80, '公司', true),
      role: text(input.role, 100, '岗位', true),
      city: text(input.city, 60, '城市'),
      salary: text(input.salary, 60, '薪资'),
      url: link(input.url),
      jd: text(input.jd, 12000, '岗位描述'),
      resumeId,
      starred: existing ? existing.starred : false,
      stage: existing ? existing.stage : choice(input.stage || 'planned', stages, '阶段'),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    }
    if (existing) Object.assign(existing, item)
    else state.jobs.unshift(item)
    event(state, item.id, existing ? '更新岗位' : '添加岗位', now, id + '-event')
  } else if (action === 'stageJob') {
    const job = find(state.jobs, input.id)
    const stage = choice(input.stage, stages, '阶段')
    if (job.stage === stage) return state
    job.stage = stage
    job.updatedAt = now
    if (stage === 'closed' || stage === 'offer') {
      state.agenda.filter(item => item.jobId === job.id && item.status === 'pending').forEach(item => { item.status = 'cancelled' })
    }
    event(state, job.id, stageNames[stage], now, id)
  } else if (action === 'starJob') {
    const job = find(state.jobs, input.id)
    job.starred = !job.starred
    job.updatedAt = now
  } else if (action === 'recordProgress') {
    const job = find(state.jobs, input.id)
    const summary = text(input.summary, 1000, '进展', true)
    job.updatedAt = now
    event(state, job.id, summary, now, id)
  } else if (action === 'deleteJob') {
    find(state.jobs, input.id)
    state.jobs = state.jobs.filter(item => item.id !== input.id)
    const removed = state.agenda.filter(item => item.jobId === input.id).map(item => item.id)
    const assets = state.assets.filter(item => item.ownerId === input.id || removed.includes(item.ownerId))
    state.garbage.push(...assets.map(item => item.fileID))
    state.assets = state.assets.filter(item => !assets.includes(item))
    state.agenda = state.agenda.filter(item => item.jobId !== input.id)
    state.events = state.events.filter(item => item.jobId !== input.id)
    state.notes.forEach(item => {
      if (item.jobId === input.id) item.jobId = ''
      if (removed.includes(item.sourceId)) item.sourceId = ''
    })
  } else if (action === 'saveAgenda') {
    const existing = input.id ? find(state.agenda, input.id) : null
    if (existing && existing.status !== 'pending') fail('已结束的日程不能改期')
    const kind = choice(input.kind, ['interview', 'assessment', 'task'], '日程类型')
    const job = jobFor(text(input.jobId, 80, '岗位'))
    if (kind !== 'task' && !job) fail('请选择关联岗位')
    if (job && ['closed', 'offer'].includes(job.stage)) fail('请先重新开启岗位流程')
    const timing = choice(input.timing, ['slot', 'deadline'], '时间方式')
    const startAt = date(input.startAt)
    const endAt = timing === 'slot' ? date(input.endAt) : ''
    if (endAt && endAt <= startAt) fail('结束时间需晚于开始时间')
    if (endAt && Date.parse(endAt) - Date.parse(startAt) > 86400000) fail('日程时长不能超过 24 小时')
    if (timing === 'slot' && state.agenda.some(item => item.id !== input.id && item.status === 'pending' && item.timing === 'slot' && startAt < item.endAt && endAt > item.startAt)) fail('这个时段已有安排，请调整时间', 'CONFLICT_TIME')
    const item = {
      id: existing ? existing.id : id, kind, jobId: job ? job.id : '', timing, startAt, endAt,
      title: text(input.title, 120, '日程名称', true),
      location: text(input.location, 500, '地点或会议链接'),
      notes: text(input.notes, 6000, '备注'),
      status: 'pending', reviewed: false, review: '',
      createdAt: existing ? existing.createdAt : now, updatedAt: now
    }
    if (existing) Object.assign(existing, item)
    else state.agenda.unshift(item)
    if (job) {
      if (kind === 'interview') job.stage = 'interview'
      if (kind === 'assessment' && ['planned', 'applied'].includes(job.stage)) job.stage = 'assessment'
      job.updatedAt = now
      event(state, job.id, `${existing ? '调整' : '安排'} · ${item.title}`, now, id + '-event')
    }
  } else if (action === 'completeAgenda') {
    const item = find(state.agenda, input.id)
    if (item.status !== 'pending') fail('这项日程已结束')
    if (item.timing === 'slot' && item.startAt > now) fail('日程尚未开始')
    item.status = 'done'
    item.completedAt = now
    if (item.timing === 'deadline' && item.kind !== 'task') {
      item.timing = 'slot'
      item.endAt = now
      item.startAt = new Date(Date.parse(now) - 3600000).toISOString()
    }
    if (item.jobId) event(state, item.jobId, `完成 · ${item.title}`, now, id)
  } else if (action === 'cancelAgenda') {
    const item = find(state.agenda, input.id)
    if (item.status !== 'pending') fail('这项日程已结束')
    item.status = 'cancelled'
    if (item.jobId) event(state, item.jobId, `取消 · ${item.title}`, now, id)
  } else if (action === 'reviewInterview') {
    const item = find(state.agenda, input.id)
    if (item.kind !== 'interview' || item.status !== 'done') fail('请先完成面试')
    item.review = text(input.review, 12000, '复盘', true)
    item.reviewed = true
    item.updatedAt = now
    event(state, item.jobId, `复盘 · ${item.title}`, now, id)
  } else if (action === 'saveNote') {
    const existing = input.id ? find(state.notes, input.id) : null
    const kind = existing ? existing.kind : choice(input.kind, ['question', 'experience'], '资料类型')
    const sourceId = text(input.sourceId, 80, '来源')
    const source = sourceId ? find(state.agenda, sourceId) : null
    if (source && source.kind !== 'interview') fail('问题来源必须是面试')
    const job = jobFor(source ? source.jobId : text(input.jobId, 80, '岗位'))
    const item = {
      id: existing ? existing.id : id, kind,
      title: text(input.title, 500, kind === 'question' ? '问题' : '经历名称', true),
      body: text(input.body, 16000, kind === 'question' ? '回答' : '经历内容'),
      category: text(input.category, 40, '分类'),
      experienceId: kind === 'question' ? noteFor(text(input.experienceId, 80, '经历')) : '',
      sourceId, jobId: job ? job.id : '',
      createdAt: existing ? existing.createdAt : now, updatedAt: now
    }
    if (existing) Object.assign(existing, item)
    else state.notes.unshift(item)
  } else if (action === 'importQuestions') {
    const lines = text(input.lines, 20000, '问题', true).split(/\r?\n/).map(value => value.replace(/^\s*(?:\d+[.、)]|[-*])\s*/, '').trim()).filter(Boolean)
    if (lines.length > 100) fail('每次最多导入 100 个问题')
    if (lines.some(value => value.length > 500)) fail('每个问题最多 500 字')
    const category = text(input.category, 40, '分类')
    const experienceId = noteFor(text(input.experienceId, 80, '经历'))
    const seen = new Set(state.notes.filter(item => item.kind === 'question').map(item => item.title))
    lines.forEach((title, index) => {
      if (seen.has(title)) return
      seen.add(title)
      state.notes.unshift({ id: id + '-' + index, kind: 'question', title, body: '', category, experienceId, sourceId: '', jobId: '', createdAt: now, updatedAt: now })
    })
  } else if (action === 'deleteNote') {
    find(state.notes, input.id)
    state.notes = state.notes.filter(item => item.id !== input.id)
    state.notes.forEach(item => { if (item.experienceId === input.id) item.experienceId = '' })
    state.resumes.forEach(item => { item.experienceIds = item.experienceIds.filter(value => value !== input.id) })
  } else if (action === 'reserveUpload') {
    state.uploads = state.uploads.filter(item => Date.parse(now) - Date.parse(item.createdAt) < 86400000)
    if (state.uploads.length >= 10) fail('待上传文件过多，请稍后再试')
    const name = text(input.name, 120, '文件名', true)
    const kind = choice(input.kind, ['resume', 'jd', 'transcript'], '文件类型')
    const ownerId = text(input.ownerId, 80, '关联记录')
    const extension = name.split('.').pop().toLowerCase()
    const allowed = { resume: ['pdf'], jd: ['jpg', 'jpeg', 'png'], transcript: ['pdf', 'txt'] }
    if (!allowed[kind].includes(extension)) fail('文件格式不支持')
    if (kind === 'jd') find(state.jobs, ownerId)
    if (kind === 'transcript' && find(state.agenda, ownerId).kind !== 'interview') fail('请选择一场面试')
    state.uploads.push({ id, name, kind, ownerId, path: `files/${context.owner}/${id}.${extension}`, createdAt: now })
  } else if (action === 'finishUpload') {
    const upload = find(state.uploads, input.id)
    if (!context.file || context.file.id !== upload.id) fail('文件未校验')
    const asset = { id: upload.id, name: upload.name, fileID: context.file.fileID, size: context.file.size, createdAt: now }
    if (upload.kind === 'resume') state.resumes.unshift({ ...asset, experienceIds: [] })
    else {
      if (upload.kind === 'jd') find(state.jobs, upload.ownerId)
      else find(state.agenda, upload.ownerId)
      state.assets.unshift({ ...asset, kind: upload.kind, ownerId: upload.ownerId })
    }
    state.uploads = state.uploads.filter(item => item.id !== upload.id)
  } else if (action === 'deleteAsset') {
    const asset = find(state.assets, input.id)
    state.garbage.push(asset.fileID)
    state.assets = state.assets.filter(item => item.id !== asset.id)
  } else if (action === 'discardUpload') {
    const upload = find(state.uploads, input.id)
    if (!context.file || context.file.id !== upload.id) fail('文件未校验')
    state.garbage.push(context.file.fileID)
    state.uploads = state.uploads.filter(item => item.id !== upload.id)
  } else if (action === 'saveResume') {
    const resume = find(state.resumes, input.id)
    resume.name = text(input.name, 120, '简历名称', true)
    if (!Array.isArray(input.experienceIds) || input.experienceIds.length > 30) fail('经历数量无效')
    resume.experienceIds = [...new Set(input.experienceIds.map(noteFor))].filter(Boolean)
  } else if (action === 'deleteResume') {
    const resume = find(state.resumes, input.id)
    if (state.jobs.some(item => item.resumeId === input.id)) fail('请先解除岗位与这份简历的关联')
    state.garbage.push(resume.fileID)
    state.resumes = state.resumes.filter(item => item.id !== input.id)
  } else if (action === 'clearData') {
    return { ...empty(), garbage: [...state.garbage, ...state.resumes.map(item => item.fileID), ...state.assets.map(item => item.fileID)] }
  } else if (action === 'cleanupFiles') {
    return state
  } else fail('操作不存在')
  return state
}

module.exports = { apply, empty, fail, find, text }
