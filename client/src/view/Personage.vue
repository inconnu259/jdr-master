<template>
    <section class="container">
        <h1>Liste des personages</h1>
        <personagesList></personagesList>
    </section>
</template>

<script>
    import personagesList from '@/components/PersonagesList'
    import { FETCH_PERSONAGES } from '@/store/actions.type'
    import { mapGetters } from 'vuex'

    export default {
        name: "Personage",
        components: {
            personagesList
        },
        mounted () {
            this.$store.dispatch(FETCH_PERSONAGES)
            .then(() => {
                console.log("YOUPI");
            })
            .catch((err) => {
                console.log("ERR : ", err);
            })
        }
    }
</script>