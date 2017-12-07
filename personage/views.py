from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET
from .models import Nation, Profession, Place, Social
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
    if nation.id is creator.get_choosen_nation():
        creator.remove_nation()
    else:
        creator.choose_nation(nation=nation)
    return redirect('create_personage')


@require_GET
@login_required(login_url="login/")
def creator_choose_profession(request, profession_id):
    creator = Creator(request)
    profession = get_object_or_404(Profession, id=profession_id)
    if profession.id is creator.get_choosen_professions():
        creator.remove_professions()
    else:
        creator.choose_profession(profession=profession)
    return redirect('create_personage')


@require_GET
@login_required(login_url="login/")
def creator_choose_place(request, place_id):
    creator = Creator(request)
    place = get_object_or_404(Place, id=place_id)
    if place.id is creator.get_choosen_place():
        creator.remove_place()
    else:
        creator.choose_place(place=place)
    return redirect('create_personage')


@require_GET
@login_required(login_url="login/")
def creator_choose_social(request, social_id):
    creator = Creator(request)
    social = get_object_or_404(Social, id=social_id)
    if social.id is creator.get_choosen_place():
        creator.remove_social()
    else:
        creator.choose_social(social=social)
    return redirect('create_personage')
