# personage/urls.py
from django.urls import path
from . import views


urlpatterns = [
    path('nations_list', views.nations_list, name='nations_list'),
    path('create_personage', views.create_personage, name='create_personage'),
    path('creator_choose_nation/<int:nation_id>', views.creator_choose_nation, name='choose_nation'),
]
