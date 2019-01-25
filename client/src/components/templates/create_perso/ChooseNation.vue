<template>
    <v-container
      id="chooseNation"
      fill-height
      fluid
      grid-list-xl>
        <v-layout
          justify-center
          wrap
          row>
            <v-flex
              xs12
              md6
              py-4
              v-for="(nation, i) in nations">
                <v-hover>
                    <material-card
                      slot-scope="{ hover }"
                      :class="`elevation-${hover ? 18 : 2}`"
                      class="mx-auto grow"
                      height="100%"
                      color="green"
                      :title="nation.name"
                      hover
                      @click.native="chooseNation(i)"
                      text="choisir ce peuple ?">
                        <v-card-text
                          color="green"
                          class="text-xs-justify">
                            <p>{{ nation.description }}</p>
                        </v-card-text>
                    </material-card>
                </v-hover>
            </v-flex>
        </v-layout>
    </v-container>
</template>

<script>
import ApiService from '@/services/api.service.js'
    export default {
        name: 'chooseNation',
        data(){
            return {
                nations: {},
                nation: -1,
            }
        },
        mounted() {
            ApiService
                .getNationsList()
                .then(({data}) => {
                    this.nations = data
                })
        },
        methods: {
            chooseNation(i) {
                this.nation = i
            }
        }
    }
</script>

<style>
.v-card--reveal {
    transform: scale(1.05);
}

.grow {
    transition: all .2s ease-in-out;
}
.grow:hover {
    transform: scale(1.05);
}
</style>