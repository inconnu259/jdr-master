import json
from django.contrib.auth.models import User
from django.urls import reverse
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework.views import status
from .mixins import TestsMixin
from rest_framework_jwt.settings import api_settings
from django.contrib.auth import user_logged_out
from .serializer import ProfileSerializer, UserSerializer
from .models import Profile

# tests for profiles


class BaseViewTest(TestsMixin, TestCase):
    SUPER_USER = "super_test"
    PASSWORD_SUPER_USER = "super_pass"
    USER = "user_test"
    PASSWORD_USER = "user_pass"
    @staticmethod
    def create_profile(nickname="", user=""):
        if nickname != "" and user != "":
            Profile.objects.create(nickname=nickname, user=user)

    def login_client(self, username="", password=""):
        return self.post(
            self.login_url,
            data={
                "username": username,
                "password": password,
            },
            status_code=200
        )

    def logout(self):
        self.post(self.logout_url, status=status.HTTP_200_OK)

    def setUp(self):
        self.init()
        # create a admin user
        self.super_user = User.objects.create_superuser(
            username=self.SUPER_USER,
            email="test@mail.com",
            password=self.PASSWORD_SUPER_USER,
            first_name="test",
            last_name="user",
        )
        # add profile for super user
        self.create_profile("super_testor", self.super_user)
        # add test data
        self.user1 = User.objects.create_user(
            username=self.USER,
            password=self.PASSWORD_USER,
            email="user@mail.com",
            first_name="user",
            last_name="test"
        )
        user2 = User.objects.create_user(username="user2")
        user3 = User.objects.create_user(username="user3")
        self.create_profile("the killer", self.user1)
        self.create_profile("amstramgram", user2)
        self.create_profile("bisounours", user3)


class AuthUser(BaseViewTest):
    """
    Tests for the auth/login/ endpoint
    """
    def test_user_login(self):
        # test login with super user
        payload = {
            "username": self.SUPER_USER,
            "password": self.PASSWORD_SUPER_USER
        }
        resp = self.post(self.login_url, data=payload, status_code=200)
        self.assertEqual('key' in self.response.json.keys(), True)
        self.token = self.response.json['key']

        # test login with invalid credentials
        payload = {
            "username": self.SUPER_USER,
            "passowrd": "wrong_passowrd"
        }
        resp = self.post(self.login_url, data=payload, status_code=400)

        # test with empty user
        resp = self.post(self.login_url, data={}, status_code=400)

        # test login with no admin count
        payload = {
            "username": self.USER,
            "password": self.PASSWORD_USER
        }
        response = self.post(self.login_url, data=payload, status_code=200)
        self.assertEqual('key' in self.response.json.keys(), True)
        self.token = self.response.json['key']

    @override_settings(ACCOUNT_LOGOUT_ON_GET=True)
    def test_user_logout_on_get(self):
        payload = {
            "username": self.SUPER_USER,
            "password": self.PASSWORD_SUPER_USER
        }
        self.post(self.login_url, data=payload, status_code=200)
        self.get(self.logout_url, status=status.HTTP_200_OK)
        self.post(self.login_url, data=payload, status_code=200)
        self.post(self.logout_url, status=status.HTTP_200_OK)

    @override_settings(ACCOUT_LOGOUT_ON_GET=False)
    def test_user_logout_on_post_only(self):
        payload = {
            "username": self.SUPER_USER,
            "password": self.PASSWORD_SUPER_USER
        }
        self.post(self.login_url, data=payload, status_code=200)
        self.get(self.logout_url, status=status.HTTP_405_METHOD_NOT_ALLOWED)
        self.post(self.logout_url, status=status.HTTP_200_OK)



class ApiProfilesTest(BaseViewTest):
    '''def test_get_all_profiles(self):
        """
        This test ensure that all profiles added in the setUp method
        exist when we make a GET request to the profiles/ endpoint
        """
        self.login_client('test_user', 'testing')
        # hit the API endpoint
        response = self.client.get(
            reverse(
                "profiles-all",
                kwargs={"version": "v1"})
        )
        # fetch the data from db
        expected = Profile.objects.all()
        serialized = ProfileSerializer(expected, many=True)
        self.assertEqual(response.data, serialized.data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.login_client('user1', 'user_test')
        response = self.client.get(
            reverse(
                "profiles-all",
                kwargs={"version": "v1"})
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)'''

    '''def test_get_profile_id(self):
        """
        This test
        """
        self.login_client('test_user', 'testing')
        #self.client.headers.update({'': ''})
        response = self.client.get(
            reverse(
                "profile",
                kwargs={"version": "v1",
                        "pk": "1"})
        )
        expected = Profile.objects.get(id=1)
        serialized = ProfileSerializer(instance=expected)
        self.assertEqual(response.data, serialized.data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.login_client('user1', 'user_test')
        response = self.client.get(
            reverse(
                "profile",
                kwargs={"version": "v1",
                        "pk": "1"})
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)'''

    def test_get_current_profile(self):
        """
        This test
        """
        self.login_client(self.SUPER_USER, self.PASSWORD_SUPER_USER)
        response = self.get(
            reverse(
                "current-profile",
                kwargs={"version": "v1"})
        )
        expected = Profile.objects.get(nickname="super_testor")
        serialized = ProfileSerializer(instance=expected)
        self.assertEqual(response.data, serialized.data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.login_client(self.USER, self.PASSWORD_USER)
        response = self.client.get(
            reverse(
                "current-profile",
                kwargs={"version": "v1"})
            )
        expected = Profile.objects.get(nickname="the killer")
        serialized = ProfileSerializer(instance=expected)
        self.assertEqual(response.data, serialized.data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
