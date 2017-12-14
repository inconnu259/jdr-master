# personage/urls.py
from django.urls import path
from . import views


urlpatterns = [
    path('nations_list', views.nations_list, name='nations_list'),
    path('create_personage', views.create_personage, name='create_personage'),
    path('creator_choose_nation/<int:nation_id>', views.creator_choose_nation, name='choose_nation'),
    path('creator_choose_profession/<int:profession_id>', views.creator_choose_profession, name='choose_profession'),
    path('creator_choose_place/<int:place_id>', views.creator_choose_place, name='choose_place'),
    path('creator_choose_social/<int:social_id>', views.creator_choose_social, name='choose_social'),
    path('creator_choose_social_domain/<int:domain_id>', views.creator_choose_social_domain, name='choose_social_domain'),
    path('creator_choose_trait/<int:trait_id', views.creator_choose_trait, name='choose_trait'),
]
