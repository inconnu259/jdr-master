<template>
    <v-container grid-list-md>
      <v-layout row wrap align-center justify-center fill-height>
        <v-flex xs12 sm8 lg4 md5>
          <v-card class="login-card">
            <v-card-title>
              <span class="headline">Identifiez vous</span>
            </v-card-title>

            <v-spacer/>

            <v-card-text>

              <v-layout
                row
                fill-height
                justify-center
                align-center
                v-if="loading"
              >
                <v-progress-circular
                  :size="50"
                  color="primary"
                  indeterminate
                />
              </v-layout>


              <v-form v-else ref="form" v-model="valid" lazy-validation>
                <v-container>

                  <v-text-field
                    v-model="credentials.username"
                    :counter="70"
                    label="identifiant"
                    :rules="rules.username"
                    maxlength="70"
                    required
                  />

                  <v-text-field
                    type="password"
                    v-model="credentials.password"
                    :counter="20"
                    label="mot de passe"
                    :rules="rules.password"
                    maxlength="20"
                    required
                  />

                </v-container>
                <v-btn :disabled="!valid" @click="login">Login</v-btn>

              </v-form>


            </v-card-text>
          </v-card>
        </v-flex>
      </v-layout>
    </v-container>
</template>

<script>
import axios from 'axios';
import swal from 'sweetalert2';
import router from '../../router';

export default {
    name: 'Auth',
    data: () => ({
        credentials: {},
        valid:true,
        loading:false,
        rules: {
          username: [
            v => !!v || "Un identifiant est requis",
            v => (v && v.length > 3) || "Un identifiant doit avoir plus de 3 charactères",
            v => /^[a-zA-Z0-9_]+$/.test(v) || "Un identifiant doit avoir seulement des lettres et des chiffres"
          ],
          password: [
            v => !!v || "Un mot de passe est requis",
            v => (v && v.length > 7) || "Le mot de passe doit avoir plus de 7 charactères"
          ]
        }
    }),
    methods: {
        login() {
          // checking if the input is valid
            if (this.$refs.form.validate()) {
              this.loading = true;
              this.$store.dispatch('auth/login', this.credentials)
                .then(() => this.$router.push('/'));
              /*axios.post('http://localhost:8000/api/v1/user/login/', this.credentials).then(res => {
                this.$store.commit('updateToken', response.data.token);

                router.push('/');
              }).catch(e => {
                this.loading = false;
                swal({
                  type: 'warning',
                  title: 'Erreur',
                  text: 'Mauvais identifiant ou mot de passe',
                  showConfirmButton:false,
                  showCloseButton:false,
                  timer:3000
                })
              })*/
            }
        },

        logout() {
          // checking if the input is valid
          this.loading = true;
          axios.post('http://localhost:8000/api/logout/all/', this.credentials).then(res => {
            this.$session.stop();
            router.push('/');
          }).catch(e => {
            this.loading = false;
            swal({
              type: 'warning',
              title: 'Erreur',
              text: 'Impossible de se déconnecter',
              showConfirmButton:false,
              showCloseButton:false,
              timer:3000
            })
          })
        }
    }
}
</script>
