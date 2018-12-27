from django.db import models
from django.contrib.auth.models import User


class Profile(models.Model):
    nikname = models.CharField(max_length=250, default="")
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    #personnage = models.ForeignKey(Personnage)

    def __str__(self):
        return self.nikname
