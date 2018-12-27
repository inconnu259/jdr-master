from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import m2m_changed
from django.core.exceptions import ValidationError

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


class Way(models.Model):
    name = models.CharField(max_length=100,
                            verbose_name='Voie')
    description = models.TextField(verbose_name='description')

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = 'Voie'
        verbose_name_plural = 'Voies'
        ordering = ("name",)


class Traits(models.Model):
    TRAIT_CHOICE = (
        ('QMAJ', 'Qualité majeur'),
        ('QMIN', 'Qualité mineur'),
        ('FMAJ', 'Défaut majeur'),
        ('FMIN', 'Défaut mineur'),
    )
    name = models.CharField(max_length=100,
                            verbose_name='trait de caractère')
    way = models.ForeignKey(Way, blank=True, on_delete=models.CASCADE, related_name='traits')
    type_trait = models.CharField(max_length=10, choices=TRAIT_CHOICE)

    def __str__(self):
        return self.name + ' (' + str(self.way) + ', ' + self.get_type_trait_display() + ')'

    class Meta:
        verbose_name = 'Trait de caractère'
        verbose_name_plural = 'traits de caractères'
        ordering = ("name",)


#class DomainLevels(models.Model):
#    skill = models.ForeignKey(Domain, null=True, on_delete=models.SET_NULL)
#    level = models.IntegerField()
#    first_domain = models.BooleanField()
#    secondary_domain = models.BooleanField()

#    def __str__(self):
#        return self.skill.name + ' niveau ' + str(self.level)


class DisciplineLevels(models.Model):
    skill = models.ForeignKey(Discipline, null=True, on_delete=models.SET_NULL)
    level = models.IntegerField()

    def __str__(self):
        return self.skill.name + ' niveau ' + str(self.level)


class Personage(models.Model):
    SEXE_CHOICES = (
        ('F', 'Femme'),
        ('H', 'Homme'),
    )
    name = models.CharField(max_length=100, verbose_name='nom')
    genre = models.CharField(max_length=10,
                             choices=SEXE_CHOICES)
    birthdate = models.IntegerField(default=20)
    nation = models.ForeignKey(Nation, null=True, on_delete=models.SET_NULL,
                               verbose_name='peuple')
    profession = models.ManyToManyField(Profession,
                                        verbose_name='metier',
                                        related_name='personnages')
    description = models.TextField(verbose_name='description')
    player = models.ForeignKey(User, on_delete=models.CASCADE,
                               verbose_name='joueur')
    ways = None
    advantages = None
    disadvantages = None
    sanity = None

    discipline = None
    domain = None
    primary_domain = None
    secondary_domain = None
    #skill_level = models.ManyToOneRel(SkillLevels,
    #                                  related_name='personnages')

    weapons = None

    artefact = None
    tresor = None

    rindath = None
    ogham = None
    Flux = None

    birthplace = None
    residence = None  # Rural / Urban
    social = None
    story = models.TextField(verbose_name='histoire')
    setback = None

    mental_health = None

    personality = None

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = 'Personnage'
        verbose_name_plural = 'Personnages'
        ordering = ("name",)

    def profession_changed(sender, **kwargs):
        if kwargs['instance'].profession.count() > 2:
            raise ValidationError("Vous ne pouvez pas avoir plus de 2 métiers")

    # This will not work cause m2m fields are saved after the model is saved

    def check_xp(self):
        ''' Le choix d'un metier dnne directement un niveau de 5 dans un Domaine de compétence (Domaine Primaire) et
        de 3 dans un domaine secondaire'''
        # Check if primary_domain and secondary_domain are in domain.
        # Check if primary_domain = the same primary domain of profession
        # Check if secondary_domain is in secondary domain of profession
        # Check if primary_domain == 5
        # Check if secondary_domain is 3 min
        # Check if


class SkillLevels(models.Model):
    domainLevel = models.ForeignKey(Domain, null=True, on_delete=models.SET_NULL)
    level = models.IntegerField()
    first_domain = models.BooleanField()
    secondary_domain = models.BooleanField()
    personnage = models.ForeignKey(Personage, null=True, on_delete=models.SET_NULL)

    disciplineLevel = models.ManyToManyField(DisciplineLevels)

    def __str__(self):
        return self.domainLevel.name + ' niveau ' + str(self.level) + ' avec les disciplines : ' + str(self.disciplineLevel)

    # limiter domaine de 1 à 5. (ou de 0 à 5 suivant comment on voit les choses)
    # test si domaine est à 5 pour pouvoir avoir une discipline
    # test si discipline est bien dans le domaine
    # discipline va de 6 à 15

    class Meta:
        verbose_name = 'Compétence'


class Setback(models.Model):
    name = models.CharField(max_length=100, verbose_name='nom')
    description = models.TextField(verbose_name='description')
    feminine = models.CharField(max_length=100, verbose_name='feminin')

    class Meta:
        verbose_name = 'Revers'
        verbose_name_plural = 'Revers'
        ordering = ("name",)
