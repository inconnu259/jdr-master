<template>
    <div>
        <h1>Profile Page</h1>
        <p></p>
    </div>
</template>

<script>
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
  },
};
</script>
