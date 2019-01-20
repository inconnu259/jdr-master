# profile/urls.py
from django.urls import path, re_path
from django.contrib.auth import views as auth_views
from rest_framework_jwt import views as jwt_views
from .views import *


urlpatterns = [
    #path('users/', UserList.as_view()),
    #path('create-users/', UserCreate.as_view()),
    #re_path('users/(?P<pk>\d+)/', UserRetrieveUpdate.as_view()),

    #path('profiles/', ProfileList.as_view(), name="profiles-all"),
    #re_path('profiles/(?P<pk>\d+)/', ProfileRetrieveUpdate.as_view(), name="profile"),
    #path('current_profile/', UserDetail, name="current-user"),
    #path('auth/login/', LoginView.as_view(), name="auth-login"),
    # Views are defined in Djoser, but we're assigning custom paths.
    re_path('profile/view/', ProfileView.as_view(), name='current-profile'),
    # Views are defined in Rest Framework JWT, but we're assigning custom paths.
    #re_path('user/login/', jwt_views.ObtainJSONWebToken.as_view(), name='user-login'),
    #re_path('user/login/refresh/', jwt_views.RefreshJSONWebToken.as_view(), name='user-login-refresh'),
    #re_path('logout/all/', ProfileLogoutAllView.as_view(), name='user-logout-all')
]

'''
"path('', views.home, name='home'),
path('profile', views.profile, name='profile'),
path('password_reset', auth_views.PasswordResetView.as_view(template_name='registration/password_reset_form.html'),
     name='password_reset'),
path('password_reset/done',
     auth_views.PasswordResetDoneView.as_view(template_name='registration/password_reset_done.html'),
     name='password_reset_done'),
re_path('reset/(?P<uidb64>[0-9A-Za-z_\-]+)/(?P<token>[0-9A-Za-z]{1,13}-[0-9A-Za-z]{1,20})/',
     # add new Path converter for uidb64 and/or token to match this pattern :
     # url(r'^reset/(?P<uidb64>[0-9A-Za-z_\-]+)/(?P<token>[0-9A-Za-z]{1,13}-[0-9A-Za-z]{1,20})/$'
     auth_views.PasswordResetConfirmView.as_view(template_name='registration/password_reset_confirm.html'),
     name='password_reset_confirm'),
path('reset/done',
     auth_views.PasswordResetCompleteView.as_view(template_name='registration/password_reset_complete.html'),
     name='password_reset_complete'),
'''