<template>
    <v-toolbar>
      <v-toolbar-items>
          <v-btn :to="{ name: 'profile' }">Profile</v-btn>
          <v-menu
            :nudge-width="100"
            transition="slide-y-transition"
            bottom
            offset-y>
              <v-btn slot="activator">
                  <span>Personnage</span>
                  <v-icon dark>arrow_drop_down</v-icon>
              </v-btn>
              <v-list>
                  <v-list-tile
                    v-for="item in items"
                    :to="{ name : item.to }"
                    :key="item.id"
                    @click="">
                      <v-list-tile-title v-text="item.label"></v-list-tile-title>
                  </v-list-tile>
              </v-list>
          </v-menu>
          <!--<v-btn :to="{ name: 'personage' }">Personnages</v-btn>-->
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
    data: () => ({
        items: [{"id": 0,
                 "label": "Création",
                 "to": "create-personage"},
                {"id": 1,
                 "label": "liste",
                 "to" : "personage"},
                {"id": 2,
                 "label": "augmenter de niveau",
                 "to": "home"}]
    }),
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