import Vue from 'vue'
import Vuex from 'vuex'
import createLogger from 'vuex/dist/logger'

import auth from './auth.module'
import personage from './personage.module'
//import profile from './profile.module'

const debug = process.env.NODE_ENV !== 'production';

Vue.use(Vuex)

export default new Vuex.Store({
    modules: {
        auth,
        //profile,
        personage,
    },
    strict: debug,
    plugins: debug ? [createLogger()]: [],
});