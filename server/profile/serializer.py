from django.contrib.auth.models import User

from rest_framework import serializers

from .models import Profile


class ProfileSerializer(serializers.ModelSerializer):
    """ A serializer class for the Profil model """
    class Meta:
        # Specify the model we are using
        model = Profile
        # Specify the fields that should be made accessible
        # Mostly it is all fields in taht model
        fields = ('user',)
