<template>
    <v-stepper v-model="e1" vertical>
        <v-stepper-step step="1">
            Peuple
        </v-stepper-step>

        <v-stepper-content step="1">
            <chooseNation/>
        </v-stepper-content>
        <v-stepper-content step="2">
            <v-card
              class="mb-5"
              color="grey lighten-1"
              height="200px">
            </v-card>
            <v-btn
              color="primary"
              @click="e1 = 3">
                Continue
            </v-btn>
            <v-btn flat>Cancel</v-btn>
        </v-stepper-content>
        <v-stepper-content step="3">
            <v-card
              class="mb-5"
              color="grey lighten-1"
              height="200px">
            </v-card>
            <v-btn
              color="primary"
              @click="e1 = 1">
                Continue
            </v-btn>
            <v-btn flat>Cancel</v-btn>
        </v-stepper-content>
    </v-stepper>
</template>

<script>
import chooseNation from '@/components/templates/create_perso/ChooseNation'

    export default {
        components: {
            chooseNation,
        },
        data() {
            return {
                e1: 0
            }
        }
    }
</script>