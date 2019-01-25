from django.shortcuts import render, get_object_or_404, redirect, resolve_url
from django.db.models.query_utils import Q
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET
from .models import Nation, Profession, Place, Social, Domain, Traits, Way, Personage
from .creator import Creator
from rest_framework import generics, permissions
from .serializer import PersonageSerializer, NationSerializer


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
    places = Place.objects.all()
    socials = Social.objects.all()
    domains = Domain.objects.all()
    traits = Traits.objects.filter(Q(way__name='Combativité') & Q(type_trait='QMAJ'))
    context = {
        'nations': nations,
        'professions': professions,
        'places': places,
        'socials': socials,
        'domains': domains,
        'traits': traits,
        'creator': creator,
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
    return redirect('{}#nations'.format(resolve_url('create_personage')))


@require_GET
@login_required(login_url="login/")
def creator_choose_profession(request, profession_id):
    creator = Creator(request)
    profession = get_object_or_404(Profession, id=profession_id)
    if profession.id is creator.get_choosen_professions():
        creator.remove_professions()
    else:
        creator.choose_profession(profession=profession)
    return redirect('{}#professions'.format(resolve_url('create_personage')))


@require_GET
@login_required(login_url="login/")
def creator_choose_place(request, place_id):
    creator = Creator(request)
    place = get_object_or_404(Place, id=place_id)
    if place.id is creator.get_choosen_place():
        creator.remove_place()
    else:
        creator.choose_place(place=place)
    return redirect('{}#place'.format(resolve_url('create_personage')))


@require_GET
@login_required(login_url="login/")
def creator_choose_social(request, social_id):
    creator = Creator(request)
    social = get_object_or_404(Social, id=social_id)
    print('social_id : ' + str(social_id))
    print('social results : ' + str(social))
    if social.id is creator.get_choosen_social():
        print('remove social')
        print('social id : ' + str(social.id))
        print('get_choosen_social : ' + str(creator.get_choosen_social()))
        creator.remove_social()
    else:
        print('choose social')
        print('social id : ' + str(social.id))
        print('get_choosen_social : ' + str(creator.get_choosen_social()))
        creator.choose_social(social=social)
    return redirect('{}#social'.format(resolve_url('create_personage')))

@require_GET
@login_required(login_url="login/")
def creator_choose_social_domain(request, domain_id):
    creator = Creator(request)
    domain = get_object_or_404(Domain, id=domain_id)
    print('domain_id:' + str(domain_id))
    print('domains : ' + str(domain))
    if domain.id is creator.get_choosen_social_domains():
        print('remove domains')
        print('domain id : ' + str(domain.id))
        print('get_choosen_social_domains: ' + str(creator.get_choosen_social()))
        creator.remove_social_domains()
    else:
        print('choose domain')
        print('domain id : ' + str(domain.id))
        print('get_choosen_social_domains: ' + str(creator.get_choosen_social()))
        creator.choose_social_domains(social_domain=domain)
    return redirect('{}#social'.format(resolve_url('create_personage')))


@require_GET
@login_required(login_url="login/")
def creator_choose_trait(request, trait_id):
    creator = Creator(request)
    trait = get_object_or_404(Traits, id=trait_id)
    if trait.id is creator.get_choosen_trait():
        creator.remove_trait()
    else:
        creator.choose_trait(trait=trait)
    return redirect('{}#traits'.format(resolve_url('create_personage')))


class PersonageList(generics.ListAPIView):
    """ View to list all profile """
    queryset = Personage.objects.all()
    serializer_class = PersonageSerializer
    permission_classes = (permissions.IsAuthenticated,)


class PersonageRetrieveUpdate(generics.RetrieveUpdateAPIView):
    """ Retrieve and update a profile """
    queryset = Personage.objects.all()
    serializer_class = PersonageSerializer
    permission_classes = (permissions.IsAuthenticated,)


class NationView(generics.ListAPIView):
    """
    Use this endpoint to retrieve/update profile.
    """
    queryset = Nation.objects.all()
    serializer_class = NationSerializer
    permission_classes = [permissions.IsAuthenticated]

    '''def get_object(self, *args, **kwargs):
        #return self.request.user.profile
        pass

    def perform_update(self, serializer):
        pass'''

    '''def post(self, request, *args, **kwargs):
        pass'''
