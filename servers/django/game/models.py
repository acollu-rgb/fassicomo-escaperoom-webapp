"""Modelli dell'Escape Room Fassicomo."""

import math
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Question(models.Model):
    """Una domanda/esercizio appartenente a un livello (1–8)."""

    class Type(models.TextChoices):
        TEXT = "text", "Risposta testuale"
        CHOICE = "choice", "Scelta multipla"
        CODE_INSPECTION = "code_inspection", "Ispezione del codice"

    level = models.PositiveSmallIntegerField(
        "livello",
        help_text="Da 1 a 8. La modalità Rapida usa i livelli 1–5, la Completa 1–8.",
    )
    code = models.CharField("codice", max_length=8, unique=True, help_text='Es. "1a", "4c", "8i".')
    title = models.CharField("titolo", max_length=120, blank=True)
    text = models.TextField("testo", blank=True, help_text="Testo mostrato al giocatore (HTML semplice ammesso).")
    question_type = models.CharField(
        "tipo", max_length=20, choices=Type.choices, default=Type.TEXT
    )
    correct_answer = models.CharField(
        "risposta corretta",
        max_length=200,
        help_text="Confrontata senza distinzione di maiuscole/minuscole e spazi ai bordi.",
    )
    hint = models.TextField("suggerimento", blank=True)
    is_active = models.BooleanField("attiva", default=True)
    created_at = models.DateTimeField("creata il", auto_now_add=True)
    updated_at = models.DateTimeField("aggiornata il", auto_now=True)

    class Meta:
        verbose_name = "domanda"
        verbose_name_plural = "domande"
        ordering = ["level", "code"]
        indexes = [models.Index(fields=["level", "is_active"])]

    def __str__(self):
        return f"{self.code} · L{self.level} · {self.title or self.text[:40]}"

    @property
    def normalized_answer(self):
        return " ".join(self.correct_answer.split()).strip().upper()


class QuestionVariant(models.Model):
    """Variante concreta di una domanda, assegnata casualmente a una squadra."""

    question = models.ForeignKey(
        Question, on_delete=models.CASCADE, related_name="variants", verbose_name="domanda"
    )
    code = models.CharField("codice variante", max_length=8, help_text='Es. "1a".')
    text = models.TextField("testo", blank=True, help_text="Se vuoto si usa il testo della domanda.")
    correct_answer = models.CharField(
        "risposta corretta", max_length=200, blank=True, help_text="Se vuota si usa quella della domanda."
    )
    hint = models.TextField("suggerimento", blank=True)
    html_file = models.CharField(
        "file HTML",
        max_length=120,
        blank=True,
        help_text="Solo livello 2: nome del file in media/level2/, es. livello_2_target_a.html",
    )
    is_active = models.BooleanField("attiva", default=True)
    created_at = models.DateTimeField("creata il", auto_now_add=True)

    class Meta:
        verbose_name = "variante"
        verbose_name_plural = "varianti"
        ordering = ["question__level", "code"]
        constraints = [
            models.UniqueConstraint(fields=["question", "code"], name="unique_variant_per_question")
        ]
        indexes = [models.Index(fields=["question", "is_active"])]

    def __str__(self):
        return f"Variante {self.code} di {self.question.code}"

    @property
    def effective_text(self):
        return self.text or self.question.text

    @property
    def effective_answer(self):
        return self.correct_answer or self.question.correct_answer

    @property
    def effective_hint(self):
        return self.hint or self.question.hint

    @property
    def normalized_answer(self):
        return " ".join(self.effective_answer.split()).strip().upper()


class QuestionOption(models.Model):
    """Opzione di una domanda a scelta multipla."""

    question = models.ForeignKey(
        Question, on_delete=models.CASCADE, related_name="options", verbose_name="domanda"
    )
    text = models.CharField("testo", max_length=200)
    is_correct = models.BooleanField("corretta", default=False)
    order = models.PositiveSmallIntegerField("ordine", default=0)

    class Meta:
        verbose_name = "opzione"
        verbose_name_plural = "opzioni"
        ordering = ["order", "id"]

    def __str__(self):
        return self.text


