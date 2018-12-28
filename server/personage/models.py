from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import m2m_changed
from django.core.validators import MinValueValidator, MaxValueValidator
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
                            verbose_name='peuple',
                            unique=True)
    description = models.TextField(verbose_name='description', blank=True)
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
                            verbose_name='place',
                            unique=True)
    description = models.TextField(verbose_name='description', blank=True)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = 'Lieu de résidence'
        verbose_name_plural = 'Lieux de résidences'
        ordering = ("name",)


class Discipline(models.Model):
    name = models.CharField(max_length=100,
                            verbose_name='nom',
                            unique=True)
    description = models.TextField(blank=True,
                                   verbose_name='description')

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = 'Discipline'
        verbose_name_plural = 'Disciplines'
        ordering = ("name",)


class Way(models.Model):
    name = models.CharField(max_length=100,
                            verbose_name='Voie',
                            unique=True)
    description = models.TextField(verbose_name='description',
                                   blank=True)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = 'Voie'
        verbose_name_plural = 'Voies'
        ordering = ("name",)


class Domain(models.Model):
    name = models.CharField(max_length=100,
                            verbose_name='domaine',
                            unique=True)
    description = models.TextField(verbose_name='description',
                                   blank=True)
    way = models.ForeignKey(Way, on_delete=models.CASCADE, related_name='domain')
    disciplines = models.ManyToManyField(Discipline,
                                         verbose_name='discipline',
                                         related_name='domains')

    def __str__(self):
        return self.name + ' (' + self.way.name[:2] + ')'

    class Meta:
        verbose_name = 'Domaine'
        verbose_name_plural = 'Domaines'
        ordering = ("name",)


class Social(models.Model):
    name = models.CharField(max_length=100,
                            verbose_name='social',
                            unique=True)
    description = models.TextField(verbose_name='description',
                                   blank=True)

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
                            verbose_name='metier',
                            unique=True)
    description = models.TextField(verbose_name='description',
                                   blank=True)
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


class Traits(models.Model):
    TRAIT_CHOICE = (
        ('QMAJ', 'Qualité majeur'),
        ('QMIN', 'Qualité mineur'),
        ('FMAJ', 'Défaut majeur'),
        ('FMIN', 'Défaut mineur'),
    )
    name = models.CharField(max_length=100,
                            verbose_name='trait de caractère',
                            unique=True)
    way = models.ForeignKey(Way, on_delete=models.CASCADE, related_name='traits')
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
    level = models.PositiveIntegerField(validators=[MinValueValidator(6), MaxValueValidator(15)])

    def __str__(self):
        return self.skill.name + ' niveau ' + str(self.level)


class Setback(models.Model):
    name = models.CharField(max_length=100, verbose_name='nom',
                            unique=True)
    description = models.TextField(verbose_name='description',
                                   blank=True)
    feminine = models.CharField(max_length=100, verbose_name='feminin')
    # rajouter un malus => suivant ce que c'est, sur le truc

    class Meta:
        verbose_name = 'Revers'
        verbose_name_plural = 'Revers'
        ordering = ("name",)


# Un désavantage, au final, c'est aussi un avantage mais négatif !
class Advantage(models.Model):
    name = models.CharField(max_length=100, verbose_name='nom',
                            unique=True)
    points = models.IntegerField()
    descriptions = models.TextField(verbose_name='description',
                                    blank=True)
    # bonus : discipline / domaine et nbre de points en plus
    # le bonus peut être aussi textuel : ex : allié il faut le nom de son allié
    # le bonus peut être aussi monetaire : aisance financière...
    # c'est la merde en fait !
    bonus = None
    # on peut faire un avantage++ qui est comme une évolution d'un avantage
    # pour simuler cela, on peut faire un avantage qui requiert d'avoir l'avantage "niveau n-1"
    # difficulté de cette méthode : n'afficher que le dernier niveau
    # et savoir s'il faut tenir compte que du bonus du dernier niveau, ou du bonus de tous les autres niveaux
    # donc le bonus serait vu que comme une addition.
    requiert = None


