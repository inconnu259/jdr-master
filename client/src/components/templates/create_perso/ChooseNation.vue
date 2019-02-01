<template>
    <v-container
      id="chooseNation"
      fill-height
      fluid
      grid-list-xl>
        <v-layout
          justify-center
          row
          wrap>
            <v-flex
              xs12
              md6
              py-4
              v-for="(n, i) in nations"
              :key=n.id>
                <v-hover>
                    <material-card
                      slot-scope="{ hover }"
                      :class="`elevation-${hover ? 18 : 2}`"
                      class="mx-auto"
                      height="100%"
                      color="green"
                      :title="`Peuple ${n.preposition} ${n.name}`"
                      hover
                      tile
                      v-ripple
                      shift
                      :value="true"
                      @click.native="chooseNation(i)"
                      :text="nation == i ? 'vous avez choisis ce peuple' : 'choisir ce peuple ?'">
                        <v-card-text
                          class="text-xs-justify"
                          :ripple="true">
                            <p>{{ n.description }}</p>
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
        data: function(){
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
                if (this.nation != i)
                    this.nation = i
                else
                    this.nation = -1

                this.$emit('nation-choosen', this.nation)
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