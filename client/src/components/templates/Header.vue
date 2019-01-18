<template>
    <v-toolbar>
      <v-toolbar-items>
          <v-btn :to="{ name: 'profile' }">Profile</v-btn>
          <v-btn :to="{ name: 'personage' }">Personnages</v-btn>
      </v-toolbar-items>
      <v-spacer></v-spacer>
      <v-toolbar-title>Les Ombres d'Esteren</v-toolbar-title>
      <v-spacer></v-spacer>
      <v-toolbar-items>
          <v-btn v-show="!isAuthenticated" @click="login()">Connexion</v-btn>
          <v-btn v-show="isAuthenticated" @click="logout()">Deconnexion</v-btn>
      </v-toolbar-items>
  </v-toolbar>
</template>

<script>
import { mapGetters } from 'vuex';

export default {

    methods: {
        login(){
            this.$router.push('/login');
        },
        logout(){
            this.$router.push('/logout');
        }
    },
    computed: mapGetters('auth', [
        'isAuthenticated',
    ]),
}
</script>