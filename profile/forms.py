from django.contrib.auth.forms import AuthenticationForm
from django import forms
from .models import Profile
from django.contrib.auth.models import User


class LoginForm(AuthenticationForm):
    username = forms.CharField(label="Identifiant", max_length=30,
                               widget=forms.TextInput(attrs={'class': 'validate', 'name': 'username'}))
    password = forms.CharField(label="Mot de passe", max_length=30,
                               widget=forms.PasswordInput(attrs={'class': 'validate', 'name': 'password'}))


class UserForm(forms.ModelForm):
    class Meta:
        model = User
        fields = ('username', 'first_name', 'last_name', 'email')


class ProfileForm(forms.ModelForm):
    class Meta:
        model = Profile
        fields = ()
