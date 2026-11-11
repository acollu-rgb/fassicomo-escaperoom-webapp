"""
Logica di gioco lato server.

Qui vivono le regole che non devono mai dipendere dal browser:
timer, penalità, selezione delle varianti, registrazione in classifica.

Le API sono volutamente "sottili": validano l'input, chiamano queste funzioni
e serializzano il risultato con `session_state()`.
"""

from __future__ import annotations

import math
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .models import GameSession, LeaderboardEntry, Question, QuestionVariant, SessionQuestion


class GameError(Exception):
    """Errore di gioco con un codice stabile e un messaggio per l'utente."""

    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


# ------------------------------------------------------------------ utilità


def mode_labels() -> dict:
    """Configurazione delle modalità con etichette già leggibili nei template."""
    return {
        key: {
            **mode,
            "total_minutes": mode["total_seconds"] // 60,
            "penalty_label": f"{mode['penalty_seconds'] // 60}:{mode['penalty_seconds'] % 60:02d}",
        }
        for key, mode in settings.GAME_CONFIG.items()
    }


def config_for(mode: str) -> dict:
    try:
        return settings.GAME_CONFIG[mode]
    except KeyError:
        raise GameError("invalid_mode", "Modalità di gioco non valida.", 400)


def normalize_answer(value: str) -> str:
    return " ".join(str(value or "").split()).strip().upper()


def clean_team_name(value: str) -> str:
    name = " ".join(str(value or "").split()).strip()
    if not name:
        raise GameError("team_name_required", "Inserisci il nome della squadra.", 400)
    if len(name) > settings.TEAM_NAME_MAX_LENGTH:
        raise GameError(
            "team_name_too_long",
            f"Il nome della squadra può contenere al massimo {settings.TEAM_NAME_MAX_LENGTH} caratteri.",
            400,
        )
    return name


def pick_variant(level: int, exclude_ids=None) -> SessionQuestion | None:
    """Sceglie una variante attiva e casuale per il livello indicato."""
    exclude_ids = set(exclude_ids or [])
    variants = list(
        QuestionVariant.objects.filter(
            question__level=level,
            question__is_active=True,
            is_active=True,
        )
        .select_related("question")
        .exclude(pk__in=exclude_ids)
    )
    if not variants:
        return None
    chosen = secrets.choice(variants)
    return chosen


def assign_level(session: GameSession, level: int) -> SessionQuestion:
    """Crea l'assegnazione per il livello, evitando la variante appena sbagliata."""
    previous_ids = list(
        session.assignments.filter(level=level).values_list("variant_id", flat=True)
    )
    variant = pick_variant(level, exclude_ids=[v for v in previous_ids if v])
    if variant is None:
        raise GameError(
            "no_questions",
            f"Nessuna domanda attiva per il livello {level}. Contatta il tutor.",
            503,
        )
    return SessionQuestion.objects.create(
        session=session,
        level=level,
        question=variant.question,
        variant=variant,
    )


def current_assignment(session: GameSession) -> SessionQuestion | None:
    return (
        session.assignments.filter(level=session.current_level)
        .select_related("question", "variant")
        .order_by("-created_at")
        .first()
    )


# ------------------------------------------------------------------ ciclo di vita


@transaction.atomic
def start_session(team_name: str, mode: str) -> GameSession:
    team_name = clean_team_name(team_name)
    config = config_for(mode)

    # blocco logico: niente due squadre con lo stesso nome attive insieme
    GameSession.objects.select_for_update().filter(
        status=GameSession.Status.ACTIVE, team_name__iexact=team_name
    ).exists()

    if GameSession.objects.filter(
        status=GameSession.Status.ACTIVE, team_name__iexact=team_name
    ).exists():
        raise GameError(
            "team_name_in_use",
            "Questo nome squadra è già in partita. Scegline un altro o attendi che la partita finisca.",
            409,
        )

    now = timezone.now()
    session = GameSession.objects.create(
        team_name=team_name,
        mode=mode,
        current_level=1,
        started_at=now,
        deadline=now + timedelta(seconds=config["total_seconds"]),
        status=GameSession.Status.ACTIVE,
    )
    assign_level(session, 1)
    return session


def get_active_session(session_id) -> GameSession:
    try:
        session = GameSession.objects.get(pk=session_id)
    except (GameSession.DoesNotExist, ValueError, TypeError):
        raise GameError("session_not_found", "Sessione non trovata.", 404)

    if session.status == GameSession.Status.ACTIVE and session.is_expired():
        expire_session(session)
    return session


@transaction.atomic
def expire_session(session: GameSession) -> GameSession:
    if session.status == GameSession.Status.ACTIVE:
        session.status = GameSession.Status.EXPIRED
        session.finished_at = session.deadline
        session.save(update_fields=["status", "finished_at", "updated_at"])
    return session


