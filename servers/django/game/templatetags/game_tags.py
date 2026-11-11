"""Templatetag utili nei template di gioco."""

from django import template

from game.services import format_ms

register = template.Library()


@register.filter
def tempo(ms):
    """Trasforma millisecondi nel formato minuti:secondi.centesimi."""
    try:
        return format_ms(int(ms))
    except (TypeError, ValueError):
        return "—"


@register.filter
def countdown(seconds):
    """Trasforma secondi in mm:ss."""
    try:
        seconds = max(0, int(seconds))
    except (TypeError, ValueError):
        return "--:--"
    return f"{seconds // 60:02d}:{seconds % 60:02d}"
