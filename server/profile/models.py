from django.db import models
from django.contrib.auth.models import User
import uuid


class Profile(models.Model):
    nikname = models.CharField(max_length=250, default="")
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    jwt_secret = models.UUIDField(default=uuid.uuid4)
    #personnage = models.ForeignKey(Personnage)

    def __str__(self):
        return self.nikname
