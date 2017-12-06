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

    def save(self):
        # update the session creator
        self.session[settings.PERSO_SESSION_ID] = self.creator
        self.session.modified = True

    def remove(self):
        """
        Remove nation choice from the creator
        :param
        :return:
        """
        if 'nation' in self.creator:
            del self.creator['nation']
            self.save()
