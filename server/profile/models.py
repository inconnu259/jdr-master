from django.db import models
from django.contrib.auth.models import User
#from personage.models import Personage


class Profile(models.Model):
    nickname = models.CharField(max_length=250, default="")
    user = models.OneToOneField(User, on_delete=models.CASCADE)

    def __str__(self):
        return self.nickname
