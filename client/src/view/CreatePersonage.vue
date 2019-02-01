<template>
    <v-stepper v-model="e1" vertical non-linear>
        <v-stepper-step :complete="e1 > 1" step="1" editable>
            Peuple
        </v-stepper-step>

        <v-stepper-content step="1">
            <chooseNation
              v-on:nation-choosen="nation = $event"/>
            <v-btn
              color="primary"
              @click="e1=2"
              :disabled="nation == -1">
                Continue
            </v-btn>
        </v-stepper-content>

        <v-stepper-step :complete="e1 > 2" step="2" editable>
            Métier
        </v-stepper-step>

        <v-stepper-content step="2">
            <chooseProfession
              v-on:profession-choosen="profession = $event"
              :domains="domains"/>
            <v-btn
              color="primary"
              @click="e1=3"
              :disabled="profession == -1">
                Continue
            </v-btn>
        </v-stepper-content>

        <v-stepper-step :complete="e1 > 3" step="3" editable>
            Lieu de naissance (Autre occupations)
        </v-stepper-step>

        <v-stepper-content step="3">
            <v-card
              class="mb-5"
              color="grey lighten-1"
              height="200px">
            </v-card>
            <v-btn
              color="primary"
              @click="e1=4">
                Continue
            </v-btn>
            <v-btn flat>Cancel</v-btn>
        </v-stepper-content>

        <v-stepper-step :complete="e1 > 4" step="4" editable>
            Lieu de résidence géographique (Lieu de naissance)
        </v-stepper-step>
        <v-stepper-content step="4">
            <choosePlace
              v-on:place-choosen="place = $event"/>
            <v-btn
              color="primary"
              @click="e1=5"
              :disabled="place == -1">
                Continue
            </v-btn>
        </v-stepper-content>

        <v-stepper-step :complete="e1 > 5" step="5" editable>
            Classe sociale
        </v-stepper-step>
        <v-stepper-content step="5">
            <chooseSocial
              v-on:social-choosen="social = $event"
              :domains="domains"/>
            <v-btn
              color="primary"
              @click="e1=6"
              :disabled="social == -1">
                Continue
            </v-btn>
        </v-stepper-content>

        <v-stepper-step :complete="e1 > 6" step="6" editable>
            Voies
        </v-stepper-step>
        <v-stepper-content step="6">
            <chooseWay
              v-on:way-choosen="way = $event"/>
            <v-btn
              color="primary"
              @click="e1=7"
              :disabled="way == -1">
                Continue
            </v-btn>
        </v-stepper-content>

        <v-stepper-step :complete="e1 > 7" step="7" editable>
            Âge
        </v-stepper-step>
        <v-stepper-content step="7">
            <chooseAge
              v-on:age-choosen="age = $event"/>
            <v-btn
              color="primary"
              @click="e1=8"
              :disabled="age == -1">
                Continue
            </v-btn>
        </v-stepper-content>

        <v-stepper-step :complete="e1 > 8" step="8" editable>
            Revers
        </v-stepper-step>

        <v-stepper-step :complete="e1 > 9" step="9" editable>
            Traits de caractères
        </v-stepper-step>

        <v-stepper-step :complete="e1 > 10" step="10" editable>
            Orientation de la personalité
        </v-stepper-step>

        <v-stepper-step :complete="e1 > 11" step="11" editable>
            Avantages et désavantages
        </v-stepper-step>

        <v-stepper-step :complete="e1 > 12" step="12" editable>
            Santé Mentale
        </v-stepper-step>
    </v-stepper>
</template>

<script>
import chooseNation from '@/components/templates/create_perso/ChooseNation'
import chooseProfession from '@/components/templates/create_perso/ChooseProfession'
import choosePlace from '@/components/templates/create_perso/ChoosePlace'
import chooseSocial from '@/components/templates/create_perso/ChooseSocial'
import chooseAge from '@/components/templates/create_perso/ChooseAge'
import chooseWay from '@/components/templates/create_perso/ChooseWay'
import ApiService from '@/services/api.service.js'

    export default {
        components: {
            chooseNation,
            chooseProfession,
            choosePlace,
            chooseAge,
            chooseSocial,
            chooseWay,
        },
        data() {
            return {
                e1: 0,
                nation: -1,
                profession: -1,
                place: -1,
                social: -1,
                age: -1,
                way: -1,
                domains: [],
            }
        },
        created() {
            ApiService
                .getDomainsList()
                .then(({data}) => {
                    this.domains = data
                })
        },
    }
</script>