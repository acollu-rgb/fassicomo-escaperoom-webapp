"""Configurazione dell'Admin Django.

Nota: i tempi totali e le penalità NON sono modificabili da qui.
Sono costanti in `escaperoom/settings.py` (GAME_CONFIG).
"""

from django.contrib import admin, messages
from django.utils.html import format_html

from .models import (
    GameSession,
    LeaderboardEntry,
    Question,
    QuestionOption,
    QuestionVariant,
    SessionQuestion,
    SiteSetting,
)

admin.site.site_header = "Escape Room Fassicomo"
admin.site.site_title = "Escape Room Fassicomo"
admin.site.index_title = "Domande, sessioni e classifiche"


class QuestionOptionInline(admin.TabularInline):
    model = QuestionOption
    extra = 4
    max_num = 6
    fields = ("text", "is_correct", "order")


class QuestionVariantInline(admin.TabularInline):
    model = QuestionVariant
    extra = 0
    fields = ("code", "text", "correct_answer", "html_file", "is_active")
    readonly_fields = ()


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("code", "level", "short_text", "question_type", "is_active", "variants_count")
    list_filter = ("level", "question_type", "is_active")
    search_fields = ("code", "title", "text", "correct_answer")
    ordering = ("level", "code")
    inlines = [QuestionOptionInline, QuestionVariantInline]
    fieldsets = (
        (None, {"fields": ("code", "level", "title", "question_type", "is_active")}),
        ("Contenuto", {"fields": ("text", "correct_answer", "hint")}),
    )

    @admin.display(description="testo")
    def short_text(self, obj):
        text = obj.text or obj.title
        return text[:70] + ("…" if len(text) > 70 else "")

    @admin.display(description="varianti")
    def variants_count(self, obj):
        return obj.variants.count()


@admin.register(QuestionVariant)
class QuestionVariantAdmin(admin.ModelAdmin):
    list_display = ("code", "question", "effective_answer", "html_file", "is_active")
    list_filter = ("is_active", "question__level")
    search_fields = ("code", "text", "correct_answer")
    autocomplete_fields = ("question",)


@admin.register(GameSession)
class GameSessionAdmin(admin.ModelAdmin):
    list_display = (
        "team_name",
        "mode",
        "status",
        "current_level",
        "error_count",
        "started_at",
        "deadline",
        "elapsed_display",
    )
    list_filter = ("mode", "status")
    search_fields = ("team_name",)
    readonly_fields = ("id", "started_at", "updated_at", "created_at")
    date_hierarchy = "started_at"
    actions = ["mark_expired", "mark_abandoned"]

    @admin.display(description="tempo reale")
    def elapsed_display(self, obj):
        if obj.status == GameSession.Status.COMPLETED:
            from .services import format_ms

            return format_ms(obj.elapsed_ms)
        return "—"

    @admin.action(description="Segna come scadute")
    def mark_expired(self, request, queryset):
        updated = queryset.filter(status=GameSession.Status.ACTIVE).update(
            status=GameSession.Status.EXPIRED
        )
        self.message_user(request, f"{updated} sessioni segnate come scadute.", messages.SUCCESS)

    @admin.action(description="Segna come abbandonate")
    def mark_abandoned(self, request, queryset):
        updated = queryset.filter(status=GameSession.Status.ACTIVE).update(
            status=GameSession.Status.ABANDONED
        )
        self.message_user(request, f"{updated} sessioni segnate come abbandonate.", messages.SUCCESS)


@admin.register(SessionQuestion)
class SessionQuestionAdmin(admin.ModelAdmin):
    list_display = ("session", "level", "question", "variant", "answered_correctly", "answered_at")
    list_filter = ("level", "answered_correctly")
    search_fields = ("session__team_name", "question__code")


@admin.register(LeaderboardEntry)
class LeaderboardEntryAdmin(admin.ModelAdmin):
    list_display = ("position_display", "team_name", "mode", "formatted_time", "error_count", "completed_at")
    list_filter = ("mode",)
    search_fields = ("team_name",)
    ordering = ("mode", "elapsed_ms", "completed_at")
    readonly_fields = ("session", "mode", "team_name", "elapsed_ms", "error_count", "completed_at", "created_at")
    actions = ["reset_leaderboard"]

    def has_add_permission(self, request):
        # le voci nascono solo dalle partite completate
        return False

    @admin.display(description="pos.")
    def position_display(self, obj):
        return obj.position

    @admin.display(description="tempo")
    def formatted_time(self, obj):
        from .services import format_ms

        return format_ms(obj.elapsed_ms)

    @admin.action(description="⚠ Azzera la classifica selezionata (irreversibile)")
    def reset_leaderboard(self, request, queryset):
        modes = sorted(set(queryset.values_list("mode", flat=True)))
        deleted, _ = LeaderboardEntry.objects.filter(mode__in=modes).delete()
        self.message_user(
            request,
            f"Classifica azzerata per: {', '.join(modes)}. Voci rimosse: {deleted}.",
            messages.WARNING,
        )


@admin.register(SiteSetting)
class SiteSettingAdmin(admin.ModelAdmin):
    list_display = ("key", "short_value", "description", "updated_at")
    search_fields = ("key", "description")

    @admin.display(description="valore")
    def short_value(self, obj):
        return format_html("<code>{}</code>", obj.value[:80])

    def has_add_permission(self, request):
        return True
