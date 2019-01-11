from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login, logout, user_logged_out, user_logged_in
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required
from .forms import UserForm, ProfileForm
from django.contrib import messages
from .models import Profile
from rest_framework import generics, permissions
from .serializer import ProfileSerializer, UserSerializer, TokenSerializer
from rest_framework import views
import uuid
from rest_framework_jwt.settings import api_settings
from rest_framework.response import Response
from rest_framework.decorators import api_view

# Get the JWT settings, add these lines after the import/from lines
jwt_payload_handler = api_settings.JWT_PAYLOAD_HANDLER
jwt_encode_handler = api_settings.JWT_ENCODE_HANDLER


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


class ProfileView(generics.RetrieveUpdateAPIView):
    """
    Use this endpoint to retrieve/update profile.
    """
    print("ProfileView")
    queryset = User.objects.all()
    serializer_class = ProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, *args, **kwargs):
        return self.request.user.profile

    def perform_update(self, serializer):
        pass


class ProfileLogoutAllView(views.APIView):
    """
    Use this endpoint to log out all session for a given user.
    """
    print("LogoutView")
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        print("Change uuid for logout")
        user = request.user
        user.profile.jwt_secret = uuid.uuid4()
        user.save()
        logout(request)
        #user_logged_out.send(sender=request.user.__class__, request=request, user=request.user)
        return Response(status=views.status.HTTP_204_NO_CONTENT)


class UserList(generics.ListAPIView):
    """ View to list all usres """
    queryset = User.objects.all().order_by('first_name')
    serializer_class = UserSerializer
    permission_classes = (permissions.IsAdminUser,)


class UserRetrieveUpdate(generics.RetrieveUpdateAPIView):
    """ Retrieve a user or update user information.
    Accepts GET and PUT requests and the record id must be provided in the request """
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = (permissions.IsAdminUser,)


class UserCreate(generics.CreateAPIView):
    """ View to create a new user. Only accepts POST requests """
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = (permissions.IsAdminUser,)


class ProfileList(generics.ListAPIView):
    """ View to list all profile """
    queryset = Profile.objects.all()
    serializer_class = ProfileSerializer
    permission_classes = (permissions.IsAdminUser,)


class ProfileRetrieveUpdate(generics.RetrieveUpdateAPIView):
    """ Retrieve and update a profile """
    queryset = Profile.objects.all()
    serializer_class = ProfileSerializer
    permission_classes = (permissions.IsAdminUser,)


class LoginView(generics.CreateAPIView):
    """
    POST auth/login
    """
    # This persmission class will overide the global permission
    # class setting
    print("LoginView")
    permission_classes = (permissions.AllowAny, )

    queryset = User.objects.all()

    def post(self, request, *args, **kwargs):
        username = request.data.get("username", "")
        password = request.data.get("password", "")
        user = authenticate(request, username=username, password=password)
        if user is not None:
            # login saves the user's ID in the session,
            # using Django's session framework.
            login(request, user)
            '''serializer = TokenSerializer(data={
                # using drf jwt utility functions to generate a token
                "token": jwt_encode_handler(
                    jwt_payload_handler(user)
                )})
            serializer.is_valid()'''
            #user_logged_in.send(sender=request.user.__class__, request=request, user=request.user)
            return Response(serializer.data)
        return Response(status=views.status.HTTP_401_UNAUTHORIZED)
