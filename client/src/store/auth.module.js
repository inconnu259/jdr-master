import auth from '@/services/auth'
import session from '@/services/session'

import {
    LOGIN_BEGIN,
    LOGIN_FAILURE,
    LOGIN_SUCCESS,
    LOGOUT,
    REMOVE_TOKEN,
    SET_TOKEN,
} from './actions.type';

const TOKEN_STORAGE_KEY = 'TOKEN_STORAGE_KEY';

const initialState = {
    authenticating: false,
    error: false,
    token: null,
};

const getters = {
    isAuthenticated: state => !!state.token,
};

const actions = {
  login({ commit }, { username, password }) {
    commit(LOGIN_BEGIN);
    return auth.login(username, password)
      .then(({ data }) => commit(SET_TOKEN, data.key))
      .then(() => commit(LOGIN_SUCCESS))
      .catch(() => commit(LOGIN_FAILURE));
  },
  logout({ commit }) {
    return auth.logout()
      .then(() => commit(LOGOUT))
      .finally(() => commit(REMOVE_TOKEN));
  },
  initialize({ commit }) {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);

    if (token) {
      commit(SET_TOKEN, token);
    } else {
      commit(REMOVE_TOKEN);
    }
  },
};

const mutations = {
  [LOGIN_BEGIN](state) {
    state.authenticating = true;
    state.error = false;
  },
  [LOGIN_FAILURE](state) {
    state.authenticating = false;
    state.error = true;
  },
  [LOGIN_SUCCESS](state) {
    state.authenticating = false;
    state.error = false;
  },
  [LOGOUT](state) {
    state.authenticating = false;
    state.error = false;
  },
  [SET_TOKEN](state, token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    session.defaults.headers.Authorization = `Token ${token}`;
    state.token = token;
  },
  [REMOVE_TOKEN](state) {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    delete session.defaults.headers.Authorization;
    state.token = null;
  },
};

/*const actions = {
    obtainToken(username, password) {
        const payload = {
            username: username,
            password: password
        }

        axios.post(this.state.endpoints.obtainJWT, payload)
            .then((response) => {
                this.commit('updateToken', response.data.token);
            })
            .catch((error) => {
                console.log(error);
            })
    },
    refreshToken() {
        const payload = {
            token: this.state.jwt
        }

        axios.post(this.state.endpoints.refreshJWT, payload)
            .then((response) => {
                this.commit('updateToken', response.data.token)
            })
            .catch((error) => {
                console.log(error)
            })
    },
    inspectToken(){
        const token = this.state.jwt;
        if(token) {
            const decoded = jwt_decode(token);
            const exp = decoded.exp
            const orig_iat = decoded.orig_iat

            if(exp - (Date.now()/1000) < 1800 && (Date.now()/1000) - orig_iat < 628200) {
                this.dispatch('refreshToken')
            } else if (exp - (Date.now()/1000) < 1800) {
                // do nothing
            } else {
                // Prompt user to re-login, this else clause covers the condition where a token is expired as well
            }
        }
    }
}

const mutations = {
  setAuthUser(state, {authUser, isAuthenticated}) {
    Vue.set(state, 'authUser', authUser)
    Vue.set(state, 'isAuthenticated', isAuthenticated)
  },
  updateToken(state, newToken) {
    localStorage.setItem('token', newToken);
    state.jwt = newToken;
  },
  removeToken(state){
    localStorage.removeItem('token');
    state.jwt = null;
  }
}*/

export default {
  namespaced: true,
  state: initialState,
  getters,
  actions,
  mutations
}