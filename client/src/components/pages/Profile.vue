<template>
    <div>
        Profile Page
    </div>
</template>

<script>
import router from "../../router";
export default {
  name: "Profile",
  mounted() {
    this.checkLoggedIn();
  },
  methods: {
    checkLoggedIn() {
      this.$session.start();
      if (!this.$session.has("token")) {
        router.push("/login");
      }
    }
  }
};
</script>
