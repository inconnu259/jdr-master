"""jdr_master URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/dev/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.contrib.auth import views as auth_views
from rest_framework_jwt.views import obtain_jwt_token, refresh_jwt_token

urlpatterns = [
    path('admin/', admin.site.urls),
    path('nested_admin/', include('nested_admin.urls')),
    #path('login/', obtain_jwt_token, name='create-token'),
    #path('login/refresh/', refresh_jwt_token, name='user-login-refresh'),
    re_path('api/(?P<version>(v1|v2))/', include('profile.urls')),
    re_path('auth/', include('rest_auth.urls')),
    #path('logout/', auth_views.LogoutView.as_view(next_page='login')),
    #re_path('api/', include('djoser.urls')),
    #re_path('api/', include('djoser.urls.jwt')),
    re_path('api/(?P<version>(v1|v2))/', include('personage.urls')),
]
