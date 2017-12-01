# personage/urls.py
from django.urls import path
from . import views


urlpatterns = [
    path('personage', views.personageList, name='personage'),
]