@transaction.atomic
def submit_answer(session: GameSession, raw_answer: str, option_id=None) -> dict:
    """Verifica la risposta e fa avanzare (o penalizza) la sessione.

    Restituisce un dizionario con l'esito, pronto per la serializzazione.
    """
    if session.status == GameSession.Status.COMPLETED:
        raise GameError("already_completed", "La partita è già stata completata.", 409)
    if session.status in {GameSession.Status.EXPIRED, GameSession.Status.ABANDONED}:
        raise GameError("session_closed", "La sessione non è più attiva.", 409)

    if session.is_expired():
        expire_session(session)
        return {"outcome": "expired"}

    assignment = current_assignment(session)
    if assignment is None:
        assignment = assign_level(session, session.current_level)

    question = assignment.question
    variant = assignment.variant

    # La risposta corretta non lascia mai il server prima della verifica.
    correct_value = variant.normalized_answer if variant else question.normalized_answer

    if option_id is not None:
        option = question.options.filter(pk=option_id).first()
        if option is None:
            raise GameError("invalid_option", "Opzione non valida.", 400)
        is_correct = normalize_answer(option.text) == correct_value
    else:
        is_correct = normalize_answer(raw_answer) == correct_value

    now = timezone.now()
    assignment.answered_at = now
    assignment.answered_correctly = is_correct
    assignment.save(update_fields=["answered_at", "answered_correctly"])

    if not is_correct:
        # penalità applicata alla scadenza, mai sommata al tempo finale
        session.error_count = F("error_count") + 1
        session.save(update_fields=["error_count", "updated_at"])
        session.refresh_from_db(fields=["error_count"])
        session.deadline = session.deadline - timedelta(seconds=session.penalty_seconds)
        session.save(update_fields=["deadline", "updated_at"])

        if session.deadline <= now:
            expire_session(session)
            return {"outcome": "expired"}

        assign_level(session, session.current_level)
        return {"outcome": "wrong"}

    # risposta corretta: si passa al livello successivo
    if session.current_level >= session.total_levels:
        return complete_session(session)

    session.current_level = F("current_level") + 1
    session.save(update_fields=["current_level", "updated_at"])
    session.refresh_from_db(fields=["current_level"])
    assign_level(session, session.current_level)
    return {"outcome": "correct"}


@transaction.atomic
def complete_session(session: GameSession) -> dict:
    now = timezone.now()
    session.status = GameSession.Status.COMPLETED
    session.finished_at = now
    session.save(update_fields=["status", "finished_at", "updated_at"])

    entry, created = LeaderboardEntry.objects.get_or_create(
        session=session,
        defaults={
            "mode": session.mode,
            "team_name": session.team_name,
            "elapsed_ms": session.elapsed_ms,
            "error_count": session.error_count,
            "completed_at": now,
        },
    )
    top_ids = [row.pk for row in LeaderboardEntry.top(mode=session.mode)]
    in_top = entry.pk in top_ids
    return {"outcome": "completed", "is_top": in_top, "is_new": created}


# ------------------------------------------------------------------ serializzazione


def option_payload(question: Question) -> list[dict]:
    if question.question_type != Question.Type.CHOICE:
        return []
    # l'ordine viene rimescolato a ogni richiesta, così la posizione non suggerisce la risposta
    options = list(question.options.all())
    secrets.SystemRandom().shuffle(options)
    return [{"id": o.pk, "text": o.text} for o in options]


def question_payload(assignment: SessionQuestion, session: GameSession) -> dict:
    question = assignment.question
    variant = assignment.variant
    payload = {
        "level": assignment.level,
        "total_levels": session.total_levels,
        "code": variant.code if variant else question.code,
        "type": question.question_type,
        "title": question.title,
        "text": variant.effective_text if variant else question.text,
        "hint": variant.effective_hint if variant else question.hint,
        "options": option_payload(question),
    }
    if question.question_type == Question.Type.CODE_INSPECTION:
        payload["html_file"] = variant.html_file if variant else ""
        payload["inspect_url"] = (
            f"{settings.STATIC_URL}level2/{payload['html_file']}" if payload["html_file"] else ""
        )
    return payload


def session_state(session: GameSession) -> dict:
    """Stato completo della sessione, senza mai esporre la risposta corretta."""
    remaining = 0
    if session.status == GameSession.Status.ACTIVE:
        remaining = max(0, math.ceil((session.deadline - timezone.now()).total_seconds()))
        if remaining == 0:
            expire_session(session)

    payload = {
        "id": str(session.pk),
        "team_name": session.team_name,
        "mode": session.mode,
        "mode_label": session.get_mode_display(),
        "status": session.status,
        "current_level": session.current_level,
        "total_levels": session.total_levels,
        "error_count": session.error_count,
        "penalty_seconds": session.penalty_seconds,
        "total_seconds": session.total_seconds,
        "seconds_remaining": remaining,
        "server_now": timezone.now().isoformat(),
        "deadline": session.deadline.isoformat(),
        "elapsed_ms": session.elapsed_ms if session.finished_at else None,
        "question": None,
        "leaderboard": leaderboard_payload(session.mode),
    }

    if session.status == GameSession.Status.ACTIVE:
        assignment = current_assignment(session)
        if assignment is None:
            assignment = assign_level(session, session.current_level)
        payload["question"] = question_payload(assignment, session)

    return payload


def leaderboard_payload(mode=None) -> dict:
    modes = [mode] if mode else [GameSession.Mode.RAPID, GameSession.Mode.COMPLETE]
    return {
        m: [
            {
                "position": index + 1,
                "team_name": entry.team_name,
                "elapsed_ms": entry.elapsed_ms,
                "formatted": format_ms(entry.elapsed_ms),
                "error_count": entry.error_count,
                "completed_at": entry.completed_at.isoformat(),
            }
            for index, entry in enumerate(LeaderboardEntry.top(mode=m))
        ]
        for m in modes
    }


def format_ms(ms: int) -> str:
    cent = max(0, int(ms // 10))
    return f"{cent // 6000:02d}:{(cent // 100) % 60:02d}.{cent % 100:02d}"


# ------------------------------------------------------------------ manutenzione


def expire_stale_sessions() -> int:
    """Marca scadute le sessioni attive oltre la tolleranza. Utile da cron."""
    limit = timezone.now() - timedelta(seconds=settings.SESSION_EXPIRY_GRACE_SECONDS)
    return GameSession.objects.filter(
        status=GameSession.Status.ACTIVE, deadline__lte=limit
    ).update(status=GameSession.Status.EXPIRED, finished_at=F("deadline"))
