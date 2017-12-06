from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET
from .models import Nation, Profession
from .creator import Creator


@login_required(login_url="login/")
def nations_list(request):
    nations = Nation.objects.all()
    context = {
        'nations': nations
    }
    return render(request, "list_nations.html", context)


@login_required(login_url="login/")
def create_personage(request):
    creator = Creator(request)
    nations = Nation.objects.all()
    professions = Profession.objects.all()
    context = {
        'nations': nations,
        'professions': professions,
        'creator': creator
    }
    return render(request, "create_personage.html", context)


@require_GET
@login_required(login_url="login/")
def creator_choose_nation(request, nation_id):
    creator = Creator(request)
    nation = get_object_or_404(Nation, id=nation_id)
    creator.choose_nation(nation=nation)
    return redirect('create_personage')
