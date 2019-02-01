<template>
    <v-item-group>
        <v-container grid-list-md>
            <v-layout wrap>
                <v-flex
                  v-for="(s, i) in socials"
                  :key="s.id"
                  xs12
                  md4>
                    <v-item>
                        <v-card
                          slot-scope="{ active, toggle }"
                          dark
                          :color="active ? 'primary' : ''"
                          height="600">
                            <v-card-title primary-title
                              @click="toggle">
                                <h3 class="headline mb-0">
                                    {{ s.name }}
                                </h3>
                                <span>
                                    {{ s.description }}
                                </span>
                            </v-card-title>
                            <v-scroll-y-transition>
                                <v-card-actions
                                  v-if="active"
                                  color="grey">
                                    <v-btn-toggle v-model="toggle_multiple" multiple
                                      v-for="domain_id in s.domains"
                                      :key="domain_id">
                                        <v-btn flat>
                                            {{ domain_id }}
                                        </v-btn>
                                    </v-btn-toggle>
                                </v-card-actions>
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
        name: 'chooseSocial',
        data: function(){
            return {
                socials: {},
                social: -1,
                toggle_multiple: [0,1,2]
            }
        },
        mounted() {
            ApiService
                .getSocialsList()
                .then(({data}) => {
                    this.socials = data
                })
        },
        methods: {
            chooseSocial(i) {
                if (this.social != i)
                    this.social = i
                else
                    this.social = -1

                this.$emit('social-choosen', this.social)
            }
        }
    }
</script>