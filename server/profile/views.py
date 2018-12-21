from django.shortcuts import render, redirect
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required
from .forms import UserForm, ProfileForm
from django.contrib import messages
from .models import Profile
from rest_framework import generics, permissions
from .serializer import ProfileSerializer, UserSerializer

@login_required(login_url="login/")
def home(request):
    return render(request, "home.html")


@login_required(login_url="login/")
def profile(request):
    if request.method == 'POST':
        user_form = UserForm(request.POST, instance=request.user)
        try:
            profile_form = ProfileForm(request.POST, instance=request.user.profile)
        except:
            profile_form = ProfileForm()
        if user_form.is_valid() and profile_form.is_valid():
            user_form.save()
            profile_form.save()
            messages.success(request, 'Votre profile est bien sauvegardé !')
            return redirect('settings:profile')
        else:
            messages.error(request, "S'il te plait, corrige les erreurs.")
    else:
        user_form = UserForm(instance=request.user)
        try:
            profile_form = ProfileForm(instance=request.user.profile)
        except:
            profile_form = ''
    return render(request, "profile.html", {
        'user_form': user_form,
        'profile_form': profile_form
    })


class UserList(generics.ListAPIView):
    """ View to list all usres """
    queryset = User.objects.all().order_by('first_name')
    serializer_class = UserSerializer
    permission_classes = (permissions.IsAuthenticated,)


class UserRetrieveUpdate(generics.RetrieveUpdateAPIView):
    """ Retrieve a user or update user information.
    Accepts GET and PUT requests and the record id must be provided in the request """
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = (permissions.IsAuthenticated,)


class UserCreate(generics.CreateAPIView):
    """ View to create a new user. Only accepts POST requests """
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = (permissions.IsAdminUser,)


class ProfileList(generics.ListAPIView):
    """ View to list all profile """
    queryset = Profile.objects.all()
    serializer_class = ProfileSerializer
    permission_classes = (permissions.IsAuthenticated,)


class ProfileRetrieveUpdate(generics.RetrieveUpdateAPIView):
    """ Retrieve and update a profile """
    queryset = Profile.objects.all()
    serializer_class = ProfileSerializer
    permission_classes = (permissions.IsAuthenticated,)
