from django.contrib.auth.models import User

from rest_framework import serializers

from .models import Personage, Nation


class PersonageSerializer(serializers.ModelSerializer):
    """ A serializer class for the Profil model """
    class Meta:
        # Specify the model we are using
        model = Personage
        # Specify the fields that should be made accessible
        # Mostly it is all fields in that model
        fields = ('name', 'genre', 'birthdate', 'nation')


class NationSerializer(serializers.ModelSerializer):
    """ A serializer clas for the User model """
    class Meta:
        # Specify the model we are using
        model = Nation
        # Specify the fields that should be made accssible.
        # Mostly it is all fields in that model
        fields = ('name', 'description', 'preposition')
