from django.db import models


class Personage(models.Model):
    name = models.CharField(max_length=100)
