<template>
    <v-container
      fill-height
      fluid
      grid-list-xl>
        <v-layout
          justify-center
          wrap>
            <v-flex
              xs12
              md8>
                <material-card
                    color="green"
                    title="Profile"
                    text="complete ou modifie ton profile">
                    <v-form>
                        <v-container py-0>
                            <v-layout wrap>
                                <v-flex
                                  xs12
                                  md4>
                                    <v-text-field
                                      class="purple-input"
                                      label="Nom d'utilisateur"
                                      :value="currentProfile.user.username" />
                                </v-flex>
                                <v-flex
                                  xs12
                                  md4>
                                    <v-text-field
                                      class="purple-input"
                                      label="Surnom"
                                      :value="currentProfile.nickname" />
                                </v-flex>
                                <v-flex
                                  xs12
                                  md6>
                                    <v-text-field
                                      label="Prénom"
                                      class="purple-input"
                                      :value="currentProfile.user.first_name" />
                                </v-flex>
                                <v-flex
                                  xs12
                                  md6>
                                    <v-text-field
                                      label="Nom"
                                      class="purple-input"
                                      :value="currentProfile.user.last_name" />
                                </v-flex>
                                <v-flex
                                  xs12
                                  md12>
                                    <v-text-field
                                      label="Adresse mail"
                                      class="purple-input"
                                      :value="currentProfile.user.email" />
                                </v-flex>
                                <v-flex xs12>
                                    <v-textarea
                                      class="purple-input"
                                      label="A propos de moi"
                                      value="Lorem ipsum dolor sit amet, consectetur adipiscing elit."/>
                                </v-flex>
                                <v-flex
                                  xs12
                                  text-xs-right>
                                    <v-btn
                                      class="mx-0 font-weight-light"
                                      color="success">
                                        Sauvegarder le profile
                                    </v-btn>
                                </v-flex>
                            </v-layout>
                        </v-container>
                    </v-form>
                </material-card>
            </v-flex>
        </v-layout>
    </v-container>
</template>

<script>
import { mapGetters } from 'vuex';
import { FETCH_A_PROFILE } from '@/store/actions.type'

export default {
    name: "Profile",
    created() {
        this.$store.dispatch(FETCH_A_PROFILE)
    },

    /*mounted () {
        this.$store.dispatch(FETCH_A_PROFILE)
        .then(() => {
            console.log("YOUPI");
        })
        .catch((err) => {
            console.log("ERR : ", err);
        })
    },*/

    computed: {
      ...mapGetters([
        'currentProfile',
        'isLoading'
      ]),
    }
};
</script>
