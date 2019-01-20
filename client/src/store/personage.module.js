import ApiService from '@/services/api.service'
import { FETCH_PERSONAGES,
         FETCH_A_PERSONAGE
      } from './actions.type'
import { FETCH_START,
         FETCH_END,
         SET_A_PERSONAGE,
         SET_PERSONAGES,
         SET_ERROR
       } from './mutations.type'



const state = {
  personages: [],
  personage: {},
  errors: {},
  loading: false
}

const getters = {
  currentPersonage (state) {
    return state.personage
  },
  personages (state) {
    return state.personages;
  },
  isLoading (state) {
    return state.loading;
  }
}

const actions = {
  [FETCH_PERSONAGES] (context, payload) {
    context.commit(FETCH_START)
    console.log("Fetch personages");
    return ApiService
      .getProfileDetails()
      .then(({data}) => {
        context.commit(SET_PERSONAGES, data);
        context.commit(FETCH_END)
      })
      .catch(({response}) => {
        context.commit(SET_ERROR, response.data.errors)
      })
  },
  [FETCH_A_PERSONAGE] (context, payload) {
    context.commit(FETCH_START)
    const {personage_id} = payload
    return ApiService
      .get(`personages/${personage_id}`)
      .then(({data}) => {
        context.commit(SET_A_PERSONAGE, data.personages);
        context.commit(FETCH_END)
      })
      .catch(({response}) => {
        context.commit(SET_ERROR, response.data.errors)
      })
  }
}

const mutations = {
  [FETCH_START] (state) {
    state.loading = true
  },
  [FETCH_END] (state) {
    state.loading = false
  },
  [SET_PERSONAGES] (state, pPersonages) {
    state.personages = pPersonages
    state.errors = {}
  },
  [SET_A_PERSONAGE] (state, pPersonage) {
    state.personage = pPersonage
    state.errors = {}
  },
  [SET_ERROR] (state) {
    state.errors = errors
  }
}

export default {
  state,
  getters,
  actions,
  mutations
}