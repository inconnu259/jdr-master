import Vue from 'vue'
import Router from 'vue-router'

import Auth from '@/components/pages/Auth'
import Profile from '@/components/pages/Profile'

Vue.use(Router)

export default new Router({
  routes: [
    {
      path: '/',
      name: 'Home',
      component: Profile
    },
    {
      path: '/login',
      name: 'Login',
      component: Auth
    }
  ]
})
