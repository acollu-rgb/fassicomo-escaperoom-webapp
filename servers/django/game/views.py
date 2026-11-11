"""Viste dell'Escape Room: pagine HTML + API JSON."""

from __future__ import annotations

import json
import logging

from django.conf import settings
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from . import services
from .models import GameSession, LeaderboardEntry, Question
from .services import GameError

logger = logging.getLogger("game")


# ------------------------------------------------------------------ helper


def wants_json(request) -> bool:
    return request.path.startswith("/api/")


def json_error(exc: GameError) -> JsonResponse:
    return JsonResponse({"ok": False, "error": exc.code, "message": exc.message}, status=exc.status)


def handle_game_errors(view):
    """Trasforma GameError in una risposta JSON o in una pagina di errore."""

    def wrapper(request, *args, **kwargs):
        try:
            return view(request, *args, **kwargs)
        except GameError as exc:
            if wants_json(request):
                return json_error(exc)
            return render(
                request,
                "game/error.html",
                {"message": exc.message, "code": exc.code},
                status=exc.status,
            )

    wrapper.__name__ = view.__name__
    wrapper.__doc__ = view.__doc__
    return wrapper


def parse_json(request) -> dict:
    if not request.body:
        return {}
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise GameError("invalid_json", "Richiesta non valida.", 400)
    if not isinstance(payload, dict):
        raise GameError("invalid_json", "Richiesta non valida.", 400)
    return payload


# ------------------------------------------------------------------ pagine


@ensure_csrf_cookie
def index(request):
    """Schermata iniziale: nome squadra, modalità, classifiche."""
    context = {
        "modes": services.mode_labels(),
        "leaderboard": services.leaderboard_payload(),
        "team_name_max_length": settings.TEAM_NAME_MAX_LENGTH,
        "total_questions": Question.objects.filter(is_active=True).count(),
    }
    return render(request, "game/start.html", context)


@ensure_csrf_cookie
def play(request, session_id):
    """Pagina di gioco: lo stato arriva dall'API e viene aggiornato in JS."""
    session = get_object_or_404(GameSession, pk=session_id)
    if session.status == GameSession.Status.ACTIVE and session.is_expired():
        services.expire_session(session)

    if session.status == GameSession.Status.COMPLETED:
        return redirect("game:result", session_id=session.pk)
    if session.status in {GameSession.Status.EXPIRED, GameSession.Status.ABANDONED}:
        return redirect("game:result", session_id=session.pk)

    return render(
        request,
        "game/level.html",
        {
            "session": session,
            "state": json.dumps(services.session_state(session)),
            "modes": settings.GAME_CONFIG,
        },
    )


@ensure_csrf_cookie
def result(request, session_id):
    """Schermata finale: vittoria con badge o sconfitta."""
    session = get_object_or_404(GameSession, pk=session_id)
    entry = getattr(session, "leaderboard_entry", None)
    context = {
        "session": session,
        "entry": entry,
        "formatted_time": services.format_ms(session.elapsed_ms),
        "leaderboard": services.leaderboard_payload(session.mode),
        "is_win": session.status == GameSession.Status.COMPLETED,
        "position": entry.position if entry else None,
    }
    return render(request, "game/result.html", context)


@ensure_csrf_cookie
def leaderboard_page(request):
    """Classifiche complete (anche oltre la top 3) e stato del server."""
    context = {
        "leaderboard": services.leaderboard_payload(),
        "modes": settings.GAME_CONFIG,
        "now": timezone.now(),
        "active_sessions": GameSession.objects.filter(
            status=GameSession.Status.ACTIVE
        ).count(),
        "completed_sessions": GameSession.objects.filter(
            status=GameSession.Status.COMPLETED
        ).count(),
    }
    return render(request, "game/leaderboard.html", context)


# ------------------------------------------------------------------ API


@require_POST
@handle_game_errors
def api_start(request):
    """POST /api/session/start/ — avvia una nuova partita."""
    payload = parse_json(request)
    session = services.start_session(
        team_name=payload.get("team_name", ""),
        mode=payload.get("mode", ""),
    )
    logger.info("Nuova sessione %s · %s · %s", session.pk, session.team_name, session.mode)
    return JsonResponse(
        {
            "ok": True,
            "session": services.session_state(session),
            "play_url": reverse("game:play", args=[session.pk]),
        },
        status=201,
    )


@require_GET
@handle_game_errors
def api_state(request, session_id):
    """GET /api/session/<uuid>/state/ — stato e domanda corrente."""
    session = services.get_active_session(session_id)
    return JsonResponse({"ok": True, "session": services.session_state(session)})


@require_POST
@handle_game_errors
def api_answer(request, session_id):
    """POST /api/session/<uuid>/answer/ — invia una risposta."""
    session = services.get_active_session(session_id)
    payload = parse_json(request)

    option_id = payload.get("option_id")
    if option_id is not None:
        try:
            option_id = int(option_id)
        except (TypeError, ValueError):
            raise GameError("invalid_option", "Opzione non valida.", 400)

    outcome = services.submit_answer(session, payload.get("answer", ""), option_id=option_id)
    session.refresh_from_db()

    return JsonResponse(
        {
            "ok": True,
            "outcome": outcome.get("outcome"),
            "is_top": outcome.get("is_top", False),
            "session": services.session_state(session),
            "result_url": reverse("game:result", args=[session.pk])
            if session.status != GameSession.Status.ACTIVE
            else None,
        }
    )


@require_GET
@handle_game_errors
def api_leaderboard(request):
    """GET /api/leaderboard/ — top 3 delle due modalità."""
    return JsonResponse({"ok": True, "leaderboard": services.leaderboard_payload()})


@require_GET
def api_health(request):
    """GET /api/health/ — controllo rapido per installazione e monitoraggio."""
    return JsonResponse(
        {
            "ok": True,
            "app": "escaperoom",
            "time": timezone.now().isoformat(),
            "active_sessions": GameSession.objects.filter(
                status=GameSession.Status.ACTIVE
            ).count(),
            "questions": Question.objects.filter(is_active=True).count(),
        }
    )


# ------------------------------------------------------------------ errore 404


def handler404(request, exception=None):
    if wants_json(request):
        return JsonResponse({"ok": False, "error": "not_found", "message": "Risorsa non trovata."}, status=404)
    return render(request, "game/error.html", {"message": "Pagina non trovata.", "code": "404"}, status=404)


def handler500(request):
    return render(
        request,
        "game/error.html",
        {"message": "Errore interno del server. Avvisa il tutor.", "code": "500"},
        status=500,
    )
