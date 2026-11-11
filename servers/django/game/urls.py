"""URL dell'app di gioco."""

from django.urls import path

from . import views

app_name = "game"

urlpatterns = [
    # pagine
    path("", views.index, name="index"),
    path("partita/<uuid:session_id>/", views.play, name="play"),
    path("partita/<uuid:session_id>/risultato/", views.result, name="result"),
    path("classifica/", views.leaderboard_page, name="leaderboard"),
    # API JSON
    path("api/session/start/", views.api_start, name="api_start"),
    path("api/session/<uuid:session_id>/state/", views.api_state, name="api_state"),
    path("api/session/<uuid:session_id>/answer/", views.api_answer, name="api_answer"),
    path("api/leaderboard/", views.api_leaderboard, name="api_leaderboard"),
    path("api/health/", views.api_health, name="api_health"),
]
