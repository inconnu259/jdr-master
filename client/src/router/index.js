import Vue from 'vue'
import Router from 'vue-router'

import Auth from '@/components/pages/Auth'
import Profile from '@/components/pages/Profile'

Vue.use(Router)

export default new Router({
  routes: [
    {
      path: '/',
      name: 'Profile',
      component: Profile
    },
    {
      path: '/login',
      name: 'Auth',
      component: Auth
    }
  ]
})