class GameSession(models.Model):
    """Una partita giocata da una squadra."""

    class Mode(models.TextChoices):
        RAPID = "rapid", "Rapida"
        COMPLETE = "complete", "Completa"

    class Status(models.TextChoices):
        ACTIVE = "active", "In corso"
        COMPLETED = "completed", "Completata"
        EXPIRED = "expired", "Scaduta"
        ABANDONED = "abandoned", "Abbandonata"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team_name = models.CharField("squadra", max_length=40)
    mode = models.CharField("modalità", max_length=10, choices=Mode.choices)
    current_level = models.PositiveSmallIntegerField("livello corrente", default=1)
    started_at = models.DateTimeField("iniziata il", default=timezone.now)
    finished_at = models.DateTimeField("terminata il", null=True, blank=True)
    deadline = models.DateTimeField("scadenza")
    status = models.CharField(
        "stato", max_length=12, choices=Status.choices, default=Status.ACTIVE
    )
    error_count = models.PositiveSmallIntegerField("errori", default=0)
    created_at = models.DateTimeField("creata il", auto_now_add=True)
    updated_at = models.DateTimeField("aggiornata il", auto_now=True)

    class Meta:
        verbose_name = "sessione di gioco"
        verbose_name_plural = "sessioni di gioco"
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["status", "mode"]),
            models.Index(fields=["team_name", "status"]),
            models.Index(fields=["-started_at"]),
        ]

    def __str__(self):
        return f"{self.team_name} · {self.get_mode_display()} · {self.get_status_display()}"

    # ------------------------------------------------------------- proprietà

    @property
    def total_levels(self):
        return settings.GAME_CONFIG[self.mode]["levels"]

    @property
    def total_seconds(self):
        return settings.GAME_CONFIG[self.mode]["total_seconds"]

    @property
    def penalty_seconds(self):
        return settings.GAME_CONFIG[self.mode]["penalty_seconds"]

    @property
    def seconds_remaining(self):
        if self.status != self.Status.ACTIVE:
            return 0
        return max(0, math.ceil((self.deadline - timezone.now()).total_seconds()))

    @property
    def elapsed_ms(self):
        """Tempo reale di gioco: fine − inizio (millisecondi)."""
        end = self.finished_at or timezone.now()
        return max(1, int((end - self.started_at).total_seconds() * 1000))

    def is_expired(self):
        return self.status == self.Status.ACTIVE and timezone.now() >= self.deadline


class SessionQuestion(models.Model):
    """Variante assegnata a una sessione per un determinato livello."""

    session = models.ForeignKey(
        GameSession, on_delete=models.CASCADE, related_name="assignments", verbose_name="sessione"
    )
    level = models.PositiveSmallIntegerField("livello")
    question = models.ForeignKey(
        Question, on_delete=models.PROTECT, related_name="assignments", verbose_name="domanda"
    )
    variant = models.ForeignKey(
        QuestionVariant,
        on_delete=models.PROTECT,
        related_name="assignments",
        verbose_name="variante",
        null=True,
        blank=True,
    )
    answered_correctly = models.BooleanField("risposta corretta", null=True, blank=True)
    answered_at = models.DateTimeField("risposta inviata il", null=True, blank=True)
    created_at = models.DateTimeField("assegnata il", auto_now_add=True)

    class Meta:
        verbose_name = "domanda assegnata"
        verbose_name_plural = "domande assegnate"
        ordering = ["session", "level"]
        indexes = [models.Index(fields=["session", "level"])]

    def __str__(self):
        return f"{self.session.team_name} · L{self.level} · {self.question.code}"


class LeaderboardEntry(models.Model):
    """Voce ufficiale della classifica, creata solo per sessioni completate."""

    session = models.OneToOneField(
        GameSession,
        on_delete=models.CASCADE,
        related_name="leaderboard_entry",
        verbose_name="sessione",
    )
    mode = models.CharField("modalità", max_length=10, choices=GameSession.Mode.choices)
    team_name = models.CharField("squadra", max_length=40)
    elapsed_ms = models.PositiveBigIntegerField("tempo reale (ms)")
    error_count = models.PositiveSmallIntegerField("errori", default=0)
    completed_at = models.DateTimeField("completata il", default=timezone.now)
    created_at = models.DateTimeField("registrata il", auto_now_add=True)

    class Meta:
        verbose_name = "risultato in classifica"
        verbose_name_plural = "risultati in classifica"
        ordering = ["mode", "elapsed_ms", "completed_at"]
        indexes = [models.Index(fields=["mode", "elapsed_ms", "completed_at"])]

    def __str__(self):
        return f"{self.team_name} · {self.get_mode_display()} · {self.elapsed_ms} ms"

    @classmethod
    def top(cls, mode, size=None):
        """I migliori tempi della modalità: a parità resta davanti chi ha finito prima."""
        size = size or settings.LEADERBOARD_SIZE
        return cls.objects.filter(mode=mode).order_by("elapsed_ms", "completed_at", "pk")[:size]

    @property
    def position(self):
        return (
            LeaderboardEntry.objects.filter(
                mode=self.mode,
                elapsed_ms__lt=self.elapsed_ms,
            ).count()
            + 1
        )


class SiteSetting(models.Model):
    """Impostazioni generali (non esposte ai partecipanti)."""

    key = models.CharField("chiave", max_length=80, unique=True)
    value = models.TextField("valore")
    description = models.CharField("descrizione", max_length=200, blank=True)
    updated_at = models.DateTimeField("aggiornata il", auto_now=True)

    class Meta:
        verbose_name = "impostazione"
        verbose_name_plural = "impostazioni"
        ordering = ["key"]

    def __str__(self):
        return self.key
