<template>
  <v-app dark>
      <v-toolbar>
          <v-toolbar-items>
              <v-btn flat>Profile</v-btn>
              <v-btn>Personnages</v-btn>
          </v-toolbar-items>
          <v-spacer></v-spacer>
          <v-toolbar-title>Les Ombres d'Esteren</v-toolbar-title>
          <v-spacer></v-spacer>
          <v-toolbar-items>
              <v-btn>Deconnexion</v-btn>
          </v-toolbar-items>
      </v-toolbar>
      <v-content>
          <router-view/>
      </v-content>
  </v-app>
</template>

<script>
export default {
  name: 'App'
}
</script>
