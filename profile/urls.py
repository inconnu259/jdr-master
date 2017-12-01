# profile/urls.py
from django.urls import path
from django.contrib.auth import views as auth_views
from . import views


urlpatterns = [
    path('', views.home, name='home'),
    path('profile', views.profile, name='profile'),
    path('password_reset', auth_views.PasswordResetView.as_view(), name='password_reset')
]