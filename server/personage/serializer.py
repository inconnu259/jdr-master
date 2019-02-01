from django.contrib.auth.models import User

from rest_framework import serializers

from .models import Personage, Nation, Profession, Social, Way, Discipline, Domain, Place


class PersonageSerializer(serializers.ModelSerializer):
    """ A serializer class for the Profil model """
    class Meta:
        # Specify the model we are using
        model = Personage
        # Specify the fields that should be made accessible
        # Mostly it is all fields in that model
        fields = ('id', 'name', 'genre', 'birthdate', 'nation')


class NationSerializer(serializers.ModelSerializer):
    """ A serializer clas for the User model """
    class Meta:
        # Specify the model we are using
        model = Nation
        # Specify the fields that should be made accssible.
        # Mostly it is all fields in that model
        fields = ('id', 'name', 'description', 'preposition')


class ProfessionSerializer(serializers.ModelSerializer):
    """ A serializer class for the Profession model """
    class Meta:
        model = Profession
        fields = ('id', 'name', 'description', 'primary_domain', 'secondary_domain')


class SocialSerializer(serializers.ModelSerializer):
    class Meta:
        model = Social
        fields = ('id', 'name', 'description', 'domains')


class WaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Way
        fields = ('id', 'name', 'description')


class DisciplineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Discipline
        fields = ('id', 'name', 'description')


class DomainSerializer(serializers.ModelSerializer):
    class Meta:
        model = Domain
        fields = ('id', 'name', 'description', 'disciplines', 'way')


class PlaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Place
        fields = ('id', 'name', 'description')
