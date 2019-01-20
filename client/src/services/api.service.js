import session from './session';

export default {
    getProfileDetails() {
        return session.get('/api/v1/profile/view/');
    },
    getAccountDetails() {
        return session.get('/auth/user/');
    },
}

/*import Vue from 'vue'
import axios from 'axios'
import AuthService from '@/services/AuthService'
import { API_URL } from '@/services/config'

export class ApiService{
  constructor() {
  }

  getProfile() {
    const url = `$(API_URL}/profile/view/`;
    return axios.get(url, {headers: { Authorization: `JWT ${AuthService.getAuthToken()}`}}).then(response => response.data);
  }

  get (resource, slug='') {
    console.log("Get");
    return axios
            .get(`${resource}\${slug}`)
            .catch((error) => {
              throw new Error(`ApiService ${error}`)
            })
  }
}*/



/*const ApiService = {
  init () {
    console.log("ApiService");
    Vue.use(VueAxios, axios)
    Vue.axios.defaults.baseURL = API_URL
    Vue.axios.defaults.headers =  {
        'Content-Type': 'application/json',
        'Authorization': 'JWT ' + this.$session.get('token')
    }
    Vue.axios.defaults.xsrfCookieName = 'csrfToken'
    Vue.axios.defaults.xsrfHeaderName = 'X-CSRFToken'
  },

  get (resource, slug='') {
    console.log("Get");
    return Vue.axios
            .get(`${resource}`)
            .catch((error) => {
              throw new Error(`ApiService ${error}`)
            })
  },

  requireAuth(to, from, next) {
    if(!isLoggedIn()){
        next({
            path: '/',
            query: {redirect: to.fullPath}
        });
    } else {
        next();
    }
  },

  isLoggedIn() {
   const idToken = getIdToken();
   }
}

export default ApiService*/