import axios from 'axios';
import { API_URL } from '@/services/config'

const CSRF_COOKIE_NAME = 'csrftoken'
const CSRF_HEADER_NAME = 'X-CSRFToken';

const session = axios.create({
    xsrfCookieName: CSRF_COOKIE_NAME,
    xsrfHeaderName: CSRF_HEADER_NAME,
    baseURL: API_URL,
});

export default session;