"""Context processor: espone la configurazione di gioco ai template."""

from django.conf import settings

from .services import mode_labels


def game_config(request):
    return {
        "game_config": mode_labels(),
        "leaderboard_size": settings.LEADERBOARD_SIZE,
        "team_name_max_length": settings.TEAM_NAME_MAX_LENGTH,
        "site_name": "Escape Room Fassicomo",
    }
