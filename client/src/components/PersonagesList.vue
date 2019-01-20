<template>
    <ul id="personageList">
    <li v-for="personage in personages">
      <div class="description">
        <p><span class="grey"> Name </span>{{ personage.nickname }} {{ personage }}</p>
        <!--<p><span class="grey"> Owner </span>{{ personage.profile.nickname }}</p>-->
        <!--<p><span class="grey"> Age </span>{{ personage.age }}</p>-->
      </div>
    </li>
  </ul>
</template>

<script>
  import { mapGetters } from 'vuex'

export default {
    name: 'personagesList',
    computed: {
      ...mapGetters([
        'personages',
        'isLoading'
      ])
    }
  }
</script>