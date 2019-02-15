<template>
    <v-container grid-list-md>
        <v-layout wrap>
            <v-flex>
                <span>Somme : {{ somme() }}</span>
            </v-flex>
            <v-flex
              v-for="(w, i) in ways"
              row
              wrap
              :key="w.id"
              xs12
              md12>
                <v-layout row wrap>
                    <v-flex md3>
                        <h3>{{ w.name }}</h3>
                    </v-flex>
                    <v-flex md1>
                        <v-text-field
                          v-model="way[w.id-1]"
                          class="mt-0"
                          hide_details
                          single-line
                          type="number"
                          :max="5"
                          :min="1"></v-text-field>
                    </v-flex>
                    <v-flex md8>
                        <span>{{ w.description }}</span>
                    </v-flex>
                </v-layout>
            </v-flex>
        </v-layout>
    </v-container>
</template>

<script>
import ApiService from '@/services/api.service.js'
    export default {
        name: 'chooseWay',
        data: function(){
            return {
                ways: {},
                way: [0, 0, 0, 0, 0],
            }
        },
        mounted() {
            ApiService
                .getWaysList()
                .then(({data}) => {
                    this.ways = data
                })
        },
        methods: {
            chooseWay(i) {
                if (this.way != i)
                    this.way = i
                else
                    this.way = -1

                this.$emit('way-choosen', this.way)
            },
            somme() {
                return this.way[0] + this.way[1] + this.way[2] + this.way[3] + this.way[4]
            }
        }
    }
</script>