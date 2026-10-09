export const stageOptions = [
  { id: 'planned', name: '待投递' }, { id: 'applied', name: '已投递' },
  { id: 'assessment', name: '测评中' }, { id: 'interview', name: '面试中' },
  { id: 'offer', name: 'Offer' }, { id: 'closed', name: '已结束' }
]
export const kindOptions = [{ id: 'interview', name: '面试' }, { id: 'assessment', name: '测评 / 笔试' }, { id: 'task', name: '待办' }]
export const empty = () => ({ jobs: [], agenda: [], notes: [], resumes: [], assets: [], uploads: [], events: [] })
const pad = value => String(value).padStart(2, '0')

export function dateKey(value = new Date()) {
  const date = new Date(value)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function timeKey(value = new Date()) {
  const date = new Date(value)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function dateLabel(value) {
  const date = new Date(value)
  const today = dateKey()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (dateKey(date) === today) return '今天'
  if (dateKey(date) === dateKey(tomorrow)) return '明天'
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function iso(day, time) {
  const [year, month, date] = day.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  return new Date(year, month - 1, date, hour, minute).toISOString()
}

export function present(state, filter, query, libraryKind, selectedDay) {
  const now = new Date()
  const today = dateKey(now)
  const jobsById = new Map(state.jobs.map(job => [job.id, job]))
  const agenda = state.agenda.map(item => {
    const summary = { ...item }
    delete summary.notes
    delete summary.review
    const job = jobsById.get(item.jobId)
    const overdue = item.status === 'pending' && Date.parse(item.timing === 'slot' ? item.endAt : item.startAt) < now.getTime()
    return { ...summary, company: job ? job.company : '个人安排', role: job ? job.role : '',
      day: dateKey(item.startAt), time: timeKey(item.startAt),
      dateText: dateLabel(item.startAt), endTime: item.endAt ? timeKey(item.endAt) : '',
      overdue, kindName: kindOptions.find(kind => kind.id === item.kind).name,
      needsReview: item.kind === 'interview' && item.status === 'done' && !item.reviewed,
      statusText: item.status === 'cancelled' ? '已取消' : item.status === 'done' ? '已完成' : overdue ? '已逾期' : item.timing === 'deadline' ? '截止' : ''
    }
  }).sort((a, b) => a.startAt.localeCompare(b.startAt))
  const pending = agenda.filter(item => item.status === 'pending')
  const reviews = agenda.filter(item => item.needsReview)
  const next = pending.find(item => !item.overdue) || null
  const jobs = state.jobs.map(job => {
    const summary = { ...job }
    delete summary.jd
    const schedule = pending.find(item => item.jobId === job.id)
    return { ...summary, initial: job.company.slice(0, 1), stageName: stageOptions.find(stage => stage.id === job.stage).name,
      next: schedule ? `${schedule.dateText} ${schedule.time} · ${schedule.title}` : '',
      resumeName: state.resumes.find(item => item.id === job.resumeId)?.name || '',
      shade: ['mint', 'blue', 'peach'][job.company.charCodeAt(0) % 3]
    }
  }).sort((a, b) => Number(b.starred) - Number(a.starred) || b.updatedAt.localeCompare(a.updatedAt))
  const term = query.trim().toLowerCase()
  const filteredJobs = jobs.filter(job => {
    const match = !term || `${job.company} ${job.role} ${job.city}`.toLowerCase().includes(term)
    return match && (filter === 'all' || filter === 'active' && ['applied', 'assessment', 'interview'].includes(job.stage) || job.stage === filter)
  })
  const notes = state.notes.filter(item => item.kind === libraryKind && (!term || `${item.title} ${item.body} ${item.category}`.toLowerCase().includes(term)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(item => ({ id: item.id, kind: item.kind, title: item.title, category: item.category, dateText: dateLabel(item.updatedAt), company: jobsById.get(item.jobId)?.company || '',
      experienceName: state.notes.find(note => note.id === item.experienceId)?.title || '',
      preview: item.body.replace(/\s+/g, ' ').slice(0, 100)
    }))
  const anchor = new Date(`${selectedDay}T12:00:00`)
  const week = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(anchor)
    day.setDate(anchor.getDate() - (anchor.getDay() + 6) % 7 + index)
    const key = dateKey(day)
    return { key, number: day.getDate(), label: ['一', '二', '三', '四', '五', '六', '日'][index], today: key === today,
      active: key === selectedDay, dot: agenda.some(item => item.day === key && item.status === 'pending') }
  })
  return {
    todayLabel: `${now.getMonth() + 1}月${now.getDate()}日 · 周${['日', '一', '二', '三', '四', '五', '六'][now.getDay()]}`,
    monthLabel: `${anchor.getFullYear()}年${anchor.getMonth() + 1}月`, week, selectedDay,
    jobs, filteredJobs, notes, agenda, reviews, next,
    dayAgenda: agenda.filter(item => item.day === selectedDay && item.status !== 'cancelled'),
    overdue: pending.filter(item => item.overdue),
    activeCount: jobs.filter(item => ['applied', 'assessment', 'interview'].includes(item.stage)).length,
    offerCount: jobs.filter(item => item.stage === 'offer').length,
    todayCount: pending.filter(item => item.day === today).length,
    plannedCount: jobs.filter(item => item.stage === 'planned').length,
    resumes: state.resumes.filter(item => !term || item.name.toLowerCase().includes(term)).map(item => ({ ...item, sizeLabel: (item.size / 1024 / 1024).toFixed(1) + ' MB', dateText: dateLabel(item.createdAt) }))
  }
}
