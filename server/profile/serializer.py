from django.contrib.auth.models import User
from rest_framework import serializers
from .models import Profile


class UserSerializer(serializers.ModelSerializer):
    """ A serializer clas for the User model """
    class Meta:
        # Specify the model we are using
        model = User
        # Specify the fields that should be made accssible.
        # Mostly it is all fields in that model
        fields = ('id', 'first_name', 'last_name', 'username', 'is_active', 'is_superuser')


class ProfileSerializer(serializers.ModelSerializer):
    """ A serializer class for the Profil model """
    user = UserSerializer(read_only=True)

    class Meta:
        # Specify the model we are using
        model = Profile
        # Specify the fields that should be made accessible
        # Mostly it is all fields in that model
        fields = ('nickname', 'user')


class TokenSerializer(serializers.Serializer):
    """
    This serializer serializes the token data
    """
    token = serializers.CharField(max_length=255)
