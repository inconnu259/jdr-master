from django.test import TestCase
from .models import Profile
from rest_framework.test import APITestCase
from


class RequestTest(APITestCase):
    def login(self):
        response = self.client.post("login")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Account.objects.count(), 1)
        self.assertEqual(Account.object.get().name, 'DabApps')
