import router from './../router'

export default class AuthService {
    authenticated = this.isAuthenticated();
    autNotifier = new EventEmitter();

    constructor() {
        this.login = this.login.bind(this)
    }
}