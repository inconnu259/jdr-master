<template>
  <v-app dark>
      <MyHeader></MyHeader>
      <v-content>
          <router-view/>
      </v-content>
      <MyFooter></MyFooter>
  </v-app>
</template>

<script>
import MyHeader from '@/components/templates/Header'
import MyFooter from '@/components/templates/Footer'
import router from './router';

export default {
  components: {
    MyHeader,
    MyFooter
  },
  name: 'App',

  methods: {
        logout() {
        }
    }
}
</script>
