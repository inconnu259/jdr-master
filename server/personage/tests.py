from django.test import TestCase
from django.core.management import call_command
from .models import Way


# Create your tests here.
class BasePersonage(TestCase):
    fixtures = ['way.json', 'nation.json']
    def setUp(self):
        # setup database with fixtures
        #call_command('loaddata', 'fixtures/way.json', verbosity=0)
        pass



class TestCreation(BasePersonage):
    def test_ways(self):
        w = Way.objects.get(pk=1)
        print(w)
