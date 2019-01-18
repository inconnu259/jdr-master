import session from './session';

export default {
    login(username, password) {
        return session.post('/user/login/', { username, password });
    },
    logout() {
        return session.post('/auth/logout/', {});
    },
    getAccountDetails() {
        return session.get('/auth/user/');
    },
}