<template>
    <div>
        <h1>Profile Page</h1>
        <!--<p>{{ profile.nickname }}</p>-->
    </div>
</template>

<script>
import { mapGetters } from 'vuex';
import { FETCH_A_PROFILE } from '@/store/actions.type'

export default {
    name: "Profile",

    mounted () {
        this.$store.dispatch(FETCH_A_PROFILE)
        .then(() => {
            console.log("YOUPI");
        })
        .catch((err) => {
            console.log("ERR : ", err);
        })
    },
    /*computed: {
      ...mapGetters([
        'profile',
        'isLoading'
      ])
    }*/
};
</script>
