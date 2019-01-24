# personage/urls.py
from django.urls import path, re_path
from . import views
from .views import *


urlpatterns = [
    path('nations_list', views.nations_list, name='nations_list'),
    path('profession_list/', views.ProfessionList.as_view(), name='profession_list'),
    path('social_list/', views.SocialList.as_view(), name='social_list'),
    path('domain_list/', views.DomainList.as_view(), name='domain_list'),
    path('discipline_list/', views.DisciplineList.as_view(), name='discipline_list'),
    path('way_list/', views.WayList.as_view(), name='way_list'),
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
