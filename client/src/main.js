// The Vue build version to load with the `import` command
// (runtime-only or standalone) has been set in webpack.base.conf with an alias.
import Vue from 'vue'
import App from './App'
import router from './router'
import Vuetify from 'vuetify'

// Sync router with store
import { sync } from 'vuex-router-sync'

import 'vuetify/dist/vuetify.min.css'
//import VueSession from 'vue-session'

import store from '@/store'

// Sync store with router
sync(store, router)

Vue.use(Vuetify)
//Vue.use(VueSession)
Vue.config.productionTip = false

/* eslint-disable no-new */
new Vue({
  el: '#app',
  router,
  store,
  components: { App },
  template: '<App/>'
})
