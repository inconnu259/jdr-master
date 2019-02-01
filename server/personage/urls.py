# personage/urls.py
from django.urls import path, re_path
from . import views
from .views import *


urlpatterns = [
    re_path('nations_list/', views.NationView.as_view(), name='nations_list'),
    path('professions_list/', views.ProfessionList.as_view(), name='professions_list'),
    path('socials_list/', views.SocialList.as_view(), name='socials_list'),
    path('domains_list/', views.DomainList.as_view(), name='domains_list'),
    path('disciplines_list/', views.DisciplineList.as_view(), name='disciplines_list'),
    path('places_list/', views.PlaceList.as_view(), name='places_list'),
    path('ways_list/', views.WayList.as_view(), name='ways_list'),
    path('create_personage', views.create_personage, name='create_personage'),
    path('creator_choose_nation/<int:nation_id>', views.creator_choose_nation, name='choose_nation'),
    path('creator_choose_profession/<int:profession_id>', views.creator_choose_profession, name='choose_profession'),
    path('creator_choose_place/<int:place_id>', views.creator_choose_place, name='choose_place'),
    path('creator_choose_social/<int:social_id>', views.creator_choose_social, name='choose_social'),
    path('creator_choose_social_domain/<int:domain_id>', views.creator_choose_social_domain, name='choose_social_domain'),
    path('creator_choose_trait/<int:trait_id>', views.creator_choose_trait, name='choose_trait'),
    path('personages/', PersonageList.as_view()),
    re_path('personages/(?P<pk>\d+)/', PersonageRetrieveUpdate.as_view())
]
