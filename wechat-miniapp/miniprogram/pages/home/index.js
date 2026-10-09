import { call, requestId } from '../../services/api'
import { config } from '../../config'
import { empty, present, stageOptions, kindOptions, dateKey, timeKey, iso } from '../../utils/presentation'

const titles = { job: '添加岗位', agenda: '安排日程', question: '记录问题', experience: '添加经历', review: '面试复盘', resume: '简历', progress: '记录进展', bulk: '批量导入', textAsset: '面试材料', settings: '我的资料' }

Page({
  data: {
    tab: 'today', filter: 'active', query: '', libraryKind: 'question',
    selectedDay: dateKey(), loaded: false, loading: true, saving: false, error: '', listLimit: 40,
    sheet: '', sheetTitle: '', form: {}, detail: null, privacy: false,
    stageOptions, kindOptions,
    jobOptions: [], resumeOptions: [], experienceOptions: [],
    filters: [{ id: 'active', name: '进行中' }, { id: 'planned', name: '待投递' }, { id: 'offer', name: 'Offer' }, { id: 'closed', name: '已结束' }, { id: 'all', name: '全部' }],
    libraryTabs: [{ id: 'question', name: '面试问题' }, { id: 'experience', name: '经历' }, { id: 'resume', name: '简历' }],
    view: present(empty(), 'active', '', 'question', dateKey())
  },

  onLoad() {
    this.state = empty()
    this.revision = 0
    this.refreshVersion = 0
    this.privacyHandler = resolve => {
      this.privacyResolve = resolve
      this.setData({ privacy: true })
    }
    if (wx.onNeedPrivacyAuthorization) wx.onNeedPrivacyAuthorization(this.privacyHandler)
    this.refresh()
  },

  onShow() {
    if (this.data.loaded && !this.data.sheet && !this.busy) this.refresh()
    clearInterval(this.timer)
    this.timer = setInterval(() => {
      if (this.state && this.data.loaded) this.render()
    }, 60000)
  },

  onHide() { clearInterval(this.timer) },
  onUnload() {
    clearInterval(this.timer)
    if (wx.offNeedPrivacyAuthorization) wx.offNeedPrivacyAuthorization(this.privacyHandler)
  },
  async onPullDownRefresh() {
    await this.refresh()
    wx.stopPullDownRefresh()
  },
  onReachBottom() { if (this.data.view.hasMore) this.loadMore() },
  loadMore() { this.setData({ listLimit: this.data.listLimit + 40 }); this.render() },

  render() {
    const { tab, filter, query, libraryKind, selectedDay } = this.data
    const model = present(this.state, filter, query, libraryKind, selectedDay)
    this.model = model
    const limit = this.data.listLimit
    const view = { ...model,
      jobCount: model.filteredJobs.length,
      noteCount: model.notes.length,
      resumeCount: model.resumes.length,
      reviewCount: model.reviews.length,
      overdueCount: model.overdue.length,
      hasMore: tab === 'today' ? model.dayAgenda.length > limit || model.overdue.length > limit : tab === 'jobs' ? model.filteredJobs.length > limit : libraryKind === 'resume' ? model.resumes.length > limit : model.notes.length > limit,
      filteredJobs: model.filteredJobs.slice(0, limit), notes: model.notes.slice(0, limit),
      dayAgenda: model.dayAgenda.slice(0, limit), overdue: model.overdue.slice(0, limit),
      reviews: model.reviews.slice(0, 1), resumes: model.resumes.slice(0, limit)
    }
    delete view.jobs
    delete view.agenda
    this.setData({ view,
      jobOptions: [{ id: '', name: '不关联岗位' }, ...this.state.jobs.filter(job => !['offer', 'closed'].includes(job.stage)).map(job => ({ id: job.id, name: `${job.company} · ${job.role}` }))],
      resumeOptions: [{ id: '', name: '不关联简历' }, ...this.state.resumes.map(item => ({ id: item.id, name: item.name }))],
      experienceOptions: [{ id: '', name: '不关联经历' }, ...this.state.notes.filter(item => item.kind === 'experience').map(item => ({ id: item.id, name: item.title }))]
    })
    this.updateDetail()
  },

  async refresh() {
    if (this.busy) return
    const version = ++this.refreshVersion
    this.setData({ loading: !this.data.loaded })
    try {
      const result = await call('load')
      if (version !== this.refreshVersion) return
      this.state = result.state
      this.revision = result.revision
      this.owner = result.owner
      this.restoreUpload()
      this.setData({ loaded: true, error: '', loading: false, cleanupPending: result.cleanupPending })
      this.render()
    } catch (error) {
      if (version === this.refreshVersion) this.setData({ error: error.message, loading: false })
    }
  },

  async send(action, input) {
    const fingerprint = JSON.stringify({ action, input })
    if (!this.pending || this.pending.fingerprint !== fingerprint) {
      this.pending = { fingerprint, id: requestId(), revision: this.revision }
    }
    const result = await call(action, input, this.pending.revision, this.pending.id)
    this.pending = null
    this.state = result.state
    this.revision = result.revision
    this.setData({ error: '', cleanupPending: result.cleanupPending })
    this.render()
    return result
  },

  uploadKey() { return `offerflow-upload:${config.env}:${this.owner}` },
  restoreUpload() {
    if (!this.owner) return
    const pendingUpload = wx.getStorageSync(this.uploadKey())
    if (pendingUpload && [...this.state.resumes, ...this.state.assets].some(item => item.id === pendingUpload.input.id)) {
      wx.removeStorageSync(this.uploadKey())
      this.pendingUpload = null
    } else if (pendingUpload && this.state.uploads.some(item => item.id === pendingUpload.input.id)) {
      this.pendingUpload = pendingUpload.input
      this.uploadRequest = pendingUpload.request
    } else {
      wx.removeStorageSync(this.uploadKey())
      this.pendingUpload = null
      this.uploadRequest = null
    }
    this.setData({ uploadRetry: Boolean(this.pendingUpload) })
  },

  async run(action, input, close = true) {
    if (this.busy || !this.data.loaded) return false
    this.busy = true
    ++this.refreshVersion
    this.setData({ saving: true })
    try {
      await this.send(action, input)
      if (close) this.closeSheet(true)
      wx.showToast({ title: '已保存', icon: 'success' })
      return true
    } catch (error) {
      if (error.code === 'STALE') this.pending = null
      wx.showToast({ title: error.message, icon: 'none', duration: 3000 })
      this.busy = false
      if (error.code === 'STALE') await this.refresh()
      return false
    } finally {
      this.busy = false
      this.setData({ saving: false })
    }
  },

  switchTab(event) {
    this.setData({ tab: event.currentTarget.dataset.tab, query: '', listLimit: 40 })
    this.render()
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },
  setFilter(event) { this.setData({ filter: event.currentTarget.dataset.id, listLimit: 40 }); this.render() },
  setLibrary(event) { this.setData({ libraryKind: event.currentTarget.dataset.id, query: '', listLimit: 40 }); this.render() },
  search(event) { this.setData({ query: event.detail.value, listLimit: 40 }); this.render() },
  chooseDay(event) { this.setData({ selectedDay: event.currentTarget.dataset.day }); this.render() },
  pickDay(event) { this.setData({ selectedDay: event.detail.value }); this.render() },
  moveWeek(event) {
    const day = new Date(`${this.data.selectedDay}T12:00:00`)
    day.setDate(day.getDate() + Number(event.currentTarget.dataset.step) * 7)
    this.setData({ selectedDay: dateKey(day) })
    this.render()
  },
  backToday() { this.setData({ selectedDay: dateKey() }); this.render() },
  noop() {},

  openSheet(type, form = {}, detailId = '') {
    if (this.busy) return
    this.dirty = false
    this.setData({ sheet: type, sheetTitle: titles[type] || '', form, detailId })
    this.updateDetail()
  },
  closeSheet(force) {
    if (force !== true && this.busy) return
    if (force !== true && this.dirty) {
      wx.showModal({ title: '放弃未保存的内容？', confirmText: '放弃', confirmColor: '#b24b3d', success: result => { if (result.confirm) this.closeSheet(true) } })
      return
    }
    this.dirty = false
    this.setData({ sheet: '', detail: null })
  },
  field(event) {
    this.dirty = true
    this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value })
  },
  option(event) {
    this.dirty = true
    this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.currentTarget.dataset.value })
  },
  select(event) {
    const { field, options } = event.currentTarget.dataset
    const entry = this.data[options][Number(event.detail.value)]
    this.dirty = true
    this.setData({ [`form.${field}`]: entry.id, [`form.${field}Label`]: entry.name })
  },

  quickAdd() { this.openSheet('quick') },
  addJob() {
    this.openSheet('job', { company: '', role: '', city: '', salary: '', jd: '', url: '', resumeId: '', resumeIdLabel: '不关联简历', stage: 'planned' })
  },
  editJob() {
    const detail = this.data.detail
    const job = this.state.jobs.find(item => item.id === detail.id)
    this.openSheet('job', { ...job, resumeIdLabel: detail.resumeName || '不关联简历' })
    this.setData({ sheetTitle: '编辑岗位' })
  },
  addAgenda(event) {
    const dataset = event && event.currentTarget.dataset || {}
    const job = this.state.jobs.find(item => item.id === dataset.job)
    const start = new Date()
    start.setHours(start.getHours() + 1, 0, 0, 0)
    const end = new Date(start.getTime() + 3600000)
    this.openSheet('agenda', {
      kind: dataset.kind || 'interview', title: '', timing: 'slot',
      day: dateKey(start), time: timeKey(start), endDay: dateKey(end), endTime: timeKey(end),
      jobId: job ? job.id : '', jobIdLabel: job ? `${job.company} · ${job.role}` : '选择岗位', location: '', notes: ''
    })
  },
  editAgenda() {
    const detail = this.data.detail
    const item = this.state.agenda.find(entry => entry.id === detail.id)
    this.openSheet('agenda', { ...item, day: dateKey(item.startAt), time: timeKey(item.startAt),
      endDay: dateKey(item.endAt || item.startAt), endTime: timeKey(item.endAt || new Date(Date.parse(item.startAt) + 3600000)),
      jobIdLabel: item.jobId ? `${detail.company} · ${detail.role}` : '不关联岗位'
    })
    this.setData({ sheetTitle: '调整日程' })
  },
  addNote(event) {
    const dataset = event && event.currentTarget.dataset || {}
    const kind = dataset.kind || (this.data.libraryKind === 'experience' ? 'experience' : 'question')
    this.openSheet(kind, { kind, title: '', body: '', category: '', experienceId: '', experienceIdLabel: '不关联经历', sourceId: dataset.source || '', jobId: dataset.job || '' })
  },
  editNote() {
    const detail = this.data.detail
    const item = this.state.notes.find(entry => entry.id === detail.id)
    this.openSheet(item.kind, { ...item, experienceIdLabel: detail.experienceName || '不关联经历' })
    this.setData({ sheetTitle: item.kind === 'question' ? '编辑问题' : '编辑经历' })
  },
  openJob(event) { this.openSheet('jobDetail', {}, event.currentTarget.dataset.id) },
  openAgenda(event) { this.openSheet('agendaDetail', {}, event.currentTarget.dataset.id) },
  openNote(event) { this.openSheet('noteDetail', {}, event.currentTarget.dataset.id) },
  settings() { this.openSheet('settings') },
  recordProgress() { this.openSheet('progress', { id: this.data.detail.id, summary: '' }) },
  cleanupFiles() { this.run('cleanupFiles', {}, false) },
  importQuestions() { this.openSheet('bulk', { lines: '', category: '', experienceId: '', experienceIdLabel: '不关联经历' }) },

  updateDetail() {
    const { sheet, detailId } = this.data
    const view = this.model
    if (!view) return
    let detail
    if (sheet === 'jobDetail') {
      const job = view.jobs.find(item => item.id === detailId)
      if (!job) { this.closeSheet(true); return }
      detail = { ...this.state.jobs.find(item => item.id === detailId), ...job, agenda: view.agenda.filter(item => item.jobId === detailId),
        events: this.state.events.filter(item => item.jobId === detailId).map(item => ({ ...item, dateText: `${dateKey(item.at)} ${timeKey(item.at)}` })),
        notes: this.state.notes.filter(item => item.jobId === detailId).map(item => ({ id: item.id, title: item.title })),
        assets: this.state.assets.filter(item => item.ownerId === detailId),
        canSchedule: !['closed', 'offer'].includes(job.stage)
      }
    } else if (sheet === 'agendaDetail') {
      const item = view.agenda.find(entry => entry.id === detailId)
      if (item) detail = { ...this.state.agenda.find(entry => entry.id === detailId), ...item, assets: this.state.assets.filter(asset => asset.ownerId === detailId) }
    }
    else if (sheet === 'noteDetail') {
      const note = this.state.notes.find(item => item.id === detailId)
      if (note) detail = { ...note,
        experienceName: this.state.notes.find(item => item.id === note.experienceId)?.title || '',
        company: this.state.jobs.find(item => item.id === note.jobId)?.company || '',
        sourceName: this.state.agenda.find(item => item.id === note.sourceId)?.title || '',
        questions: this.state.notes.filter(item => item.experienceId === detailId).map(item => ({ id: item.id, title: item.title }))
      }
    }
    if (detail) this.setData({ detail })
  },

  async save() {
    const form = this.data.form
    const sheet = this.data.sheet
    if (sheet === 'job') return this.run('saveJob', form)
    if (sheet === 'question' || sheet === 'experience') return this.run('saveNote', form)
    if (sheet === 'review') return this.run('reviewInterview', form)
    if (sheet === 'resume') return this.run('saveResume', form)
    if (sheet === 'progress') return this.run('recordProgress', form)
    if (sheet === 'bulk') return this.run('importQuestions', form)
    if (sheet === 'agenda') {
      try {
        const startAt = iso(form.day, form.time)
        const endAt = form.timing === 'slot' ? iso(form.endDay, form.endTime) : ''
        return this.run('saveAgenda', { ...form, startAt, endAt })
      } catch { wx.showToast({ title: '请选择有效时间', icon: 'none' }) }
    }
  },

  starJob(event) { this.run('starJob', { id: event.currentTarget.dataset.id }, false) },
  changeStage() {
    const id = this.data.detail.id
    wx.showActionSheet({ itemList: stageOptions.map(stage => stage.name), success: async result => {
      const stage = stageOptions[result.tapIndex].id
      if (['closed', 'offer'].includes(stage)) {
        const confirmed = await wx.showModal({ title: stage === 'offer' ? '记录 Offer？' : '结束这个岗位？', content: '未完成的日程将一并取消。', confirmText: '确认' })
        if (!confirmed.confirm) return
      }
      this.run('stageJob', { id, stage }, false)
    } })
  },
  async completeAgenda(event) {
    const id = event.currentTarget.dataset.id
    const item = this.state.agenda.find(entry => entry.id === id)
    if (await this.run('completeAgenda', { id }, false)) {
      if (item.kind === 'interview') this.openSheet('review', { id, review: '' })
    }
  },
  review(event) {
    const id = event.currentTarget.dataset.id
    const item = this.state.agenda.find(entry => entry.id === id)
    this.openSheet('review', { id, review: item.review || '' })
  },
  async cancelAgenda() {
    const result = await wx.showModal({ title: '取消这项日程？', confirmText: '取消日程', confirmColor: '#b24b3d' })
    if (result.confirm) this.run('cancelAgenda', { id: this.data.detail.id })
  },
  async remove() {
    const { sheet, detail, form } = this.data
    const action = sheet === 'jobDetail' ? 'deleteJob' : sheet === 'resume' ? 'deleteResume' : 'deleteNote'
    const result = await wx.showModal({ title: '删除这条记录？', content: action === 'deleteJob' ? '关联日程一并删除，问题与经历保留。' : '', confirmText: '删除', confirmColor: '#b24b3d' })
    if (result.confirm) this.run(action, { id: sheet === 'resume' ? form.id : detail.id })
  },
  copy(event) { wx.setClipboardData({ data: event.currentTarget.dataset.text }) },

  async uploadResume(event) {
    if (this.busy) return
    if (this.pendingUpload) { await this.retryUpload(); return }
    const dataset = event && event.currentTarget.dataset || {}
    const kind = dataset.kind || 'resume'
    const ownerId = dataset.owner || ''
    let uploadedID = ''
    let finalizing = false
    try {
      if (wx.requirePrivacyAuthorize) await wx.requirePrivacyAuthorize()
      let file
      if (kind === 'jd') {
        const chosen = await wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album'], sizeType: ['compressed'] })
        const image = chosen.tempFiles[0]
        const extension = /\.png$/i.test(image.tempFilePath) ? 'png' : 'jpg'
        file = { name: `JD-${Date.now()}.${extension}`, path: image.tempFilePath, size: image.size }
      } else {
        const chosen = await wx.chooseMessageFile({ count: 1, type: 'file', extension: kind === 'resume' ? ['pdf'] : ['pdf', 'txt'] })
        file = chosen.tempFiles[0]
      }
      if (file.size > 5 * 1024 * 1024) throw new Error('请选择 5 MB 以内的文件')
      this.busy = true
      ++this.refreshVersion
      this.setData({ saving: true })
      const reserved = await this.send('reserveUpload', { name: file.name, kind, ownerId })
      const upload = this.state.uploads.find(item => item.id === reserved.operationId)
      const result = await wx.cloud.uploadFile({ cloudPath: upload.path, filePath: file.path })
      uploadedID = result.fileID
      finalizing = true
      const input = { id: upload.id, fileID: result.fileID }
      this.pending = { fingerprint: JSON.stringify({ action: 'finishUpload', input }), id: requestId(), revision: this.revision }
      this.pendingUpload = input
      this.uploadRequest = this.pending
      wx.setStorageSync(this.uploadKey(), { input, request: this.pending })
      await this.send('finishUpload', { id: upload.id, fileID: result.fileID })
      wx.removeStorageSync(this.uploadKey())
      this.pendingUpload = null
      this.setData({ uploadRetry: false })
      if (kind === 'resume') {
        this.setData({ tab: 'library', libraryKind: 'resume' })
        this.closeSheet(true)
      }
      this.render()
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (error) {
      if (finalizing && this.pending) {
        this.pendingUpload = JSON.parse(this.pending.fingerprint).input
        this.setData({ uploadRetry: true })
      } else if (uploadedID) {
        await wx.cloud.deleteFile({ fileList: [uploadedID] }).catch(() => {})
      }
      if (!/cancel|deny|reject/i.test(error.errMsg || '')) wx.showToast({ title: error.message || '上传失败，请重试', icon: 'none', duration: 3000 })
      if (error.code === 'STALE') this.pending = null
    } finally {
      this.busy = false
      this.setData({ saving: false })
      if (finalizing && this.pendingUpload) await this.refresh()
    }
  },
  async retryUpload() {
    if (this.uploadRequest) this.pending = this.uploadRequest
    if (this.pendingUpload && await this.run('finishUpload', this.pendingUpload, false)) {
      this.pendingUpload = null
      this.uploadRequest = null
      wx.removeStorageSync(this.uploadKey())
      this.setData({ uploadRetry: false })
    } else if (this.pendingUpload && !this.pending) {
      this.uploadRequest = { fingerprint: JSON.stringify({ action: 'finishUpload', input: this.pendingUpload }), id: requestId(), revision: this.revision }
      wx.setStorageSync(this.uploadKey(), { input: this.pendingUpload, request: this.uploadRequest })
    }
  },
  async discardUpload() {
    await this.refresh()
    if (!this.pendingUpload) return
    const result = await wx.showModal({ title: '放弃这次上传？', confirmText: '放弃' })
    if (result.confirm && await this.run('discardUpload', this.pendingUpload, false)) {
      wx.removeStorageSync(this.uploadKey())
      this.pendingUpload = null
      this.uploadRequest = null
      this.setData({ uploadRetry: false })
    }
  },
  openResume(event) {
    const resume = this.state.resumes.find(item => item.id === event.currentTarget.dataset.id)
    if (!resume) return
    this.openSheet('resume', { ...resume, experiences: this.state.notes.filter(item => item.kind === 'experience').map(item => ({ ...item, selected: resume.experienceIds.includes(item.id) })) })
  },
  selectExperience(event) {
    const ids = new Set(this.data.form.experienceIds)
    const id = event.currentTarget.dataset.id
    if (ids.has(id)) ids.delete(id)
    else ids.add(id)
    this.dirty = true
    this.setData({ 'form.experienceIds': Array.from(ids), 'form.experiences': this.data.form.experiences.map(item => ({ ...item, selected: ids.has(item.id) })) })
  },
  async previewResume(event) {
    const id = event.currentTarget.dataset.id || this.data.form.id
    const resume = this.state.resumes.find(item => item.id === id)
    if (!resume) return
    wx.showLoading({ title: '正在打开' })
    try {
      const result = await wx.cloud.downloadFile({ fileID: resume.fileID })
      await wx.openDocument({ filePath: result.tempFilePath, fileType: 'pdf', showMenu: true })
    } catch { wx.showToast({ title: '文件打开失败', icon: 'none' }) }
    finally { wx.hideLoading() }
  },
  async openAsset(event) {
    const asset = this.state.assets.find(item => item.id === event.currentTarget.dataset.id)
    if (!asset) return
    wx.showLoading({ title: '正在打开' })
    try {
      const result = await wx.cloud.downloadFile({ fileID: asset.fileID })
      if (asset.kind === 'jd') await wx.previewImage({ urls: [result.tempFilePath] })
      else if (/\.pdf$/i.test(asset.name)) await wx.openDocument({ filePath: result.tempFilePath, fileType: 'pdf', showMenu: true })
      else {
        const content = await new Promise((resolve, reject) => wx.getFileSystemManager().readFile({ filePath: result.tempFilePath, encoding: 'utf8', success: value => resolve(value.data), fail: reject }))
        this.openSheet('textAsset', { body: content })
      }
    } catch { wx.showToast({ title: '文件打开失败', icon: 'none' }) }
    finally { wx.hideLoading() }
  },
  async deleteAsset(event) {
    const result = await wx.showModal({ title: '删除这个附件？', confirmText: '删除', confirmColor: '#b24b3d' })
    if (result.confirm) await this.run('deleteAsset', { id: event.currentTarget.dataset.id }, false)
  },

  async exportData() {
    if (this.busy) return
    this.busy = true
    wx.showLoading({ title: '正在导出' })
    let path = ''
    try {
      const result = await call('load')
      const data = { ...result.state }
      delete data.uploads
      path = `${wx.env.USER_DATA_PATH}/OfferFlow-${dateKey()}.json`
      const content = JSON.stringify({ format: 'offerflow-wechat-export', version: 1, exportedAt: new Date().toISOString(), data }, null, 2)
      await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({ filePath: path, data: content, encoding: 'utf8', success: resolve, fail: reject }))
      wx.hideLoading()
      await wx.shareFileMessage({ filePath: path, fileName: `OfferFlow-${dateKey()}.json` })
    } catch (error) { if (!/cancel/i.test(error.errMsg || '')) wx.showToast({ title: error.message || '导出失败', icon: 'none' }) }
    finally {
      if (path) wx.getFileSystemManager().unlink({ filePath: path, fail: () => {} })
      wx.hideLoading()
      this.busy = false
    }
  },
  async clearData() {
    const result = await wx.showModal({ title: '清空所有资料？', content: '岗位、日程、问题、经历和简历将永久删除。', editable: true, placeholderText: '输入「清空」', confirmText: '清空', confirmColor: '#b24b3d' })
    if (result.confirm && result.content === '清空' && await this.run('clearData', {})) {
      wx.removeStorageSync(this.uploadKey())
      this.pendingUpload = null
      this.uploadRequest = null
      this.setData({ uploadRetry: false })
    }
  },
  openPrivacy() {
    wx.openPrivacyContract({ fail: () => wx.showToast({ title: '暂时无法打开隐私指引', icon: 'none' }) })
  },
  agreePrivacy() {
    if (this.privacyResolve) this.privacyResolve({ buttonId: 'privacy-agree', event: 'agree' })
    this.privacyResolve = null
    this.setData({ privacy: false })
  },
  rejectPrivacy() {
    if (this.privacyResolve) this.privacyResolve({ event: 'disagree' })
    this.privacyResolve = null
    this.setData({ privacy: false })
  }
})
