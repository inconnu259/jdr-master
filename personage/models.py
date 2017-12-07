from django.db import models
from django.contrib.auth.models import User

WAYS_CHOICES = (
    ('Co', 'Combativité'),
    ('Cr', 'Créativité'),
    ('Em', 'Empathie'),
    ('Ra', 'Raison'),
    ('Id', 'Idéal')
)


class Nation(models.Model):
    name = models.CharField(max_length=100,
                            verbose_name='peuple')
    description = models.TextField(verbose_name='description')
    noun = models.CharField(max_length=100,
                            verbose_name='nom')
    plural = models.CharField(max_length=100,
                              verbose_name='pluriel')
    feminine = models.CharField(max_length=100,
                                verbose_name='feminin')
    preposition = models.CharField(max_length=20,
                                   verbose_name='preposition',
                                   blank=True)

    def __str__(self):
        return self._meta.verbose_name + ' ' + self.preposition + ' ' + self.name

    class Meta:
        verbose_name = 'Peuple'
        verbose_name_plural = 'Peuples'
        ordering = ("name",)


class Place(models.Model):
    name = models.CharField(max_length=100,
                            verbose_name='place')
    description = models.TextField(verbose_name='description')

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = 'Lieu de résidence'
        verbose_name_plural = 'Lieux de résidences'
        ordering = ("name",)


class Discipline(models.Model):
    name = models.CharField(max_length=100,
                            verbose_name='nom')
    description = models.TextField(blank=True,
                                   verbose_name='description')

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = 'Discipline'
        verbose_name_plural = 'Disciplines'
        ordering = ("name",)


class Domain(models.Model):
    name = models.CharField(max_length=100,
                            verbose_name='domaine')
    description = models.TextField(verbose_name='description')
    way = models.CharField(max_length=2,
                           verbose_name='voie',
                           choices=WAYS_CHOICES)
    disciplines = models.ManyToManyField(Discipline,
                                         verbose_name='discipline',
                                         related_name='domains')

    def __str__(self):
        return self.name + ' (' + self.get_way_display() + ')'

    class Meta:
        verbose_name = 'Domaine'
        verbose_name_plural = 'Domaines'
        ordering = ("name",)


class Social(models.Model):
    name = models.CharField(max_length=100,
                            verbose_name='social')
    description = models.TextField(verbose_name='description')

    domains = models.ManyToManyField(Domain,
                          verbose_name='domaines',
                          related_name='domains')

    def __str__(self):
        return self.name + ' (' + ','.join([domain.name for domain in self.domains.all()]) + ')'

    class Meta:
        verbose_name = 'Classe sociale'
        verbose_name_plural = 'Classes sociales'
        ordering = ("name",)


class Profession(models.Model):
    name = models.CharField(max_length=100,
                            verbose_name='metier')
    description = models.TextField(verbose_name='description')
    primary_domain = models.ForeignKey(Domain,
                                       verbose_name='domaine primaire',
                                       on_delete=models.SET_NULL,
                                       null=True,
                                       related_name='primary_domain')
    secondary_domain = models.ManyToManyField(Domain,
                                              verbose_name='domaine secondaire',
                                              related_name='secondary_domain')

    def __str__(self):
        return self.name + ' (' + self.primary_domain.name + '), (' + ','.join([sec.name for sec in self.secondary_domain.all()]) + ')'

    class Meta:
        verbose_name = 'Metier'
        verbose_name_plural = 'Metiers'
        ordering = ("name",)


class Personage(models.Model):
    SEXE_CHOICES = (
        ('F', 'Femme'),
        ('H', 'Homme'),
    )
    name = models.CharField(max_length=100, verbose_name='nom')
    genre = models.CharField(max_length=10,
                             choices=SEXE_CHOICES)
    nation = models.ForeignKey(Nation, null=True, on_delete=models.SET_NULL,
                               verbose_name='peuple')
    profession = models.ManyToManyField(Profession,
                                        verbose_name='metier')
    birthplace = None
    residence = None  # Rural / Urban
    birthdate = None  # or age
    discipline = None
    domain = None
    social = None
    advantages = None
    disadvantages = None
    sanity = None
    primary_domain = None
    secondary_domain = None
    story = models.TextField(verbose_name='histoire')
    description = models.TextField(verbose_name='description')
    player = models.ForeignKey(User, on_delete=models.CASCADE,
                               verbose_name='joueur')

    class Meta:
        verbose_name = 'Personnage'
        verbose_name_plural = 'Personnages'
        ordering = ("name",)


class Setback(models.Model):
    name = models.CharField(max_length=100, verbose_name='nom')
    description = models.TextField(verbose_name='description')
    feminine = models.CharField(max_length=100, verbose_name='feminin')

    class Meta:
        verbose_name = 'Revers'
        ordering = ("name",)
