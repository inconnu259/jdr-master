<template>
    <div>
        <h1>Personages()</h1>
        <table class="table table-bordered table-hover">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Name</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="personage in personages" @click="selectPersonage(personage">
                    <th></th>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<script>
    import { APIService } from '../htt
</script>