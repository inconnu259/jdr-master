import ApiService from '@/services/api.service'
import session from '@/services/session'

import { FETCH_PROFILES,
         FETCH_A_PROFILE
       } from './actions.type'
import  { FETCH_START,
          FETCH_END,
          SET_A_PROFILE,
          SET_PROFILES,
          SET_ERROR
        } from './mutations.type'

const state = {
    profiles: [],
    profile: {},
    errors: {},
    loading: false
}

const getters = {
    currentProfile(state) {
        return state.profile
    },
    profiles(state) {
        return state.profiles
    },
    isLoading(state) {
        return state.loading
    }
}

const actions = {
    /*[FETCH_PROFILES] (context, payload) {
        context.commit(FETCH_START)
        return ApiService
            .get('profiles')
            .then(({data})) => {
                context.commit(SET_PROFILES, data.profiles.results);
                context.commit(FETCH_END)
            }
            .catch(({response})) => {
                context.commit(SET_ERROR, response.data.errors)
            }
    },*/
    [FETCH_A_PROFILE] (context, payload) {
        context.commit(FETCH_START)
        //const {profile_id} = payload
        return ApiService
            .getProfileDetails()
            .then(({data}) => {
                context.commit(SET_A_PROFILE, data);
                context.commit(FETCH_END)
            })
            .catch(({response}) => {
                context.commit(SET_ERROR, response.data.errors)
            })
    }
}

const mutations = {
    [FETCH_START](state) {
        state.loading = true
    },
    [FETCH_END](state) {
        state.loading = false
    },
    [SET_PROFILES](state, pProfiles) {
        state.profiles = pProfiles
        state.errors = {}
    },
    [SET_A_PROFILE](state, pProfile) {
        state.profile = pProfile
        state.errors = {}
    },
    [SET_ERROR](state) {
        state.errors = errors
    }
}

export default {
    state,
    getters,
    actions,
    mutations
}