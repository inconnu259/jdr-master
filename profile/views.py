from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from .forms import UserForm, ProfileForm
from django.contrib import messages


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
            messages.success(request, _('Votre profile est bien sauvegardé !'))
            return redirect('settings:profile')
        else:
            messages.error(request, ("S'il te plait, corrige les erreurs."))
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