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

    def add_nation(self, nation, update_nation=False):
        """
        Add a nation to the creator or update it
        :return:
        """
        nation_id = str(nation.id)
        if 'nation' not in self.creator:
            self.creator['nation'] = nation_id

        if update_nation:
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
