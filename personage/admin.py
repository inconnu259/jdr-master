from django.contrib import admin
from .models import Setback, Profession, Nation, Personage, Domain, Discipline


@admin.register(Nation)
class NationAdmin(admin.ModelAdmin):
    pass


class DisciplineInLine(admin.TabularInline):
    model = Discipline.domains.through
    can_delete = False
    verbose_name = 'Discipline'
    verbose_name_plural = 'Disciplines'
    show_change_link = True


@admin.register(Domain)
class DomainAdmin(admin.ModelAdmin):
    inlines = [DisciplineInLine, ]
    exclude = ['disciplines', ]


@admin.register(Discipline)
class DisciplineAdmin(admin.ModelAdmin):
    pass


@admin.register(Profession)
class ProfessionAdmin(admin.ModelAdmin):
    pass