# personage/urls.py
from django.urls import path
from . import views


urlpatterns = [
    path('nationsList', views.nationsList, name='nationsList'),
    path('create_personage', views.createPersonage, name='create_personage'),
    # path('create_personage',)
]
