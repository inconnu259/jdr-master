import json
from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework.test import APITestCase, APIClient
from rest_framework.views import status
from .serializer import ProfileSerializer
from .models import Profile


# tests for profiles


class BaseViewTest(APITestCase):
    client = APIClient()

    @staticmethod
    def create_profile(nickname="", user=""):
        if nickname != "" and user != "":
            Profile.objects.create(nickname=nickname, user=user)
            pass

    def login_a_user(self, username="", password=""):
        url = reverse(
            "auth-login",
            kwargs={"version": "v1"}
        )
        return self.client.post(
            url,
            data=json.dumps({
                "username": username,
                "password": password,
            }),
            content_type="application/json"
        )

    def login_client(self, username="", password=""):
        # get a token from DRF
        response = self.client.post(
            reverse('create-token'),
            data=json.dumps(
                {
                    'username': username,
                    'password': password,
                }
            ),
            content_type='application/json'
        )
        self.token = response.data['token']
        # set the token in the header
        self.client.credentials(
            HTTP_AUTHORIZATION='Bearer ' + self.token
        )
        self.client.login(username=username, password=password)
        return self.token

    def setUp(self):
        # create a admin user
        self.user = User.objects.create_superuser(
            username="test_user",
            email="test@mail.com",
            password="testing",
            first_name="test",
            last_name="user",
        )
        # add profile for super user
        self.profile = Profile.objects.create(
            nickname="super_testor",
            user=self.user,
        )
        # add test data
        user1 = User.objects.create(username="user1")
        user2 = User.objects.create(username="user2")
        user3 = User.objects.create(username="user3")
        self.create_profile("the killer", user1)
        self.create_profile("amstramgram", user2)
        self.create_profile("bisounours", user3)


class AuthLoginUser(BaseViewTest):
    """
    Tests for the auth/login/ endpoint
    """
    def test_login_user_with_valid_credential(self):
        # test login with valid credentials
        response = self.login_a_user("test_user", "testing")
        # assert token key exists
        self.assertIn("token", response.data)
        # assert status code is 200 OK
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # test login with invalid credentials
        response = self.login_a_user("anonymous", "pass")
        # assert status code is 401 UNAUTHORIZED
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class GetAllProfilesTest(BaseViewTest):
    def test_get_all_profiles(self):
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
