import json
from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework.test import APITestCase, APIClient
from rest_framework.views import status
from rest_framework_jwt.settings import api_settings
from django.contrib.auth import user_logged_out
from .serializer import ProfileSerializer, UserSerializer
from .models import Profile

# Get the JWT settings, add these lines after the import/from lines
jwt_payload_handler = api_settings.JWT_PAYLOAD_HANDLER
jwt_encode_handler = api_settings.JWT_ENCODE_HANDLER

# tests for profiles


class BaseViewTest(APITestCase):
    client = APIClient(enforce_csrf_checks=True)

    @staticmethod
    def create_profile(nickname="", user=""):
        if nickname != "" and user != "":
            Profile.objects.create(nickname=nickname, user=user)

    def login_a_user(self, username="", password=""):
        url = reverse(
            "user-login",
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

    def logout(self):
        # get a token from DRF
        response = self.client.post(
            reverse('user-logout-alluser-logout-all',
                    kwargs={"version": "v1"}),
            self.client.credentials(
                HTTP_AUTHORIZATION='JWT ' + self.token
            )
        )

    def login_client(self, username="", password=""):
        # get a token from DRF
        response = self.client.post(
            reverse('user-login',
                    kwargs={"version": "v1"}),
            data=json.dumps(
                {
                    'username': username,
                    'password': password,
                }
            ),
            content_type='application/json'
        )
        try:
            self.token = response.data['token']
            # set the token in the header
            self.client.credentials(
                HTTP_AUTHORIZATION='JWT ' + self.token
            )
        except KeyError:
            print("No token")
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
        self.create_profile("super_testor", self.user)
        # add test data
        user1 = User.objects.create_user(
            username="user1",
            password='user_test',
            email="user@mail.com",
            first_name="user",
            last_name="test"
        )
        user2 = User.objects.create_user(username="user2")
        user3 = User.objects.create_user(username="user3")
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
        #self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        # => maintenant les erreurs d'identifications sont bad_request
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # test login with no admin count
        response = self.login_a_user("user1", "user_test")
        # assert token key exists
        self.assertIn("token", response.data)
        # assert status code is 200 OK
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class ApiUsersTest(BaseViewTest):
    '''def test_get_all_users(self):
        self.login_client('test_user', 'testing')
        response = self.client.get(
            reverse("user-list")
        )
        # fetch the data from db
        expected = User.objects.all()
        serialized = UserSerializer(expected, many=True)
        self.assertEqual(response.data, serialized.data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)'''

    #def test_post_should_logout_logged_in_user(self):
        #user_logged_out.connect(self.signal_receiver)
        #request = self.factory.post(user=user)



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
        self.login_client('test_user', 'testing')
        response = self.client.get(
            reverse(
                "current-profile",
                kwargs={"version": "v1"})
        )
        expected = Profile.objects.get(nickname="super_testor")
        serialized = ProfileSerializer(instance=expected)
        self.assertEqual(response.data, serialized.data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.login_client('user1', 'user_test')
        response = self.client.get(
            reverse(
                "current-profile",
                kwargs={"version": "v1"})
            )
        expected = Profile.objects.get(nickname="the killer")
        serialized = ProfileSerializer(instance=expected)
        self.assertEqual(response.data, serialized.data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # log out before

        """self.login_client("anonymous", "123nopassword")
        response = self.client.get(
            reverse(
                "current-profile",
                kwargs={"version": "v1"})
            )
        print(response.data)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)"""

    def test_logout(self):
        print("logout")
        payload = jwt_payload_handler(self.user)
        token = jwt_encode_handler(payload)

        auth = 'JWT {0}'.format(token)
        response = self.client.post(
            reverse("user-logout-all",
                    kwargs={"version": "v1"})
            , HTTP_AUTHORIZATION=auth, format='json')

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        # logout doesn't work if we try to login with same token
        '''print("current profile with logout user")
        response = self.client.get(
            reverse(
                "current-profile",
                kwargs={"version": "v1"})
            , HTTP_AUTHORIZATION=auth, format='json'
            )
        print("assert")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        print("test_logout end")'''
