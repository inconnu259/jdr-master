from django.conf import settings
from personage.models import Nation


class Creator(object):

    def __init__(self, request):
        """
        Initialize the personage creator
        :param request:
        """
        self.session = request.session
        creator = self.session.get(settings.PERSO_SESSION_ID)
        if not creator:
            # save an empty creator in the session
            creator = self.session[settings.PERSO_SESSION_ID] = {}
        self.creator = creator

    def choose_nation(self, nation):
        """
        Add a nation to the creator or update it
        :return:
        """
        nation_id = str(nation.id)
        self.creator['nation'] = nation_id

        self.save()

    def choose_place(self, place):
        """
        Add a nation to the creator or update it
        :return:
        """
        place_id = str(place.id)
        self.creator['place'] = place_id

        self.save()

    def choose_social(self, social):
        social_id = str(social.id)
        if 'social' in self.creator:
            self.remove_social_domains()
        self.creator['social'] = social_id

        self.save()

    def choose_social_domains(self, social_domain):
        if 'social' in self.creator:
            domain_id = str(social_domain.id)
            saved_list = self.creator.get('social_domains', [])
            if domain_id in saved_list:
                saved_list.remove(domain_id)
            elif len(saved_list) < 2:
                saved_list.append(domain_id)
            else:
                saved_list[1] = domain_id
            self.creator['social_domains'] = saved_list
            self.save()
        #else:
            #error no social domain


    def get_choosen_nation(self):
        if 'nation' in self.creator:
            return int(self.creator['nation'])
        else:
            return 0

    def get_choosen_place(self):
        if 'place' in self.creator:
            return int(self.creator['place'])
        else:
            return 0

    def choose_profession(self, profession):
        profession_id = str(profession.id)
        #self.remove_professions()
        saved_list = self.creator.get('professions', [])
        if profession_id in saved_list:
            saved_list.remove(profession_id)
        else:
            saved_list.append(profession_id)
        self.creator['professions'] = saved_list

        #if 'professions' not in self.creator:
        #    self.creator['professions'] = [profession_id, ]
        #else:
        #    prof = [(p for p in self.creator['professions']),]
        #    print(prof)
        #    self.creator['professions'] = prof
        self.save()

    def get_choosen_professions(self):
        if 'professions' in self.creator:
            return list(map(int, self.creator['professions']))
        else:
            return 0

    def get_choosen_social(self):
        if 'social' in self.creator:
            return int(self.creator['social'])
        else:
            return 0

    def get_choosen_social_domains(self):
        if 'social_domains' in self.creator:
            return list(map(int, self.creator['social_domains']))
        else:
            return 0

    def save(self):
        # update the session creator
        self.session[settings.PERSO_SESSION_ID] = self.creator
        self.session.modified = True

    def remove_nation(self):
        """
        Remove nation choice from the creator
        :param
        :return:
        """
        if 'nation' in self.creator:
            del self.creator['nation']
            self.save()

    def remove_professions(self):
        if 'professions' in self.creator:
            del self.creator['professions']
            self.save()

    def remove_place(self):
        if 'place' in self.creator:
            del self.creator['place']
            self.save()

    def remove_social(self):
        if 'social' in self.creator:
            del self.creator['social']
            if 'social_domains' in self.creator:
                del self.creator['social_domains']
            self.save()

    def remove_social_domains(self):
        if 'social_domains' in self.creator:
            del self.creator['social_domains']
            self.save()
