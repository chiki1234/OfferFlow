import { config } from './config'

App({
  onLaunch() {
    this.ready = Boolean(config.env && wx.cloud)
    if (this.ready) wx.cloud.init({ env: config.env, traceUser: false })
  }
})
