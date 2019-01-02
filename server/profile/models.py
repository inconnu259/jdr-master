from django.db import models
from django.contrib.auth.models import User
import uuid


class Profile(models.Model):
    nickname = models.CharField(max_length=250, default="")
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    jwt_secret = models.UUIDField(default=uuid.uuid4)

    def __str__(self):
        return self.nickname
