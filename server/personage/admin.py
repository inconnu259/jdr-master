from django.contrib import admin
from .models import *


@admin.register(Nation)
class NationAdmin(admin.ModelAdmin):
    pass


@admin.register(Place)
class PlaceAdmin(admin.ModelAdmin):
    pass


class DisciplineInLine(admin.TabularInline):
    model = Discipline.domains.through
    can_delete = False
    verbose_name = 'Discipline'
    verbose_name_plural = 'Disciplines'
    show_change_link = True


class DomainInLine(admin.TabularInline):
    model = Domain.disciplines.through
    can_delete = False


class ProfessionInLine(admin.TabularInline):
    model = Profession.personnages.through
    can_delete = False
    max_num = 2


class SkillLevelsInLine(admin.TabularInline):
    model = SkillLevels
    can_delete = False


@admin.register(Domain)
class DomainAdmin(admin.ModelAdmin):
    inlines = [DisciplineInLine, ]
    exclude = ['disciplines', ]


@admin.register(Traits)
class TraitsAdmin(admin.ModelAdmin):
    pass


@admin.register(Way)
class WayAdmin(admin.ModelAdmin):
    show_change_link = True


@admin.register(Discipline)
class DisciplineAdmin(admin.ModelAdmin):
    inlines = [DomainInLine,]


@admin.register(Profession)
class ProfessionAdmin(admin.ModelAdmin):
    pass


@admin.register(Social)
class SocialAdmin(admin.ModelAdmin):
    pass


@admin.register(Personage)
class PersonnageAdmin(admin.ModelAdmin):
    inlines = [ProfessionInLine, SkillLevelsInLine]
    exclude = ['profession',]


@admin.register(SkillLevels)
class SkillLelvesAdmin(admin.ModelAdmin):
    pass


@admin.register(Setback)
class SetBackAdmin(admin.ModelAdmin):
    pass


@admin.register(DisciplineLevels)
class DisciplineLevelsAdmin(admin.ModelAdmin):
    pass
