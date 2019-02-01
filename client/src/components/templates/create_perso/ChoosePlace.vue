<template>
    <v-item-group>
        <v-container grid-list-md>
            <v-layout wrap>
                <v-flex
                  v-for="(p, i) in places"
                  :key="p.id"
                  xs12
                  md4>
                    <v-item>
                        <v-card
                          slot-scope="{ active, toggle }"
                          :color="active ? 'primary' : ''"
                          class="d-flex align-center"
                          dark
                          height="200"
                          @click="toggle">
                            <v-scroll-y-transition>
                                <div
                                  v-if="active"
                                  class="display-3 text-xs-center">
                                    Active
                                </div>
                            </v-scroll-y-transition>
                        </v-card>
                    </v-item>
                </v-flex>
            </v-layout>
        </v-container>
    </v-item-group>
</template>

<script>
    import ApiService from '@/services/api.service.js'
    export default {
        name: 'choosePlace',
        data: function(){
            return {
                places: {},
                place: -1,
            }
        },
        mounted() {
            ApiService
                .getPlacesList()
                .then(({data}) => {
                    this.places = data
                })
        },
        methods: {
            choosePlace(i) {
                if (this.place != i)
                    this.place = i
                else
                    this.place = -1

                this.$emit('place-choosen', this.place)
            }
        }
    }
</script>