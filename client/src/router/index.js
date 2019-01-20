import Vue from 'vue'
import Router from 'vue-router'

import Home from '@/components/pages/Home'
import Auth from '@/components/pages/Auth'
import Profile from '@/components/pages/Profile'
import Personage from '@/components/pages/Personage'
import Lost from '@/components/pages/Lost'

import store from '@/store';

Vue.use(Router)

const requireAuthenticated = (to, from, next) => {
  console.log('routing authenticated ', from, next)
  store.dispatch('auth/initialize')
    .then(() => {
        if(!store.getters['auth/isAuthenticated']) {
            next('/login');
        } else {
            next();
        }
    });
};

const requireUnauthenticated = (to, from, next) => {
    store.dispatch('auth/initialize')
        .then(() => {
            if(store.getters['auth/isAuthenticated']) {
                next('/home');
            } else {
                next();
            }
        });
};

const redirectLogout = (to, from, next) => {
    console.log('routing logout ', from, next)
    store.dispatch('auth/logout')
    .then(() => next('/login'));
};

export default new Router({
  saveScrollPosition: true,
  routes: [
    {
      path: '/profile',
      name: 'profile',
      component: Profile,
      beforeEnter: requireAuthenticated,
    },
    {
      path: '/',
      name: 'home',
      component: Home,
    },
    {
      path: '/login',
      name: 'login',
      component: Auth,
      beforeEnter: requireUnauthenticated,
    },
    {
      path: '/personnages',
      name: 'personage',
      component: Personage,
      beforeEnter: requireAuthenticated,
    },
    {
      path: '/logout',
      name: 'logout',
      beforeEnter: redirectLogout,
    },
    {
      path: '*',
      component: Lost,
    }
  ]
})