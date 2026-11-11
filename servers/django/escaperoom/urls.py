"""URL principali del progetto Escaperoom."""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

admin.site.site_header = "Escape Room Fassicomo — Amministrazione"
admin.site.site_title = "Escape Room Fassicomo"
admin.site.index_title = "Gestione domande, sessioni e classifiche"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("game.urls")),
]

# In produzione i file media (pagine del livello 2) sono serviti da Nginx;
# in sviluppo Django li serve direttamente.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
