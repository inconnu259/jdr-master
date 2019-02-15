<template>
    <v-btn-toggle v-model="toggle_none">
        <v-container grid-list-md>
            <v-layout wrap>
                <v-flex
                  v-for="(p, i) in professions"
                  :key="p.id"
                  xs12
                  md4>
                    <v-btn
                      :value="p.id"
                      @click="chooseProfession(i)">
                        {{ p.name }}
                    </v-btn>
                    <v-dialog
                      v-model="dialog.parent_id[i]"
                      width="500">
                        <v-btn
                          slot="activator"
                          :value="undefined">
                          <v-icon>search</v-icon>
                        </v-btn>

                        <v-card>
                            <v-card-title
                              class="headline"
                              primary-title>
                                {{ p.name }}
                            </v-card-title>

                            <v-card-text>
                                <span>{{ p.description }}</span>
                                <p>Domaine principal :</p>
                                <span>{{ domains[p.primary_domain-1].name }}</span>
                                <p>Domaines secondaires :</p>
                                <span v-for="domain in p.secondary_domain">{{ domains[domain-1].name }} </span>

                            </v-card-text>
                            <v-divider></v-divider>
                            <v-card-actions>
                                <v-btn
                                  color="primary"
                                  flat
                                  @click="dialog.parent_id[i] = false">
                                    Ok
                                </v-btn>
                            </v-card-actions>
                        </v-card>
                    </v-dialog>
                </v-flex>
            </v-layout>
        </v-container>
    </v-btn-toggle>

</template>

<script>
import ApiService from '@/services/api.service.js'
export default {
    name: 'chooseProfession',
    data: function(){
        return {
            professions: {},
            profession: -1,
            toggle_none: null,
            dialog: {
                parent_id: []
            },
        }
    },
    props: {
        domains: {
          type: Array,
          default: []
        },
    },
    mounted() {
        ApiService
            .getProfessionsList()
            .then(({data}) => {
                this.professions = data
            })
    },
    methods: {
        chooseProfession(i) {
            if (this.profession != i)
                this.profession = i
            else
                this.profession = -1

            this.$emit('profession-choosen', this.profession)
        },
    }
}
</script>