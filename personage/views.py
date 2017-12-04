from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from .models import Nation


@login_required(login_url="login/")
def nationsList(request):
    nations = Nation.objects.all()
    context = {
        'nations': nations
    }
    return render(request, "list.html", context)


@login_required(login_url="login/")
def createPersonage(request):
    nations = Nation.objects.all()
    context = {
        'nations': nations
    }
    return render(request, "create_personage.html", context)