class Personage(models.Model):
    SEXE_CHOICES = (
        ('F', 'Femme'),
        ('H', 'Homme'),
    )
    name = models.CharField(max_length=100, verbose_name='nom')
    genre = models.CharField(max_length=10,
                             choices=SEXE_CHOICES)
    birthdate = models.PositiveIntegerField(validators=[MinValueValidator(0), MaxValueValidator(150)],
                                            default=20)
    nation = models.ForeignKey(Nation, null=True, on_delete=models.SET_NULL,
                               verbose_name='peuple')
    profession = models.ManyToManyField(Profession,
                                        verbose_name='metier',
                                        related_name='personnages')
    description = models.TextField(verbose_name='description',
                                   blank=True)
    player = models.ForeignKey(User, on_delete=models.CASCADE,
                               verbose_name='joueur')

    advantages = models.ForeignKey(Advantage,
                                   verbose_name='avantage',
                                   blank=True,
                                   null=True,
                                   on_delete=models.SET_NULL)
    disadvantages = None
    sanity = models.PositiveIntegerField(validators=[MinValueValidator(0), MaxValueValidator(19)],
                                         default=19)

    #survie, vigueur : calculé automatiquement à la création du perso => fonction pour la valeur de base
    # Valeurs stockées = valeurs qui peut être modifié au cours de la partie. A la création c'est utilisé par celle de base
    # ne peut pas dépasser celle de base.
    stamina = None
    survival = None


    weapons = None
    armor = None
    # potentiel de combat, defense, rapidité : calculé automatiquement
    # score d'attaque calculé automatiquement
    # attitude : automatique, mouvement aussi, protection aussi

    # ajouter automatiquement weapon et armor à la liste des équipements quand elle est demandée
    # text ou database equipment qui permet de pouvoir ajouter des élements ? et d'avoir un tracking ?
    equipment = None

    artefact = None
    tresor = None
    precious = None

    resources = None

    # rindath, exaltation calculé automatiquement => sert à la valeur maximal.
    # valeur sauvé = valeur actuel
    rindath = None
    ogham = None
    exaltation = None
    major_miracles = None
    minor_miracles = None
    mineral_flux = None
    vegetal_flux = None
    organic_flux = None
    fossil_flux = None

    birthplace = None
    residence = None  # Rural / Urban
    social = None
    story = models.TextField(verbose_name='histoire',
                             blank=True)
    setback = models.ForeignKey(Setback, null=True, on_delete=models.SET_NULL,
                                verbose_name='Revers')

    mental_health = models.PositiveSmallIntegerField()
    mental_resistance = models.PositiveSmallIntegerField()

    personality = models.TextField(blank=True)

    xp = models.PositiveSmallIntegerField(default=0)

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

    def clean(self):
        if self.ways.all() != 5:
            raise ValidationError("Il doit y avoir 5 voies.")
        total = 0
        max_min = False
        for way in self.ways.all():
            total += way.level
            if way.level == 1 or way.level == 5:
                max_min = True
        if 15 != total:
            raise ValidationError("La somme des voies doit être égal à 15.")
        if not max_min:
            raise(ValidationError("Au moins une voie doit être à 5 ou à 1."))



class SkillLevels(models.Model):
    domainLevel = models.ForeignKey(Domain, null=True, on_delete=models.CASCADE)
    level = models.PositiveIntegerField(validators=[MinValueValidator(0), MaxValueValidator(5)])
    FIRST = '1'
    SECOND = '2'
    STANDARD = 'ST'
    TYPES = (
        (FIRST, 'Premier'),
        (SECOND, 'Second'),
        (STANDARD, 'Standard')
    )
    types_domain = models.CharField(max_length=2, choices=TYPES, default=STANDARD)
    #first_domain = models.BooleanField()
    #secondary_domain = models.BooleanField()
    personage = models.ForeignKey(Personage, null=True, on_delete=models.CASCADE)

    disciplineLevel = models.ManyToManyField(DisciplineLevels)

    def __str__(self):
        return self.domainLevel.name + ' niveau ' + str(self.level) + ' avec les disciplines : ' + str(self.disciplineLevel)

    # limiter domaine de 1 à 5. (ou de 0 à 5 suivant comment on voit les choses)
    # test si domaine est à 5 pour pouvoir avoir une discipline
    # test si discipline est bien dans le domaine
    # discipline va de 6 à 15

    class Meta:
        verbose_name = 'Compétence'

    def clean(self):
        if self.types_domain == self.FIRST and self.level != 5:
            raise(ValidationError("Un domaine primaire est forcément à 5"))
        if self.types_domain == self.SECOND and self.level < 3:
            raise (ValidationError("Un domaine secondaire doit être au minimum à 3"))
        # si domaine primaire ou secondaire, tester si notre personnage n'a pas deja un primaire (ou secondaire)


class WaysLevels(models.Model):
    way = models.ForeignKey(Way, blank=True, on_delete=models.CASCADE, related_name='ways_level')
    level = models.PositiveIntegerField(validators=[MinValueValidator(0), MaxValueValidator(5)])
    personage = models.ForeignKey(Personage, null=True, on_delete=models.CASCADE, related_name='ways')
